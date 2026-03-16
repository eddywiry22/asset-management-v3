import { env, validateEnv } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import logger from './utils/logger';
import app from './app';

async function bootstrap(): Promise<void> {
  validateEnv();

  await connectDatabase();

  const server = app.listen(env.port, () => {
    logger.info(`Server running on port ${env.port} in ${env.nodeEnv} mode`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
