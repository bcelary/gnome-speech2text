#!/usr/bin/env python3
"""
Type definitions for GNOME Speech2Text D-Bus Service.

This module provides enums, dataclasses, and constants used throughout the service.
"""

from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, Set


class RecordingState(Enum):
    """States in the recording lifecycle state machine."""

    STARTING = "starting"
    RECORDING = "recording"
    RECORDED = "recorded"
    TRANSCRIBING = "transcribing"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"


class PostRecordingAction(Enum):
    """Actions to take after transcription completes."""

    PREVIEW = "preview"  # No automatic action (text available via D-Bus signal only)
    TYPE_ONLY = "type_only"  # Auto-type text
    COPY_ONLY = "copy_only"  # Copy to clipboard only
    TYPE_AND_COPY = "type_and_copy"  # Both type and copy


# Valid state transitions for the recording state machine
# Note: FAILED state can be reached from any state (including terminal states)
# via the special case in Recording._transition_state() for error handling.
VALID_TRANSITIONS: Dict[RecordingState, Set[RecordingState]] = {
    RecordingState.STARTING: {
        RecordingState.RECORDING,
        RecordingState.CANCELLED,
        RecordingState.FAILED,
    },
    RecordingState.RECORDING: {
        RecordingState.RECORDED,
        RecordingState.CANCELLED,
        RecordingState.FAILED,
    },
    RecordingState.RECORDED: {
        RecordingState.TRANSCRIBING,
        RecordingState.CANCELLED,  # Allow cancellation before transcription starts
        RecordingState.FAILED,
    },
    RecordingState.TRANSCRIBING: {
        RecordingState.COMPLETED,
        RecordingState.CANCELLED,  # Allow cancellation during transcription
        RecordingState.FAILED,
    },
    # Terminal states have no valid transitions
    RecordingState.COMPLETED: set(),
    RecordingState.CANCELLED: set(),
    RecordingState.FAILED: set(),
}


@dataclass(frozen=True)
class ServiceConfig:
    """Immutable service-wide configuration from environment variables."""

    server_url: str
    model_file: str
    language: str
    vad_model: Optional[str]
    auto_start: bool


@dataclass(frozen=True)
class RecordingConfig:
    """Immutable per-recording configuration."""

    recording_id: str
    duration: int
    post_recording_action: PostRecordingAction


@dataclass
class AudioFile:
    """Metadata about a recorded audio file."""

    path: Path
    size_bytes: int
    exists: bool


@dataclass
class DependencyCheckResult:
    """Result of system dependency check."""

    all_ok: bool
    missing_dependencies: List[str]
    error_message: Optional[str] = None


# Constants for recording validation
MIN_AUDIO_FILE_SIZE_BYTES = 100
AUDIO_VALIDATION_ATTEMPTS = 5
AUDIO_VALIDATION_RETRY_DELAY = 0.2

# Duration limits
MIN_RECORDING_DURATION = 1
MAX_RECORDING_DURATION = 300  # 5 minutes

# Process termination timeouts
FFMPEG_GRACEFUL_SHUTDOWN_TIMEOUT = 2.0
FFMPEG_STARTUP_DELAY = 0.1
FILESYSTEM_FLUSH_DELAY = 0.3
PROCESS_CLEANUP_DELAY = 0.2

# Thread shutdown
WORKER_THREAD_JOIN_TIMEOUT = 5.0
RECORDING_POLL_INTERVAL = 0.1  # For event.wait() timeout


class InvalidStateTransitionError(Exception):
    """Raised when attempting an invalid state transition."""

    def __init__(self, current: RecordingState, requested: RecordingState):
        self.current = current
        self.requested = requested
        super().__init__(
            f"Invalid state transition: {current.value} -> {requested.value}"
        )


class TranscriptionCancelledError(Exception):
    """Raised when transcription is cancelled by user request."""

    pass


class DependencyError(Exception):
    """Raised when required system dependencies are missing."""

    def __init__(self, missing: List[str]):
        self.missing = missing
        super().__init__(f"Missing dependencies: {', '.join(missing)}")
