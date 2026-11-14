"""The match score, version 1 (`docs/decisions/2026-11-14-match-score.md`).

The score is counted from three numbers, never judged. The meaning part (30 points) comes with
embeddings, so version 1 scales the 70 points that exist to 100. The SQL that orders the match
lists reads these same constants, so the order and the number cannot disagree.
"""

from app.schemas.matches import ScoreBreakdown, Scored, ScorePart

SCORE_VERSION = 1

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


def match_score(roles: int, technologies: int, sectors: int) -> Scored:
    """Score a match from the matched role count and the shared technology and sector counts."""
    role_points = MANY_ROLES_POINTS if roles >= 2 else ONE_ROLE_POINTS if roles == 1 else 0
    technology_points = min(technologies, TECHNOLOGY_CAP) * TECHNOLOGY_POINTS
    sector_points = min(sectors, SECTOR_CAP) * SECTOR_POINTS
    raw = role_points + technology_points + sector_points
    return Scored(
        # whole numbers only, so it rounds half up without floating point
        score=(raw * 100 + AVAILABLE_MAX // 2) // AVAILABLE_MAX,
        score_version=SCORE_VERSION,
        partial=True,
        breakdown=ScoreBreakdown(
            roles=ScorePart(points=role_points, max=ROLES_MAX),
            technologies=ScorePart(points=technology_points, max=TECHNOLOGIES_MAX),
            sectors=ScorePart(points=sector_points, max=SECTORS_MAX),
            meaning=ScorePart(points=None, max=MEANING_MAX),
        ),
    )
