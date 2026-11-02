import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Clock } from 'lucide-react-native';
import { ApiError, queryKeys } from '@servebell/api-client';
import type { ServiceRequestView } from '@servebell/shared';
import { Button, IconBadge, Pulse, ServiceIcon, Text, useTheme } from '@servebell/design-system';
import { api, formatDuration, ServiceStatusBadge, showLocalAlert } from '@servebell/mobile-core';

/** One request in the queue. Primary actions are reachable with one thumb tap. */
export const RequestCard = memo(function RequestCard({ r, restaurantId, now, mine }: { r: ServiceRequestView; restaurantId: string; now: number; mine: boolean }) {
  const t = useTheme();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.services });
  const onError = (e: Error) => {
    void refresh();
    void showLocalAlert(e instanceof ApiError && e.code === 'ALREADY_ACCEPTED' ? 'Already taken' : 'Action failed', e.message);
  };
  const act = useMutation({
    mutationFn: (action: 'accept' | 'wait' | 'start' | 'complete') => api.staffServices[action](restaurantId, r.id),
    onSuccess: () => void refresh(),
    onError,
  });
  const overdue = r.escalationLevel > 0 && r.status === 'PENDING';
  const waited = now - new Date(r.createdAt).getTime();
  const busy = (a: string) => act.isPending && act.variables === a;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/request/[id]', params: { id: r.id } })}
      style={({ pressed }) => [
        { borderRadius: t.radii.lg, padding: 14, gap: 12, borderWidth: 1, backgroundColor: pressed ? t.colors.surfacePressed : t.colors.surface, borderColor: overdue ? t.colors.danger : t.colors.border },
        overdue && { backgroundColor: t.colors.dangerSoft },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconBadge size={46} tone={overdue ? 'danger' : 'primary'}>
          <ServiceIcon icon={r.serviceType.icon} kind={r.serviceType.kind} size={22} color={overdue ? t.colors.danger : t.colors.primary} />
        </IconBadge>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title3" numberOfLines={1}>Table {r.table.label}</Text>
          <Text variant="callout" color="textSecondary" numberOfLines={1}>{r.serviceType.name}{r.quantity > 1 ? ` × ${r.quantity}` : ''} · {r.customer.fullName.split(' ')[0]}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <ServiceStatusBadge status={r.status} overdue={overdue} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {overdue ? <View style={{ alignItems: 'center', justifyContent: 'center' }}><Pulse color={t.colors.danger} size={14} /><AlertTriangle size={12} color={t.colors.danger} /></View> : <Clock size={12} color={t.colors.textMuted} />}
            <Text variant="micro" color={overdue ? 'danger' : 'textMuted'}>{formatDuration(r.completedAt ? new Date(r.completedAt).getTime() - new Date(r.createdAt).getTime() : waited)}</Text>
          </View>
        </View>
      </View>
      {r.note ? <Text variant="callout" numberOfLines={2}>“{r.note}”</Text> : null}
      {r.acceptedBy && !mine && r.status !== 'PENDING' ? <Text variant="caption" color="textSecondary">Handled by {r.acceptedBy.fullName}</Text> : null}

      {r.status === 'PENDING' ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {!r.dismissedByMe ? <Button title="Wait" variant="outline" size="md" style={{ flex: 1 }} disabled={act.isPending} loading={busy('wait')} onPress={() => act.mutate('wait')} /> : null}
          <Button title="Accept" size="md" style={{ flex: 2 }} disabled={act.isPending} loading={busy('accept')} onPress={() => act.mutate('accept')} />
        </View>
      ) : mine && r.status === 'ACCEPTED' ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Start" variant="secondary" size="md" style={{ flex: 1 }} disabled={act.isPending} loading={busy('start')} onPress={() => act.mutate('start')} />
          <Button title="Complete" size="md" style={{ flex: 1 }} disabled={act.isPending} loading={busy('complete')} onPress={() => act.mutate('complete')} />
        </View>
      ) : mine && r.status === 'IN_PROGRESS' ? (
        <Button title="Complete" size="md" disabled={act.isPending} loading={busy('complete')} onPress={() => act.mutate('complete')} />
      ) : null}
    </Pressable>
  );
});
