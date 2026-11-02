/**
 * Minimal Supabase Auth helpers for scripts and the dev seed (Auth REST API).
 * The secret key is only read from the environment and never printed.
 */
const base = () => (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
const secret = () => process.env.SUPABASE_SECRET_KEY ?? '';

export const isLocalSupabase = () => /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base());

async function admin<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!base() || !secret()) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set');
  const res = await fetch(`${base()}/auth/v1${path}`, {
    method,
    headers: { apikey: secret(), Authorization: `Bearer ${secret()}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase Auth ${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}

type AuthUser = { id: string; email?: string };

export async function findAuthUser(email: string): Promise<AuthUser | null> {
  const target = email.toLowerCase();
  for (let page = 1; page < 50; page++) {
    const { users } = await admin<{ users: AuthUser[] }>('GET', `/admin/users?page=${page}&per_page=200`);
    const hit = users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (users.length < 200) return null;
  }
  return null;
}

/** Creates the user already confirmed, or resets the password of an existing one. Returns auth.users.id. */
export async function ensureAuthUser(input: { email: string; password?: string; fullName?: string }): Promise<string> {
  const existing = await findAuthUser(input.email);
  const attrs = {
    email_confirm: true,
    ...(input.password ? { password: input.password } : {}),
    ...(input.fullName ? { user_metadata: { full_name: input.fullName } } : {}),
  };
  if (existing) {
    await admin('PUT', `/admin/users/${existing.id}`, attrs);
    return existing.id;
  }
  const created = await admin<AuthUser>('POST', '/admin/users', { email: input.email, ...attrs });
  return created.id;
}

/** Signs in with email + password and returns an access token. */
export async function passwordSignIn(email: string, password: string, apiKey = process.env.SUPABASE_PUBLISHABLE_KEY || secret()) {
  const res = await fetch(`${base()}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { access_token?: string; msg?: string; error_description?: string; message?: string };
  if (!body.access_token) throw new Error(`Sign-in failed for ${email}: ${body.msg ?? body.error_description ?? body.message ?? res.status}`);
  return body.access_token;
}
