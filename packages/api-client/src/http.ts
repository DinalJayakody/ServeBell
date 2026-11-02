import { ErrorCode, type ApiErrorBody } from '@servebell/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: ApiErrorBody['details'],
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the request never reached the server (offline, DNS, timeout). */
  get isNetwork() {
    return this.status === 0;
  }
}

export interface ApiClientOptions {
  /** e.g. http://192.168.1.5:4000 — never localhost when testing on a phone. */
  baseUrl: string;
  /** Returns the current Supabase access token; `forceRefresh` asks Supabase Auth for a fresh one. */
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  /** Called when the server rejects the session even after a token refresh. */
  onUnauthenticated?: () => void;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
type Query = Record<string, string | number | boolean | undefined | null>;

export class HttpClient {
  constructor(private readonly opts: ApiClientOptions) {}

  async request<T>(method: Method, path: string, init: { body?: unknown; query?: Query; auth?: boolean } = {}): Promise<T> {
    const auth = init.auth ?? true;
    let res = await this.send(method, path, init, auth ? await this.opts.getIdToken(false) : null);
    if (res.status === 401 && auth) {
      const body = (await res.clone().json().catch(() => null)) as ApiErrorBody | null;
      if (body?.code === ErrorCode.TOKEN_EXPIRED) {
        res = await this.send(method, path, init, await this.opts.getIdToken(true));
      }
      if (res.status === 401) this.opts.onUnauthenticated?.();
    }
    if (res.status === 204) return undefined as T;
    const data = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const e = (data ?? {}) as Partial<ApiErrorBody>;
      throw new ApiError(res.status, e.code ?? ErrorCode.INTERNAL, e.message ?? `Request failed (${res.status})`, e.details, e.requestId);
    }
    return data as T;
  }

  /** Multipart upload (FormData) with the same auth/refresh/error handling. */
  async upload<T>(path: string, form: FormData): Promise<T> {
    const go = async (force: boolean) => {
      const token = await this.opts.getIdToken(force);
      try {
        return await (this.opts.fetchImpl ?? fetch)(new URL(`/api/v1${path}`, this.opts.baseUrl).toString(), { method: 'POST', body: form, headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
      } catch {
        throw new ApiError(0, 'NETWORK', 'Upload failed. Check your connection and try again.');
      }
    };
    let res = await go(false);
    if (res.status === 401) res = await go(true);
    const data = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const e = (data ?? {}) as Partial<ApiErrorBody>;
      throw new ApiError(res.status, e.code ?? ErrorCode.INTERNAL, e.message ?? 'Upload failed', e.details, e.requestId);
    }
    return data as T;
  }

  /** Raw text response (e.g. printable HTML). */
  async text(path: string): Promise<string> {
    const token = await this.opts.getIdToken(false);
    const res = await (this.opts.fetchImpl ?? fetch)(new URL(`/api/v1${path}`, this.opts.baseUrl).toString(), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new ApiError(res.status, ErrorCode.INTERNAL, `Request failed (${res.status})`);
    return res.text();
  }

  private async send(method: Method, path: string, init: { body?: unknown; query?: Query }, token: string | null) {
    const url = new URL(`/api/v1${path}`, this.opts.baseUrl);
    for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 15_000);
    try {
      return await (this.opts.fetchImpl ?? fetch)(url.toString(), {
        method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError(0, 'NETWORK', 'Unable to reach ServeBell. Check your connection and try again.');
    } finally {
      clearTimeout(timer);
    }
  }
}
