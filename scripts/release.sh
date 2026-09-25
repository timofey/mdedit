#!/usr/bin/env bash
# Prepares a release: bumps the version everywhere, commits, tags, and (after
# confirmation) pushes. Pushing the tag starts the GitHub "Release" workflow, which
# builds Linux + macOS packages into a draft release.
#
# Usage: scripts/release.sh 0.2.0
set -euo pipefail
cd "$(dirname "$0")/.."

version="${1:-}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]]; then
  echo "usage: $0 X.Y.Z   (current: $(node -p "require('./package.json').version"))" >&2
  exit 1
fi
tag="v$version"

[[ "$(git branch --show-current)" == main ]] || { echo "Release from main" >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo "Working tree is not clean" >&2; exit 1; }
git fetch --quiet origin
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || { echo "main is not in sync with origin/main" >&2; exit 1; }
! git rev-parse -q --verify "refs/tags/$tag" >/dev/null || { echo "Tag $tag already exists" >&2; exit 1; }

# package.json is the source of truth (tauri.conf.json reads it); keep Cargo in sync.
npm version "$version" --no-git-tag-version >/dev/null
sed -i.bak "0,/^version = \".*\"/s//version = \"$version\"/" src-tauri/Cargo.toml && rm src-tauri/Cargo.toml.bak
(cd src-tauri && cargo update --workspace --offline >/dev/null 2>&1 || cargo update --workspace >/dev/null)

npm test >/dev/null

git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "Release $tag"
git tag -a "$tag" -m "mdedit $tag"

echo
read -r -p "Push main and $tag to origin (starts the release build)? [y/N] " answer
if [[ "$answer" == [yY] ]]; then
  git push origin main "$tag"
  echo "Pushed. Follow the build under Actions, then publish the draft under Releases."
else
  echo "Not pushed. When ready:  git push origin main $tag"
  echo "To undo:                 git tag -d $tag && git reset --hard HEAD~1"
fi
