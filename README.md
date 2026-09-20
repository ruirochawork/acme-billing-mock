# acme-billing-mock

A **deliberately vulnerable mock billing API**, used only to demonstrate a security-testing tool
against a real running service and a real CI pipeline. No real users, no real data, nothing in
production. Same idea as OWASP Juice Shop or DVWA. Read [SCOPE.md](SCOPE.md) before running it
anywhere reachable.

It is the real target behind the scripted "verifies its own fixes" loop in the main showcase: a
scanner finds a weakness, an exploit proves it against the live service **with a control request**,
a pull request fixes it, and the pipeline retests the deployed commit to prove the fix.

## Run locally

```sh
npm install
npm start          # http://127.0.0.1:3000  (localhost only by default)
npm test           # the app's own invariants
```

Prove the hero finding against a running instance:

```sh
npm run exploit -- --url http://127.0.0.1:3000
```

You will see the triple and a verdict:

- **attack** — Alice's session reads Globex's invoice → `200` with another tenant's data
- **control** — Alice reads her own invoice → `200` (the endpoint still works)
- **negative** — no session reads the same invoice → `401` (auth exists)

`EXPLOITABLE` today; `FIXED` once the ownership check is merged. `BROKEN` (control or negative
misbehaving) never counts as a fix — that guard is the point of the triple.

## The seeded flaws

Four, all deliberate and confined to the fake data, listed in
[docs/SEEDED-FLAWS.md](docs/SEEDED-FLAWS.md) with the tool that finds each and the fix it gets.
The hero is an IDOR on `GET /api/invoices/:id`, chained from the `GET /debug/config` leak.

## The pipeline

Three workflows in [.github/workflows](.github/workflows):

Five workflows implement the full loop: detect on the server → locate the code → approve → open
the PR → gate the merge → deploy to QA → promote to production, each stage proven before the next.

| Workflow | Trigger | Stage | What it does |
|----------|---------|-------|--------------|
| `scan.yml` | schedule / manual | 1–2 detect | Scans `QA_URL` (or a local instance) with ZAP + Nuclei + the exploit triple; SARIF to the Security tab; opens a tracking issue when `EXPLOITABLE`. Report-only. |
| `propose-fix.yml` | manual (finding id) | 3–5 fix | `locate-fix` resolves the finding to a `file:line` and shows the stored patch; after the `fix-approval` environment is approved, applies the patch on a branch and opens the PR. |
| `retest-pr.yml` | pull request | 6 gate | App tests + exploit `--expect fixed` (attack 403, control 200, negative 401). Blocks merge. |
| `deliver.yml` | push to `main` | 7 QA | Builds once, publishes to GHCR tagged by commit, deploys that digest to QA, verifies QA is up and on that commit. |
| `promote.yml` | manual (sha) | 8–9 prod | Re-runs the finding on QA and requires `FIXED`; then, behind the `production` environment's reviewer, deploys the **same digest** to prod and verifies it there. |

The honest core is that **each stage is proven, not asserted**: `retest-pr` proves the fix before
merge, `deliver` proves QA runs the exact commit, and `promote` re-proves the finding on QA and
ships the identical image digest to production — never a rebuild. `deploy/deploy.sh` is the one
file you fill in for your host; everything else is host-agnostic and driven by the `QA_URL` /
`PROD_URL` variables.

## What the tool does vs what is stored

Locating the vulnerable code (`security/locate-fix.mjs`) is genuinely automated. The **fix itself
is a stored patch** in `security/fixes/`, keyed to the finding in `security/findings.json`; every
output labels it as such, so an approver never mistakes it for a model-authored change. This is
the demo being explicit about where automation ends today.

## Configure

Repository **Settings → Secrets and variables → Actions**:

- **Variables:** `QA_URL`, `PROD_URL` — the two environments' base URLs. Unset = build/publish
  only, no deploy, so a fresh repo stays green.
- **Secrets:** whatever `deploy/deploy.sh` needs (e.g. `DEPLOY_SSH_KEY` or `FLY_API_TOKEN`); and
  optionally `PR_TOKEN` (a fine-grained PAT) so a PR opened by `propose-fix` triggers `retest-pr`
  — PRs opened with the default token do not trigger other workflows.

**Environments** (Settings → Environments), each with a required reviewer:
`fix-approval` (gates opening the PR) and `production` (gates the prod deploy).

## Re-arming the demo

`main` and the `demo-vulnerable` tag are the vulnerable baseline. After a fix is merged, reset for
the next run:

```sh
git push origin --delete fix/cross-tenant-invoice-read   # remove branch (closes the PR)
git reset --hard demo-vulnerable
git push --force-with-lease origin main                    # redeploys the vulnerable build to QA
```

## Pinning versions

`projectdiscovery/nuclei:latest` and `ghcr.io/zaproxy/zaproxy:stable` float by design (their exact
tags could not be verified offline). Pin them to a specific release once confirmed; both scanner
steps are wrapped so a drift never fails the job on its own.
