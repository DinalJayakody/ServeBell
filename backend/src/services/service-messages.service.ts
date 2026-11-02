import { Injectable } from '@nestjs/common';
import { hasPermission, OPEN_SERVICE_STATUSES, Permission, RealtimeEvent, type MessageSenderRole, type SendMessageInput, type ServiceMessageView } from '@servebell/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Errors } from '../common/errors.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

interface Access {
  role: MessageSenderRole;
  request: { id: string; restaurantId: string; customerId: string; status: string; acceptedById: string | null; table: { label: string } };
}

/**
 * Conversation attached to a service request. Customer and the assigned waiter
 * (or any waiter while it is still pending) participate; owners/admins can audit.
 */
@Injectable()
export class ServiceMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
  ) {}

  private async access(userId: string, requestId: string, write: boolean): Promise<Access> {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id: requestId },
      select: { id: true, restaurantId: true, customerId: true, status: true, acceptedById: true, table: { select: { label: true } } },
    });
    if (!request) throw Errors.notFound('Request');
    if (request.customerId === userId) return { role: 'CUSTOMER', request };
    const member = await this.prisma.restaurantMember.findFirst({ where: { restaurantId: request.restaurantId, userId, status: 'ACTIVE' }, select: { id: true, role: true } });
    if (!member) throw Errors.notFound('Request');
    const involved = request.acceptedById === member.id || (request.status === 'PENDING' && hasPermission(member.role, Permission.MESSAGES_PARTICIPATE));
    const auditor = hasPermission(member.role, Permission.MESSAGES_AUDIT);
    if (write ? !(involved || auditor) : !(involved || auditor || request.acceptedById === member.id)) throw Errors.forbidden('Only the assigned team member can use this conversation');
    return { role: 'STAFF', request };
  }

  async list(userId: string, requestId: string): Promise<ServiceMessageView[]> {
    await this.access(userId, requestId, false);
    const rows = await this.prisma.serviceMessage.findMany({
      where: { requestId },
      include: { sender: { select: { fullName: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return rows.map(toView);
  }

  async send(userId: string, requestId: string, input: SendMessageInput): Promise<ServiceMessageView> {
    const { role, request } = await this.access(userId, requestId, true);
    if (!(OPEN_SERVICE_STATUSES as readonly string[]).includes(request.status)) throw Errors.conflict('This request is closed.');
    const existing = await this.prisma.serviceMessage.findUnique({
      where: { senderUserId_clientMessageId: { senderUserId: userId, clientMessageId: input.clientMessageId } },
      include: { sender: { select: { fullName: true } } },
    });
    if (existing) return toView(existing);
    const row = await this.prisma.serviceMessage.create({
      data: { requestId, restaurantId: request.restaurantId, senderUserId: userId, senderRole: role, body: input.body, clientMessageId: input.clientMessageId },
      include: { sender: { select: { fullName: true } } },
    });
    const view = toView(row);
    this.realtime.toService(requestId, request.restaurantId, RealtimeEvent.SERVICE_MESSAGE_CREATED, view);
    this.realtime.toUser(request.customerId, request.restaurantId, RealtimeEvent.SERVICE_MESSAGE_CREATED, view);
    // Notify the other side.
    if (role === 'STAFF') {
      await this.notifications.notify([request.customerId], { type: 'service.message', title: 'New message from the restaurant', body: input.body.slice(0, 140), app: 'CUSTOMER', restaurantId: request.restaurantId, dedupeKey: `msg:${row.id}`, data: { serviceRequestId: requestId } });
    } else if (request.acceptedById) {
      const assignee = await this.prisma.restaurantMember.findUnique({ where: { id: request.acceptedById }, select: { userId: true } });
      if (assignee) await this.notifications.notify([assignee.userId], { type: 'service.message', title: `Table ${request.table.label} sent a message`, body: input.body.slice(0, 140), app: 'RESTAURANT', restaurantId: request.restaurantId, dedupeKey: `msg:${row.id}`, data: { serviceRequestId: requestId, restaurantId: request.restaurantId } });
    }
    return view;
  }

  async markRead(userId: string, requestId: string) {
    await this.access(userId, requestId, false);
    await this.prisma.serviceReadCursor.upsert({
      where: { requestId_userId: { requestId, userId } },
      create: { requestId, userId, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    });
  }
}

function toView(m: { id: string; requestId: string; senderRole: MessageSenderRole; senderUserId: string | null; body: string; clientMessageId: string | null; createdAt: Date; sender: { fullName: string } | null }): ServiceMessageView {
  return { id: m.id, requestId: m.requestId, senderRole: m.senderRole, senderUserId: m.senderUserId, senderName: m.sender?.fullName ?? null, body: m.body, clientMessageId: m.clientMessageId, createdAt: m.createdAt.toISOString() };
}
