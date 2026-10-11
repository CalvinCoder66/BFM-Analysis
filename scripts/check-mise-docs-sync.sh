#!/usr/bin/env bash
# Checks that every mise task in .mise.toml is documented in the rulesync source.
# Run as part of: mise run rules:check
set -euo pipefail

MISE_FILE=".mise.toml"
RULES_FILE=".rulesync/rules/overview.md"

# Extract task names from .mise.toml (e.g. [tasks.foo] or [tasks."foo:bar"])
task_names=$(grep -oP '^\[tasks\."\K[^"]+|^\[tasks\.\K[a-zA-Z0-9_-]+' "$MISE_FILE" | sort)

missing=()
for task in $task_names; do
  if ! grep -q "mise run ${task}" "$RULES_FILE"; then
    missing+=("$task")
  fi
done

if [ ${#missing[@]} -gt 0 ]; then
  echo "ERROR: These mise tasks are not documented in $RULES_FILE:"
  for task in "${missing[@]}"; do
    echo "  - mise run $task"
  done
  echo ""
  echo "Add them to the Essential Commands section in $RULES_FILE,"
  echo "then run: mise run rules:sync"
  exit 1
fi

echo "All mise tasks are documented ✓"
