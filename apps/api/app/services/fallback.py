from collections.abc import Sequence

from app.services.gemini import GeminiApiError, GeminiCodebaseAnalyzer, GeminiConfigurationError
from app.services.groq import GroqApiError, GroqCodebaseAnalyzer, GroqConfigurationError
from app.services.verification import CodebaseAnalysisResult, RepositorySnapshot


class FallbackCodebaseAnalyzer:
    def __init__(
        self,
        primary: GroqCodebaseAnalyzer,
        fallback: GeminiCodebaseAnalyzer,
    ) -> None:
        self.primary = primary
        self.fallback = fallback

    async def analyze(
        self, repositories: Sequence[RepositorySnapshot], role_slug: str, language: str
    ) -> CodebaseAnalysisResult:
        try:
            return await self.primary.analyze(list(repositories), role_slug, language)
        except (GroqApiError, GroqConfigurationError):
            try:
                return await self.fallback.analyze(list(repositories), role_slug, language)
            except (GeminiApiError, GeminiConfigurationError):
                raise
