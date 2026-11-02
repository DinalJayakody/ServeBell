import { Injectable } from '@nestjs/common';
import { hasPermission, Permission, type FilePurpose } from '@servebell/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Errors } from '../common/errors.js';
import { fileUrl } from '../common/files.js';
import { createStorage, type StorageDriver } from './storage.js';
import { processImage } from './image-processing.js';

export const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

@Injectable()
export class UploadsService {
  readonly storage: StorageDriver = createStorage();

  constructor(private readonly prisma: PrismaService) {}

  /** Avatars belong to the uploader; every other purpose needs catalog/menu rights in the restaurant. */
  async upload(userId: string, file: { buffer: Buffer; mimetype: string; size: number }, purpose: FilePurpose, restaurantId?: string) {
    if (!ACCEPTED_MIME.includes(file.mimetype)) throw Errors.badRequest('Upload a JPEG, PNG or WebP image');
    if (file.size > MAX_UPLOAD_BYTES) throw Errors.badRequest('Images must be 10 MB or smaller');
    if (purpose !== 'AVATAR') {
      if (!restaurantId) throw Errors.badRequest('restaurantId is required for restaurant images');
      const member = await this.prisma.restaurantMember.findFirst({ where: { restaurantId, userId, status: 'ACTIVE' }, select: { role: true } });
      const needed = purpose === 'MENU_ITEM' ? Permission.MENU_MANAGE : purpose === 'TABLE_IMAGE' || purpose === 'FLOOR_REFERENCE' ? Permission.FLOORPLAN_MANAGE : Permission.CATALOG_MANAGE;
      if (!member || !hasPermission(member.role, needed)) throw Errors.forbidden();
    }
    let img;
    try {
      img = await processImage(file.buffer, purpose);
    } catch {
      throw Errors.badRequest('This file could not be read as an image');
    }
    await this.storage.put(img.key, img.data, img.mimeType);
    const row = await this.prisma.fileObject.create({
      data: { uploaderId: userId, restaurantId: purpose === 'AVATAR' ? null : restaurantId, purpose, storageKey: img.key, mimeType: img.mimeType, sizeBytes: img.data.length, width: img.width, height: img.height, status: 'READY' },
    });
    return { id: row.id, url: fileUrl(row.storageKey), width: row.width, height: row.height };
  }
}
