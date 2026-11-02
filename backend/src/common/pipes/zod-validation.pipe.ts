import { HttpStatus, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ErrorCode } from '@servebell/shared';
import { AppError } from '../errors.js';

/** Validates a body/query/param with a shared Zod schema: `@Body(new ZodPipe(loginSchema))`. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new AppError(
      ErrorCode.VALIDATION_FAILED,
      'Some fields are invalid',
      HttpStatus.BAD_REQUEST,
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
}
