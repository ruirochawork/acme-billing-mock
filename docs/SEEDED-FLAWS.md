# Seeded flaws

Every weakness in this app is deliberate and listed here. They were planted by the person who
also wrote the demo, so a successful run demonstrates the **find → prove → fix → retest loop
working end to end** — not the tool's ability to discover unknown bugs. That distinction is made
openly; see the evaluation plan in the main showcase repo.

All four stay inside the fake data in `src/data.js`. None runs code, reads the host, or makes the
server reach the network. The worst outcome of any of them is reading a made-up invoice.

| # | Flaw | Class | Found by | Fix |
|---|------|-------|----------|-----|
| 1 | `GET /api/invoices/:id` has no ownership check — any logged-in user reads any tenant's invoice (IDOR / BOLA) | Access control | `security/exploit/access-control.mjs` | Compare `invoice.accountId` to the caller's account; return 403 otherwise |
| 2 | `GET /debug/config` leaks account ids, a fake internal token, and each account's latest invoice id | API configuration | Nuclei (`security/nuclei/debug-config-exposure.yaml`) | Remove the endpoint, or gate it to an internal network with auth |
| 3 | CORS reflects any `Origin` with credentials allowed | API configuration | ZAP full scan | Replace reflection with an allow-list |
| 4 | No CSP header; session cookie lacks `SameSite`/`Secure` | Browser security | ZAP baseline (passive) | Set a restrictive CSP; add `SameSite=Lax; Secure` to the cookie |

## The chain (flaws 2 → 1)

Flaw 2 hands an attacker the victim's `latestInvoiceId` without any guessing; flaw 1 then serves
that invoice to the wrong tenant. The exploit script walks exactly this path: sign in as Alice,
read `/debug/config` to learn Globex's latest invoice id, then read it with Alice's session.

## The demonstration PR

Scope the first PR to **flaw 1 only** — the hero. The fix is the stored patch
`security/fixes/cross-tenant-invoice-read.patch` (the ownership check on `src/app.js`), applied by
the `propose-fix` workflow after approval. `retest-pr` then shows the attack returning 403 while
the control request (Alice reading her own invoice) still returns 200, proving the endpoint was
narrowed rather than broken. Flaws 2–4 are left for subsequent findings so each stays a clean,
single-finding change.
