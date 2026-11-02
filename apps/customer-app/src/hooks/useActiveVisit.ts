import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@servebell/api-client';
import { api, useSession } from '@servebell/mobile-core';

/** The table session survives app restarts: it lives on the server, not in the app. */
export function useActiveVisit() {
  const signedIn = useSession((s) => s.status === 'signedIn');
  return useQuery({ queryKey: queryKeys.activeVisit, queryFn: async () => (await api.visits.active()).visit, enabled: signedIn, staleTime: 60_000 });
}
