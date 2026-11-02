import { type INestApplication, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppConfig } from './config/config.module.js';
import { ConfiguredIoAdapter } from './realtime/socket-adapter.js';

/** Shared by main.ts and the e2e tests so tests exercise the real HTTP pipeline. */
export function configureApp(app: INestApplication) {
  const config = app.get(AppConfig);
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableCors({ origin: config.env.CORS_ORIGINS, credentials: false });
  app.useWebSocketAdapter(new ConfiguredIoAdapter(app, config.env.CORS_ORIGINS));
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();

  if (!config.isProd) {
    const doc = new DocumentBuilder()
      .setTitle('ServeBell API')
      .setDescription('Authenticate with a Firebase ID token: `Authorization: Bearer <idToken>`.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, doc));
  }
  return config;
}
