import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validateEnv, type Env } from './env.js';

export class AppConfig {
  constructor(readonly env: Env) {}
  get isProd() {
    return this.env.NODE_ENV === 'production';
  }
}

@Global()
@Module({
  imports: [NestConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true })],
  providers: [
    // forRoot has already loaded .env into process.env and validated it once.
    { provide: AppConfig, useFactory: () => new AppConfig(validateEnv(process.env)) },
  ],
  exports: [AppConfig],
})
export class ConfigModule {}
