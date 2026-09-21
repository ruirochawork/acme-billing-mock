# Operations & current state

The live, working state of this demo and how to run it. For what the app is and why it's
deliberately vulnerable, see [README](../README.md) and [SCOPE](../SCOPE.md).

_Last verified: 2026-09-21._

## What this is

A deliberately vulnerable mock billing API used to demonstrate a continuous find → fix → verify
loop against **real, internet-facing servers** with a **real CI/CD pipeline**. Detection runs
against a running server; the fix goes through an approved pull request; a merge auto-deploys to
QA; a gated promotion ships the identical image to production. Every stage is verified against the
live server before the next.

## Live environments

| Env | URL | Image tag it runs | Auto-updates when |
| --- | --- | --- | --- |
| QA | http://88.96.50.133:3000 | `:latest` | every merge to `main` (via `deliver`) |
| Prod | http://141.145.201.219:3000 | `:prod` | only when `promote` moves the tag |

Both are Oracle Cloud **Always Free**, **Arm** (`VM.Standard.A1.Flex`), Ubuntu 24.04 (arm64), in
region `eu-paris-1`, same VCN/subnet. Registry: `ghcr.io/ruirochawork/acme-billing-mock` (public).

Both currently run commit `ca1055d` and are **FIXED** (the cross-tenant read returns 403 while a
tenant's own read still returns 200).

## The pipeline (7 workflows)

| Workflow | Trigger | Role |
| --- | --- | --- |
| `scan` | manual / weekly cron | Detect: ZAP + Nuclei + the exploit triple against a target (default QA). Writes an EXPLOITABLE/FIXED verdict to the run summary; uploads Nuclei SARIF; opens a tracking Issue when EXPLOITABLE. Report-only. |
| `propose-fix` | manual (finding id) | Locate the code (`locate-fix.mjs` → file:line), show the stored patch in the run summary, pause on the `fix-approval` environment, then apply the patch on `fix/<finding>` and open the PR (uses `PR_TOKEN`). |
| `retest-pr` | pull request | Merge gate: app tests + exploit `--expect fixed` (attack 403, control 200, negative 401). Blocks merge. |
| `deliver` | push to `main` | Build once (amd64 + arm64), push `:latest` and `:<sha>` to GHCR. Waits for QA to report the new commit, records finding state. No key stored; QA updates itself. |
| `promote` | manual (sha) | Confirm QA is on that commit and FIXED → pause on the `production` environment → move `:prod` to that image server-side (same digest, no rebuild) → wait for prod to report it → verify prod FIXED. |
| `seed-prod` | manual (sha) | Point `:prod` at any commit's image. Used to start prod on the vulnerable baseline, and to re-arm prod. Ungated utility. |
| `rearm-qa` | manual | Re-arm QA: reverse the stored fix patch on `main` (keeping later changes), push, and let `deliver` roll QA back to EXPLOITABLE. Gated by `fix-approval`. |

## Deploy model (pull-based, no SSH)

CI never connects to the boxes and stores no deploy key. Each box runs the app plus
[Watchtower](https://containrrr.dev/watchtower/), which polls GHCR and recreates the container
when its tag changes:

- QA watches `:latest` → follows every merge.
- Prod watches `:prod` → moves only on a deliberate `promote`.

Promotion ships the **exact image digest** QA verified (`docker buildx imagetools create` copies
the manifest list; it never rebuilds).

### Box setup (one-time, per box)

```sh
# OS firewall — OCI Ubuntu blocks everything but SSH by default
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
sudo netfilter-persistent save
# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu   # then log out/in
# App + updater (QA uses :latest; prod uses :prod)
docker run -d --name <qa|prod> --restart unless-stopped -p 3000:3000 \
  ghcr.io/ruirochawork/acme-billing-mock:<latest|prod>
docker run -d --name watchtower --restart unless-stopped \
  -e DOCKER_API_VERSION=1.44 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower --interval 30
```

Load-bearing, easy to get wrong (all learned the hard way here):

- **`DOCKER_API_VERSION=1.44` is required.** The `containrrr/watchtower` image ships an API client
  (1.25) too old for modern daemons; without it, it errors every poll and silently never updates.
  Check with `docker logs watchtower`.
- **Do not pass `-e GIT_SHA`.** The image bakes in its commit and `/version` reports it; an
  override survives Watchtower recreation and breaks the `deliver`/`promote` commit checks.
- **OCI needs two firewalls open**, not one: the VCN security-list ingress rule for TCP 3000 (on
  the shared subnet, so it covers both boxes) **and** the instance's own iptables (above).

## Repository configuration

- **Variables:** `QA_URL` = `http://88.96.50.133:3000`, `PROD_URL` = `http://141.145.201.219:3000`
- **Secrets:** `PR_TOKEN` — fine-grained PAT (Contents + Pull requests: write), so the PR that
  `propose-fix` opens triggers `retest-pr` (a PR opened with the default token would not).
- **Environments:** `fix-approval` and `production`, each with a required reviewer = the human gate.
- The repo is **public**: environment required-reviewers and code scanning (SARIF) are paid
  features on private repos; both are free on public.

## Running the demo (browser only, after box setup)

**QA loop:**
1. Actions → `scan` → Run → open the run → summary shows 🔴 EXPLOITABLE.
2. Actions → `propose-fix` → Run (`cross-tenant-invoice-read`) → read the patch → Review
   deployments → Approve `fix-approval`. The PR opens.
3. On the PR, `retest-pr` goes green → Merge.
4. `deliver` rebuilds; Watchtower updates QA within ~30s.
5. Actions → `scan` → Run again → summary shows 🟢 FIXED.

**Promote to prod:**
6. Actions → `promote` → Run → `sha` = the commit QA's `/version` currently reports → Run.
7. Approve the `production` gate → `:prod` moves → Watchtower updates prod → workflow verifies
   prod FIXED.

## Re-arming for the next run

- **QA / `main`:** Actions → `rearm-qa` → Run → approve `fix-approval`. It reverses the stored
  fix patch on top of current `main` (restoring the vulnerability while keeping every later
  pipeline/doc change), pushes to `main`, and `deliver` rolls QA back to EXPLOITABLE. Safe to
  re-run: if `main` is already vulnerable it does nothing.
- **Prod:** Actions → `seed-prod` → Run with sha `34fcf1ed8f9ec45e799ea5b9dcf4155ba7d23f2c` (the
  vulnerable baseline) → prod goes EXPLOITABLE again after Watchtower polls.

Full reset for a fresh demo: run `rearm-qa`, then `seed-prod` — both environments EXPLOITABLE,
ready to run the loop again from the browser.

## Honesty notes (state these when presenting)

- The fix is a **stored patch** (`security/fixes/`), not authored by the tool. The run summary
  says so. Locating the code is automated; proposing the fix is not.
- The flaw was **seeded by the author** ([docs/SEEDED-FLAWS.md](SEEDED-FLAWS.md)). This proves the
  loop works end to end on real infrastructure — not detection capability.

## Known loose ends

- QA/`main` re-arm button not built (above).
- `scan`'s SARIF upload should now work on the public repo — confirm on the next run.
- The merged branch `fix/cross-tenant-invoice-read` still exists on origin; safe to delete.
- Scanner images `containrrr/watchtower`, `projectdiscovery/nuclei:latest`,
  `ghcr.io/zaproxy/zaproxy:stable` float unpinned; pin them once versions are confirmed.
