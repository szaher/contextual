#!/bin/sh
# ctxkit prepare-commit-msg hook — injects context trailers into commit messages
# Installed by: ctxkit hooks init
# Version: __CTXKIT_VERSION__

# Check if ctxkit is available
if ! command -v ctxkit >/dev/null 2>&1; then
  exit 0
fi

# $2 contains the commit source: message, template, merge, squash, or commit (amend)
# Skip injection for non-interactive commits (rebase, squash, amend)
case "$2" in
  merge|squash|commit)
    exit 0
    ;;
esac

# Inject trailers — must complete within 500ms total
# On any failure, exit 0 (never block commits)
ctxkit hooks inject-trailers "$1" 2>/dev/null || true

exit 0
