#!/bin/bash
# Copy .env files from a source worktree to the current project.
# Only copies to directories that already exist. Skips .claude/, node_modules/, and .env.example files.
#
# Usage:
#   bash scripts/copy-env.sh /path/to/source/worktree
#
# Example:
#   bash scripts/copy-env.sh /Users/jingchen/Developments/dashseller

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: bash scripts/copy-env.sh /path/to/source/worktree"
  exit 1
fi
SOURCE="$1"
TARGET="$(pwd)"

if [ ! -d "$SOURCE" ]; then
  echo "Error: Source directory '$SOURCE' does not exist."
  exit 1
fi

echo "Source: $SOURCE"
echo "Target: $TARGET"
echo ""

imported=()
skipped=()

while IFS= read -r env_file; do
  # Get the relative path from source root
  rel_path="${env_file#"$SOURCE"/}"

  # Skip .claude/ worktree copies, node_modules, and .env.example files
  case "$rel_path" in
    .claude/*|node_modules/*|*/node_modules/*) continue ;;
    *.example) continue ;;
  esac

  target_dir="$TARGET/$(dirname "$rel_path")"
  target_file="$TARGET/$rel_path"

  if [ -d "$target_dir" ]; then
    cp "$env_file" "$target_file"
    imported+=("$rel_path")
  else
    skipped+=("$rel_path")
  fi
done < <(find "$SOURCE" -name '.env*' -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/.claude/*' 2>/dev/null | sort)

echo "--- Imported ---"
if [ ${#imported[@]} -eq 0 ]; then
  echo "  (none)"
else
  for f in "${imported[@]}"; do
    echo "  ✓ $f"
  done
fi

echo ""
echo "--- Skipped (directory does not exist) ---"
if [ ${#skipped[@]} -eq 0 ]; then
  echo "  (none)"
else
  for f in "${skipped[@]}"; do
    echo "  ✗ $f"
  done
fi
