#!/usr/bin/env python3
"""
System dependency checker for GNOME Speech2Text service.

Validates required system dependencies (ffmpeg, clipboard tools, typing tools,
whisper.cpp server) with caching and detailed error messages.
"""

import os
import subprocess
import syslog
from typing import List, Optional

from .types import DependencyCheckResult
from .whisper_cpp_client import WhisperCppClient


class DependencyChecker:
    """Check and cache system dependency availability."""

    def __init__(self, server_url: str, whisper_client: WhisperCppClient):
        """Initialize dependency checker.

        Args:
            server_url: URL of whisper.cpp server for health checks
            whisper_client: Client instance for server health checks
        """
        self.server_url = server_url
        self.whisper_client = whisper_client

        # Cached results
        self._checked = False
        self._missing_deps: List[str] = []

    def check_dependencies(self) -> DependencyCheckResult:
        """Check all required dependencies.

        Returns cached result after first check.

        Returns:
            DependencyCheckResult with status and missing dependencies
        """
        if self._checked:
            return DependencyCheckResult(
                all_ok=len(self._missing_deps) == 0,
                missing_dependencies=self._missing_deps.copy(),
            )

        missing: List[str] = []

        # Check FFmpeg
        if not self._check_ffmpeg():
            missing.append("ffmpeg")

        # Check clipboard tools (session-type specific)
        clipboard_error = self._check_clipboard_tools()
        if clipboard_error:
            missing.append(clipboard_error)

        # Check typing tools (X11 only)
        typing_error = self._check_typing_tools()
        if typing_error:
            missing.append(typing_error)

        # Check server health
        if not self._check_server_health():
            missing.append(f"whisper.cpp server not responding at {self.server_url}")

        self._missing_deps = missing
        self._checked = True

        return DependencyCheckResult(
            all_ok=len(missing) == 0, missing_dependencies=missing
        )

    def _check_ffmpeg(self) -> bool:
        """Check if FFmpeg is available.

        Returns:
            True if ffmpeg is available
        """
        try:
            subprocess.run(
                ["ffmpeg", "-version"],
                capture_output=True,
                check=True,
                timeout=5,
            )
            return True
        except (
            FileNotFoundError,
            subprocess.CalledProcessError,
            subprocess.TimeoutExpired,
        ):
            syslog.syslog(syslog.LOG_WARNING, "FFmpeg not found or not working")
            return False

    def _check_clipboard_tools(self) -> Optional[str]:
        """Check for clipboard tools based on session type.

        Returns:
            Error message if clipboard tools missing, None if available
        """
        session_type = os.environ.get("XDG_SESSION_TYPE", "").lower()

        if session_type == "wayland":
            # Wayland: need wl-copy
            if self._command_available("wl-copy"):
                return None
            return "wl-clipboard (required for Wayland)"
        else:
            # X11 or unknown: check for xclip or xsel
            if self._command_available("xclip") or self._command_available("xsel"):
                return None
            return "clipboard-tools (xclip or xsel for X11)"

    def _check_typing_tools(self) -> Optional[str]:
        """Check for typing tools (xdotool on X11).

        Returns:
            Error message if typing tools missing, None if available or not needed
        """
        session_type = os.environ.get("XDG_SESSION_TYPE", "").lower()

        # Typing only supported on X11 (via xdotool)
        if session_type == "wayland":
            # On pure Wayland, xdotool won't work, but it might work via XWayland
            # We'll check anyway and warn if missing
            if not self._command_available("xdotool"):
                return "xdotool (required for typing text)"
            return None
        else:
            # X11: xdotool required
            if self._command_available("xdotool"):
                return None
            return "xdotool (required for typing text on X11)"

    def _check_server_health(self) -> bool:
        """Check if whisper.cpp server is responding.

        Returns:
            True if server is healthy
        """
        try:
            health = self.whisper_client.health_check()
            is_ok = health.get("status") == "ok"
            if not is_ok:
                syslog.syslog(
                    syslog.LOG_WARNING,
                    f"Whisper.cpp server health check failed: {health}",
                )
            return is_ok
        except Exception as e:
            syslog.syslog(
                syslog.LOG_WARNING, f"Whisper.cpp server health check error: {e}"
            )
            return False

    def _command_available(self, command: str) -> bool:
        """Check if a command is available in PATH.

        Args:
            command: Command name to check

        Returns:
            True if command is available
        """
        try:
            subprocess.run(
                ["which", command],
                capture_output=True,
                check=True,
                timeout=2,
            )
            return True
        except (
            FileNotFoundError,
            subprocess.CalledProcessError,
            subprocess.TimeoutExpired,
        ):
            return False
