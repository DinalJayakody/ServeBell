import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/** Provider-agnostic object storage. Swap drivers without touching callers. */
export interface StorageDriver {
  readonly kind: 'local' | 'r2';
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Local driver only: R2 objects are served from the public bucket domain. */
  read?(key: string): Promise<Buffer>;
}

export const LOCAL_STORAGE_DIR = resolve(import.meta.dirname, '../../storage');
const SAFE_KEY = /^[a-z0-9-]+\.(webp|jpg|png)$/;

export class LocalStorage implements StorageDriver {
  readonly kind = 'local' as const;
  constructor(private readonly dir = LOCAL_STORAGE_DIR) {}

  async put(key: string, body: Buffer) {
    if (!SAFE_KEY.test(key)) throw new Error('Invalid storage key');
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, key), body);
  }

  read(key: string) {
    if (!SAFE_KEY.test(key)) return Promise.reject(new Error('Invalid storage key'));
    return readFile(join(this.dir, key));
  }
}

export class R2Storage implements StorageDriver {
  readonly kind = 'r2' as const;
  private readonly client: S3Client;
  constructor(private readonly opts: { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string }) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${opts.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
    });
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.opts.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }));
  }
}

/** R2 when fully configured, local disk otherwise (development). */
export function createStorage(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): StorageDriver {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL } = env;
  if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET && R2_PUBLIC_BASE_URL) {
    return new R2Storage({ accountId: R2_ACCOUNT_ID, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, bucket: R2_BUCKET });
  }
  return new LocalStorage();
}
