// The app's own tests assert the invariants that must hold BEFORE and AFTER the fix, so this
// suite stays green across the fix PR. The security state that actually changes (the IDOR) is
// asserted by security/exploit/access-control.mjs, not here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

const start = () =>
  new Promise((resolve) => {
    const server = createApp().listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });

const login = async (base, username) => {
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  return { cookie, body: await res.json() };
};

test('version endpoint reports a git sha', async () => {
  const { server, base } = await start();
  try {
    const body = await (await fetch(`${base}/version`)).json();
    assert.equal(body.service, 'acme-billing-mock');
    assert.ok(body.gitSha);
  } finally {
    server.close();
  }
});

test('invoice listing is scoped to the caller account', async () => {
  const { server, base } = await start();
  try {
    const alice = await login(base, 'alice');
    const body = await (await fetch(`${base}/api/invoices`, { headers: { cookie: alice.cookie } })).json();
    assert.ok(body.invoices.length > 0);
    assert.ok(body.invoices.every((invoice) => invoice.accountId === alice.body.accountId));
  } finally {
    server.close();
  }
});

test('an unauthenticated invoice read is rejected (negative control invariant)', async () => {
  const { server, base } = await start();
  try {
    const res = await fetch(`${base}/api/invoices/inv_globex_9002`);
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test('a caller can always read their own invoice (control invariant)', async () => {
  const { server, base } = await start();
  try {
    const alice = await login(base, 'alice');
    const list = await (await fetch(`${base}/api/invoices`, { headers: { cookie: alice.cookie } })).json();
    const ownId = list.invoices[0].id;
    const res = await fetch(`${base}/api/invoices/${ownId}`, { headers: { cookie: alice.cookie } });
    assert.equal(res.status, 200);
  } finally {
    server.close();
  }
});
