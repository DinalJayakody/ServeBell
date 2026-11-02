import { Body, Controller, Get, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import { FilePurpose } from '@servebell/shared';
import { UploadsService, MAX_UPLOAD_BYTES } from './uploads.service.js';
import { ZodPipe } from '../common/pipes/zod-validation.pipe.js';
import { CurrentUser } from '../common/decorators/auth.decorators.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Errors } from '../common/errors.js';
import type { AuthUser } from '../common/request-context.js';

/** The subset of a multer file the service needs. */
interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

const uploadBody = z.object({
  purpose: z.enum(Object.values(FilePurpose) as [FilePurpose, ...FilePurpose[]]),
  restaurantId: z.uuid().optional(),
});

@ApiTags('uploads')
@Controller({ path: 'uploads', version: '1' })
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  @ApiOperation({ summary: 'Upload an image (resized to WebP). AVATAR: any user; others: restaurant managers' })
  upload(@CurrentUser() user: AuthUser, @UploadedFile() file: UploadedImage | undefined, @Body(new ZodPipe(uploadBody)) body: z.infer<typeof uploadBody>) {
    if (!file) throw Errors.badRequest('Attach an image in the "file" field');
    return this.uploads.upload(user.id, file, body.purpose, body.restaurantId);
  }

  /** Development/local storage only. With R2, files are served from R2_PUBLIC_BASE_URL. */
  @Public()
  @SkipThrottle()
  @Get('files/:key')
  @ApiOperation({ summary: 'Serve a locally stored image (public)' })
  async file(@Param('key') key: string, @Res() res: Response) {
    if (!this.uploads.storage.read) throw Errors.notFound('File');
    const data = await this.uploads.storage.read(key).catch(() => null);
    if (!data) throw Errors.notFound('File');
    res.setHeader('Content-Type', key.endsWith('.webp') ? 'image/webp' : key.endsWith('.png') ? 'image/png' : 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(data);
  }
}
