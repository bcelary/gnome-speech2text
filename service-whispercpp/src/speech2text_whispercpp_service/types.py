#!/usr/bin/env python3
"""
Type definitions for GNOME Speech2Text D-Bus Service.

This module provides enums, dataclasses, and custom exceptions used throughout the service.
Constants have been moved to constants.py for better organization.
"""

from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import List, Optional


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
