// A mock billing API with deliberately planted weaknesses, used only to demonstrate a
// security-testing tool against a real running service. Every planted weakness is marked
// `SEEDED FLAW` and documented in docs/SEEDED-FLAWS.md, together with the fix each one gets.
//
// Deliberately kept inside the fake data: reading another tenant's fake invoice, a leaked
// config blob, a reflected CORS header, a couple of missing browser headers. Deliberately NOT
// present: anything that runs code, reads the host filesystem, or reaches the network from the
// server. The blast radius is the fake data in this file and nothing else.

import crypto from 'node:crypto';
import express from 'express';
import { users, invoices, invoicesForAccount, latestInvoiceId } from './data.js';
import { gitSha } from './version.js';

// sid -> username. In memory, cleared on restart. No real credentials exist.
const sessions = new Map();

const parseCookies = (header = '') =>
  Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const eq = part.indexOf('=');
        return [part.slice(0, eq), decodeURIComponent(part.slice(eq + 1))];
      }),
  );

const currentUser = (req) => {
  const { sid } = parseCookies(req.headers.cookie);
  const username = sid && sessions.get(sid);
  return username ? users[username] : null;
};

export function createApp() {
  const app = express();
  app.use(express.json());

  // SEEDED FLAW (API configuration): CORS reflects any Origin and allows credentials, so any
  // site a logged-in user visits can read authenticated responses. Fix: an allow-list.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // SEEDED FLAW (Browser security): no Content-Security-Policy is ever set, so a reflected or
  // stored script would run unrestricted. Fix: a restrictive default-src policy.

  app.get('/', (_req, res) => {
    res
      .type('html')
      .send(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Acme Billing (mock)</title></head>' +
          '<body><h1>Acme Billing — mock target</h1>' +
          '<p>Deliberately vulnerable demo service. Fake data only. Not for production use.</p>' +
          '<form method="post" action="/login"><button>Sign in (mock)</button></form>' +
          '</body></html>',
      );
  });

  app.get('/version', (_req, res) => res.json({ service: 'acme-billing-mock', gitSha }));
  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  // Ownership proof: echoes the secret set on this box via PMC_VERIFY_TOKEN. Whoever can configure
  // the box can set it; proving knowledge of it to the control plane proves control of the target.
  // Not a vulnerability — it exposes no secret unless one is deliberately configured here.
  app.get('/.well-known/pmc-verify', (_req, res) =>
    res.json({ service: 'acme-billing-mock', token: process.env.PMC_VERIFY_TOKEN || null }),
  );

  // Mock sign-in: no password, because there is nothing real to protect. Pick a known user.
  app.post('/login', (req, res) => {
    const username = (req.body && req.body.username) || 'alice';
    if (!users[username]) return res.status(400).json({ error: 'unknown demo user' });
    const sid = crypto.randomUUID();
    sessions.set(sid, username);
    // SEEDED FLAW (Browser security): session cookie lacks SameSite and Secure. HttpOnly is
    // kept so the flaw under test is the missing cross-site and transport protection only.
    res.setHeader('Set-Cookie', `sid=${sid}; Path=/; HttpOnly`);
    res.json({ ok: true, user: username, accountId: users[username].accountId });
  });

  app.get('/api/me', (req, res) => {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: 'not authenticated' });
    res.json({ username: user.username, accountId: user.accountId, tenant: user.tenant });
  });

  // Correct behaviour: a listing scoped to the caller's own account. The contrast with the
  // single-invoice route below is the whole point of the demo.
  app.get('/api/invoices', (req, res) => {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: 'not authenticated' });
    res.json({ invoices: invoicesForAccount(user.accountId) });
  });

  // SEEDED FLAW (Access control — the hero): this reads an invoice by id and checks only that
  // the caller is logged in, never that the invoice belongs to their account. Any authenticated
  // user can read any tenant's invoice (IDOR / broken object-level authorization). Fix: compare
  // invoice.accountId with the caller's accountId and return 403 otherwise.
  app.get('/api/invoices/:id', (req, res) => {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: 'not authenticated' });
    const invoice = invoices.find((candidate) => candidate.id === req.params.id);
    if (!invoice) return res.status(404).json({ error: 'not found' });
    res.json({ invoice });
  });

  // SEEDED FLAW (API configuration — the chain enabler): an unauthenticated debug endpoint that
  // leaks every account id, a fake internal token, and each account's latest invoice id. That
  // last field is what turns the IDOR above into a cross-tenant read without any guessing.
  // Fix: remove the endpoint, or gate it behind an internal-only network and auth.
  app.get('/debug/config', (_req, res) => {
    res.json({
      env: 'staging',
      internalToken: 'tok_internal_demo_2f9c', // fake, not a credential to anything
      accounts: Object.values(users).map((user) => ({
        accountId: user.accountId,
        tenant: user.tenant,
        latestInvoiceId: latestInvoiceId(user.accountId),
      })),
    });
  });

  return app;
}
