from collections.abc import Sequence

from app.services.groq import GroqApiError, GroqConfigurationError
from app.services.providers import ProviderUnavailable, first_answer
from app.services.verification import (
    CodebaseAnalysisResult,
    CodebaseAnalyzer,
    RepositorySnapshot,
)


class FallbackCodebaseAnalyzer:
    def __init__(self, *analyzers: CodebaseAnalyzer) -> None:
        self.analyzers = analyzers

    async def analyze(
        self, repositories: Sequence[RepositorySnapshot], role_slug: str, language: str
    ) -> CodebaseAnalysisResult:
        return await first_answer(
            self.analyzers,
            lambda analyzer: analyzer.analyze(list(repositories), role_slug, language),
            (GroqApiError, GroqConfigurationError, ProviderUnavailable),
        )
