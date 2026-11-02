import { HttpStatus, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, errors as joseErrors, jwtVerify, type JWTPayload } from 'jose';
import { ErrorCode } from '@servebell/shared';
import { AppConfig } from '../config/config.module.js';
import { AppError } from '../common/errors.js';

/** Who the bearer token belongs to (a Supabase Auth user). */
export interface AuthIdentity {
  /** auth.users.id */
  uid: string;
  email: string | null;
  name: string | null;
  provider: string | null;
  /** Profile fields given at sign-up (user_metadata); only used to fill blanks. */
  metadata: { fullName?: string; phone?: string };
}

/** Authoritative account state, read from Supabase Auth rather than from the token. */
export interface AuthAccount {
  email: string | null;
  emailVerified: boolean;
}

/** Abstract so tests can provide a deterministic verifier without network access. */
export abstract class IdTokenVerifier {
  abstract verify(accessToken: string): Promise<AuthIdentity>;
  /** Asks Supabase Auth for the user behind a token (also proves the session still exists). */
  abstract account(accessToken: string): Promise<AuthAccount>;
}

interface SupabaseClaims extends JWTPayload {
  email?: string;
  role?: string;
  app_metadata?: { provider?: string };
  user_metadata?: { full_name?: unknown; name?: unknown; phone?: unknown };
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/**
 * Verifies Supabase access tokens offline against the project's published
 * signing keys (ES256 JWKS, cached by jose and refreshed on key rotation).
 */
@Injectable()
export class SupabaseJwtVerifier extends IdTokenVerifier {
  private readonly issuer: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly config: AppConfig) {
    super();
    const base = config.env.SUPABASE_URL.replace(/\/$/, '');
    this.issuer = `${base}/auth/v1`;
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`), { cooldownDuration: 30_000, cacheMaxAge: 10 * 60_000 });
  }

  async verify(accessToken: string): Promise<AuthIdentity> {
    let claims: SupabaseClaims;
    try {
      ({ payload: claims } = await jwtVerify<SupabaseClaims>(accessToken, this.jwks, {
        issuer: this.issuer,
        audience: 'authenticated',
        algorithms: ['ES256', 'RS256'],
      }));
    } catch (e) {
      const expired = e instanceof joseErrors.JWTExpired;
      throw new AppError(
        expired ? ErrorCode.TOKEN_EXPIRED : ErrorCode.UNAUTHENTICATED,
        expired ? 'Session expired' : 'Invalid authentication token',
        HttpStatus.UNAUTHORIZED,
      );
    }
    // Anonymous or service tokens are not user sessions.
    if (!claims.sub || claims.role !== 'authenticated') {
      throw new AppError(ErrorCode.UNAUTHENTICATED, 'Invalid authentication token', HttpStatus.UNAUTHORIZED);
    }
    const meta = claims.user_metadata ?? {};
    return {
      uid: claims.sub,
      email: claims.email?.toLowerCase() || null,
      name: str(meta.full_name) ?? str(meta.name) ?? null,
      provider: claims.app_metadata?.provider ?? null,
      metadata: { fullName: str(meta.full_name), phone: str(meta.phone) },
    };
  }

  async account(accessToken: string): Promise<AuthAccount> {
    const res = await fetch(`${this.issuer}/user`, {
      headers: { apikey: this.config.env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8_000),
    }).catch(() => null);
    if (!res) throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'Sign-in service unavailable, try again', HttpStatus.SERVICE_UNAVAILABLE);
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      throw new AppError(ErrorCode.UNAUTHENTICATED, 'Session is no longer valid', HttpStatus.UNAUTHORIZED);
    }
    if (!res.ok) throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'Sign-in service unavailable, try again', HttpStatus.SERVICE_UNAVAILABLE);
    const user = (await res.json()) as { email?: string; email_confirmed_at?: string | null };
    return { email: user.email?.toLowerCase() ?? null, emailVerified: Boolean(user.email_confirmed_at) };
  }
}
