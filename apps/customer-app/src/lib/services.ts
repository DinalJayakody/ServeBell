import type { ServiceKind, ServiceTypeView, VisitView } from '@servebell/shared';

export const SERVICE_SUBTITLE: Record<ServiceKind, string> = {
  WAITER: 'Call your waiter',
  WATER: 'Still or sparkling',
  UTENSIL: 'Delivered to your table',
  BILL: 'Request your bill',
  CLEANING: 'Tidy up the table',
  ASSISTANCE: 'Any other help',
  CUSTOM: 'Custom request',
};

export const findService = (services: ServiceTypeView[], kind: ServiceKind) => services.find((s) => s.kind === kind);
export const primaryService = (services: ServiceTypeView[]) => services.find((s) => s.isPrimary) ?? findService(services, 'WAITER');

export function tableLine(visit: Pick<VisitView, 'table' | 'guestCount'>) {
  return `Table ${visit.table.label}${visit.guestCount ? ` • ${visit.guestCount} Guest${visit.guestCount > 1 ? 's' : ''}` : ''}`;
}
