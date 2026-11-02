import type { ServiceRequestDetail, ServiceRequestView, StaffRef } from '@servebell/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { fileUrl } from '../common/files.js';

const staffSelect = { select: { id: true, employeeCode: true, user: { select: { fullName: true, avatar: { select: { storageKey: true } } } } } } as const;

export const serviceInclude = {
  restaurant: { select: { id: true, name: true } },
  table: { select: { id: true, label: true } },
  serviceType: { select: { id: true, kind: true, name: true, icon: true, isPrimary: true } },
  customer: { select: { id: true, fullName: true } },
  acceptedBy: staffSelect,
  completedBy: staffSelect,
} satisfies Prisma.ServiceRequestInclude;

export type ServiceRow = Prisma.ServiceRequestGetPayload<{ include: typeof serviceInclude }>;

type StaffRow = NonNullable<ServiceRow['acceptedBy']>;
const staffRef = (m: StaffRow | null): StaffRef | null =>
  m ? { memberId: m.id, employeeCode: m.employeeCode, fullName: m.user.fullName, avatarUrl: m.user.avatar ? fileUrl(m.user.avatar.storageKey) : null } : null;

const iso = (d: Date | null) => d?.toISOString() ?? null;

export function toServiceView(r: ServiceRow, extra: { dismissedByMe?: boolean } = {}): ServiceRequestView {
  return {
    id: r.id,
    number: r.number,
    status: r.status,
    restaurant: r.restaurant,
    table: r.table,
    serviceType: r.serviceType,
    quantity: r.quantity,
    note: r.note,
    customer: r.customer,
    acceptedBy: staffRef(r.acceptedBy),
    completedBy: staffRef(r.completedBy),
    createdAt: r.createdAt.toISOString(),
    acceptedAt: iso(r.acceptedAt),
    startedAt: iso(r.startedAt),
    completedAt: iso(r.completedAt),
    cancelledAt: iso(r.cancelledAt),
    cancelReason: r.cancelReason,
    escalationLevel: r.escalationLevel,
    lastEscalatedAt: iso(r.lastEscalatedAt),
    ...extra,
  };
}

export function toServiceDetail(r: ServiceRow & { events: { id: string; type: ServiceRequestDetail['events'][number]['type']; createdAt: Date; actor: { fullName: string } | null }[] }, extra: { dismissedByMe?: boolean } = {}): ServiceRequestDetail {
  return {
    ...toServiceView(r, extra),
    events: r.events.map((e) => ({ id: e.id, type: e.type, createdAt: e.createdAt.toISOString(), actorName: e.actor?.fullName ?? null })),
  };
}
