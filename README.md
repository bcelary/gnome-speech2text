# GNOME Speech2Text

![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)
![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat&logo=linux&logoColor=black)
![GNOME](https://img.shields.io/badge/GNOME-4A90D9?style=flat&logo=gnome&logoColor=white)
![Whisper](https://img.shields.io/badge/Whisper-412991?style=flat&logo=openai&logoColor=white)

Local speech-to-text for GNOME Shell using [whisper.cpp](https://github.com/ggerganov/whisper.cpp). Record audio with a keyboard shortcut, transcribe it locally, and insert the text at your cursor or copy to clipboard.

> **Fork Notice**: This is a fork of [kavehtehrani/gnome-speech2text](https://github.com/kavehtehrani/gnome-speech2text) modified to work with whisper.cpp server for blazing-fast local transcription. The main advantage is speed and flexibility - you can tweak whisper.cpp settings, choose different models, and enjoy significantly faster inference compared to Python-based solutions.

![recording-modal](./images/recording-modal.png)

## Features

- **Fast & Local** - Uses whisper.cpp server for blazing-fast C++ inference (no cloud APIs, much faster than Python implementations)
- **Highly Customizable** - Choose different Whisper models (tiny to large), configure VAD, set language preferences
- **Quick Access** - Panel button + keyboard shortcut (default: Super+Alt+Space)
- **Multi-language** - Supports all languages available in Whisper models
- **Text Insertion** - Automatically insert at cursor (X11) or copy to clipboard (Wayland)
- **Voice Activity Detection** - Optional VAD filtering to reduce hallucinations

## Quick Start

### 1. Install System Dependencies

**Ubuntu/Debian:**

```bash
sudo apt install python3 pipx ffmpeg python3-dbus python3-gi wl-clipboard xdotool xclip
```

**Fedora:**

```bash
sudo dnf install python3 pipx ffmpeg python3-dbus python3-gobject wl-clipboard xdotool xclip
```

### 2. Set Up whisper.cpp Server

This extension requires a [whisper.cpp](https://github.com/ggerganov/whisper.cpp) server with models in `~/.cache/whisper.cpp/`.

For detailed build instructions and requirements, see the [whisper.cpp repository](https://github.com/ggerganov/whisper.cpp).

**Quick setup:**

```bash
# Build and install whisper.cpp server
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp
make server
sudo make install

# Download models (e.g., 'base' model)
bash ./models/download-ggml-model.sh base ~/.cache/whisper.cpp
```

### 3. Install Service & Extension

```bash
git clone https://github.com/bcelary/gnome-speech2text.git
cd gnome-speech2text
make install
```

This installs both the D-Bus service (via pipx) and the GNOME Shell extension.

**Restart GNOME Shell:**

- **X11:** Press `Alt+F2`, type `r`, press Enter
- **Wayland:** Log out and back in

**Note:** For manual service installation or development setup, see [service-whispercpp/README.md](./service-whispercpp/README.md).

## Configuration

### Service Configuration

The default settings work for most users. To customize model selection, language, or Voice Activity Detection, configure these environment variables:

Create or edit `~/.config/environment.d/custom-env.conf`:

```bash
WHISPER_MODEL=small                       # Model: tiny, base, small, medium, large-v3-turbo
WHISPER_LANGUAGE=auto                     # Language: auto, en, es, fr, de, etc.
WHISPER_VAD_MODEL=auto                    # VAD: auto (recommended), none, or specific model
WHISPER_SERVER_URL=http://localhost:8080  # Server URL
```

Then log out and back in for changes to take effect.

### Extension Preferences

Right-click the microphone icon → Settings:

- **Keyboard Shortcut** - Customize recording hotkey
- **Recording Duration** - Max recording time (10-300 seconds)
- **Copy to Clipboard** - Auto-copy transcribed text
- **Skip Preview** (X11 only) - Insert text immediately without preview

## Usage

1. Press **Super+Alt+Space** (or click the microphone icon)
2. Speak when the recording dialog appears
3. Wait for transcription
4. Review and click **Insert** or **Copy**

## Troubleshooting

**Service not starting:**

```bash
# Check D-Bus registration
dbus-send --session --print-reply \
  --dest=org.gnome.Shell.Extensions.Speech2TextWhisperCpp \
  /org/gnome/Shell/Extensions/Speech2TextWhisperCpp \
  org.gnome.Shell.Extensions.Speech2TextWhisperCpp.GetServiceStatus

# View logs
journalctl -f | grep -E "(gnome-shell|speech2text|whispercpp)"
```

**Extension not appearing:**

```bash
# Verify installation
make status

# Check extension is enabled
gnome-extensions enable gnome-speech2text@bcelary.github
```

**Text insertion not working on Wayland:**

Text insertion requires X11. On Wayland, use "Copy to Clipboard" mode instead.

For more troubleshooting, see [service-whispercpp/README.md](./service-whispercpp/README.md).

## Development

### Extension Development

```bash
# See help for detailed targets to install/remove the extension files as needed:
make help

# View logs
journalctl -f | grep speech2text
```

### Service Development

See [service-whispercpp/README.md](./service-whispercpp/README.md) for detailed instructions on setting up the service in development mode with `uv`.

## Uninstallation

```bash
cd gnome-speech2text
make uninstall
```

This removes everything: extension, service files, pipx package, and resets settings.

**Note:** whisper.cpp binaries are not removed. To remove them, run `sudo make uninstall` from your whisper.cpp directory.

## Architecture

The extension consists of two components:

1. **GNOME Extension** (UI) - Panel button, keyboard shortcuts, settings dialog
2. **D-Bus Service** (Backend) - Audio recording, speech transcription via whisper.cpp, text insertion

This separation follows GNOME's security guidelines and keeps the extension lightweight.

## Privacy

All audio processing happens locally on your machine. No data is sent to external servers.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Credits

- Forked from [kavehtehrani/gnome-speech2text](https://github.com/kavehtehrani/gnome-speech2text)
- Uses [whisper.cpp](https://github.com/ggerganov/whisper.cpp) for efficient local inference
- Based on OpenAI's [Whisper](https://github.com/openai/whisper) models

## Contributing

Issues and pull requests welcome at [github.com/bcelary/gnome-speech2text](https://github.com/bcelary/gnome-speech2text).
