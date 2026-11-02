import { describe, expect, it } from 'vitest';
import { hasPermission, Permission } from './permissions.js';
import { canTransition, SERVICE_TRANSITIONS } from './service-lifecycle.js';
import { rotatedBounds, saveLayoutSchema } from './floor-plan.js';
import { signUpFormSchema } from './schemas/auth.js';

describe('permissions', () => {
  it('denies owner-only capabilities to waiters', () => {
    expect(hasPermission('WAITER', Permission.EMPLOYEES_MANAGE)).toBe(false);
    expect(hasPermission('WAITER', Permission.MESSAGES_AUDIT)).toBe(false);
    expect(hasPermission('WAITER', Permission.SERVICES_HANDLE)).toBe(true);
  });
  it('reserves ownership transfer for owners', () => {
    expect(hasPermission('ADMIN', Permission.OWNERSHIP_TRANSFER)).toBe(false);
    expect(hasPermission('OWNER', Permission.OWNERSHIP_TRANSFER)).toBe(true);
  });
  it('denies everything without a role', () => {
    expect(hasPermission(null, Permission.RESTAURANT_READ)).toBe(false);
  });
});

describe('service lifecycle', () => {
  it('never reopens a terminal request', () => {
    expect(canTransition(SERVICE_TRANSITIONS, 'COMPLETED', 'PENDING')).toBe(false);
    expect(canTransition(SERVICE_TRANSITIONS, 'CANCELLED', 'ACCEPTED')).toBe(false);
  });
  it('allows the happy path', () => {
    expect(canTransition(SERVICE_TRANSITIONS, 'PENDING', 'ACCEPTED')).toBe(true);
    expect(canTransition(SERVICE_TRANSITIONS, 'ACCEPTED', 'IN_PROGRESS')).toBe(true);
    expect(canTransition(SERVICE_TRANSITIONS, 'IN_PROGRESS', 'COMPLETED')).toBe(true);
  });
});

describe('floor plan geometry', () => {
  it('computes rotated bounds', () => {
    const b = rotatedBounds({ x: 0, y: 0, width: 200, depth: 100, rotation: 90 });
    expect(b.maxX - b.minX).toBeCloseTo(100);
    expect(b.maxY - b.minY).toBeCloseTo(200);
  });
  it('rejects tables with zero capacity', () => {
    const r = saveLayoutSchema.safeParse({
      expectedVersion: 0, name: 'Main', widthCm: 1000, depthCm: 800, objects: [],
      tables: [{ label: 'T1', shape: 'ROUND', capacity: 0, x: 1, y: 1, width: 90, depth: 90 }],
    });
    expect(r.success).toBe(false);
  });
});

describe('auth schemas', () => {
  it('normalises email and enforces password strength', () => {
    const ok = signUpFormSchema.parse({ fullName: 'Sarah', email: ' Sarah@Example.COM ', password: 'secret123', confirmPassword: 'secret123' });
    expect(ok.email).toBe('sarah@example.com');
    expect(signUpFormSchema.safeParse({ fullName: 'Sarah', email: 'a@b.co', password: 'password', confirmPassword: 'password' }).success).toBe(false);
    expect(signUpFormSchema.safeParse({ fullName: 'Sarah', email: 'a@b.co', password: 'secret123', confirmPassword: 'secret124' }).success).toBe(false);
  });
});

import { extractQrToken } from './schemas/service.js';
describe('QR token extraction', () => {
  it('accepts raw tokens and every URL form', () => {
    const t = '61LLwNs6D55QDVDTPZU-MA';
    expect(extractQrToken(t)).toBe(t);
    expect(extractQrToken(`https://servebell.app/t/${t}`)).toBe(t);
    expect(extractQrToken(`servebell://t/${t}`)).toBe(t);
    expect(extractQrToken(`exp://192.168.1.5:8081/--/t/${t}?x=1`)).toBe(t);
    expect(extractQrToken('https://evil.example/not-a-table')).toBeNull();
    expect(extractQrToken('short')).toBeNull();
  });
});
