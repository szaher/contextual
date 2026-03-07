#!/usr/bin/env bash
set -euo pipefail

# ctxkit uninstaller

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

# ---------------------------------------------------------------------------
# Unregister plugin from Claude Code
# ---------------------------------------------------------------------------
if command -v ctxkit >/dev/null 2>&1; then
  info "Unregistering ctxkit plugin..."
  ctxkit plugin uninstall 2>/dev/null || true
  ctxkit plugin uninstall --scope project 2>/dev/null || true
else
  info "ctxkit not on PATH — skipping plugin unregistration"
fi

# ---------------------------------------------------------------------------
# Stop daemon (if running)
# ---------------------------------------------------------------------------
if command -v ctxkit >/dev/null 2>&1; then
  info "Stopping ctxkit daemon..."
  ctxkit daemon stop 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# Detect package manager
# ---------------------------------------------------------------------------
PM=""
if command -v npm >/dev/null 2>&1; then
  PM="npm"
elif command -v pnpm >/dev/null 2>&1; then
  PM="pnpm"
fi

# ---------------------------------------------------------------------------
# Uninstall global packages
# ---------------------------------------------------------------------------
SUDO=""
if [ -n "$PM" ] && [ "$(id -u)" -ne 0 ]; then
  NPM_GLOBAL_DIR="$(npm root -g 2>/dev/null || echo "/usr/local/lib/node_modules")"
  if [ -d "$NPM_GLOBAL_DIR" ] && [ ! -w "$NPM_GLOBAL_DIR" ]; then
    SUDO="sudo"
  elif [ ! -d "$NPM_GLOBAL_DIR" ] && [ ! -w "$(dirname "$NPM_GLOBAL_DIR")" ]; then
    SUDO="sudo"
  fi
fi

if [ -n "$PM" ]; then
  info "Uninstalling global packages with $PM..."
  $SUDO $PM uninstall -g @ctxl/cli @ctxl/mcp @ctxl/claude-plugin 2>/dev/null || true
else
  warn "Neither npm nor pnpm found — skipping package removal"
  warn "Manually remove @ctxl/cli, @ctxl/mcp, and @ctxl/claude-plugin"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
printf "\n"
printf "${GREEN}${BOLD}ctxkit uninstalled.${RESET}\n"
printf "\n"
printf "  Note: Your data directory (~/.ctxl/) was preserved.\n"
printf "  To remove it:  rm -rf ~/.ctxl\n"
printf "\n"
printf "  Per-project plugin registrations are not removed.\n"
printf "  Run 'ctxkit plugin uninstall --scope project' in individual projects if needed.\n"
printf "\n"
