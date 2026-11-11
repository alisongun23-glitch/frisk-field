#!/usr/bin/env bash
# Copies the Frisk Field project this skill lives in (its .claude/skills folder is five levels up from here) into the run's folder.
set -eu
ROOT="$(cd "$(dirname "$0")/../../../../.." && pwd)"
for item in index.html package.json src tests tools; do cp -R "$ROOT/$item" .; done
