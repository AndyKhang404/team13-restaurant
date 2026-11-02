import { createApp } from './app.js';
import { env } from './config/env.js';
import { pruneSessions } from './auth/session.js';

const app = createApp();

const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

function pruneExpiredSessions(): void {
  pruneSessions()
    .then((count) => {
      if (count > 0) console.log(`🧹 Pruned ${count} expired/revoked session(s).`);
    })
    .catch((error: unknown) => {
      console.warn('[session] cleanup failed:', error instanceof Error ? error.message : error);
    });
}

app.listen(env.PORT, () => {
  console.log(`🚀 Team13 Restaurant SSR server running at http://localhost:${env.PORT}`);
  console.log(`🌱 Environment: ${env.NODE_ENV}`);

  // Clean up dead sessions on boot and hourly thereafter.
  pruneExpiredSessions();
  setInterval(pruneExpiredSessions, PRUNE_INTERVAL_MS).unref();
});