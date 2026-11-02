import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { ErrorCode } from '@servebell/shared';
import { AppConfig } from '../config/config.module.js';
import { AppError } from '../common/errors.js';

export interface FirebaseIdentity {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  signInProvider: string | null;
}

/** Abstract so tests can provide a deterministic verifier without network access. */
export abstract class IdTokenVerifier {
  abstract verify(idToken: string): Promise<FirebaseIdentity>;
}

@Injectable()
export class FirebaseIdTokenVerifier extends IdTokenVerifier {
  private readonly logger = new Logger(FirebaseIdTokenVerifier.name);
  private readonly auth: Auth;
  private readonly checkRevoked: boolean;

  constructor(config: AppConfig) {
    super();
    const { FIREBASE_PROJECT_ID, FIREBASE_SERVICE_ACCOUNT_BASE64, FIREBASE_AUTH_EMULATOR_HOST } = config.env;
    if (FIREBASE_AUTH_EMULATOR_HOST) process.env['FIREBASE_AUTH_EMULATOR_HOST'] = FIREBASE_AUTH_EMULATOR_HOST;
    const serviceAccount = FIREBASE_SERVICE_ACCOUNT_BASE64
      ? JSON.parse(Buffer.from(FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'))
      : null;
    const app: App =
      getApps()[0] ??
      initializeApp(serviceAccount ? { credential: cert(serviceAccount), projectId: FIREBASE_PROJECT_ID } : { projectId: FIREBASE_PROJECT_ID });
    this.auth = getAuth(app);
    // Revocation checks call the Admin API, which needs a credential.
    this.checkRevoked = Boolean(serviceAccount);
    if (!serviceAccount) this.logger.warn('No Firebase service account configured: revoked-token checks are disabled');
  }

  async verify(idToken: string): Promise<FirebaseIdentity> {
    try {
      const t = await this.auth.verifyIdToken(idToken, this.checkRevoked);
      return {
        uid: t.uid,
        email: t.email?.toLowerCase() ?? null,
        emailVerified: t.email_verified === true,
        name: typeof t['name'] === 'string' ? t['name'] : null,
        signInProvider: t.firebase?.sign_in_provider ?? null,
      };
    } catch (e) {
      const code = (e as { code?: string }).code;
      const expired = code === 'auth/id-token-expired';
      throw new AppError(
        expired ? ErrorCode.TOKEN_EXPIRED : ErrorCode.UNAUTHENTICATED,
        expired ? 'Session expired' : 'Invalid authentication token',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }
}
