#!/usr/bin/env python3
"""
FFmpeg audio recorder wrapper.

Manages FFmpeg process for recording audio from PulseAudio with graceful
termination and audio file validation.
"""

import contextlib
import signal
import subprocess
import syslog
import time
from pathlib import Path
from typing import Optional

from .constants import (
    AUDIO_VALIDATION_ATTEMPTS,
    AUDIO_VALIDATION_RETRY_DELAY,
    FFMPEG_GRACEFUL_SHUTDOWN_TIMEOUT,
    FFMPEG_STARTUP_DELAY,
    FILESYSTEM_FLUSH_DELAY,
    MIN_AUDIO_FILE_SIZE_BYTES,
    PROCESS_CLEANUP_DELAY,
)
from .types import AudioFile


class AudioRecorder:
    """FFmpeg wrapper for recording audio."""

    def __init__(self, audio_file: Path, max_duration: int):
        """Initialize audio recorder.

        Args:
            audio_file: Path where audio will be saved
            max_duration: Maximum recording duration in seconds
        """
        self.audio_file = audio_file
        self.max_duration = max_duration
        self.process: Optional[subprocess.Popen[str]] = None

    def start(self) -> None:
        """Start FFmpeg recording process.

        Raises:
            Exception: If FFmpeg fails to start
        """
        cmd = [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-nostats",
            "-loglevel",
            "error",
            "-f",
            "pulse",
            "-i",
            "default",
            "-flush_packets",
            "1",  # Force packet flushing
            "-bufsize",
            "32k",  # Small buffer size
            "-avioflags",
            "direct",  # Direct I/O, avoid buffering
            "-fflags",
            "+flush_packets",  # Additional flush flag
            "-t",
            str(self.max_duration),
            "-ar",
            "16000",
            "-ac",
            "1",
            "-f",
            "wav",
            str(self.audio_file),
        ]

        self.process = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdout=subprocess.PIPE,
            text=True,
        )

        syslog.syslog(
            syslog.LOG_INFO, f"FFmpeg process started with PID: {self.process.pid}"
        )
        syslog.syslog(syslog.LOG_INFO, f"FFmpeg command: {' '.join(cmd)}")

        # Check if process started successfully
        time.sleep(FFMPEG_STARTUP_DELAY)
        if self.process.poll() is not None:
            stderr_output = (
                self.process.stderr.read()
                if self.process.stderr
                else "No stderr available"
            )
            syslog.syslog(
                syslog.LOG_ERR,
                f"FFmpeg process failed immediately with return code: {self.process.returncode}",
            )
            syslog.syslog(syslog.LOG_ERR, f"FFmpeg stderr: {stderr_output}")
            raise Exception(f"FFmpeg failed to start: {stderr_output}")

    def stop(self, graceful: bool = True) -> None:
        """Stop the recording process.

        Args:
            graceful: If True, attempt graceful shutdown first
        """
        if not self.process or self.process.poll() is not None:
            return

        if graceful:
            self._terminate_gracefully()
        else:
            self._force_kill()

    def wait(self) -> int:
        """Wait for process to complete and return exit code.

        Returns:
            Process return code
        """
        if not self.process:
            return -1

        returncode = self.process.wait()
        syslog.syslog(
            syslog.LOG_INFO, f"FFmpeg process finished with return code: {returncode}"
        )

        # Capture any stderr output
        try:
            if self.process.stderr and not self.process.stderr.closed:
                stderr_output = self.process.stderr.read()
                if stderr_output:
                    syslog.syslog(syslog.LOG_INFO, f"FFmpeg stderr: {stderr_output}")
        except (ValueError, OSError) as e:
            syslog.syslog(
                syslog.LOG_DEBUG, f"Could not read stderr (process terminated): {e}"
            )

        return returncode

    def validate_audio_file(self) -> AudioFile:
        """Validate the recorded audio file exists and has minimum size.

        Returns:
            AudioFile with validation results
        """
        # Give filesystem time to flush
        time.sleep(FILESYSTEM_FLUSH_DELAY)

        syslog.syslog(syslog.LOG_INFO, f"Validating audio file: {self.audio_file}")

        for attempt in range(AUDIO_VALIDATION_ATTEMPTS):
            if self.audio_file.exists():
                file_size = self.audio_file.stat().st_size
                syslog.syslog(
                    syslog.LOG_INFO,
                    f"Attempt {attempt + 1}: File exists, size: {file_size} bytes",
                )

                if file_size > MIN_AUDIO_FILE_SIZE_BYTES:
                    syslog.syslog(
                        syslog.LOG_INFO,
                        f"Audio validation successful on attempt {attempt + 1}",
                    )
                    return AudioFile(
                        path=self.audio_file, size_bytes=file_size, exists=True
                    )
                else:
                    syslog.syslog(
                        syslog.LOG_WARNING,
                        f"File too small ({file_size} bytes), retrying...",
                    )
            else:
                syslog.syslog(
                    syslog.LOG_WARNING, f"Attempt {attempt + 1}: File doesn't exist yet"
                )

            # Small delay between attempts
            if attempt < AUDIO_VALIDATION_ATTEMPTS - 1:
                time.sleep(AUDIO_VALIDATION_RETRY_DELAY)

        # Validation failed
        file_size = self.audio_file.stat().st_size if self.audio_file.exists() else 0
        return AudioFile(
            path=self.audio_file, size_bytes=file_size, exists=self.audio_file.exists()
        )

    def _terminate_gracefully(self) -> None:
        """Terminate FFmpeg gracefully with escalating signals."""
        if not self.process:
            return

        syslog.syslog(syslog.LOG_INFO, "Terminating FFmpeg gracefully")

        try:
            # Try 'q' command first (FFmpeg's graceful quit)
            if self.process.stdin:
                try:
                    self.process.stdin.write("q\n")
                    self.process.stdin.flush()
                    self.process.stdin.close()
                    self.process.wait(timeout=FFMPEG_GRACEFUL_SHUTDOWN_TIMEOUT)
                    syslog.syslog(syslog.LOG_INFO, "FFmpeg terminated with 'q' command")
                    return
                except (subprocess.TimeoutExpired, BrokenPipeError, OSError):
                    syslog.syslog(
                        syslog.LOG_WARNING, "'q' command failed, trying SIGINT"
                    )

            # Try SIGINT
            self.process.send_signal(signal.SIGINT)
            try:
                self.process.wait(timeout=FFMPEG_GRACEFUL_SHUTDOWN_TIMEOUT)
                syslog.syslog(syslog.LOG_INFO, "FFmpeg terminated with SIGINT")
                return
            except subprocess.TimeoutExpired:
                syslog.syslog(syslog.LOG_WARNING, "SIGINT timeout, trying SIGTERM")

            # Try SIGTERM
            self.process.terminate()
            try:
                self.process.wait(timeout=PROCESS_CLEANUP_DELAY)
                syslog.syslog(syslog.LOG_INFO, "FFmpeg terminated with SIGTERM")
                return
            except subprocess.TimeoutExpired:
                syslog.syslog(syslog.LOG_WARNING, "SIGTERM timeout, force killing")

            # Force kill
            self._force_kill()

        except Exception as e:
            syslog.syslog(syslog.LOG_ERR, f"Error during graceful termination: {e}")
            self._force_kill()

    def _force_kill(self) -> None:
        """Force kill the FFmpeg process."""
        if not self.process:
            return

        syslog.syslog(syslog.LOG_WARNING, "Force killing FFmpeg process")

        with contextlib.suppress(Exception):
            self.process.kill()
            self.process.wait()

        # Final fallback: system kill
        if self.process.poll() is None:
            with contextlib.suppress(Exception):
                subprocess.run(
                    ["kill", "-9", str(self.process.pid)],
                    check=False,
                    timeout=2,
                )
