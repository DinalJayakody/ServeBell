import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@servebell/shared';

/** Domain error carrying a stable machine-readable code for clients. */
export class AppError extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    readonly details?: { path: string; message: string }[],
  ) {
    super({ code, message, details }, status);
  }
}

export const Errors = {
  emailNotVerified: () => new AppError(ErrorCode.EMAIL_NOT_VERIFIED, 'Verify your email address first — check your inbox for the link.', HttpStatus.FORBIDDEN),
  notFound: (what = 'Resource') => new AppError(ErrorCode.NOT_FOUND, `${what} not found`, HttpStatus.NOT_FOUND),
  forbidden: (msg = 'You do not have access to this resource') => new AppError(ErrorCode.FORBIDDEN, msg, HttpStatus.FORBIDDEN),
  unauthenticated: (msg = 'Authentication required') => new AppError(ErrorCode.UNAUTHENTICATED, msg, HttpStatus.UNAUTHORIZED),
  conflict: (msg: string, code: ErrorCode = ErrorCode.CONFLICT) => new AppError(code, msg, HttpStatus.CONFLICT),
  badRequest: (msg: string, code: ErrorCode = ErrorCode.VALIDATION_FAILED) => new AppError(code, msg, HttpStatus.BAD_REQUEST),
};

/**
 * True when a database error (from any Prisma/driver-adapter layer) is the given
 * constraint or SQLSTATE. The pg adapter nests details in `cause`, so walk the chain.
 */
export function isDbConstraint(e: unknown, ...needles: string[]): boolean {
  const seen = new Set<unknown>();
  let cur: unknown = e;
  while (cur && typeof cur === 'object' && !seen.has(cur)) {
    seen.add(cur);
    const o = cur as { message?: unknown; code?: unknown; meta?: unknown; originalCode?: unknown; constraint?: unknown; cause?: unknown };
    const text = [o.message, o.code, o.originalCode, o.constraint, JSON.stringify(o.meta ?? null)].map(String).join(' ');
    if (needles.some((n) => text.includes(n))) return true;
    cur = o.cause;
  }
  return false;
}
