# Only the embeddings still raise these; #255 moves them off Gemini and removes their last use.
class GeminiConfigurationError(Exception):
    pass


class GeminiApiError(Exception):
    pass
