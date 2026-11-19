"""The match score, versions 1 and 2.

Why: `docs/decisions/2026-11-14-match-score.md` and `2026-11-15-match-score-meaning.md`; the
band was measured again in `2026-11-19-embeddings-on-openai.md`.

The score is counted from numbers, never judged. Version 2 adds the meaning part (30 points),
read from the stored vectors. A pair with a missing vector keeps version 1, which scales the 70
points that exist to 100. The SQL that orders the match lists reads these same constants, so the
order and the number cannot disagree.
"""

import math
from typing import Any

from sqlalchemy import ColumnElement

from app.schemas.matches import ScoreBreakdown, Scored, ScorePart

SCORE_VERSION = 2
PARTIAL_SCORE_VERSION = 1

ONE_ROLE_POINTS = 30
MANY_ROLES_POINTS = 40
TECHNOLOGY_POINTS = 4
TECHNOLOGY_CAP = 5
SECTOR_POINTS = 5
SECTOR_CAP = 2
MEANING_MAX = 30

ROLES_MAX = MANY_ROLES_POINTS
TECHNOLOGIES_MAX = TECHNOLOGY_POINTS * TECHNOLOGY_CAP
SECTORS_MAX = SECTOR_POINTS * SECTOR_CAP
AVAILABLE_MAX = ROLES_MAX + TECHNOLOGIES_MAX + SECTORS_MAX

# Measured on 19 November 2026 with OpenAI's vectors (`2026-11-19-embeddings-on-openai.md`): an
# idea and a developer's profile read 0.17 to 0.46 alike, with the best fits at 0.34 and above
# and profiles that do not fit at 0.17 to 0.30. The meaning points stretch 0.15 to 0.45 from 0 to
# 30. 0.60 is where two ideas read close: the same idea in English and in French read 0.61 to
# 0.77 and two ideas with one subject 0.64, while unrelated ideas reached 0.55.
MEANING_FLOOR = 0.15
MEANING_CEILING = 0.45
MEANING_BAND = MEANING_CEILING - MEANING_FLOOR
SIMILAR_FROM = 0.60


def similarity(embedding: Any, other: Any) -> ColumnElement[float]:
    """How alike two vectors read in SQL, as 1 minus their cosine distance."""
    return 1 - embedding.cosine_distance(other)


def meaning_points(read_alike: float) -> int:
    """The meaning points, from 0 to 30. `meaning_points_sql` in `matches.py` does the same steps
    on double precision numbers and rounds half up with `floor(x + 0.5)`, which both compute
    exactly, so the two always give the same whole number."""
    position = min(max((read_alike - MEANING_FLOOR) / MEANING_BAND, 0.0), 1.0)
    return math.floor(MEANING_MAX * position + 0.5)


def match_score(
    roles: int, technologies: int, sectors: int, read_alike: float | None = None
) -> Scored:
    """Score a match from the matched role count, the shared technology and sector counts, and
    how alike the two vectors read. `read_alike` is None when either vector is missing."""
    role_points = MANY_ROLES_POINTS if roles >= 2 else ONE_ROLE_POINTS if roles == 1 else 0
    technology_points = min(technologies, TECHNOLOGY_CAP) * TECHNOLOGY_POINTS
    sector_points = min(sectors, SECTOR_CAP) * SECTOR_POINTS
    raw = role_points + technology_points + sector_points
    meaning = None if read_alike is None else meaning_points(read_alike)
    return Scored(
        score=(
            # whole numbers only, so it rounds half up without floating point
            (raw * 100 + AVAILABLE_MAX // 2) // AVAILABLE_MAX if meaning is None else raw + meaning
        ),
        score_version=PARTIAL_SCORE_VERSION if meaning is None else SCORE_VERSION,
        partial=meaning is None,
        breakdown=ScoreBreakdown(
            roles=ScorePart(points=role_points, max=ROLES_MAX),
            technologies=ScorePart(points=technology_points, max=TECHNOLOGIES_MAX),
            sectors=ScorePart(points=sector_points, max=SECTORS_MAX),
            meaning=ScorePart(points=meaning, max=MEANING_MAX),
        ),
    )
