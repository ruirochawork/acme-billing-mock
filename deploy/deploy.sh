#!/usr/bin/env bash
# Deploy one image digest to one environment. THIS IS THE ONE FILE YOU FILL IN.
#
#   ./deploy/deploy.sh <environment> <image-digest> <git-sha>
#
# The pipeline always promotes the SAME digest that QA verified — it never rebuilds for
# production — so this script must deploy exactly the digest it is handed.
#
# It exits 0 without doing anything while still unimplemented, so the pipeline runs end to end on
# a fresh repo. The verify step is what will tell you nothing is actually deployed yet.
set -euo pipefail

ENVIRONMENT="${1:?environment required (qa|prod)}"
IMAGE_DIGEST="${2:?image digest required, e.g. ghcr.io/owner/app@sha256:...}"
GIT_SHA="${3:?git sha required}"

echo "deploy: environment=$ENVIRONMENT digest=$IMAGE_DIGEST sha=$GIT_SHA"

# ---------------------------------------------------------------------------
# Fill in ONE of these. Both receive the digest, never a rebuilt image.
# ---------------------------------------------------------------------------

# --- Option A: a VPS you own, over SSH, two containers on one box ----------
# Secrets: DEPLOY_SSH_KEY, DEPLOY_HOST, DEPLOY_USER. Port per environment.
#
# port=$([ "$ENVIRONMENT" = "prod" ] && echo 3002 || echo 3001)
# ssh -o StrictHostKeyChecking=accept-new "$DEPLOY_USER@$DEPLOY_HOST" bash -s <<EOF
#   set -e
#   docker pull "$IMAGE_DIGEST"
#   docker rm -f "acme-$ENVIRONMENT" 2>/dev/null || true
#   docker run -d --name "acme-$ENVIRONMENT" --restart unless-stopped \
#     -p 127.0.0.1:$port:3000 -e GIT_SHA="$GIT_SHA" "$IMAGE_DIGEST"
# EOF

# --- Option B: Fly.io, one app per environment -----------------------------
# Secret: FLY_API_TOKEN
#
# flyctl deploy --app "acme-billing-$ENVIRONMENT" --image "$IMAGE_DIGEST" \
#   --env GIT_SHA="$GIT_SHA" --yes

# ---------------------------------------------------------------------------
if grep -q 'NOT_IMPLEMENTED' "$0" 2>/dev/null; then
  echo "::warning::deploy/deploy.sh is not implemented yet — nothing was deployed for $ENVIRONMENT"
fi
# Delete the next line once you implement a deploy option above. NOT_IMPLEMENTED
exit 0
