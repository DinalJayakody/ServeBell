import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { randomUUID } from 'node:crypto';
import { IdTokenVerifier, type AuthAccount, type AuthIdentity } from '../src/auth/token-verifier.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { RealtimePublisher, type BroadcastMessage } from '../src/realtime/realtime.publisher.js';
import { AppError } from '../src/common/errors.js';

/**
 * Test-only verifier: the bearer token is "test:<uid>:<email>[:unverified]". Lets
 * tests act as any Supabase Auth user without network calls; never registered outside tests.
 */
class FakeVerifier extends IdTokenVerifier {
  private parse(token: string) {
    const [prefix, uid, email, flag] = token.split(':');
    if (prefix !== 'test' || !uid || !email) throw new AppError('UNAUTHENTICATED', 'Invalid authentication token', 401);
    return { uid, email, verified: flag !== 'unverified' };
  }
  async verify(token: string): Promise<AuthIdentity> {
    const { uid, email } = this.parse(token);
    return { uid, email, name: null, provider: 'email', metadata: {} };
  }
  async account(token: string): Promise<AuthAccount> {
    const { email, verified } = this.parse(token);
    return { email, emailVerified: verified };
  }
}

/** Records realtime broadcasts instead of calling Supabase. */
export class RecordingPublisher extends RealtimePublisher {
  readonly sent: BroadcastMessage[] = [];
  async publish(messages: BroadcastMessage[]) {
    this.sent.push(...messages);
  }
}

/** Rate limits are covered separately; disable them for functional tests. */
const noThrottle = {
  increment: async () => ({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
};

export async function createTestApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(IdTokenVerifier)
    .useClass(FakeVerifier)
    .overrideProvider(RealtimePublisher)
    .useClass(RecordingPublisher)
    .overrideProvider(ThrottlerStorage)
    .useValue(noThrottle)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService), realtime: app.get(RealtimePublisher) as RecordingPublisher };
}

let seq = 0;
export function makeUser(label: string) {
  const uid = randomUUID();
  const email = `${label}-${Date.now()}-${seq++}@test.servebell.dev`;
  return { uid, email, token: `test:${uid}:${email}` };
}

export function api(app: INestApplication, token?: string) {
  const agent = request(app.getHttpServer());
  const auth = (r: request.Test) => (token ? r.set('Authorization', `Bearer ${token}`) : r);
  return {
    get: (url: string) => auth(agent.get(`/api/v1${url}`)),
    post: (url: string, body?: object) => auth(agent.post(`/api/v1${url}`)).send(body ?? {}),
    patch: (url: string, body?: object) => auth(agent.patch(`/api/v1${url}`)).send(body ?? {}),
    put: (url: string) => auth(agent.put(`/api/v1${url}`)),
    delete: (url: string) => auth(agent.delete(`/api/v1${url}`)),
  };
}

/** Creates a Supabase Auth user with a synced local profile. */
export async function signUp(app: INestApplication, label: string, appName: 'CUSTOMER' | 'RESTAURANT' = 'CUSTOMER') {
  const u = makeUser(label);
  const res = await api(app, u.token).post('/auth/sync', { app: appName, fullName: `${label} user` });
  if (res.status !== 200) throw new Error(`sync failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...u, id: res.body.id as string };
}
