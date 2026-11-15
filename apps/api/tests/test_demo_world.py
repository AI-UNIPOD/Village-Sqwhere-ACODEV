"""The lived-in demo: the frozen fixtures, and what the loader makes of them in a database."""

import asyncio
import re
from collections import Counter
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select, text

from app import config
from app.demo_seed import seed
from app.demo_world import load_members, load_posts, write_world
from app.models import Comment, Post, User
from tests.conftest import test_async_session as db_session

FULL, LIGHT = load_members()
POSTS = load_posts()
MEMBERS = {member["handle"]: member for member in FULL + LIGHT}
SPEAKERS = {**MEMBERS, **{"olaoluwa_adebayo": {"country": "NG"}}}
# nothing the seed writes may call itself a demo, or leave a stand-in word in a text
BANNED = re.compile(
    r"\b(demo|sample|placeholder|tests?|fake|dummy|mock\w*|examples?|lorem|made[- ]up)\b", re.I
)
CFA = {"SN", "CI", "BJ", "BF", "ML", "TG", "NE", "GW", "CM", "GA", "CG", "TD", "CF", "GQ"}
# a currency word or sign, and the countries whose people use it
CURRENCIES = [
    (re.compile(r"₦|\bnaira\b", re.I), {"NG"}),
    (re.compile(r"GH₵|\bcedis?\b", re.I), {"GH"}),
    (re.compile(r"\bKSh\b"), {"KE"}),
    (re.compile(r"\brand\b|\bR ?\d{2}"), {"ZA"}),
    (re.compile(r"\bFCFA\b|francs? CFA", re.I), CFA),
]


def every_text():
    for post in POSTS:
        yield post["by"], post["body"]
        if post.get("title"):
            yield post["by"], post["title"]
        for comment in post["comments"]:
            yield comment["by"], comment["body"]


def test_the_roster_has_150_full_members_with_the_original_seven_and_about_1000_light_ones() -> (
    None
):
    assert len(FULL) + 7 == 150
    assert len(LIGHT) == 1000
    assert all(member["country"] for member in FULL + LIGHT)
    assert all(not member.get("verified") for member in LIGHT)


def test_every_handle_holds_an_underscore_so_it_can_never_be_a_github_login() -> None:
    handles = [member["handle"] for member in FULL + LIGHT]
    assert len(set(handles)) == len(handles)
    assert all("_" in handle and re.fullmatch(r"[a-z0-9_]{5,39}", handle) for handle in handles)
    assert len({member["name"].casefold() for member in FULL + LIGHT}) == len(handles)


def test_only_members_in_roles_the_demo_visitor_never_needs_are_verified() -> None:
    # the visitor's ideas need mobile, frontend and devops, so the tour's matcher keeps its story
    for member in FULL:
        if member["verified"]:
            assert not {"mobile-engineer", "frontend-engineer", "devops-cloud-engineer"} & set(
                member["roles"]
            )


def test_the_feed_is_about_1500_posts_and_6000_comments_across_the_seven_types() -> None:
    comments = sum(len(post["comments"]) for post in POSTS)
    assert 1450 <= len(POSTS) + 12 <= 1550
    assert 5800 <= comments <= 6200
    assert {post["type"] for post in POSTS} == {
        "general",
        "question",
        "rfc",
        "oss_release",
        "research_note",
        "code_review_request",
        "architecture_challenge",
    }


def test_activity_is_heavy_tailed_and_most_posts_have_few_comments() -> None:
    by_author = Counter(post["by"] for post in POSTS)
    top_ten = sum(count for _, count in by_author.most_common(10))
    assert top_ten / len(POSTS) > 0.2 and min(by_author.values()) >= 1
    sizes = [len(post["comments"]) for post in POSTS]
    assert sum(size <= 3 for size in sizes) / len(sizes) > 0.5
    assert max(sizes) >= 10


def test_replies_go_at_most_three_levels_deep_and_follow_their_parent_in_time() -> None:
    for post in POSTS:
        depth, minutes = {None: -1}, {None: 0}
        for comment in post["comments"]:
            parent = comment["parent"]
            assert parent in depth  # a parent is listed before its replies
            depth[comment["key"]] = depth[parent] + 1
            minutes[comment["key"]] = minutes[parent] + comment["after_minutes"]
            assert depth[comment["key"]] <= 2
            assert comment["after_minutes"] > 0
        # a thread never reaches past the moment the world is written
        assert max(minutes.values()) / 60 < post["age_hours"]


def test_the_texts_hold_no_stand_in_word_dash_exclamation_link_or_mention() -> None:
    for _, body in every_text():
        assert not BANNED.search(body), body
        assert not re.search(r"[!\u2014\u2013@]|https?:|www\.|github", body, re.I), body


def test_a_currency_is_only_named_by_someone_from_a_country_that_uses_it() -> None:
    for who, body in every_text():
        for pattern, countries in CURRENCIES:
            if pattern.search(body):
                assert SPEAKERS[who]["country"] in countries, (who, body)


def test_french_texts_use_the_narrow_no_break_space_before_a_colon_or_question_mark() -> None:
    texts = [body for _, body in every_text()]
    assert any(" ?" in body for body in texts) and any(" :" in body for body in texts)
    assert not any(re.search(r"[A-Za-zÀ-ÿ] [?:;]", body) for body in texts if " " in body)


# --- in a database ------------------------------------------------------------------------


def _run(work):
    async def go():
        async with db_session() as session:
            return await work(session)

    return asyncio.run(go())


async def _write(session):
    await seed(session)
    written = await write_world(session)
    await session.commit()
    return written


async def _forget_the_world(session) -> None:
    handles = list(MEMBERS)
    people = select(User.id).where(User.username.in_(handles))
    await session.execute(delete(Post).where(Post.author_id.in_(people)))
    await session.execute(delete(User).where(User.username.in_(handles)))
    await session.commit()


@pytest.fixture(scope="module")
def world():
    written = _run(_write)
    yield written
    _run(_forget_the_world)


def _scalar(sql: str):
    return _run(lambda session: session.scalar(text(sql), {"handles": list(MEMBERS)}))


def test_the_world_is_written_whole_and_every_account_is_a_demo_account(world) -> None:
    assert world == (len(POSTS), sum(len(post["comments"]) for post in POSTS))
    assert _scalar("SELECT count(*) FROM users WHERE username = ANY(:handles) AND is_demo") == len(
        MEMBERS
    )
    assert _scalar("SELECT count(*) FROM users WHERE username = ANY(:handles)") == len(MEMBERS)


def test_the_original_seven_keep_the_posts_the_seed_wrote_them(world) -> None:
    assert (
        _scalar(
            """SELECT count(*) FROM posts p JOIN users u ON u.id = p.author_id
               WHERE u.username IN ('olaoluwa_adebayo', 'aminata_ndiaye', 'kwabena_owusu',
                                    'danladi_kabir', 'wanjiru_kamau', 'tendai_moyo',
                                    'uwase_mutoni') AND p.deleted_at IS NULL"""
        )
        >= 12
    )


def test_every_count_the_feed_shows_is_a_true_count_of_the_rows(world) -> None:
    wrong = """
    SELECT count(*) FROM posts p JOIN users u ON u.id = p.author_id
    WHERE u.username = ANY(:handles) AND (
      p.like_count <> (SELECT count(*) FROM post_likes l WHERE l.post_id = p.id)
      OR p.comment_count <> (SELECT count(*) FROM comments c WHERE c.post_id = p.id
                             AND c.deleted_at IS NULL))
    """
    assert _scalar(wrong) == 0
    wrong_comments = """
    SELECT count(*) FROM comments c JOIN users u ON u.id = c.author_id
    WHERE u.username = ANY(:handles) AND (
      c.like_count <> (SELECT count(*) FROM comment_likes l WHERE l.comment_id = c.id)
      OR c.reply_count <> (SELECT count(*) FROM comments r WHERE r.parent_id = c.id))
    """
    assert _scalar(wrong_comments) == 0
    assert _scalar("SELECT sum(like_count) FROM posts") > len(POSTS)


def test_nobody_likes_their_own_post_and_no_like_comes_before_what_it_likes(world) -> None:
    assert (
        _scalar(
            """SELECT count(*) FROM post_likes l JOIN posts p ON p.id = l.post_id
               WHERE l.user_id = p.author_id OR l.created_at < p.created_at"""
        )
        == 0
    )


def test_a_rerun_keeps_every_id_and_dates_the_feed_back_from_now_again(world) -> None:
    async def newest(session):
        return await session.scalar(
            select(func.max(Post.created_at)).where(
                Post.author_id.in_(select(User.id).where(User.username.in_(list(MEMBERS))))
            )
        )

    async def ids(session):
        return set(
            await session.scalars(
                select(Post.id).where(
                    Post.author_id.in_(select(User.id).where(User.username.in_(list(MEMBERS))))
                )
            )
        )

    before_ids = _run(ids)

    async def age_everything(session):
        await session.execute(text("SET LOCAL session_replication_role = replica"))
        await session.execute(
            text(
                """UPDATE posts SET created_at = created_at - interval '5 days'
                   WHERE author_id IN (SELECT id FROM users WHERE username = ANY(:h))"""
            ),
            {"h": list(MEMBERS)},
        )
        await session.commit()

    _run(age_everything)
    assert datetime.now(UTC) - _run(newest) > timedelta(days=4)
    _run(_write)
    assert datetime.now(UTC) - _run(newest) < timedelta(hours=2)
    assert _run(ids) == before_ids


def test_the_visitor_signs_in_and_scrolls_through_the_new_posts(
    world, client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(config, "DEMO_ENABLED", True)
    signed_in = client.post("/v1/auth/demo")
    assert signed_in.status_code == 200
    headers = {"Authorization": f"Bearer {signed_in.json()['data']['access_token']}"}
    feed = client.get("/v1/feed", headers=headers, params={"limit": 50})
    assert feed.status_code == 200 and len(feed.json()["data"]) == 50
    authors = {post["author"]["username"] for post in feed.json()["data"]}
    assert authors & set(MEMBERS)
    comment_total = _run(lambda session: session.scalar(select(func.count()).select_from(Comment)))
    assert comment_total >= sum(len(post["comments"]) for post in POSTS)
