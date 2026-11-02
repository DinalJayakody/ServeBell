import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';

async function main() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  // Behind Nginx in production; needed for correct client IPs in rate limiting and audit logs.
  app.set('trust proxy', 1);
  const config = configureApp(app);
  // 0.0.0.0 so phones on the LAN (Expo Go) can reach the API.
  await app.listen(config.env.PORT, '0.0.0.0');
}

void main();
