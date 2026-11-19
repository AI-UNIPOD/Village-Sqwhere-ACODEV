"""The lived-in demo: about 150 full members who write the feed and about 1,000 lighter members
who mostly like it, loaded from frozen fixtures in app/demo_fixtures. Nothing here is generated at
reset time: the fixtures were written once and reviewed, and the "random" choices below (who
likes what) come from a hash, so every run builds the same world.

Run by app.demo_seed after the original seven people. Every account is a demo account
(users.is_demo), so the wall in app/api/deps.py keeps all of it away from real developers. Every
count the feed shows (likes, comments, replies) is kept by the database triggers from the rows
written here, so each one is a true COUNT. Posts cannot change their own time, so a rerun
deletes the world's posts and writes them again, dated back from the moment it runs, with the
same ids. docs/decisions/2026-11-15-lived-in-demo.md
"""

import hashlib
import json
from datetime import UTC, datetime, timedelta
from math import gcd
from pathlib import Path
from uuid import UUID, uuid5

from sqlalchemy import delete, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.demo_vectors import write_frozen_vectors
from app.models import (
    Comment,
    CommentLike,
    Post,
    PostAttachment,
    PostLike,
    PostTopic,
    PostType,
    Role,
    Sector,
    Technology,
    User,
    UserRole,
    UserSector,
    UserTechnology,
)

FIXTURES = Path(__file__).parent / "demo_fixtures"
IMAGES = FIXTURES / "images"
# Fixed, so a post or comment keeps its address from one run to the next.
NAMESPACE = UUID("6f3d2c1e-8b47-4a59-9d0e-2c7b1a5f4e83")
# A like arrives within three days of what it likes, and never later than now.
LIKE_WINDOW_MINUTES = 3 * 24 * 60


def _read(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def load_members() -> tuple[list[dict], list[dict]]:
    members = _read("members.json")
    return members["full"], members["light"]


def load_posts() -> list[dict]:
    return [post for path in sorted(FIXTURES.glob("posts_*.json")) for post in _read(path.name)]


def _unit(*parts: str) -> float:
    """A number in [0, 1) that depends only on its parts."""
    digest = hashlib.sha256(":".join(parts).encode()).digest()
    return int.from_bytes(digest[:8], "big") / 2**64


def likers(key: str, count: int, pool: list[UUID], author: UUID) -> list[UUID]:
    """`count` different members of the pool, not the author, chosen the same way every run: a
    start and a step that shares no factor with the pool's size visit every member once."""
    size = len(pool)
    start = int(_unit(key, "start") * size)
    step = 1 + int(_unit(key, "step") * (size - 1))
    while gcd(step, size) != 1:
        step = step % (size - 1) + 1
    chosen = [pool[(start + i * step) % size] for i in range(min(count + 1, size))]
    return [member for member in chosen if member != author][:count]


async def _find_or_create_members(db: AsyncSession, full: list[dict], light: list[dict], now):
    handles = [member["handle"] for member in full + light]
    found = {
        user.username: user
        for user in await db.scalars(select(User).where(User.username.in_(handles), User.is_demo))
    }
    roles = {role.slug: role.id for role in await db.scalars(select(Role))}
    techs = {tech.slug: tech.id for tech in await db.scalars(select(Technology))}
    sectors = {sector.slug: sector.id for sector in await db.scalars(select(Sector))}
    for member in full + light:
        if member["handle"] in found:
            continue
        joined = now - timedelta(days=30 + int(_unit(member["handle"], "joined") * 330))
        user = User(
            username=member["handle"],
            display_name=member["name"],
            bio=member["bio"] or None,
            country_code=member["country"],
            is_demo=True,
            created_at=joined,
        )
        if member.get("verified"):
            user.verified_at = joined + timedelta(days=3)
        db.add(user)
        found[member["handle"]] = user
    await db.flush()
    for member in full + light:
        user = found[member["handle"]]
        if await db.scalar(select(UserRole.user_id).where(UserRole.user_id == user.id).limit(1)):
            continue
        held = member.get("roles") or [member["role"]]
        db.add_all(
            UserRole(
                user_id=user.id,
                role_id=roles[slug],
                is_primary=slug == member.get("primary_role", held[0]),
                verified_at=user.verified_at if member.get("verified") else None,
            )
            for slug in held
        )
        db.add_all(
            UserTechnology(user_id=user.id, technology_id=techs[slug]) for slug in member["stack"]
        )
        db.add_all(
            UserSector(user_id=user.id, sector_id=sectors[slug])
            for slug in member.get("sectors", [])
        )
    await db.flush()
    return {handle: user.id for handle, user in found.items()}


async def write_world(db: AsyncSession) -> tuple[int, int]:
    """Writes the members, then every post, comment and like, dated back from now. Returns the
    number of posts and comments written."""
    now = datetime.now(UTC)
    full, light = load_members()
    posts = load_posts()
    ids = await _find_or_create_members(db, full, light, now)
    pool = sorted(ids.values(), key=str)
    members = list(ids.values())  # the seven original people keep the posts demo_seed wrote
    # the seven people of app.demo_seed answer in threads too, so they must exist already
    others = {
        handle
        for post in posts
        for handle in [post["by"], *(comment["by"] for comment in post["comments"])]
    } - set(ids)
    for user in await db.scalars(select(User).where(User.username.in_(others), User.is_demo)):
        ids[user.username] = user.id
    if missing := others - set(ids):
        raise RuntimeError(f"Run the seed first: {sorted(missing)} are not in the database.")
    techs = {tech.slug: tech.id for tech in await db.scalars(select(Technology))}

    # posts cannot change their own time, so they are written again; their comments, likes and
    # topics go with them
    await db.execute(delete(Post).where(Post.author_id.in_(members)))

    post_rows, topic_rows, like_rows, image_rows, comments = [], [], [], [], []
    for post in posts:
        post_id = uuid5(NAMESPACE, post["key"])
        posted = now - timedelta(hours=post["age_hours"])
        author = ids[post["by"]]
        post_rows.append(
            {
                "id": post_id,
                "author_id": author,
                "type": PostType(post["type"]),
                "title": post.get("title"),
                "body": post["body"],
                "created_at": posted,
                "updated_at": posted,
            }
        )
        topic_rows += [
            {"post_id": post_id, "technology_id": techs[slug]}
            for slug in post["topics"]
            if slug in techs
        ]
        image_rows += [
            _image_row(post["key"], post_id, position, image, posted)
            for position, image in enumerate(post.get("images", []))
        ]
        like_rows += _likes(
            PostLike.post_id.key, post["key"], post_id, post["likes"], posted, now, pool, author
        )
        times = {None: posted}
        for comment in post["comments"]:
            parent = comment["parent"]
            made = times[parent] + timedelta(minutes=comment["after_minutes"])
            times[comment["key"]] = made
            comments.append((post_id, post["key"], comment, made))

    await _insert(db, Post, post_rows)
    await _insert(db, PostTopic, topic_rows)
    await _insert(db, PostAttachment, image_rows, batch=40)

    comment_rows, comment_like_rows, depth, root = [], [], {None: -1}, {}
    for post_id, post_key, comment, made in comments:
        key = f"{post_key}:{comment['key']}"
        comment_id = uuid5(NAMESPACE, key)
        parent = comment["parent"]
        depth[comment["key"]] = depth[parent] + 1
        root[comment["key"]] = comment_id if parent is None else root[parent]
        comment_rows.append(
            {
                "id": comment_id,
                "post_id": post_id,
                "parent_id": None if parent is None else uuid5(NAMESPACE, f"{post_key}:{parent}"),
                "root_id": root[comment["key"]],
                "depth": depth[comment["key"]],
                "author_id": ids[comment["by"]],
                "body": comment["body"],
                "created_at": made,
                "updated_at": made,
            }
        )
        comment_like_rows += _likes(
            CommentLike.comment_id.key,
            key,
            comment_id,
            comment["likes"],
            made,
            now,
            pool,
            ids[comment["by"]],
        )
    # parents first, so a reply never meets a missing parent
    for level in range(max((row["depth"] for row in comment_rows), default=-1) + 1):
        await _insert(db, Comment, [row for row in comment_rows if row["depth"] == level])
    await _insert(db, PostLike, like_rows)
    await _insert(db, CommentLike, comment_like_rows)
    await write_frozen_vectors(db)  # the verified members' own, once they are all there
    return len(post_rows), len(comment_rows)


async def _insert(db: AsyncSession, model, rows: list[dict], batch: int = 5000) -> None:
    for start in range(0, len(rows), batch):
        await db.execute(insert(model), rows[start : start + batch])


def _image_row(post_key: str, post_id: UUID, position: int, image: dict, posted: datetime) -> dict:
    """A picture is a file in demo_fixtures/images, stored like an upload: its bytes in the row."""
    data = (IMAGES / image["file"]).read_bytes()
    return {
        "id": uuid5(NAMESPACE, f"{post_key}:image{position}"),
        "post_id": post_id,
        "data": data,
        "mime_type": "image/webp",
        "byte_size": len(data),
        "width": image["width"],
        "height": image["height"],
        "position": position,
        "created_at": posted,
    }


def _likes(column, key, target, count, made, now, pool, author) -> list[dict]:
    return [
        {
            column: target,
            "user_id": member,
            "created_at": min(
                now, made + timedelta(minutes=int(_unit(key, str(member)) * LIKE_WINDOW_MINUTES))
            ),
        }
        for member in likers(key, count, pool, author)
    ]
