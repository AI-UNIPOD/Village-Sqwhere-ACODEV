from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.posts import PostType
from app.schemas.lookups import TechnologyRef
from app.schemas.posts import (
    PostAuthorRef,
    PostCreateRequest,
    PostItemResponse,
    PostListResponse,
    PostResponse,
    PostUpdateRequest,
)


def test_post_create_default_type_and_empty_topics() -> None:
    req = PostCreateRequest(body="Hello world")
    assert req.type == PostType.GENERAL
    assert req.topics == []
    assert req.title is None
    assert req.link_url is None


def test_post_create_title_stripped_and_length_boundaries() -> None:
    req = PostCreateRequest(title="x" + " " * 199, body="Hello")
    assert len(req.title) == 1
    assert req.title == "x"

    valid_req = PostCreateRequest(title="x" * 200, body="Hello")
    assert len(valid_req.title) == 200

    with pytest.raises(ValidationError):
        PostCreateRequest(title="x" * 201, body="Hello")

    with pytest.raises(ValidationError):
        PostCreateRequest(title="   ", body="Hello")


def test_post_create_body_whitespace_and_length_boundaries() -> None:
    with pytest.raises(ValidationError, match="body must not be whitespace only"):
        PostCreateRequest(body="   ")

    valid_req = PostCreateRequest(body="x" * 20000)
    assert len(valid_req.body) == 20000

    with pytest.raises(ValidationError):
        PostCreateRequest(body="x" * 20001)

    spaced_body = "  hello world  "
    req = PostCreateRequest(body=spaced_body)
    assert req.body == spaced_body


def test_post_create_link_url_patterns() -> None:
    http_req = PostCreateRequest(body="Hello", link_url="http://example.com")
    assert http_req.link_url == "http://example.com"

    https_req = PostCreateRequest(body="Hello", link_url="https://example.com/path?arg=1")
    assert https_req.link_url == "https://example.com/path?arg=1"

    with pytest.raises(ValidationError):
        PostCreateRequest(body="Hello", link_url="ftp://example.com")

    with pytest.raises(ValidationError):
        PostCreateRequest(body="Hello", link_url="example.com")


def test_post_create_rfc_title_requirement() -> None:
    with pytest.raises(ValidationError, match="title is required for RFC posts"):
        PostCreateRequest(type=PostType.RFC, body="Valid RFC body")

    rfc_req = PostCreateRequest(type=PostType.RFC, title="RFC 001", body="Valid RFC body")
    assert rfc_req.title == "RFC 001"

    general_req = PostCreateRequest(type=PostType.GENERAL, body="General post without title")
    assert general_req.title is None


def test_post_create_stray_fields_forbidden() -> None:
    stray_fields = [
        {"hub_id": str(uuid4())},
        {"author_id": str(uuid4())},
        {"like_count": 5},
        {"created_at": datetime.now(UTC).isoformat()},
    ]
    for stray in stray_fields:
        payload = {"body": "Hello", **stray}
        with pytest.raises(ValidationError):
            PostCreateRequest.model_validate(payload)


def test_post_create_accepts_hub_milestone() -> None:
    req = PostCreateRequest(type=PostType.HUB_MILESTONE, body="Milestone update")
    assert req.type == PostType.HUB_MILESTONE


def test_post_update_validations() -> None:
    with pytest.raises(ValidationError, match="body cannot be null"):
        PostUpdateRequest(body=None)

    with pytest.raises(ValidationError, match="body cannot be null"):
        PostUpdateRequest.model_validate({"body": None})

    title_cleared = PostUpdateRequest(title=None)
    assert title_cleared.title is None

    title_cleared_dict = PostUpdateRequest.model_validate({"title": None})
    assert title_cleared_dict.title is None

    with pytest.raises(ValidationError):
        PostUpdateRequest.model_validate({"type": "rfc"})

    with pytest.raises(ValidationError):
        PostUpdateRequest.model_validate({"author_id": str(uuid4())})

    empty = PostUpdateRequest()
    assert empty.model_dump(exclude_unset=True) == {}

    valid = PostUpdateRequest(title="Updated Title", body="Updated Body")
    assert valid.title == "Updated Title"
    assert valid.body == "Updated Body"


def test_post_author_ref_shape_and_forbids_email() -> None:
    ref = PostAuthorRef(
        id=uuid4(),
        username="faisal",
        display_name="Faisal K",
        avatar_url=None,
        is_verified=True,
    )
    dumped = ref.model_dump()
    assert "email" not in dumped
    assert dumped["username"] == "faisal"

    with pytest.raises(ValidationError):
        PostAuthorRef(
            id=uuid4(),
            username="faisal",
            display_name="Faisal K",
            avatar_url=None,
            is_verified=True,
            email="faisal@example.com",
        )


def test_post_item_and_list_response_envelopes() -> None:
    author = PostAuthorRef(
        id=uuid4(),
        username="faisal",
        display_name="Faisal K",
        avatar_url=None,
        is_verified=True,
    )
    topic = TechnologyRef(slug="python", name="Python")
    now = datetime.now(UTC)
    post_res = PostResponse(
        id=uuid4(),
        type=PostType.GENERAL,
        title="Python Tips",
        body="Useful tips for async programming.",
        link_url="https://example.com",
        author=author,
        topics=[topic],
        like_count=10,
        comment_count=2,
        created_at=now,
        updated_at=now,
        edited_at=None,
        liked_by_me=False,
        saved_by_me=True,
    )

    item_res = PostItemResponse(data=post_res)
    assert item_res.data.id == post_res.id

    list_res = PostListResponse(data=[post_res])
    assert list_res.data[0].id == post_res.id
    assert list_res.next_offset is None

    list_res_paged = PostListResponse(data=[post_res], next_offset=20)
    assert list_res_paged.next_offset == 20
