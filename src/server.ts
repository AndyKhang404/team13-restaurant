import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`🚀 Team13 Restaurant SSR server running at http://localhost:${env.PORT}`);
  console.log(`📁 Environment: ${env.NODE_ENV}`);
});
