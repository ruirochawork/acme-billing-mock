// Fake, in-memory data. Two tenants, four invoices. Nothing here is real; there is no database
// and no real customer. The data exists only so the demo has two accounts whose boundary can be
// crossed and then defended.

export const users = {
  alice: { username: 'alice', accountId: 'acct_acme_001', tenant: 'Acme' },
  bob: { username: 'bob', accountId: 'acct_globex_002', tenant: 'Globex' },
};

export const invoices = [
  { id: 'inv_acme_5001', accountId: 'acct_acme_001', customer: 'Acme Corp', amountCents: 42000, status: 'paid' },
  { id: 'inv_acme_5002', accountId: 'acct_acme_001', customer: 'Acme Corp', amountCents: 15900, status: 'open' },
  { id: 'inv_globex_9001', accountId: 'acct_globex_002', customer: 'Globex LLC', amountCents: 730000, status: 'open' },
  { id: 'inv_globex_9002', accountId: 'acct_globex_002', customer: 'Globex LLC', amountCents: 128000, status: 'paid' },
];

export const invoicesForAccount = (accountId) =>
  invoices.filter((invoice) => invoice.accountId === accountId);

export const latestInvoiceId = (accountId) => {
  const owned = invoicesForAccount(accountId);
  return owned.length ? owned[owned.length - 1].id : null;
};
