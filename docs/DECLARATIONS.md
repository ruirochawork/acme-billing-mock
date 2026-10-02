# What this application declares about itself

An assessment tool could try to work out what this service is by crawling it. It would learn the
surface it managed to reach and nothing about the shape behind it, and anything it could not reach
it would simply not know about. So instead this repository states three things plainly, in files an
assessment tool reads:

| File | What it declares | Who reads it |
| --- | --- | --- |
| `security/checks.json` | The access-control checks this application publishes for a tool to run against it | The control plane's exploit engine |
| `security/findings.json` | How each finding is fixed: the patch, the code to locate, and the provenance of the fix | The propose-fix and re-arm workflows |
| `security/architecture.json` | The components of this service and the routes each one serves | The dashboard's application map |

The bargain is the same in all three cases: the application describes itself, and the tool reads it
rather than guessing. That is what makes the result evidence instead of a drawing.

## The price of the bargain

A declaration that has drifted from the code is **worse than no declaration**, because the tool
reports it as evidence. A map drawn from a component that no longer exists, or a check aimed at a
route nobody serves, looks exactly as confident as a correct one.

So the declarations are tested against the code in `tests/declarations.test.mjs`, and CI fails when
they part company:

- every route a component declares exists in `src/app.js`
- every route `src/app.js` serves belongs to some component
- no two components share an id, and no connection names a component that does not exist
- every check aims at a route this application actually serves
- every finding names a patch that exists and locates a pattern still present in the file it names

Renaming a route without updating the declaration breaks the build from both directions. That is
deliberate: the test exists because the first draft of `architecture.json` declared a
`/user/:uid/photos/:file` route that this application has never served — a plausible-looking
component, confidently wrong, caught by the check rather than by review.

## What the architecture declares, and what it does not

`security/architecture.json` describes **one small Express process**. The components are modules of
that single deployable, not services, and the file says so in its own note and its `deployable`
field. Six components are declared: the browser as an entry point, the public site, session login,
the invoices API, the debug configuration endpoint, and the in-memory data behind them.

Two of those — the browser and the data — declare no routes. Nothing a scan sends can reach them
directly, so the map shows what they are rather than claiming they were tested and found clean.

The connections were written by reading which handlers import from `src/data.js`. Unlike the routes,
**the edges are not covered by a test**: if the debug endpoint stopped reading `data.js`, nothing
would fail. Worth knowing before trusting an edge.

## Keeping it honest as the application changes

- A new route needs a component, or CI fails. Put it on an existing one if it belongs there.
- A new component needs real code behind it. A component is a claim about this repository.
- The seeded flaw is restored by the re-arm workflow, which rewrites `src/app.js`. The declarations
  survive that because they describe routes and files, not the presence or absence of the flaw.
- The `detail` text on each component is prose a person reads on the map. Keep it true and short;
  nothing validates it.

## The deliberate limits still apply

Everything in [SCOPE.md](../SCOPE.md) continues to hold. This is a deliberately vulnerable mock with
invented tenants and fake data, in the spirit of OWASP Juice Shop, and it exists only to be tested
by its owner. The planted flaws are confined to that fake data on purpose, and the limits listed
there — no code execution, no outbound requests, no filesystem reads — are part of what makes it
safe to run exposed for a demo. Declaring the application's shape does not widen any of that; it
only means the tool draws what is already there.
