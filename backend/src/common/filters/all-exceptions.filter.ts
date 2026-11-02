import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ErrorCode, type ApiErrorBody } from '@servebell/shared';
import { Prisma } from '../../generated/prisma/client.js';

const STATUS_CODES: Partial<Record<number, ErrorCode>> = {
  400: ErrorCode.VALIDATION_FAILED,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  429: ErrorCode.RATE_LIMITED,
};

/** Converts every thrown value into ApiErrorBody. Never leaks stack traces to clients. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') throw exception;
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();
    const body = this.toBody(exception);
    body.requestId = typeof req.id === 'string' ? req.id : undefined;
    if (body.statusCode >= 500) {
      this.logger.error({ err: exception, path: req.url }, 'Unhandled error');
      // Opt-in raw output for debugging test runs where the app logger is silent.
      if (process.env['DEBUG_ERRORS']) console.error(exception);
    }
    res.status(body.statusCode).json(body);
  }

  private toBody(e: unknown): ApiErrorBody {
    if (e instanceof ThrottlerException) {
      return { statusCode: 429, code: ErrorCode.RATE_LIMITED, message: 'Too many requests, please slow down' };
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const r = e.getResponse() as string | { code?: string; message?: string | string[]; details?: ApiErrorBody['details'] };
      const message = typeof r === 'string' ? r : Array.isArray(r.message) ? r.message.join(', ') : (r.message ?? e.message);
      const code = (typeof r === 'object' && r.code) || STATUS_CODES[status] || ErrorCode.INTERNAL;
      return { statusCode: status, code, message, details: typeof r === 'object' ? r.details : undefined };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return { statusCode: 409, code: ErrorCode.CONFLICT, message: 'A record with these details already exists' };
      if (e.code === 'P2025') return { statusCode: 404, code: ErrorCode.NOT_FOUND, message: 'Resource not found' };
    }
    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, code: ErrorCode.INTERNAL, message: 'Something went wrong' };
  }
}
