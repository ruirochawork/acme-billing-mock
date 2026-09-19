// Entry point: starts the mock target. Bind address and port come from the environment so the
// container and the demo box can pin them; default to localhost so a bare `npm start` never
// exposes the service by accident.
import { createApp } from './app.js';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';

createApp().listen(port, host, () => {
  console.log(`acme-billing-mock listening on http://${host}:${port}`);
});
