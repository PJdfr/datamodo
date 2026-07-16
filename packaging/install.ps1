# datamodo local edition — one-command installer (Windows PowerShell).
#
#   irm https://get.datamodo.dev/install.ps1 | iex
#
# Same decision tree as install.sh (packaging brief §3): local vs BYOK,
# Docker Compose vs npm, RAM → model tier. Everything stays changeable later
# (Settings toggle; `datamodo setup` re-sizes models).

param(
  [ValidateSet("local", "byok")] [string]$Mode,
  [ValidateSet("docker", "npm")] [string]$Runtime,
  [int]$Ram,
  [switch]$Yes
)

$ErrorActionPreference = "Stop"

function Ask($question, $default) {
  if ($Yes -or -not [Environment]::UserInteractive) { return $default }
  $answer = Read-Host "$question [$default]"
  if ([string]::IsNullOrWhiteSpace($answer)) { return $default }
  return $answer
}

Write-Host ""
Write-Host "datamodo — local edition installer"
Write-Host "  your private data vault: forward the mess, get back structured data."
Write-Host ""

# ---------------------------------------------------------------- step 1: AI
if (-not $Mode) {
  Write-Host "How do you want to run the AI?"
  Write-Host "  1) Local  - models on this machine via Ollama (private, free, offline)"
  Write-Host "  2) Bring your own key - Anthropic/OpenAI/OpenRouter (no local models)"
  $choice = Ask "Choose 1 or 2" "1"
  $Mode = if ($choice -eq "2") { "byok" } else { "local" }
}

# ------------------------------------------------------------ step 2: runtime
$dockerOk = $false
try {
  docker info *> $null
  docker compose version *> $null
  $dockerOk = ($LASTEXITCODE -eq 0)
} catch { $dockerOk = $false }

if (-not $Runtime) {
  if ($dockerOk) {
    Write-Host ""
    Write-Host "Docker is available. Two ways to run datamodo:"
    Write-Host "  1) Docker Compose - app + a real Postgres in containers (recommended with Docker)"
    Write-Host "  2) npm            - no containers; embedded database, 'datamodo serve'"
    $choice = Ask "Choose 1 or 2" "1"
    $Runtime = if ($choice -eq "2") { "npm" } else { "docker" }
  } else {
    $Runtime = "npm"
  }
}
if ($Runtime -eq "docker" -and -not $dockerOk) {
  Write-Warning "Docker was requested but 'docker compose' isn't working - falling back to npm."
  $Runtime = "npm"
}

# --------------------------------------------------- step 3: Ollama (local AI)
if ($Mode -eq "local" -and -not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  Write-Host ""
  Write-Host "Local AI needs Ollama (free, private) - it isn't installed yet."
  Write-Host "  Install it from https://ollama.com/download (Windows installer)."
  Write-Host "  datamodo works without it meanwhile (messages stored & filed, not AI-read);"
  Write-Host "  'datamodo setup' pulls the right models once Ollama is running."
  Write-Host "  Tip: with an NVIDIA GPU + WSL2, Ollama uses the GPU automatically."
}

# -------------------------------------------------------------------- install
if ($Runtime -eq "npm") {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    Write-Error "Node.js 20+ is required for the npm path. Install it from https://nodejs.org, then re-run."
  }
  $major = [int](node -p 'process.versions.node.split(".")[0]')
  if ($major -lt 20) {
    Write-Error "Node.js >= 20 required (you have $(node -v)). Upgrade, then re-run."
  }
  Write-Host ""
  Write-Host "Installing datamodo (npm)..."
  npm install -g datamodo
  if ($Mode -eq "local") {
    if ($Ram) { datamodo setup --yes --ram $Ram } else { datamodo setup --yes }
  }
  Write-Host ""
  Write-Host "OK Installed. Start it any time with:  datamodo serve"
  Write-Host "  Dashboard -> http://localhost:4321"
  if ($Mode -eq "byok") { Write-Host "  Then: Settings -> 'Bring your own key' -> paste your API key." }
  exit 0
}

# Docker Compose path
$dest = Join-Path $HOME ".datamodo\docker"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Write-Host ""
Write-Host "Setting up Docker Compose in $dest..."
Invoke-WebRequest -UseBasicParsing -Uri "https://get.datamodo.dev/docker-compose.yml" -OutFile (Join-Path $dest "docker-compose.yml")
Push-Location $dest
try {
  if ($Ram) { $env:DATAMODO_RAM_GB = "$Ram" }
  docker compose up -d
} finally { Pop-Location }
Write-Host ""
Write-Host "OK Running. Dashboard -> http://localhost:4321"
if ($Mode -eq "byok") { Write-Host "  Next: Settings -> 'Bring your own key' -> paste your API key." }
Write-Host "  Stop with: docker compose -f $dest\docker-compose.yml down"
