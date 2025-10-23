"""GNOME Speech2Text Service - Whisper.cpp Backend

A D-Bus service that provides speech-to-text functionality for the GNOME Shell
extension using whisper.cpp server for local speech recognition.

Forked from kavehtehrani/gnome-speech2text
"""

__version__ = "2.0.0"
__author__ = "Bartek Celary"
__email__ = "bcelary@gmail.com"

# Naming constants - Single source of truth for service naming
# When renaming the service, update these constants and pyproject.toml
PACKAGE_NAME = "speech2text-whispercpp-service"
SERVICE_EXECUTABLE = "speech2text-whispercpp-service"
SETUP_EXECUTABLE = "speech2text-whispercpp-setup"
UNINSTALL_EXECUTABLE = "speech2text-whispercpp-uninstall"

# D-Bus naming (must match extension-side constants!)
DBUS_NAME = "org.gnome.Shell.Extensions.Speech2TextWhisperCpp"
DBUS_PATH = "/org/gnome/Shell/Extensions/Speech2TextWhisperCpp"
DBUS_SERVICE_FILE = "org.gnome.Shell.Extensions.Speech2TextWhisperCpp.service"
DBUS_INTERFACE_FILE = "org.gnome.Shell.Extensions.Speech2TextWhisperCpp.xml"

# Extension UUID (for reference/documentation)
EXTENSION_UUID = "speech2text-whispercpp@bcelary.github"

from .service import main

__all__ = [
    "main",
    "PACKAGE_NAME",
    "SERVICE_EXECUTABLE",
    "SETUP_EXECUTABLE",
    "UNINSTALL_EXECUTABLE",
    "DBUS_NAME",
    "DBUS_PATH",
    "DBUS_SERVICE_FILE",
    "DBUS_INTERFACE_FILE",
    "EXTENSION_UUID",
]
