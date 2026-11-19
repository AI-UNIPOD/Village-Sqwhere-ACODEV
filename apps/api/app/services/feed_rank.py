"""How posts are ordered and searched (docs/decisions/2026-11-19-feed-ranking-and-search.md).

Everything here is plain SQL built at request time: no AI, no stored scores, and nothing about
what a person read or clicked. The same rules serve every account, the demo included.

* For you: `(likes + 3 x comments + 1) x topic boost / (age in hours + 2) ^ 1.5`. A post on one of
  the viewer's topics counts 1.5 times. Only posts from the last 30 days are ranked; older posts
  follow, newest first, so a long scroll never runs out.
* Most active: likes + 3 x comments, then newest. Without a search it only looks at the last 7
  days; with a search it looks at every match.
* Best match: the words match the title most, the text next. A single word also matches the
  names of topics. Equal matches go to the more active post, then the newer one.
"""

import re
from dataclasses import dataclass
from datetime import timedelta
from enum import StrEnum

from sqlalchemy import (
    ColumnElement,
    Float,
    case,
    cast,
    exists,
    func,
    literal,
    literal_column,
    select,
)

from app.models import Post, PostTopic, Technology, User

NEWEST_FIRST = (Post.created_at.desc(), Post.id.desc())

RANK_WINDOW = timedelta(days=30)
ACTIVE_WINDOW = timedelta(days=7)
COMMENT_WEIGHT = 3
TOPIC_BOOST = 1.5
GRAVITY = 1.5
AGE_OFFSET_HOURS = 2
# Topic names count a little for a one-word search, below a match in the title or text.
TOPIC_NAME_BONUS = 0.2
MAX_QUERY_LENGTH = 100


class FeedSort(StrEnum):
    FOR_YOU = "for_you"
    NEWEST = "newest"
    ACTIVE = "active"


class PostSort(StrEnum):
    RELEVANCE = "relevance"
    NEWEST = "newest"
    ACTIVE = "active"
    FOR_YOU = "for_you"


# Search ignores case and the accents of French and Yoruba (upper and lower case, so it does not
# depend on the database's locale), so "demarrage" finds "démarrage".
# Both strings have the same length: translate() swaps them one letter for one letter. The index
# in infra/db/init/030-post-search.sql spells out the same strings, and a test keeps them equal.
FOLD_FROM = "àáâãäåçèéêëìíîïñòóôõöùúûüýÿẹọṣÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝẸỌṢ"
FOLD_TO = "aaaaaaceeeeiiiinooooouuuuyyeosaaaaaaceeeeiiiinooooouuuuyeos"


def _sql_text(value: str) -> ColumnElement[str]:
    # Written into the statement, not sent as a parameter: the planner only uses the search
    # index when it sees the same constants the index was built with.
    return literal_column("'" + value.replace("'", "''") + "'")


def fold(expression: ColumnElement) -> ColumnElement[str]:
    return func.translate(func.lower(expression), _sql_text(FOLD_FROM), _sql_text(FOLD_TO))


_SIMPLE = literal_column("'simple'::regconfig")


def _vector(expression: ColumnElement) -> ColumnElement:
    return func.to_tsvector(_SIMPLE, fold(expression))


def post_vector() -> ColumnElement:
    """Title words weigh A, text words weigh B."""
    return func.setweight(_vector(func.coalesce(Post.title, _sql_text(""))), _sql_text("A")).op(
        "||"
    )(func.setweight(_vector(Post.body), _sql_text("B")))


def clean_query(raw: str | None) -> str | None:
    """The words to search for, or None when there are none: a blank box is not a search."""
    words = " ".join((raw or "").split())
    return words or None


def _like_prefix(word: str) -> str:
    escaped = word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"{escaped}%"


@dataclass(frozen=True)
class PostSearch:
    """A search over titles, text and (for one word) topic names."""

    match: ColumnElement[bool]
    rank: ColumnElement


def build_search(query: str) -> PostSearch:
    tsquery = func.websearch_to_tsquery(_SIMPLE, fold(literal(query)))
    in_text = post_vector().op("@@")(tsquery)
    rank = func.ts_rank_cd(
        literal_column("'{0.1, 0.2, 0.4, 1.0}'::float4[]"), post_vector(), tsquery, 32
    )
    if re.search(r"\s", query):
        return PostSearch(match=in_text, rank=rank)
    prefix = _like_prefix(query.lower())
    on_topic = exists(
        select(1)
        .select_from(PostTopic)
        .join(Technology, Technology.id == PostTopic.technology_id)
        .where(
            PostTopic.post_id == Post.id,
            fold(Technology.name).like(prefix, escape="\\")
            | Technology.slug.like(prefix, escape="\\"),
        )
    )
    return PostSearch(
        match=in_text | on_topic,
        rank=rank + case((on_topic, TOPIC_NAME_BONUS), else_=0.0),
    )


def _engagement() -> ColumnElement:
    return Post.like_count + COMMENT_WEIGHT * Post.comment_count


def search_order(search: PostSearch) -> tuple[ColumnElement, ...]:
    return (search.rank.desc(), _engagement().desc(), *NEWEST_FIRST)


def active_since() -> ColumnElement[bool]:
    return Post.created_at >= func.now() - ACTIVE_WINDOW


def active_order() -> tuple[ColumnElement, ...]:
    return (_engagement().desc(), *NEWEST_FIRST)


def viewer_topic_ids(viewer: User) -> list[int]:
    """The topics the viewer chose for the feed, or the technologies of their profile."""
    chosen = [topic.technology_id for topic in viewer.feed_topics]
    return chosen or [tech.technology_id for tech in viewer.technologies]


def for_you_order(topic_ids: list[int]) -> tuple[ColumnElement, ...]:
    age_hours = func.greatest(func.extract("epoch", func.now() - Post.created_at) / 3600.0, 0)
    boost = (
        case(
            (
                Post.id.in_(
                    select(PostTopic.post_id).where(PostTopic.technology_id.in_(topic_ids))
                ),
                TOPIC_BOOST,
            ),
            else_=1.0,
        )
        if topic_ids
        else literal(1.0)
    )
    score = cast(
        (_engagement() + 1) * boost / func.power(age_hours + AGE_OFFSET_HOURS, GRAVITY), Float
    )
    recent = Post.created_at >= func.now() - RANK_WINDOW
    return (recent.desc(), case((recent, score), else_=0.0).desc(), *NEWEST_FIRST)
