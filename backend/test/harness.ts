import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { IdTokenVerifier, type FirebaseIdentity } from '../src/auth/firebase-token.verifier.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { AppError } from '../src/common/errors.js';

/**
 * Test-only verifier: the bearer token is "test:<uid>:<email>". Lets tests act
 * as any Firebase user without network calls; never registered outside tests.
 */
class FakeVerifier extends IdTokenVerifier {
  async verify(token: string): Promise<FirebaseIdentity> {
    const [prefix, uid, email, flag] = token.split(':');
    if (prefix !== 'test' || !uid || !email) throw new AppError('UNAUTHENTICATED', 'Invalid authentication token', 401);
    return { uid, email, emailVerified: flag !== 'unverified', name: null, signInProvider: 'password' };
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
    .overrideProvider(ThrottlerStorage)
    .useValue(noThrottle)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

let seq = 0;
export function makeUser(label: string) {
  const id = `${label}-${Date.now()}-${seq++}`;
  const email = `${id}@test.servebell.dev`;
  return { uid: id, email, token: `test:${id}:${email}` };
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

/** Creates a Firebase-backed user with a synced local profile. */
export async function signUp(app: INestApplication, label: string, appName: 'CUSTOMER' | 'RESTAURANT' = 'CUSTOMER') {
  const u = makeUser(label);
  const res = await api(app, u.token).post('/auth/sync', { app: appName, fullName: `${label} user` });
  if (res.status !== 200) throw new Error(`sync failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...u, id: res.body.id as string };
}
