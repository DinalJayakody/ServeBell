import { describe, expect, it, vi } from 'vitest';
import { createApiClient, ApiError } from './index.js';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('api client', () => {
  it('sends the access token and parses JSON', async () => {
    const fetchImpl = vi.fn(async () => json(200, { id: 'u1' }));
    const api = createApiClient({ baseUrl: 'http://api.test', getIdToken: async () => 'tok', fetchImpl });
    await expect(api.auth.me()).resolves.toEqual({ id: 'u1' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/auth/me');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('refreshes an expired token once and retries', async () => {
    const getIdToken = vi.fn(async (force?: boolean) => (force ? 'fresh' : 'stale'));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(401, { statusCode: 401, code: 'TOKEN_EXPIRED', message: 'Session expired' }))
      .mockResolvedValueOnce(json(200, { id: 'u1' }));
    const api = createApiClient({ baseUrl: 'http://api.test', getIdToken, fetchImpl });
    await expect(api.auth.me()).resolves.toEqual({ id: 'u1' });
    expect(getIdToken).toHaveBeenLastCalledWith(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('maps API errors and notifies on unrecoverable 401', async () => {
    const onUnauthenticated = vi.fn();
    const fetchImpl = vi.fn(async () => json(401, { statusCode: 401, code: 'UNAUTHENTICATED', message: 'nope' }));
    const api = createApiClient({ baseUrl: 'http://api.test', getIdToken: async () => 'tok', fetchImpl, onUnauthenticated });
    await expect(api.auth.me()).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(onUnauthenticated).toHaveBeenCalledOnce();
  });

  it('reports network failures distinctly', async () => {
    const api = createApiClient({ baseUrl: 'http://api.test', getIdToken: async () => null, fetchImpl: vi.fn(async () => { throw new TypeError('fetch failed'); }) });
    const err = await api.health().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).isNetwork).toBe(true);
  });
});
