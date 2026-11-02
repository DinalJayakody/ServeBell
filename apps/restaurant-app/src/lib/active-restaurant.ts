import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { hasPermission, type MembershipSummary, type Permission } from '@servebell/shared';
import { useSession } from '@servebell/mobile-core';

const KEY = 'servebell.restaurant.active';
const NO_MEMBERSHIPS: MembershipSummary[] = [];
const useActiveId = create<{ id: string | null; set: (id: string) => void }>((set) => ({
  id: null,
  set: (id) => {
    set({ id });
    void AsyncStorage.setItem(KEY, id).catch(() => undefined);
  },
}));
void AsyncStorage.getItem(KEY).then((id) => id && useActiveId.setState({ id })).catch(() => undefined);

/** The restaurant the staff member is currently working in (remembered across launches). */
export function useActiveMembership(): { membership: MembershipSummary | null; memberships: MembershipSummary[]; select: (id: string) => void; can: (p: Permission) => boolean } {
  // Select a stable reference: a selector returning a fresh `[]` would re-render forever.
  const user = useSession((s) => s.user);
  const memberships = user?.memberships ?? NO_MEMBERSHIPS;
  const { id, set } = useActiveId();
  const membership = memberships.find((m) => m.restaurantId === id) ?? memberships[0] ?? null;
  useEffect(() => {
    if (membership && membership.restaurantId !== id) set(membership.restaurantId);
  }, [membership, id, set]);
  return { membership, memberships, select: set, can: (p) => hasPermission(membership?.role, p) };
}

export const roleLabel = (role: string) => ({ OWNER: 'Owner', ADMIN: 'Administrator', WAITER: 'Customer Assistant' })[role] ?? role;
