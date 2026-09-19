# Scope and safety

This is a **deliberately vulnerable mock service** for demonstrating a security-testing tool. It
is the same category of artifact as OWASP Juice Shop, DVWA and WebGoat. It exists only to be
tested by its owner.

## What it is

- Fake data only: two invented tenants and four invoices, held in memory (`src/data.js`).
- No real users, no database, no secrets, no connection to any real system.
- The "internal token" in `/debug/config` is a made-up string that authenticates to nothing.

## What may be tested

- Only this service, run by its owner, on infrastructure the owner controls.
- The planted flaws in [docs/SEEDED-FLAWS.md](docs/SEEDED-FLAWS.md), with the tools named there.

## Deliberate limits (keep them)

The planted flaws are confined to the fake data on purpose. Do not add flaws that widen the blast
radius beyond it:

- No remote code execution, command injection, or file upload to disk.
- No SSRF or anything that lets the server make outbound requests — on a cloud host that can
  reach the instance metadata service, this would expose real credentials.
- No path traversal or host filesystem reads.

## Running it exposed

If a copy is left running for live demos: restrict who can reach it (IP allow-list, an auth gate
at the edge, or bring it up only during a demo and tear it down after), run it in a throwaway
account or project with a spending cap, keep the container unprivileged and the host patched, and
confirm the host provider permits security testing of your own service. Because no planted flaw
reaches code execution, the worst a passer-by can do is read fake invoices.
