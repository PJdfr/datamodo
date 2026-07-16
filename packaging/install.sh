#!/bin/sh
# datamodo local edition — one-command installer (macOS / Linux).
#
#   curl -fsSL https://get.datamodo.dev | sh
#
# Decision tree (packaging brief §3) — every step can be preset with flags/env:
#   1. How do you want to run the AI?   local (private, this machine) | byok
#   2. (local) Docker available?        compose (app + real Postgres) | npm (embedded DB)
#   3. (local) RAM budget → model tier  (detected; `datamodo setup` re-asks)
#
# Flags: --local | --byok   --docker | --npm   --ram <GB>   --yes
# Everything the installer picks stays changeable later: LOCAL ↔ BYOK is a
# Settings toggle, models are editable in Settings, `datamodo setup` re-sizes.

set -eu

MODE=""        # local | byok
RUNTIME=""     # docker | npm
RAM=""
ASSUME_YES=""

while [ $# -gt 0 ]; do
  case "$1" in
    --local) MODE="local" ;;
    --byok) MODE="byok" ;;
    --docker) RUNTIME="docker" ;;
    --npm) RUNTIME="npm" ;;
    --ram) shift; RAM="${1:-}" ;;
    --yes|-y) ASSUME_YES=1 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

say()  { printf '%s\n' "$*"; }
err()  { printf 'datamodo: %s\n' "$*" >&2; }
have() { command -v "$1" >/dev/null 2>&1; }

ask() { # ask "question" "default"
  if [ -n "$ASSUME_YES" ] || [ ! -t 0 ]; then
    printf '%s' "$2"
    return
  fi
  printf '%s [%s]: ' "$1" "$2" >&2
  read -r answer || answer=""
  printf '%s' "${answer:-$2}"
}

say ""
say "datamodo — local edition installer"
say "  your private data vault: forward the mess, get back structured data."
say ""

# ---------------------------------------------------------------- step 1: AI
if [ -z "$MODE" ]; then
  say "How do you want to run the AI?"
  say "  1) Local  — models on this machine via Ollama (private, free, offline)"
  say "  2) Bring your own key — Anthropic/OpenAI/OpenRouter (no local models)"
  choice=$(ask "Choose 1 or 2" "1")
  [ "$choice" = "2" ] && MODE="byok" || MODE="local"
fi

# -------------------------------------------------------- step 2: runtime
DOCKER_OK=""
if have docker && docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  DOCKER_OK=1
fi

if [ -z "$RUNTIME" ]; then
  if [ -n "$DOCKER_OK" ]; then
    say ""
    say "Docker is available. Two ways to run datamodo:"
    say "  1) Docker Compose — app + a real Postgres in containers (recommended with Docker)"
    say "  2) npm            — no containers; embedded database, 'datamodo serve'"
    choice=$(ask "Choose 1 or 2" "1")
    [ "$choice" = "2" ] && RUNTIME="npm" || RUNTIME="docker"
  else
    RUNTIME="npm"
  fi
fi

if [ "$RUNTIME" = "docker" ] && [ -z "$DOCKER_OK" ]; then
  err "Docker was requested but 'docker compose' isn't working here — falling back to npm."
  RUNTIME="npm"
fi

# ----------------------------------------------------- step 3: Ollama (local)
OS="$(uname -s 2>/dev/null || echo unknown)"
if [ "$MODE" = "local" ] && ! have ollama; then
  say ""
  say "Local AI needs Ollama (free, private) — it isn't installed yet."
  case "$OS" in
    Darwin) say "  Install it from https://ollama.com/download (or: brew install ollama)" ;;
    Linux)  say "  Install it with:  curl -fsSL https://ollama.com/install.sh | sh" ;;
    *)      say "  Install it from https://ollama.com/download" ;;
  esac
  say "  datamodo works without it meanwhile (messages are stored & filed, not AI-read),"
  say "  and 'datamodo setup' pulls the right models once Ollama is running."
fi
if [ "$MODE" = "local" ] && [ "$RUNTIME" = "docker" ] && [ "$OS" = "Darwin" ]; then
  say ""
  say "Note (macOS): Ollama must run on the HOST, not in Docker — containers can't"
  say "use the GPU here. The compose file already points at your host's Ollama."
fi

# ---------------------------------------------------------------- install
if [ "$RUNTIME" = "npm" ]; then
  if ! have node; then
    err "Node.js 20+ is required for the npm path. Install it from https://nodejs.org (or via nvm/brew), then re-run."
    exit 1
  fi
  major=$(node -p 'process.versions.node.split(".")[0]')
  if [ "$major" -lt 20 ]; then
    err "Node.js >= 20 required (you have $(node -v)). Upgrade, then re-run."
    exit 1
  fi
  say ""
  say "Installing datamodo (npm)…"
  npm install -g datamodo
  if [ "$MODE" = "local" ]; then
    say ""
    datamodo setup --yes ${RAM:+--ram "$RAM"} || true
  fi
  say ""
  say "✓ Installed. Start it any time with:  datamodo serve"
  say "  Dashboard → http://localhost:4321"
  [ "$MODE" = "byok" ] && say "  Then: Settings → 'Bring your own key' → paste your API key."
  exit 0
fi

# Docker Compose path: write the bundle into ~/.datamodo/docker and start it.
DEST="${DATAMODO_HOME:-$HOME/.datamodo}/docker"
mkdir -p "$DEST"
say ""
say "Setting up Docker Compose in $DEST…"
if have curl; then
  curl -fsSL https://get.datamodo.dev/docker-compose.yml -o "$DEST/docker-compose.yml"
else
  err "curl is required to fetch the compose file."; exit 1
fi
cd "$DEST"
[ -n "$RAM" ] && export DATAMODO_RAM_GB="$RAM"
docker compose up -d
say ""
say "✓ Running. Dashboard → http://localhost:4321"
say "  Data lives in the 'datamodo-db' / 'datamodo-data' Docker volumes."
[ "$MODE" = "byok" ] && say "  Next: Settings → 'Bring your own key' → paste your API key."
say "  Stop with: docker compose -f $DEST/docker-compose.yml down"
