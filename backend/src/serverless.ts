import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
let ready: Promise<Handler> | null = null;

/** Builds the same Nest app as main.ts, without listening; reused while the instance stays warm. */
async function create(): Promise<Handler> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  // Behind Vercel's edge proxy: needed for client IPs in rate limiting and audit logs.
  app.set('trust proxy', 1);
  configureApp(app);
  await app.init();
  return app.getHttpAdapter().getInstance() as Handler;
}

/** Vercel Node.js function entry (see backend/api/index.js and backend/vercel.json). */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // A failed cold start is retried on the next request instead of being cached.
  ready ??= create().catch((e: unknown) => {
    ready = null;
    throw e;
  });
  (await ready)(req, res);
}
