#!/usr/bin/env bash
# Verify a deployed environment: it is up, it is running the commit we think it is, and the
# original finding behaves as expected there.
#
#   ./deploy/verify.sh <url> <git-sha> <expect: fixed|vulnerable>
#
# The /version check is what ties the verdict to a specific commit. Without it, "the exploit
# failed" could be a verdict about whatever happened to be deployed, not about this fix.
set -euo pipefail

URL="${1:?target url required}"
GIT_SHA="${2:?git sha required}"
EXPECT="${3:-fixed}"
URL="${URL%/}"

echo "verify: url=$URL sha=$GIT_SHA expect=$EXPECT"

echo "waiting for health..."
for _ in $(seq 1 60); do
  if curl -sf "$URL/healthz" >/dev/null; then break; fi
  sleep 2
done
curl -sf "$URL/healthz" >/dev/null || { echo "::error::$URL never became healthy"; exit 1; }

deployed="$(curl -fsS "$URL/version" | sed -n 's/.*"gitSha":"\([^"]*\)".*/\1/p')"
echo "deployed sha: $deployed"
if [ "$deployed" != "$GIT_SHA" ]; then
  echo "::error::$URL is running $deployed, expected $GIT_SHA — refusing to judge the wrong build"
  exit 1
fi

# The exploit triple. With expect=report it records the verdict without failing the job (used
# right after deploying the vulnerable baseline). Otherwise it fails unless the attack, control
# and negative control all behave as the expected state requires.
if [ "$EXPECT" = "report" ]; then
  node security/exploit/access-control.mjs --url "$URL"
  echo "verify: $URL is at $GIT_SHA (finding state reported, not asserted)"
else
  node security/exploit/access-control.mjs --url "$URL" --expect "$EXPECT"
  echo "verify: $URL is at $GIT_SHA and the finding is $EXPECT"
fi
