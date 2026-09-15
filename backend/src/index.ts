import 'dotenv/config';

import { buildServer } from './server.js';

const app = buildServer();
const port = Number.parseInt(process.env['PORT'] ?? '3000', 10);

app
  .listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info(`listening on ${port}`))
  .catch((error: unknown) => {
    app.log.error(error);
    process.exit(1);
  });
