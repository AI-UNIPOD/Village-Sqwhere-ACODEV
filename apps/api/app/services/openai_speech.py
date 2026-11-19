import asyncio
import json
import secrets
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import OPENAI_API_KEY, OPENAI_STT_MODEL
from app.services.interview import InterviewUnavailable

# OpenAI's speech to text guide names its input formats by file extension, so the file is
# named for its real format. The keys are the base types of ALLOWED_AUDIO_TYPES in
# app/api/v1/interviews.py, the only types that reach this point.
FILE_EXTENSIONS = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/flac": "flac",
}


class OpenAITranscriber:
    """Speech to text when Groq's Whisper fails. Claude has no speech to text."""

    def __init__(
        self,
        api_key: str | None = OPENAI_API_KEY,
        model: str = OPENAI_STT_MODEL,
        timeout: float = 60,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    async def transcribe(self, audio: bytes, content_type: str) -> str:
        if not self.api_key:
            raise InterviewUnavailable("OpenAI speech transcription is not configured.")
        try:
            response = await asyncio.to_thread(self._post_multipart_sync, audio, content_type)
        except (HTTPError, URLError, TimeoutError, ValueError) as error:
            raise InterviewUnavailable("Speech transcription failed.") from error
        text = response.get("text")
        if not isinstance(text, str) or not text.strip():
            raise InterviewUnavailable("Speech transcription returned no text.")
        return text.strip()

    def _post_multipart_sync(self, audio: bytes, content_type: str) -> dict[str, Any]:
        boundary = f"----VillageSqwhere{secrets.token_hex(12)}"
        extension = FILE_EXTENSIONS.get(content_type.split(";")[0], "webm")
        body = b"".join(
            [
                (
                    f'--{boundary}\r\nContent-Disposition: form-data; name="model"\r\n'
                    f"\r\n{self.model}\r\n"
                ).encode(),
                (
                    f'--{boundary}\r\nContent-Disposition: form-data; name="file"; '
                    f'filename="answer.{extension}"\r\nContent-Type: {content_type}\r\n\r\n'
                ).encode(),
                audio,
                f"\r\n--{boundary}--\r\n".encode(),
            ]
        )
        request = Request(
            "https://api.openai.com/v1/audio/transcriptions",
            data=body,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "User-Agent": "village-sqwhere-api",
            },
            method="POST",
        )
        with urlopen(request, timeout=self.timeout) as response:
            result = json.load(response)
        if not isinstance(result, dict):
            raise ValueError("OpenAI transcription response is not an object")
        return result
