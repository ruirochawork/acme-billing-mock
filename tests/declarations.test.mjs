// This application declares things about itself that an assessment tool trusts: the checks it
// publishes, how each finding is fixed, and its own shape. A declaration that has drifted from the
// code is worse than none, because the tool reports it as evidence — a map drawn from a component
// that no longer exists, or a check aimed at a route nobody serves. So the declarations are tested
// against the code here, and CI fails when they part company.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const source = readFileSync(join(root, 'src/app.js'), 'utf8');

// Every route this service actually serves, as Express registers it.
const routes = [...source.matchAll(/app\.(get|post|put|patch|delete)\('([^']+)'/g)].map((m) => ({
  method: m[1].toUpperCase(),
  path: m[2],
}));

// A declared prefix covers a route when it is that route or a path segment above it. "/" is the
// root page, not a claim on everything below it — the same rule the control plane applies.
const covers = (prefix, path) =>
  path === prefix || (prefix !== '/' && path.startsWith(`${prefix}/`));

test('the app really does serve the routes these tests reason about', () => {
  assert.ok(routes.length >= 8, `found only ${routes.length} routes in src/app.js`);
  for (const expected of ['/login', '/api/invoices', '/api/invoices/:id', '/debug/config'])
    assert.ok(
      routes.some((r) => r.path === expected),
      `src/app.js no longer serves ${expected}`,
    );
});

test('every component in architecture.json serves routes that exist', () => {
  const { components } = read('security/architecture.json');
  for (const c of components)
    for (const declared of c.routes)
      assert.ok(
        routes.some((r) => covers(declared, r.path)),
        `component "${c.id}" declares ${declared}, which src/app.js does not serve`,
      );
});

test('every route the app serves belongs to a component', () => {
  // A route on no component is a finding with nowhere to sit: the tool would report it as
  // unaccounted for, which is right, but the declaration is what should be fixed.
  const { components } = read('security/architecture.json');
  const declared = components.flatMap((c) => c.routes);
  for (const r of routes)
    assert.ok(
      declared.some((prefix) => covers(prefix, r.path)),
      `${r.method} ${r.path} is on no component in security/architecture.json`,
    );
});

test('architecture.json is internally consistent', () => {
  const { components, connections } = read('security/architecture.json');
  const ids = new Set(components.map((c) => c.id));
  assert.equal(ids.size, components.length, 'two components share an id');
  for (const edge of connections)
    for (const end of [edge.from, edge.to])
      assert.ok(ids.has(end), `connection ${edge.from}→${edge.to} names unknown component "${end}"`);
});

test('every check in checks.json aims at routes this app serves', () => {
  const { checks } = read('security/checks.json');
  assert.ok(checks.length > 0, 'checks.json declares no checks');
  for (const check of checks) {
    const steps = [...(check.setup || []), check.attack, check.control, check.negative];
    for (const step of steps.filter(Boolean)) {
      // A step's path can carry a capture; only its fixed part can be checked against the code.
      const fixed = String(step.path).split('{{')[0].replace(/\/$/, '') || '/';
      assert.ok(
        routes.some((r) => covers(fixed, r.path) || r.path.startsWith(fixed)),
        `check "${check.id}" asks for ${step.path}, which src/app.js does not serve`,
      );
    }
  }
});

test('every finding in findings.json points at code and a patch that exist', () => {
  const findings = read('security/findings.json');
  assert.ok(Object.keys(findings).length > 0, 'findings.json declares nothing');
  for (const [id, f] of Object.entries(findings)) {
    assert.ok(f.patch, `finding "${id}" declares no patch`);
    // The patch and the located file must be real: the fix flow reads both by name.
    assert.doesNotThrow(
      () => readFileSync(join(root, f.patch)),
      `finding "${id}" names a patch that does not exist: ${f.patch}`,
    );
    const located = readFileSync(join(root, f.locate.file), 'utf8');
    assert.ok(
      located.includes(f.locate.pattern),
      `finding "${id}" locates "${f.locate.pattern}" in ${f.locate.file}, which no longer contains it`,
    );
  }
});
