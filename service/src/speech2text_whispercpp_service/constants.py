#!/usr/bin/env python3
"""
Constants for GNOME Speech2Text D-Bus Service.

Single source of truth for all service constants including naming,
D-Bus configuration, durations, timeouts, and state machine transitions.
"""


# Import enums for VALID_TRANSITIONS type hints
# (Avoid circular import by importing here, not at module level in types.py)


# ==============================================================================
# Package and Service Naming
# ==============================================================================
# When renaming the service, update these constants and pyproject.toml

PACKAGE_NAME = "speech2text-whispercpp-service"
SERVICE_EXECUTABLE = "speech2text-whispercpp-service"


# ==============================================================================
# D-Bus Configuration
# ==============================================================================
# Must match extension-side constants!

DBUS_NAME = "org.gnome.Shell.Extensions.Speech2TextWhisperCpp"
DBUS_PATH = "/org/gnome/Shell/Extensions/Speech2TextWhisperCpp"
DBUS_SERVICE_FILE = "org.gnome.Shell.Extensions.Speech2TextWhisperCpp.service"


# ==============================================================================
# Extension Reference
# ==============================================================================

EXTENSION_UUID = "speech2text-whispercpp@bcelary.github"


# ==============================================================================
# URLs
# ==============================================================================

GITHUB_REPO_URL = "https://github.com/bcelary/gnome-speech2text"


# ==============================================================================
# Audio Recording and Validation
# ==============================================================================

MIN_AUDIO_FILE_SIZE_BYTES = 100
AUDIO_VALIDATION_ATTEMPTS = 5
AUDIO_VALIDATION_RETRY_DELAY = 0.2  # seconds


# ==============================================================================
# Recording Duration Limits
# ==============================================================================

MIN_RECORDING_DURATION = 1  # 1 second
MAX_RECORDING_DURATION = (
    3600  # 1 hour - generous limit, client UI enforces tighter constraints
)


# ==============================================================================
# Process Termination Timeouts
# ==============================================================================

FFMPEG_GRACEFUL_SHUTDOWN_TIMEOUT = 2.0  # seconds
FFMPEG_STARTUP_DELAY = 0.1  # seconds
FILESYSTEM_FLUSH_DELAY = 0.3  # seconds
PROCESS_CLEANUP_DELAY = 0.2  # seconds


# ==============================================================================
# Thread Management
# ==============================================================================

WORKER_THREAD_JOIN_TIMEOUT = 5.0  # seconds
RECORDING_POLL_INTERVAL = 0.1  # seconds - for event.wait() timeout
