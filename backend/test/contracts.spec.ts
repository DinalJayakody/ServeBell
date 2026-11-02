import * as Shared from '@servebell/shared';
import * as Db from '../src/generated/prisma/enums.js';

/** Shared enums must match the database enums exactly, or clients and API drift. */
describe('Shared contract parity', () => {
  const pairs = [
    'PlatformRole', 'RestaurantRole', 'MemberStatus', 'RestaurantStatus', 'OnboardingStatus', 'ClientApp', 'ServiceKind',
    'ServiceStatus', 'ServiceEventType', 'MessageSenderRole', 'OrderStatus', 'ReservationStatus', 'VisitStatus', 'QrStatus',
    'FloorPlanStatus', 'TableShape', 'FloorObjectKind', 'MenuKind', 'FilePurpose', 'PushDeliveryStatus', 'DevicePlatform',
  ] as const;

  it.each(pairs)('%s matches Prisma', (name) => {
    const shared = Object.values((Shared as unknown as Record<string, object>)[name]!).sort();
    const db = Object.values((Db as unknown as Record<string, object>)[name]!).sort();
    expect(shared).toEqual(db);
  });
});
