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

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `deploy.yml` | push to `main` | build the image (stamped with the commit), smoke-test, deploy if a deploy secret is set |
| `security.yml` | manual / schedule | bring the target up, run ZAP + Nuclei + the exploit script, upload SARIF to code scanning |
| `retest.yml` | pull request | build the PR, run the app's tests and the exploit script with `--expect fixed` — must pass to merge |

`retest.yml` is the honest core: the tool proposes a change, and CI proves it on the running
service **before** anyone merges — the same "a change to verify, not a recommendation" principle
the showcase applies to workflow permissions.

## Re-arming the demo

Tag the vulnerable commit (for example `demo-vulnerable`) so you can redeploy it and reset the
demo in one step after a fix is merged.

## Pinning versions

The scanner and action versions in the workflows are marked with `# VERIFY` where the exact tag
or SARIF flag should be confirmed against the current release before you rely on them.
