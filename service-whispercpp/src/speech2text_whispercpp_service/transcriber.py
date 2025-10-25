#!/usr/bin/env python3
"""
Whisper.cpp transcription wrapper.

Provides transcription functionality with enhanced error messages and text
normalization.
"""

import re
import syslog
import threading
from pathlib import Path
from typing import Optional

from .types import TranscriptionCancelledError
from .whisper_cpp_client import WhisperCppClient


class Transcriber:
    """Wrapper around WhisperCppClient with error enhancement."""

    def __init__(
        self, client: WhisperCppClient, server_url: str, timeout: float = 30.0
    ):
        """Initialize transcriber.

        Args:
            client: WhisperCppClient instance
            server_url: Server URL for error messages
            timeout: Request timeout in seconds (default: 30.0)
        """
        self.client = client
        self.server_url = server_url
        self.timeout = timeout

    def transcribe(
        self, audio_file: Path, cancel_event: Optional[threading.Event] = None
    ) -> str:
        """Transcribe audio file using whisper.cpp server.

        Args:
            audio_file: Path to audio file
            cancel_event: Optional event to signal cancellation

        Returns:
            Transcribed text (normalized)

        Raises:
            TranscriptionCancelledError: If cancellation was requested
            Exception: If transcription fails with enhanced error message
        """
        if not audio_file.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_file}")

        # Check for cancellation before starting
        if cancel_event and cancel_event.is_set():
            syslog.syslog(syslog.LOG_INFO, "Transcription cancelled before start")
            raise TranscriptionCancelledError("Transcription cancelled by user")

        try:
            # Use JSON format for better error detection
            with audio_file.open("rb") as af:
                # Check cancellation before making request
                if cancel_event and cancel_event.is_set():
                    syslog.syslog(
                        syslog.LOG_INFO, "Transcription cancelled before API call"
                    )
                    raise TranscriptionCancelledError("Transcription cancelled by user")

                response = self.client.audio.transcriptions.create(
                    file=af, response_format="json", timeout=self.timeout
                )

            # Check cancellation after request completes
            if cancel_event and cancel_event.is_set():
                syslog.syslog(syslog.LOG_INFO, "Transcription cancelled after API call")
                raise TranscriptionCancelledError("Transcription cancelled by user")

            # Extract text from response
            if isinstance(response, dict):
                text = str(response.get("text", "")).strip()
            else:
                text = response.strip()

            # Normalize text
            text = self._normalize_text(text)

            syslog.syslog(
                syslog.LOG_INFO,
                f"Transcription successful, length: {len(text)} chars",
            )
            return text

        except TranscriptionCancelledError:
            # Re-raise cancellation exceptions
            raise
        except Exception as e:
            error_msg = self._enhance_error_message(e)
            syslog.syslog(syslog.LOG_ERR, f"Transcription failed: {error_msg}")
            raise Exception(error_msg) from e

    def _normalize_text(self, text: str) -> str:
        """Normalize transcribed text.

        Collapses multiple whitespace characters (including newlines) into single spaces.

        Args:
            text: Raw transcribed text

        Returns:
            Normalized text
        """
        # Collapse all whitespace (including newlines) into single spaces
        return re.sub(r"\s+", " ", text.strip())

    def _enhance_error_message(self, error: Exception) -> str:
        """Enhance error message with helpful context.

        Args:
            error: Original exception

        Returns:
            Enhanced error message
        """
        error_str = str(error)

        # Timeout errors - check first before connection errors
        if "timeout" in error_str.lower() or "timed out" in error_str.lower():
            return (
                f"Transcription timeout ({self.timeout}s) - audio too long or model too slow. "
                f"Increase WHISPER_TIMEOUT or use faster model"
            )

        # Connection errors
        if "Connection" in error_str or "connection" in error_str:
            return f"Cannot connect to whisper.cpp server at {self.server_url}. Is it running?"

        # 404 errors
        if "404" in error_str or "Not Found" in error_str:
            return f"Transcription endpoint not found - check WHISPER_SERVER_URL is correct: {self.server_url}"

        # Return original error if not recognized
        return error_str
