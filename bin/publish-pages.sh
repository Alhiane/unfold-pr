#!/usr/bin/env bash
# Publishes unfold.html to the GitHub Pages branch at pr-<PR>/index.html, or removes it when
# the PR is closed. Env: BRANCH, PR, CLOSED, GH_TOKEN, GITHUB_REPOSITORY, GITHUB_OUTPUT.
set -euo pipefail

git config --global user.name "github-actions[bot]"
git config --global user.email "41898282+github-actions[bot]@users.noreply.github.com"

WT=$(mktemp -d)
if git fetch -q --depth=1 origin "$BRANCH" 2>/dev/null; then
  git worktree add -q --detach "$WT" FETCH_HEAD
  git -C "$WT" checkout -q -B "$BRANCH"
else
  [ "$CLOSED" = "true" ] && exit 0      # nothing published yet, nothing to clean up
  git worktree add -q --detach "$WT"
  git -C "$WT" checkout -q --orphan "$BRANCH"
  git -C "$WT" rm -rfq . 2>/dev/null || true
  touch "$WT/.nojekyll"
  printf '<!doctype html><meta charset="utf-8"><title>Unfold maps</title><p>Interactive Unfold maps, one folder per open pull request.</p>\n' > "$WT/index.html"
fi

if [ "$CLOSED" = "true" ]; then
  [ -d "$WT/pr-$PR" ] || exit 0
  git -C "$WT" rm -rq "pr-$PR"
  git -C "$WT" commit -qm "Remove Unfold map for closed #$PR"
else
  mkdir -p "$WT/pr-$PR"
  cp unfold.html "$WT/pr-$PR/index.html"
  git -C "$WT" add -A
  git -C "$WT" diff --cached --quiet && echo "map unchanged" || git -C "$WT" commit -qm "Unfold map for #$PR"
fi

for i in 1 2 3; do
  git -C "$WT" push -q origin "HEAD:$BRANCH" && break
  git -C "$WT" fetch -q --depth=1 origin "$BRANCH" && git -C "$WT" rebase -q FETCH_HEAD || true
  sleep 2
done

[ "$CLOSED" = "true" ] && exit 0

# The site's real address if Pages is set up, otherwise the default <owner>.github.io/<repo>/
SITE=$(gh api "repos/$GITHUB_REPOSITORY/pages" --jq .html_url 2>/dev/null) || SITE=""
case "$SITE" in https://*) ;; *) SITE="" ;; esac
if [ -z "$SITE" ]; then
  OWNER=${GITHUB_REPOSITORY%%/*}; REPO=${GITHUB_REPOSITORY#*/}
  SITE="https://$(echo "$OWNER" | tr '[:upper:]' '[:lower:]').github.io/$REPO/"
  echo "pages_missing=true" >> "$GITHUB_OUTPUT"
fi
echo "url=${SITE%/}/pr-$PR/" >> "$GITHUB_OUTPUT"
