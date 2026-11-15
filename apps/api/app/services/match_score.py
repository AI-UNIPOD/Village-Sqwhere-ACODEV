"""The match score, with meaning points when both embeddings are available.

The score is counted from stored facts, never judged. Until both embeddings exist, the 70
available points are scaled to 100 and the response says it is partial.
"""

from app.schemas.matches import ScoreBreakdown, Scored, ScorePart

SCORE_VERSION = 2

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


def match_score(
    roles: int, technologies: int, sectors: int, meaning_similarity: float | None = None
) -> Scored:
    """Score shared facts and, when available, cosine similarity between embeddings."""
    role_points = MANY_ROLES_POINTS if roles >= 2 else ONE_ROLE_POINTS if roles == 1 else 0
    technology_points = min(technologies, TECHNOLOGY_CAP) * TECHNOLOGY_POINTS
    sector_points = min(sectors, SECTOR_CAP) * SECTOR_POINTS
    meaning_points = (
        int(max(0.0, min(1.0, meaning_similarity)) * MEANING_MAX + 0.5)
        if meaning_similarity is not None
        else None
    )
    raw = role_points + technology_points + sector_points
    if meaning_points is not None:
        raw += meaning_points
    maximum = 100 if meaning_points is not None else AVAILABLE_MAX
    return Scored(
        score=(raw * 100 + maximum // 2) // maximum,
        score_version=SCORE_VERSION if meaning_points is not None else 1,
        partial=meaning_points is None,
        breakdown=ScoreBreakdown(
            roles=ScorePart(points=role_points, max=ROLES_MAX),
            technologies=ScorePart(points=technology_points, max=TECHNOLOGIES_MAX),
            sectors=ScorePart(points=sector_points, max=SECTORS_MAX),
            meaning=ScorePart(points=meaning_points, max=MEANING_MAX),
        ),
    )
