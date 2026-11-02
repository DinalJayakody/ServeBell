import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import type { FilePurpose } from '@servebell/shared';

const MAX_EDGE: Record<FilePurpose, number> = {
  RESTAURANT_IMAGE: 1600, AVATAR: 512, MENU_ITEM: 1000, TABLE_IMAGE: 1400, UTENSIL: 512, FLOOR_REFERENCE: 2000,
};

/** Normalises any accepted upload to an EXIF-stripped, size-capped WebP. */
export async function processImage(input: Buffer, purpose: FilePurpose) {
  const edge = MAX_EDGE[purpose];
  const pipeline = sharp(input, { failOn: 'error' }).rotate().resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 });
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, key: `${purpose.toLowerCase().replace('_', '-')}-${randomUUID()}.webp`, mimeType: 'image/webp' };
}
