#!/usr/bin/env bash
# Установка движка Clipzy в Vercel Sandbox (Ubuntu). Сайт запускает её один раз:
# машина постоянная, всё установленное остаётся в снимке её диска.
# Шаг установки — в $ROOT/setup.state (его показывает экран «Устанавливаем движок»), журнал — в $ROOT/setup.log.
# Аргумент — отпечаток зависимостей: когда он меняется, сайт запускает установку заново.
set -euo pipefail

ROOT=/vercel/sandbox/clipzy
DEPS="${1:-}"
MODEL="${CLIPZY_WHISPER_MODEL:-large-v3-turbo}"

exec >>"$ROOT/setup.log" 2>&1
state() { echo "$1" >"$ROOT/setup.state"; echo "== $(date -u +%T) $1"; }
# Упала — запоминаем, какую версию ставили: сайт повторит установку сам, только когда она поменяется
trap 'state failed; echo "$DEPS" >"$ROOT/failed"' ERR

state system
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends ffmpeg fonts-noto-color-emoji curl

state python
export PATH="$HOME/.local/bin:$PATH"
command -v uv >/dev/null || curl -LsSf https://astral.sh/uv/install.sh | sh
# Python 3.12: под него точно есть готовые сборки faster-whisper, onnxruntime и OpenCV
[ -x "$ROOT/venv/bin/python" ] || uv venv --python 3.12 "$ROOT/venv"

state packages
uv pip install --python "$ROOT/venv/bin/python" -r "$ROOT/engine/requirements-cpu.txt"

state model
HF_HOME="$ROOT/hf" "$ROOT/venv/bin/python" -c \
  "from faster_whisper import WhisperModel; WhisperModel('$MODEL', device='cpu', compute_type='int8')"

echo "$DEPS" >"$ROOT/ready"
state ready
