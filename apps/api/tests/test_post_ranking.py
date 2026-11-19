"""Feed ranking, the sort options and search over posts (app/services/feed_rank.py).

Posts are saved straight to the database with chosen ages and counts, so each ordering can be
checked against the rule written out here in plain Python.
"""

import re
from collections.abc import Generator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from app import config
from app.models import Post, PostTopic, PostType, Technology, User, UserFeedTopic, UserTechnology
from app.services import feed_rank
from tests.hub_support import auth, make_user, run
from tests.test_demo_wall import to_demo

SCRIPT = Path(__file__).parents[3] / "infra" / "db" / "init" / "030-post-search.sql"


@pytest.fixture(autouse=True)
def clean_posts() -> Generator[None]:
    def wipe() -> None:
        async def work(session) -> None:
            await session.execute(
                text("TRUNCATE posts, post_topics, post_likes, saved_posts, post_revisions CASCADE")
            )
            await session.commit()

        run(work)

    wipe()
    yield
    wipe()


def add_post(
    author: User,
    *,
    age: timedelta = timedelta(hours=1),
    likes: int = 0,
    comments: int = 0,
    title: str | None = None,
    body: str = "Plain text",
    kind: PostType = PostType.GENERAL,
    topics: tuple[str, ...] = (),
) -> UUID:
    async def work(session) -> UUID:
        post = Post(
            author_id=author.id,
            type=kind,
            title=title,
            body=body,
            like_count=likes,
            comment_count=comments,
            created_at=datetime.now(UTC) - age,
        )
        session.add(post)
        await session.flush()
        for slug in topics:
            technology = await session.scalar(select(Technology).where(Technology.slug == slug))
            assert technology is not None, slug
            session.add(PostTopic(post_id=post.id, technology_id=technology.id))
        await session.commit()
        return post.id

    return run(work)


def choose_topics(user: User, *slugs: str, as_stack: bool = False) -> None:
    async def work(session) -> None:
        for slug in slugs:
            technology = await session.scalar(select(Technology).where(Technology.slug == slug))
            assert technology is not None, slug
            row = UserTechnology if as_stack else UserFeedTopic
            session.add(row(user_id=user.id, technology_id=technology.id))
        await session.commit()

    run(work)


def ids(response) -> list[str]:
    assert response.status_code == 200, response.text
    return [item["id"] for item in response.json()["data"]]


def reference_score(likes: int, comments: int, hours: float, on_topic: bool) -> float:
    """The For you rule from the decision record, in plain Python."""
    engagement = likes + 3 * comments + 1
    return engagement * (1.5 if on_topic else 1.0) / (hours + 2) ** 1.5


# --- For you -----------------------------------------------------------------------------------


def test_for_you_orders_posts_by_the_rule_and_puts_older_posts_after(client: TestClient) -> None:
    viewer, writer = make_user(), make_user()
    day = timedelta(days=1)
    made = {
        "fresh and quiet": add_post(writer, age=timedelta(hours=2)),
        "a day old and busy": add_post(writer, age=day, likes=60, comments=10),
        "a week old and very busy": add_post(writer, age=7 * day, likes=300, comments=40),
        "a week old and quiet": add_post(writer, age=7 * day, likes=2),
        "ten hours, some likes": add_post(writer, age=timedelta(hours=10), likes=12),
        "forty days and huge": add_post(writer, age=40 * day, likes=900, comments=90),
        "fifty days": add_post(writer, age=50 * day, likes=5),
    }
    ranked = [
        name
        for name, _ in sorted(
            (
                ("fresh and quiet", reference_score(0, 0, 2, False)),
                ("a day old and busy", reference_score(60, 10, 24, False)),
                ("a week old and very busy", reference_score(300, 40, 168, False)),
                ("a week old and quiet", reference_score(2, 0, 168, False)),
                ("ten hours, some likes", reference_score(12, 0, 10, False)),
            ),
            key=lambda item: -item[1],
        )
    ]
    # past 30 days nothing is ranked: those posts follow, newest first
    expected = [*ranked, "forty days and huge", "fifty days"]

    got = ids(client.get("/v1/feed", headers=auth(viewer)))
    assert got == [str(made[name]) for name in expected]


def test_for_you_is_the_default_and_newest_is_the_old_order(client: TestClient) -> None:
    viewer, writer = make_user(), make_user()
    old_hit = add_post(writer, age=timedelta(days=1), likes=80, comments=20)
    newer = add_post(writer, age=timedelta(hours=3))
    newest = add_post(writer, age=timedelta(minutes=5))
    default = ids(client.get("/v1/feed", headers=auth(viewer)))
    assert default[0] == str(old_hit)
    assert ids(client.get("/v1/feed?sort=newest", headers=auth(viewer))) == [
        str(newest),
        str(newer),
        str(old_hit),
    ]
    assert ids(client.get("/v1/posts", headers=auth(viewer))) == [
        str(newest),
        str(newer),
        str(old_hit),
    ]


def test_a_comment_counts_three_times_a_like(client: TestClient) -> None:
    viewer, writer = make_user(), make_user()
    two_comments = add_post(writer, age=timedelta(hours=5), comments=2)  # 7 points
    five_likes = add_post(writer, age=timedelta(hours=5), likes=5)  # 6 points
    seven_likes = add_post(writer, age=timedelta(hours=5), likes=7)  # 8 points
    assert ids(client.get("/v1/feed", headers=auth(viewer))) == [
        str(seven_likes),
        str(two_comments),
        str(five_likes),
    ]


@pytest.mark.parametrize("as_stack", [False, True])
def test_posts_on_the_viewers_topics_get_a_boost(client: TestClient, as_stack: bool) -> None:
    viewer, writer = make_user(), make_user()
    # the topic is a feed topic, or, when none was chosen, a technology of the profile
    choose_topics(viewer, "python", as_stack=as_stack)
    other = add_post(writer, age=timedelta(hours=4), likes=10, topics=("react",))
    on_topic = add_post(writer, age=timedelta(hours=4), likes=7, topics=("python",))
    # 7 likes x 1.5 beats 10 likes x 1
    got = ids(client.get("/v1/posts?sort=for_you", headers=auth(viewer)))
    assert got[0] == str(on_topic)
    assert got[1] == str(other)
    if as_stack:
        assert ids(client.get("/v1/feed", headers=auth(viewer))) == got


def test_chosen_feed_topics_still_filter_the_feed_and_the_stack_does_not(
    client: TestClient,
) -> None:
    viewer, writer = make_user(), make_user()
    choose_topics(viewer, "python", as_stack=True)
    add_post(writer, topics=("react",))
    assert len(ids(client.get("/v1/feed", headers=auth(viewer)))) == 1  # no feed topic: everything
    choose_topics(viewer, "go")
    assert ids(client.get("/v1/feed", headers=auth(viewer))) == []  # feed topic Go: nothing on it


def test_pages_of_the_ranked_feed_do_not_repeat_posts(client: TestClient) -> None:
    viewer, writer = make_user(), make_user()
    for n in range(25):
        add_post(writer, age=timedelta(hours=n + 1), likes=n % 7)
    first = client.get("/v1/feed?limit=10", headers=auth(viewer)).json()
    second = client.get(
        f"/v1/feed?limit=10&offset={first['next_offset']}", headers=auth(viewer)
    ).json()
    third = client.get(
        f"/v1/feed?limit=10&offset={second['next_offset']}", headers=auth(viewer)
    ).json()
    seen = [item["id"] for page in (first, second, third) for item in page["data"]]
    assert len(seen) == 25 and len(set(seen)) == 25
    assert third["next_offset"] is None


# --- Most active -------------------------------------------------------------------------------


def test_most_active_looks_at_the_week_and_orders_by_likes_and_comments(client: TestClient) -> None:
    viewer, writer = make_user(), make_user()
    busy = add_post(writer, age=timedelta(days=3), likes=5, comments=10)  # 35
    liked = add_post(writer, age=timedelta(hours=2), likes=30)  # 30
    tie_older = add_post(writer, age=timedelta(days=2), likes=3)  # 3
    tie_newer = add_post(writer, age=timedelta(days=1), likes=3)  # 3
    add_post(writer, age=timedelta(days=9), likes=500)  # outside the week
    for path in ("/v1/feed?sort=active", "/v1/posts?sort=active"):
        assert ids(client.get(path, headers=auth(viewer))) == [
            str(busy),
            str(liked),
            str(tie_newer),
            str(tie_older),
        ], path


# --- Search ------------------------------------------------------------------------------------


def search(client: TestClient, viewer: User, query: str) -> list[str]:
    return ids(client.get("/v1/posts", params={"q": query}, headers=auth(viewer)))


def test_a_title_match_beats_a_match_in_the_text(client: TestClient) -> None:
    viewer, writer = make_user(), make_user()
    in_text = add_post(writer, title="Notes", body="We tried kubernetes last month", likes=50)
    in_title = add_post(writer, title="Kubernetes upgrade notes", body="Steps we took", likes=0)
    assert search(client, viewer, "kubernetes") == [str(in_title), str(in_text)]


def test_equal_matches_go_to_the_more_active_post_then_the_newer_one(client: TestClient) -> None:
    viewer, writer = make_user(), make_user()
    quiet_new = add_post(writer, title="Postgres tips", age=timedelta(hours=1))
    quiet_old = add_post(writer, title="Postgres tips", age=timedelta(days=3))
    active = add_post(writer, title="Postgres tips", age=timedelta(days=9), comments=4)
    assert search(client, viewer, "postgres") == [str(active), str(quiet_new), str(quiet_old)]


def test_search_ignores_case_and_accents_in_both_directions(client: TestClient) -> None:
    viewer, writer = make_user(), make_user()
    accented = add_post(writer, title="Démarrage lent du serveur")
    plain = add_post(writer, title="Server startup", body="the demarrage was slow")
    assert set(search(client, viewer, "demarrage")) == {str(accented), str(plain)}
    assert set(search(client, viewer, "DÉMARRAGE")) == {str(accented), str(plain)}


def test_search_understands_quotes_or_and_minus(client: TestClient) -> None:
    viewer, writer = make_user(), make_user()
    both = add_post(writer, body="connection pool exhausted under load")
    apart = add_post(writer, body="the pool of workers, one connection each")
    redis = add_post(writer, body="connection pool with redis")
    assert set(search(client, viewer, "connection pool")) == {str(both), str(apart), str(redis)}
    assert set(search(client, viewer, '"connection pool"')) == {str(both), str(redis)}
    assert set(search(client, viewer, "connection pool -redis")) == {str(both), str(apart)}
    assert set(search(client, viewer, "exhausted OR redis")) == {str(both), str(redis)}


def test_one_word_also_matches_topic_names_but_two_words_do_not(client: TestClient) -> None:
    viewer, writer = make_user(), make_user()
    tagged = add_post(writer, body="Our nightly job got faster", topics=("python",))
    mentioned = add_post(writer, body="We rewrote the python scripts")
    # the text match counts more than the topic name, so the mention comes first
    assert search(client, viewer, "python") == [str(mentioned), str(tagged)]
    assert search(client, viewer, "pyth") == [str(tagged)]
    assert search(client, viewer, "python scripts") == [str(mentioned)]


def test_percent_and_underscore_in_a_search_are_just_characters(client: TestClient) -> None:
    viewer, writer = make_user(), make_user()
    add_post(writer, body="anything at all", topics=("python",))
    assert search(client, viewer, "%") == []
    assert search(client, viewer, "_") == []


def test_a_blank_search_is_no_search_and_relevance_needs_words(client: TestClient) -> None:
    viewer, writer = make_user(), make_user()
    older = add_post(writer, age=timedelta(hours=2))
    newer = add_post(writer, age=timedelta(hours=1))
    assert search(client, viewer, "   ") == [str(newer), str(older)]
    refused = client.get("/v1/posts?sort=relevance", headers=auth(viewer))
    assert refused.status_code == 422
    assert refused.json()["detail"]["code"] == "SORT_NEEDS_SEARCH"
    too_long = client.get("/v1/posts", params={"q": "a" * 101}, headers=auth(viewer))
    assert too_long.status_code == 422
    assert client.get("/v1/feed?sort=relevance", headers=auth(viewer)).status_code == 422


def test_search_can_be_sorted_and_filtered(client: TestClient) -> None:
    viewer, writer = make_user(), make_user()
    old_busy = add_post(writer, title="Queue design", age=timedelta(days=20), likes=40)
    new_quiet = add_post(writer, title="Queue design", age=timedelta(hours=2))
    question = add_post(writer, title="Queue design", kind=PostType.QUESTION, topics=("go",))
    add_post(writer, title="Unrelated")
    headers = auth(viewer)
    assert ids(client.get("/v1/posts?q=queue&sort=newest", headers=headers)) == [
        str(question),
        str(new_quiet),
        str(old_busy),
    ]
    # with a search, Most active looks at every match, not only the last week
    assert ids(client.get("/v1/posts?q=queue&sort=active", headers=headers))[0] == str(old_busy)
    assert ids(client.get("/v1/posts?q=queue&type=question", headers=headers)) == [str(question)]
    assert ids(client.get("/v1/posts?q=queue&topic=go", headers=headers)) == [str(question)]


def test_search_pages_do_not_repeat_posts(client: TestClient) -> None:
    viewer, writer = make_user(), make_user()
    for n in range(23):
        add_post(writer, title=f"Cache {n}", age=timedelta(hours=n + 1), likes=n % 5)
    headers = auth(viewer)
    seen: list[str] = []
    offset: int | None = 0
    while offset is not None:
        page = client.get(
            "/v1/posts", params={"q": "cache", "limit": 10, "offset": offset}, headers=headers
        ).json()
        seen += [item["id"] for item in page["data"]]
        offset = page["next_offset"]
    assert len(seen) == 23 and len(set(seen)) == 23


def test_deleted_posts_and_the_demo_wall_are_not_searched(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(config, "DEMO_ENABLED", True)
    viewer, writer, demo_writer, demo_viewer = make_user(), make_user(), make_user(), make_user()
    to_demo(demo_writer, demo_viewer)
    kept = add_post(writer, title="Wall test words")
    gone = add_post(writer, title="Wall test words")
    inside = add_post(demo_writer, title="Wall test words")

    assert client.delete(f"/v1/posts/{gone}", headers=auth(writer)).status_code == 204
    assert search(client, viewer, "wall test words") == [str(kept)]
    assert search(client, demo_viewer, "wall test words") == [str(inside)]
    demo_feed = ids(client.get("/v1/feed", headers=auth(demo_viewer)))
    assert demo_feed == [str(inside)]


# --- The search index script --------------------------------------------------------------------


def test_the_fold_letters_are_one_for_one_and_match_the_index_script() -> None:
    assert len(feed_rank.FOLD_FROM) == len(feed_rank.FOLD_TO)
    script = SCRIPT.read_text(encoding="utf-8")
    assert feed_rank.FOLD_FROM in script
    assert feed_rank.FOLD_TO in script
    assert re.search(r"USING gin", script)
