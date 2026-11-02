import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';

/**
 * Restricts browser origins for Socket.IO to the configured web origins.
 * Native apps send no Origin header and are authenticated by Firebase token.
 */
export class ConfiguredIoAdapter extends IoAdapter {
  constructor(app: INestApplicationContext, private readonly origins: string[]) {
    super(app);
  }

  override createIOServer(port: number, options?: Partial<ServerOptions>) {
    return super.createIOServer(port, {
      ...(options as ServerOptions),
      cors: {
        origin: (origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) => cb(null, !origin || this.origins.includes(origin)),
      },
      maxHttpBufferSize: 64 * 1024,
    });
  }
}
