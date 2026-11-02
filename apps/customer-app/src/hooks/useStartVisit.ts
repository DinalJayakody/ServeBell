import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@servebell/api-client';
import { api } from '@servebell/mobile-core';

/** Starts the table session on the server and lands on Home. */
export function useStartVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { qr: string; guestCount?: number }) => api.visits.start(v.qr, v.guestCount),
    onSuccess: (visit) => {
      qc.setQueryData(queryKeys.activeVisit, visit);
      void qc.invalidateQueries({ queryKey: queryKeys.services });
      router.dismissTo('/(tabs)/home');
    },
  });
}
