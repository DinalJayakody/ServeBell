import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, type OnGatewayConnection, type OnGatewayInit, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { hasPermission, Permission, RealtimeCommand, rooms } from '@servebell/shared';
import { IdTokenVerifier } from '../auth/token-verifier.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { RealtimeService } from './realtime.service.js';

interface SocketData {
  userId: string;
}

const idPayload = z.object({ id: z.uuid() });
type Ack = { ok: true } | { ok: false; error: string };

/**
 * Authenticated with the Supabase access token in the handshake (`auth: { token }`).
 * Every room join is authorised against the database.
 */
@WebSocketGateway({ pingInterval: 25_000, pingTimeout: 20_000 })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly verifier: IdTokenVerifier,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: Server) {
    this.realtime.attach(server);
    server.use((socket, next) => {
      const token = (socket.handshake.auth as { token?: unknown })?.token;
      if (typeof token !== 'string') return next(new Error('UNAUTHENTICATED'));
      this.verifier
        .verify(token)
        .then((identity) => this.prisma.user.findUnique({ where: { authUserId: identity.uid }, select: { id: true, deletedAt: true } }))
        .then((user) => {
          if (!user || user.deletedAt) return next(new Error('UNAUTHENTICATED'));
          (socket.data as SocketData).userId = user.id;
          next();
        })
        .catch(() => next(new Error('UNAUTHENTICATED')));
    });
  }

  handleConnection(socket: Socket) {
    const { userId } = socket.data as SocketData;
    if (userId) void socket.join(rooms.user(userId));
  }

  @SubscribeMessage(RealtimeCommand.JOIN_RESTAURANT)
  async joinRestaurant(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<Ack> {
    const parsed = idPayload.safeParse(body);
    if (!parsed.success) return { ok: false, error: 'INVALID' };
    const { userId } = socket.data as SocketData;
    const member = await this.prisma.restaurantMember.findUnique({
      where: { restaurantId_userId: { restaurantId: parsed.data.id, userId } },
      select: { status: true, role: true },
    });
    if (!member || member.status !== 'ACTIVE' || !hasPermission(member.role, Permission.SERVICES_HANDLE)) return { ok: false, error: 'FORBIDDEN' };
    await socket.join(rooms.restaurantStaff(parsed.data.id));
    return { ok: true };
  }

  @SubscribeMessage(RealtimeCommand.JOIN_SERVICE)
  async joinService(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<Ack> {
    const parsed = idPayload.safeParse(body);
    if (!parsed.success) return { ok: false, error: 'INVALID' };
    const { userId } = socket.data as SocketData;
    const req = await this.prisma.serviceRequest.findUnique({ where: { id: parsed.data.id }, select: { customerId: true, restaurantId: true } });
    if (!req) return { ok: false, error: 'NOT_FOUND' };
    let allowed = req.customerId === userId;
    if (!allowed) {
      const member = await this.prisma.restaurantMember.findUnique({
        where: { restaurantId_userId: { restaurantId: req.restaurantId, userId } },
        select: { status: true, role: true },
      });
      allowed = member?.status === 'ACTIVE' && hasPermission(member.role, Permission.MESSAGES_PARTICIPATE);
    }
    if (!allowed) return { ok: false, error: 'FORBIDDEN' };
    await socket.join(rooms.service(parsed.data.id));
    return { ok: true };
  }

  @SubscribeMessage(RealtimeCommand.LEAVE_SERVICE)
  async leaveService(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<Ack> {
    const parsed = idPayload.safeParse(body);
    if (parsed.success) await socket.leave(rooms.service(parsed.data.id));
    return { ok: true };
  }
}
