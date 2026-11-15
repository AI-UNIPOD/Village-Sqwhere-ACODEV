"""The match score as a pure function: the record's examples, the caps and the parts."""

import pytest

from app.services.match_score import match_score


@pytest.mark.parametrize(
    ("roles", "technologies", "sectors", "score"),
    [
        (1, 0, 0, 43),  # raw 30
        (1, 3, 0, 60),  # raw 42
        (2, 3, 1, 81),  # raw 57
        (2, 5, 2, 100),  # raw 70
        (3, 9, 4, 100),  # more of everything counts no further
        (1, 6, 3, 86),  # raw 60: technologies and sectors stop at five and two
        (0, 0, 0, 0),
    ],
)
def test_the_score_is_the_raw_points_scaled_to_100_and_rounded_half_up(
    roles: int, technologies: int, sectors: int, score: int
) -> None:
    assert match_score(roles, technologies, sectors).score == score


def test_the_breakdown_gives_raw_points_and_maxima_with_no_meaning_part() -> None:
    result = match_score(2, 3, 1)

    assert {name: (part.points, part.max) for name, part in result.breakdown} == {
        "roles": (40, 40),
        "technologies": (12, 20),
        "sectors": (5, 10),
        "meaning": (None, 30),
    }
    assert result.score_version == 1
    assert result.partial is True


def test_the_meaning_part_makes_a_score_of_version_2_that_is_the_plain_sum() -> None:
    result = match_score(2, 3, 1, 0.76)

    # 40 + 12 + 5 + 15, out of 100, with nothing scaled
    assert result.score == 72
    assert result.score_version == 2
    assert result.partial is False
    assert {name: (part.points, part.max) for name, part in result.breakdown} == {
        "roles": (40, 40),
        "technologies": (12, 20),
        "sectors": (5, 10),
        "meaning": (15, 30),
    }


def test_a_pair_with_no_similarity_is_still_scored_in_version_1() -> None:
    result = match_score(1, 0, 0, None)

    assert (result.score, result.score_version, result.partial) == (43, 1, True)
