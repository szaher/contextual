#!/usr/bin/env bash
set -euo pipefail

# ctxkit installer — curl -fsSL https://raw.githubusercontent.com/szaher/contextual/main/install.sh | bash
#
# Modes:
#   Remote (default when piped):  installs from npm registry
#   Local  (--local or auto):     builds from local monorepo checkout

VERSION="${CTXL_VERSION:-latest}"
SCOPE="global"               # default: global install
LOCAL=""                      # set to repo root when using local mode

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
RED=""
GREEN=""
YELLOW=""
BOLD=""
RESET=""

if [ -t 1 ]; then
  RED="\033[0;31m"
  GREEN="\033[0;32m"
  YELLOW="\033[0;33m"
  BOLD="\033[1m"
  RESET="\033[0m"
fi

info()  { printf "${GREEN}[ctxkit]${RESET} %s\n" "$*"; }
warn()  { printf "${YELLOW}[ctxkit]${RESET} %s\n" "$*"; }
error() { printf "${RED}[ctxkit]${RESET} %s\n" "$*" >&2; }
fatal() { error "$@"; exit 1; }

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --project)
      SCOPE="project"
      shift
      ;;
    --local)
      # Explicit local mode — resolve repo root from script location or cwd
      LOCAL="${2:-}"
      if [ -n "$LOCAL" ]; then
        shift 2
      else
        shift
      fi
      ;;
    --version)
      VERSION="${2:-latest}"
      shift 2
      ;;
    --help|-h)
      cat <<'USAGE'
Usage: install.sh [OPTIONS]

Options:
  --project        Install plugin into current project (.claude/plugins/) instead of global (~/.claude/plugins/)
  --local [PATH]   Install from local monorepo checkout instead of npm registry
                   PATH defaults to the directory containing this script, or current directory
  --version VER    Specify package version for npm install (default: latest)
  -h, --help       Show this help message

Environment:
  CTXL_VERSION     Same as --version
USAGE
      exit 0
      ;;
    *)
      fatal "Unknown option: $1 (use --help for usage)"
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Auto-detect local mode: if this script is in a ctxl monorepo, use it
# ---------------------------------------------------------------------------
SCRIPT_DIR=""
# BASH_SOURCE is available when run directly (not piped)
if [ -n "${BASH_SOURCE[0]:-}" ] && [ "${BASH_SOURCE[0]}" != "bash" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

if [ -z "$LOCAL" ] && [ -n "$SCRIPT_DIR" ] \
   && [ -f "$SCRIPT_DIR/packages/cli/package.json" ] \
   && [ -f "$SCRIPT_DIR/packages/claude-plugin/package.json" ]; then
  LOCAL="$SCRIPT_DIR"
  info "Detected local monorepo at $LOCAL"
fi

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
info "Checking prerequisites..."

# Node.js >= 20
if ! command -v node >/dev/null 2>&1; then
  fatal "Node.js is required but not found. Install Node.js 20+ from https://nodejs.org"
fi

NODE_MAJOR=$(node -e 'console.log(process.versions.node.split(".")[0])')
if [ "$NODE_MAJOR" -lt 20 ]; then
  fatal "Node.js 20+ required (found v$(node -v)). Please upgrade: https://nodejs.org"
fi

# Detect package manager — prefer npm for global installs
PM=""
if command -v npm >/dev/null 2>&1; then
  PM="npm"
elif command -v pnpm >/dev/null 2>&1; then
  PM="pnpm"
else
  fatal "npm or pnpm is required but neither was found"
fi

info "Using Node.js $(node -v) with $PM"

# Determine if sudo is needed for global installs
SUDO=""
NPM_GLOBAL_DIR="$(npm root -g 2>/dev/null || echo "/usr/local/lib/node_modules")"
if [ "$(id -u)" -ne 0 ]; then
  if [ -d "$NPM_GLOBAL_DIR" ] && [ ! -w "$NPM_GLOBAL_DIR" ]; then
    # Dir exists but isn't writable
    SUDO="sudo"
  elif [ ! -d "$NPM_GLOBAL_DIR" ] && [ ! -w "$(dirname "$NPM_GLOBAL_DIR")" ]; then
    # Dir doesn't exist and parent isn't writable
    SUDO="sudo"
  fi
  if [ -n "$SUDO" ]; then
    info "Global node_modules ($NPM_GLOBAL_DIR) is not writable — will use sudo"
  fi
fi

# ---------------------------------------------------------------------------
# Install packages
# ---------------------------------------------------------------------------
if [ -n "$LOCAL" ]; then
  # -----------------------------------------------------------------------
  # Local mode: build tarballs and install from them
  # -----------------------------------------------------------------------
  if [ ! -f "$LOCAL/pnpm-workspace.yaml" ]; then
    fatal "Not a valid ctxl monorepo: $LOCAL (missing pnpm-workspace.yaml)"
  fi

  if ! command -v pnpm >/dev/null 2>&1; then
    fatal "pnpm is required for local builds (npm install -g pnpm)"
  fi

  info "Building packages from local source..."
  (cd "$LOCAL" && pnpm install --frozen-lockfile 2>/dev/null || pnpm install) || fatal "pnpm install failed"
  (cd "$LOCAL" && pnpm build) || fatal "pnpm build failed"

  info "Packing tarballs..."
  PACK_DIR=$(mktemp -d)
  STAGE_DIR=$(mktemp -d)
  REPACK_DIR=$(mktemp -d)
  trap 'rm -rf "$PACK_DIR" "$STAGE_DIR" "$REPACK_DIR"' EXIT

  # Pack ALL workspace packages (including core/daemon which are deps)
  for pkg in core daemon cli mcp claude-plugin; do
    (cd "$LOCAL/packages/$pkg" && pnpm pack --pack-destination "$PACK_DIR") || fatal "Failed to pack @ctxl/$pkg"
  done

  # Unpack each tarball into a staging directory
  for tgz in "$PACK_DIR"/*.tgz; do
    name=$(basename "$tgz" .tgz)
    mkdir -p "$STAGE_DIR/$name"
    tar xzf "$tgz" -C "$STAGE_DIR/$name" --strip-components=1
  done

  # Rewrite @ctxl/* deps to file: paths pointing at the ORIGINAL tarballs
  # so npm resolves them locally instead of from the registry
  info "Rewriting workspace dependencies for local install..."
  node -e "
    const fs = require('fs');
    const path = require('path');
    const stageDir = process.argv[1];
    const packDir = process.argv[2];
    const dirs = fs.readdirSync(stageDir);
    const tarballs = fs.readdirSync(packDir).filter(f => f.endsWith('.tgz'));
    // Map @ctxl/X package name to its original tarball path
    const pkgMap = {};
    for (const dir of dirs) {
      const p = JSON.parse(fs.readFileSync(path.join(stageDir, dir, 'package.json'), 'utf8'));
      const tgz = tarballs.find(t => t.startsWith(dir));
      if (tgz) pkgMap[p.name] = path.join(packDir, tgz);
    }
    // Rewrite deps
    for (const dir of dirs) {
      const pkgPath = path.join(stageDir, dir, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      let changed = false;
      for (const [dep, ver] of Object.entries(pkg.dependencies || {})) {
        if (pkgMap[dep]) {
          pkg.dependencies[dep] = 'file:' + pkgMap[dep];
          changed = true;
        }
      }
      if (changed) fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    }
  " "$STAGE_DIR" "$PACK_DIR"

  # Re-pack the staged dirs into new tarballs (npm install -g <tarball>
  # copies files; npm install -g <folder> creates symlinks that break
  # when the temp dir is cleaned up)
  info "Repacking for install..."
  for dir in "$STAGE_DIR"/*/; do
    name=$(basename "$dir")
    tar czf "$REPACK_DIR/$name.tgz" -C "$STAGE_DIR" "$name"
  done

  CLI_TGZ=$(ls "$REPACK_DIR"/ctxl-cli-*.tgz 2>/dev/null | head -1)
  MCP_TGZ=$(ls "$REPACK_DIR"/ctxl-mcp-*.tgz 2>/dev/null | head -1)
  PLUGIN_TGZ=$(ls "$REPACK_DIR"/ctxl-claude-plugin-*.tgz 2>/dev/null | head -1)

  if [ -z "$CLI_TGZ" ] || [ -z "$MCP_TGZ" ] || [ -z "$PLUGIN_TGZ" ]; then
    fatal "One or more repacked tarballs not found in $REPACK_DIR"
  fi

  info "Installing from local tarballs..."
  $SUDO npm install -g "$CLI_TGZ" "$MCP_TGZ" "$PLUGIN_TGZ"

else
  # -----------------------------------------------------------------------
  # Remote mode: install from npm registry
  # -----------------------------------------------------------------------
  info "Installing ctxkit packages from npm..."

  VERSION_SUFFIX=""
  if [ "$VERSION" != "latest" ]; then
    VERSION_SUFFIX="@$VERSION"
  fi

  $SUDO $PM install -g "@ctxl/cli${VERSION_SUFFIX}" "@ctxl/mcp${VERSION_SUFFIX}" "@ctxl/claude-plugin${VERSION_SUFFIX}"
fi

# ---------------------------------------------------------------------------
# Verify binaries
# ---------------------------------------------------------------------------
info "Verifying installed binaries..."

if ! command -v ctxkit >/dev/null 2>&1; then
  # Try rehashing PATH for common shells
  hash -r 2>/dev/null || true
fi

if ! command -v ctxkit >/dev/null 2>&1; then
  NPM_BIN=$(npm bin -g 2>/dev/null || echo "")
  warn "ctxkit binary not found on PATH"
  if [ -n "$NPM_BIN" ]; then
    warn "Global bin directory: $NPM_BIN"
    warn "Add it to your PATH:  export PATH=\"$NPM_BIN:\$PATH\""
  fi
  fatal "Cannot proceed without ctxkit on PATH"
fi

if ! command -v ctxkit-mcp >/dev/null 2>&1; then
  warn "ctxkit-mcp binary not found on PATH (MCP server may not work)"
  warn "Continuing anyway — the plugin can still function with hooks and skills"
fi

info "ctxkit $(ctxkit --version 2>/dev/null || echo '(installed)')"

# ---------------------------------------------------------------------------
# Register plugin with Claude Code
# ---------------------------------------------------------------------------
PLUGIN_SCOPE_FLAG=""
if [ "$SCOPE" = "project" ]; then
  PLUGIN_SCOPE_FLAG="--scope project"
  info "Registering plugin for current project..."
else
  info "Registering plugin globally..."
fi

PLUGIN_FROM_FLAG=""
if [ -n "$LOCAL" ]; then
  PLUGIN_FROM_FLAG="--from $LOCAL"
fi

ctxkit plugin install $PLUGIN_SCOPE_FLAG $PLUGIN_FROM_FLAG

# ---------------------------------------------------------------------------
# Success
# ---------------------------------------------------------------------------
printf "\n"
printf "${GREEN}${BOLD}ctxkit installed successfully!${RESET}\n"
printf "\n"
printf "  ${BOLD}CLI:${RESET}     ctxkit --help\n"
printf "  ${BOLD}Plugin:${RESET}  ctxkit plugin status\n"
printf "\n"
printf "  The Claude Code plugin provides:\n"
printf "    - 8 lifecycle hooks (auto-context, drift detection, etc.)\n"
printf "    - /ctxkit interactive skill\n"
printf "    - MCP server with 10 tools\n"
printf "\n"
printf "  Start a new Claude Code session to activate the plugin.\n"
printf "\n"
if [ -n "$LOCAL" ]; then
  printf "  To uninstall:  $LOCAL/uninstall.sh\n"
else
  printf "  To uninstall:  curl -fsSL https://raw.githubusercontent.com/szaher/contextual/main/uninstall.sh | bash\n"
fi
printf "\n"
