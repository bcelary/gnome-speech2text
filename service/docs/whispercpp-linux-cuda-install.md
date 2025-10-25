# whisper.cpp - Quick Installation Guide

Focused installation guide for compiling whisper.cpp with CUDA support and local user install.

## Prerequisites

### 1. Install CUDA
Ensure NVIDIA CUDA is properly installed:
- **CUDA Installation Guide**: https://developer.nvidia.com/cuda-downloads
- Verify installation: `nvcc --version` and `nvidia-smi`

### 2. Install Build Tools
```bash
sudo apt install build-essential cmake
```

## Compilation & Installation

### 1. Clone Repository (if not already done)
```bash
git clone https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
```

### 2. Configure with CUDA Support
```bash
cmake -B build -DGGML_CUDA=1 -DCMAKE_INSTALL_PREFIX=~/.local
```

### 3. Build
```bash
cmake --build build -j --config Release
```

### 4. Install to ~/.local
```bash
cmake --install build
```

### 5. Update Environment Variables
Add to your `~/.bashrc` or `~/.zshrc`:

```bash
# whisper.cpp
export PATH="$HOME/.local/bin:$PATH"
export LD_LIBRARY_PATH="$HOME/.local/lib:$LD_LIBRARY_PATH"
```

Then reload:
```bash
source ~/.bashrc  # or source ~/.zshrc
```

### 6. Verify Installation
```bash
whisper-cli --help
```

## Download Models

Models will be cached in `~/.cache/whisper.cpp/`

```bash
# Create cache directory
mkdir -p ~/.cache/whisper.cpp

# Download models (choose based on your needs)
./models/download-ggml-model.sh base ~/.cache/whisper.cpp
./models/download-ggml-model.sh small ~/.cache/whisper.cpp
./models/download-ggml-model.sh medium ~/.cache/whisper.cpp

# For English-only (faster, more accurate for English):
./models/download-ggml-model.sh base.en ~/.cache/whisper.cpp
./models/download-ggml-model.sh small.en ~/.cache/whisper.cpp
./models/download-ggml-model.sh medium.en ~/.cache/whisper.cpp

# Download VAD model (for Voice Activity Detection)
./models/download-vad-model.sh silero-v5.1.2 ~/.cache/whisper.cpp
```

**Model Selection:**
- **base** (142 MB): Good balance, recommended for most users
- **small** (466 MB): Better accuracy, still reasonable speed
- **medium** (1.5 GB): High accuracy, slower processing
- **`.en` suffix**: English-only models (faster, can't auto-detect languages)
- **no `.en`**: Multilingual (99 languages, supports auto-detect and translation)

## Usage

### Basic Transcription
```bash
whisper-cli -m ~/.cache/whisper.cpp/ggml-base.en.bin -f audio.wav
```

### Convert Audio to Compatible Format
whisper-cli requires 16-bit PCM WAV files (16kHz, mono):
```bash
ffmpeg -i input.mp3 -ar 16000 -ac 1 -c:a pcm_s16le output.wav
```

### Common Options
```bash
# Use more CPU threads
whisper-cli -m ~/.cache/whisper.cpp/ggml-base.en.bin -f audio.wav -t 8

# Auto-detect language (requires non-.en model)
whisper-cli -m ~/.cache/whisper.cpp/ggml-base.bin -f audio.wav -l auto

# Translate to English
whisper-cli -m ~/.cache/whisper.cpp/ggml-base.bin -f audio.wav -l es --translate

# Output as subtitles
whisper-cli -m ~/.cache/whisper.cpp/ggml-base.en.bin -f audio.wav -osrt

# Disable GPU (CPU only)
whisper-cli -m ~/.cache/whisper.cpp/ggml-base.en.bin -f audio.wav -ng

# Use VAD (Voice Activity Detection)
whisper-cli -m ~/.cache/whisper.cpp/ggml-base.en.bin -f audio.wav --vad -vm ~/.cache/whisper.cpp/ggml-silero-v5.1.2.bin
```

### Running the Server
```bash
# Basic server
whisper-server -m ~/.cache/whisper.cpp/ggml-base.en.bin

# Server with VAD enabled
whisper-server -m ~/.cache/whisper.cpp/ggml-base.en.bin --vad -vm ~/.cache/whisper.cpp/ggml-silero-v5.1.2.bin

# Server with custom host/port
whisper-server -m ~/.cache/whisper.cpp/ggml-base.en.bin --host 0.0.0.0 --port 9000
```

## Troubleshooting

**whisper-cli: command not found**
- Make sure `~/.local/bin` is in your PATH
- Reload shell: `source ~/.bashrc`

**Library errors (libwhisper.so not found)**
- Make sure `~/.local/lib` is in your LD_LIBRARY_PATH
- Reload shell: `source ~/.bashrc`

**No GPU acceleration**
- Verify CUDA is installed: `nvcc --version`
- Check whisper-cli output shows your GPU device
- Rebuild with: `cmake -B build -DGGML_CUDA=1 -DCMAKE_INSTALL_PREFIX=~/.local`

**Slow performance**
- Use smaller model: `base.en` or `tiny.en`
- Increase CPU threads: `-t 8`
- Check GPU is being used (output should show "Device 0: ...")

## Quick Reference

```bash
# Installation
cmake -B build -DGGML_CUDA=1 -DCMAKE_INSTALL_PREFIX=~/.local
cmake --build build -j --config Release
cmake --install build

# Download model
./models/download-ggml-model.sh base.en ~/.cache/whisper.cpp

# Transcribe
whisper-cli -m ~/.cache/whisper.cpp/ggml-base.en.bin -f audio.wav
```
