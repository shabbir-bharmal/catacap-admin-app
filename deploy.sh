set -e  # 🔥 stops script immediately on error

echo "🚀 Pushing to current branch..."
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# 🔥 This is the critical line — if this fails, script stops
git push origin "$CURRENT_BRANCH"

echo "✅ Git push successful — continuing deployment..."

# Now only runs if push succeeded
echo "📦 Building app..."
pnpm run build

# Replit's publish flow creates a local commit (e.g. build artifacts / lockfile
# updates) around the build step that is NOT automatically pushed to the remote.
# That commit may land slightly after `pnpm run build` returns, so we poll for a
# bounded time to detect it, then push. If no new commit appears we exit cleanly.
echo "🔁 Checking for a publish-created commit to push..."

# Make sure we have up-to-date remote refs so the ahead/behind comparison is accurate.
git fetch origin "$CURRENT_BRANCH" >/dev/null 2>&1 || true

MAX_WAIT_SECONDS=30
WAITED=0
while [ "$WAITED" -lt "$MAX_WAIT_SECONDS" ]; do
  AHEAD_COUNT=$(git rev-list --count "origin/${CURRENT_BRANCH}..HEAD" 2>/dev/null || echo "0")
  if [ "$AHEAD_COUNT" -gt 0 ]; then
    echo "📬 Detected $AHEAD_COUNT unpushed commit(s) from publish flow."
    break
  fi
  sleep 2
  WAITED=$((WAITED + 2))
  git fetch origin "$CURRENT_BRANCH" >/dev/null 2>&1 || true
done

# Always attempt a final push. If there is nothing new, git exits 0 with
# "Everything up-to-date" — that's success. A real push failure (rejected,
# auth error, network, etc.) will still propagate via `set -e`.
echo "🚀 Pushing any publish-created commit to origin/${CURRENT_BRANCH}..."
git push origin "$CURRENT_BRANCH"

echo "✅ Deploy script finished — remote is in sync with local."
