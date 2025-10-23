#!/usr/bin/env python3
"""
Post-processing utilities for clipboard and text typing.

Handles copying text to clipboard and typing text automatically, with support
for both X11 and Wayland display servers.
"""

import os
import subprocess
import syslog
from typing import Optional


class PostProcessor:
    """Handle clipboard and typing operations with display server detection."""

    def __init__(self) -> None:
        """Initialize post-processor with cached display server detection."""
        self._display_server: Optional[str] = None

    def copy_to_clipboard(self, text: str) -> bool:
        """Copy text to clipboard with X11/Wayland support.

        Args:
            text: Text to copy to clipboard

        Returns:
            True if successful, False otherwise
        """
        if not text:
            return False

        display_server = self._detect_display_server()

        try:
            if display_server == "wayland":
                # Try wl-copy first (native Wayland)
                if self._run_clipboard_command(["wl-copy"], text):
                    return True
                # Fallback to xclip (XWayland)
                if self._run_clipboard_command(
                    ["xclip", "-selection", "clipboard"], text
                ):
                    return True
                syslog.syslog(
                    syslog.LOG_WARNING,
                    "Clipboard copy failed: no working clipboard tool found (Wayland)",
                )
                return False
            else:
                # X11: try xclip first, then xsel
                if self._run_clipboard_command(
                    ["xclip", "-selection", "clipboard"], text
                ):
                    return True
                if self._run_clipboard_command(
                    ["xsel", "--clipboard", "--input"], text
                ):
                    return True
                syslog.syslog(
                    syslog.LOG_WARNING,
                    "Clipboard copy failed: no working clipboard tool found (X11)",
                )
                return False
        except Exception as e:
            syslog.syslog(syslog.LOG_ERR, f"Error copying to clipboard: {e}")
            return False

    def type_text(self, text: str) -> bool:
        """Type text using xdotool.

        Args:
            text: Text to type

        Returns:
            True if successful, False otherwise
        """
        if not text:
            return False

        try:
            subprocess.run(
                ["xdotool", "type", "--clearmodifiers", "--delay", "10", text],
                check=True,
                timeout=30,
            )
            return True
        except FileNotFoundError:
            syslog.syslog(syslog.LOG_ERR, "xdotool not found, cannot type text")
            return False
        except subprocess.CalledProcessError as e:
            syslog.syslog(syslog.LOG_ERR, f"xdotool failed: {e}")
            return False
        except subprocess.TimeoutExpired:
            syslog.syslog(syslog.LOG_ERR, "xdotool timeout while typing text")
            return False
        except Exception as e:
            syslog.syslog(syslog.LOG_ERR, f"Error typing text: {e}")
            return False

    def _detect_display_server(self) -> str:
        """Detect if running on X11 or Wayland.

        Returns cached result after first detection.

        Returns:
            "wayland" or "x11"
        """
        if self._display_server is not None:
            return self._display_server

        try:
            # Check XDG_SESSION_TYPE first (most reliable)
            session_type = os.environ.get("XDG_SESSION_TYPE", "").lower()
            if session_type in ("wayland", "x11"):
                self._display_server = session_type
                return session_type

            # Fallback: check for Wayland/X11 specific env vars
            if os.environ.get("WAYLAND_DISPLAY"):
                self._display_server = "wayland"
                return "wayland"

            if os.environ.get("DISPLAY"):
                self._display_server = "x11"
                return "x11"

            # Default fallback
            self._display_server = "x11"
            syslog.syslog(
                syslog.LOG_WARNING,
                "Could not detect display server, defaulting to X11",
            )
            return "x11"
        except Exception as e:
            syslog.syslog(
                syslog.LOG_WARNING,
                f"Error detecting display server: {e}, defaulting to X11",
            )
            self._display_server = "x11"
            return "x11"

    def _run_clipboard_command(self, command: list[str], text: str) -> bool:
        """Run a clipboard command and return success status.

        Args:
            command: Command and arguments
            text: Text to pass as stdin

        Returns:
            True if command succeeded
        """
        try:
            subprocess.run(
                command,
                input=text,
                text=True,
                check=True,
                timeout=5,
            )
            return True
        except (
            FileNotFoundError,
            subprocess.CalledProcessError,
            subprocess.TimeoutExpired,
        ):
            return False
