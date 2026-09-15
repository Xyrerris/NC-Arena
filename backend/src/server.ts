import Fastify from 'fastify';
import type { FastifyError } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';

import { ApiError } from './domain/errors.js';
import { accountRoutes } from './routes/accounts.js';
import { meRoutes } from './routes/me.js';
import { rosterRoutes } from './routes/roster.js';

export const buildServer = () => {
  const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

  // Every route below is registered with Zod schemas (fastify-type-provider-zod). A body or
  // response that fails validation throws before a handler runs, which is what turns Zod's
  // issue list into a `VALIDATION_ERROR` below rather than a raw Fastify error shape.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((error: FastifyError | ApiError, _req, reply) => {
    if (error instanceof ApiError) {
      reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
      return;
    }
    if (error.validation) {
      reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: error.message },
      });
      return;
    }
    app.log.error(error);
    reply.code(500).send({ error: { code: 'INTERNAL', message: 'Something went wrong.' } });
  });

  app.get('/health', async () => ({ ok: true }));

  app.register(accountRoutes);
  app.register(rosterRoutes);
  app.register(meRoutes);

  return app;
};
