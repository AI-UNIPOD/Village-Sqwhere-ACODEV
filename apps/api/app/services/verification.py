import asyncio
import json
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import GITHUB_API_TOKEN
from app.models.users import VerificationPhase, VerificationSession, VerificationStatus


class RepositorySnapshot(BaseModel):
    repository_url: str
    default_branch: str
    languages: dict[str, int]
    file_paths: list[str] = Field(max_length=2000)
    test_paths: list[str] = Field(max_length=500)
    recent_commits: list[dict] = Field(max_length=20)
    tree_truncated: bool = False


class RepositorySnapshotClient(Protocol):
    async def snapshot(self, repository_url: str) -> RepositorySnapshot: ...


class GitHubRepositoryError(Exception):
    pass


class GitHubRepositoryClient:
    def __init__(self, token: str | None = GITHUB_API_TOKEN, timeout: float = 15) -> None:
        self.token = token
        self.timeout = timeout

    async def snapshot(self, repository_url: str) -> RepositorySnapshot:
        owner, repository = self._repository_parts(repository_url)
        base_url = f"https://api.github.com/repos/{owner}/{repository}"
        repository_data = await self._get_json(base_url)
        branch = repository_data.get("default_branch")
        if not isinstance(branch, str) or not branch:
            raise GitHubRepositoryError("GitHub did not return a default branch.")

        languages, tree, commits = await asyncio.gather(
            self._get_json(f"{base_url}/languages"),
            self._get_json(f"{base_url}/git/trees/{branch}?recursive=1"),
            self._get_json(f"{base_url}/commits?per_page=20"),
        )
        file_paths = [
            item["path"]
            for item in tree.get("tree", [])
            if item.get("type") == "blob" and isinstance(item.get("path"), str)
        ][:2000]
        test_paths = [path for path in file_paths if self._is_test_path(path)][:500]
        recent_commits = [
            {
                "sha": item.get("sha"),
                "message": item.get("commit", {}).get("message", "").splitlines()[0],
                "date": item.get("commit", {}).get("author", {}).get("date"),
            }
            for item in commits[:20]
            if isinstance(item, dict)
        ]
        return RepositorySnapshot(
            repository_url=repository_url,
            default_branch=branch,
            languages=languages if isinstance(languages, dict) else {},
            file_paths=file_paths,
            test_paths=test_paths,
            recent_commits=recent_commits,
            tree_truncated=bool(tree.get("truncated", False)),
        )

    async def _get_json(self, url: str) -> object:
        try:
            return await asyncio.to_thread(self._get_json_sync, url)
        except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError) as error:
            raise GitHubRepositoryError("GitHub repository data could not be loaded.") from error

    def _get_json_sync(self, url: str) -> object:
        headers = {
            "Accept": "application/vnd.github+json",
            "User-Agent": "village-sqwhere-api",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        request = Request(url, headers=headers)
        with urlopen(request, timeout=self.timeout) as response:
            return json.load(response)

    @staticmethod
    def _repository_parts(repository_url: str) -> tuple[str, str]:
        parsed = urlsplit(repository_url)
        parts = parsed.path.strip("/").split("/")
        if parsed.scheme != "https" or parsed.netloc != "github.com" or len(parts) != 2:
            raise GitHubRepositoryError("Repository must be an HTTPS GitHub repository URL.")
        owner, repository = parts
        if not owner or not repository:
            raise GitHubRepositoryError("Repository URL is incomplete.")
        return owner, repository.removesuffix(".git")

    @staticmethod
    def _is_test_path(path: str) -> bool:
        lowered = path.lower()
        return (
            "/test/" in f"/{lowered}/"
            or "/tests/" in f"/{lowered}/"
            or lowered.startswith("test_")
            or ".test." in lowered
            or ".spec." in lowered
        )


class CodebaseAnalysisResult(BaseModel):
    score: float = Field(ge=0, le=100)
    summary: str = Field(min_length=1, max_length=4000)
    strengths: list[str] = Field(max_length=20)
    concerns: list[str] = Field(max_length=20)
    evidence: list[dict] = Field(max_length=50)
    model: str = Field(min_length=1, max_length=100)
    criterion_assessments: list[dict] = Field(default_factory=list, max_length=10)
    security_flags: list[str] = Field(default_factory=list, max_length=20)
    confidence: float = Field(default=0.0, ge=0, le=1)


class CodebaseAnalyzer(Protocol):
    async def analyze(
        self, repositories: Sequence[RepositorySnapshot], role_slug: str
    ) -> CodebaseAnalysisResult: ...


async def analyze_codebase(
    session: VerificationSession,
    role_slug: str,
    repository_client: RepositorySnapshotClient,
    analyzer: CodebaseAnalyzer,
) -> CodebaseAnalysisResult:
    repository_urls = [item["repository_url"] for item in session.evidence]
    snapshots = await asyncio.gather(
        *(repository_client.snapshot(repository_url) for repository_url in repository_urls)
    )
    return await analyzer.analyze(snapshots, role_slug)


async def run_codebase_analysis(
    db: AsyncSession,
    session: VerificationSession,
    role_slug: str,
    repository_client: RepositorySnapshotClient,
    analyzer: CodebaseAnalyzer,
) -> CodebaseAnalysisResult:
    """Run and persist phase one without making the HTTP request wait for analysis."""
    if session.status not in {VerificationStatus.PENDING, VerificationStatus.IN_PROGRESS}:
        raise ValueError("Verification session is not available for codebase analysis.")
    if session.current_phase != VerificationPhase.CODEBASE_ANALYSIS:
        raise ValueError("Verification session is not in the codebase analysis phase.")

    session.status = VerificationStatus.IN_PROGRESS
    await db.commit()

    result = await analyze_codebase(session, role_slug, repository_client, analyzer)

    session.ai_score = result.score
    session.ai_result = {"codebase_analysis": result.model_dump(mode="json")}
    session.current_phase = VerificationPhase.TECHNICAL_DEFENCE
    session.updated_at = datetime.now(UTC)
    await db.commit()
    return result
