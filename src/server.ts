import { buildApp } from './app.js';

async function main() {
  const port = Number(process.env.PORT ?? 8080);
  const host = process.env.HOST ?? '0.0.0.0';
  const app = buildApp({});

  try {
    await app.listen({ port, host });
  } catch (error) {
    app.log.error(error, 'failed_to_start');
    process.exit(1);
  }
}

void main();
