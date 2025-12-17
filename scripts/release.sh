#!/usr/bin/env bash
set -euo pipefail

TYPE="${1:-}"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean"
  exit 1
fi

BRANCH="$(git branch --show-current)"
if [[ "$BRANCH" != "main" ]]; then
  echo "Must be on main branch"
  exit 1
fi

cd package
bun pm version "$TYPE"

VERSION=$(bun -e "console.log(require('./package.json').version)")

git add package.json
git commit -m "Release v$VERSION"
git tag "v$VERSION"

npm publish
