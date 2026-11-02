import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, queryKeys } from '@servebell/api-client';
import type { ServiceTypeView } from '@servebell/shared';
import { api, newId } from '@servebell/mobile-core';

/** One tap = one request (idempotent). Opens the "Request Sent!" screen. */
export function useRequestService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { service: ServiceTypeView; note?: string }) => api.services.create({ serviceTypeId: v.service.id, quantity: 1, note: v.note, idempotencyKey: newId() }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: queryKeys.services });
      if (r.duplicate) router.push({ pathname: '/request/[id]', params: { id: r.id } });
      else router.push({ pathname: '/request/sent', params: { id: r.id } });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'VISIT_REQUIRED') void qc.invalidateQueries({ queryKey: queryKeys.activeVisit });
      Alert.alert('Couldn’t send request', e.message);
    },
  });
}
