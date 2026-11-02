import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Inbox } from 'lucide-react-native';
import type { OnboardingStatus } from '@servebell/shared';
import { queryKeys } from '@servebell/api-client';
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, SegmentedControl, Text, useTheme } from '@servebell/design-system';
import { api, session } from '@servebell/mobile-core';

/** Platform administrators verify restaurant owners here. The API re-checks the role. */
export default function Applications() {
  const t = useTheme();
  const qc = useQueryClient();
  const [status, setStatus] = useState<OnboardingStatus>('PENDING');
  const list = useQuery({ queryKey: queryKeys.ownerApplicationsReview(status), queryFn: () => api.onboarding.list(status) });
  const review = useMutation({
    mutationFn: (v: { id: string; decision: 'APPROVED' | 'REJECTED' }) => api.onboarding.review(v.id, { decision: v.decision }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['onboarding'] });
      await session.refreshUser().catch(() => undefined);
    },
  });

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 52 }}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back"><ArrowLeft size={22} color={t.colors.text} /></Pressable>
        <Text variant="title2">Owner applications</Text>
      </View>
      <SegmentedControl value={status} onChange={setStatus} options={[{ value: 'PENDING', label: 'Pending' }, { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Rejected' }]} />
      {list.isPending ? <LoadingState /> : list.isError ? <ErrorState message={list.error.message} onRetry={() => void list.refetch()} /> : (
        <FlatList
          data={list.data}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ gap: 12, paddingVertical: 16, flexGrow: 1 }}
          ListEmptyComponent={<EmptyState icon={<Inbox size={28} color={t.colors.primary} />} title="Nothing here" message="No applications with this status." />}
          renderItem={({ item: a }) => (
            <Card style={{ gap: 6 }}>
              <Text variant="title3">{a.restaurantName}</Text>
              <Text variant="caption" color="textSecondary">{a.addressLine}, {a.city} · {a.phone}</Text>
              {a.businessRegistrationNo ? <Text variant="caption" color="textSecondary">BR: {a.businessRegistrationNo}</Text> : null}
              {a.applicant ? <Text variant="caption" color="textMuted">{a.applicant.fullName} · {a.applicant.email}</Text> : null}
              {a.status === 'PENDING' ? (
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                  <Button title="Reject" variant="outline" size="md" style={{ flex: 1 }} disabled={review.isPending} onPress={() => review.mutate({ id: a.id, decision: 'REJECTED' })} />
                  <Button title="Approve" size="md" style={{ flex: 1 }} loading={review.isPending && review.variables?.id === a.id} onPress={() => review.mutate({ id: a.id, decision: 'APPROVED' })} />
                </View>
              ) : null}
            </Card>
          )}
        />
      )}
    </Screen>
  );
}
