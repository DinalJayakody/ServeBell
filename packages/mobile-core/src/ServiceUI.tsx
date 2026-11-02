import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, SendHorizontal } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { queryKeys } from '@servebell/api-client';
import type { ServiceMessageView, ServiceRequestView, ServiceStatus } from '@servebell/shared';
import { Badge, Text, useTheme, type Tone } from '@servebell/design-system';
import { api, useSession } from './session';
import { newId } from './time';

export const STATUS_LABEL: Record<ServiceStatus, string> = {
  PENDING: 'Waiting', ACCEPTED: 'Accepted', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
};
const STATUS_TONE: Record<ServiceStatus, Tone> = {
  PENDING: 'warning', ACCEPTED: 'primary', IN_PROGRESS: 'primary', COMPLETED: 'success', CANCELLED: 'neutral',
};

export function ServiceStatusBadge({ status, overdue }: { status: ServiceStatus; overdue?: boolean }) {
  if (overdue && status === 'PENDING') return <Badge label="Overdue" tone="danger" dot />;
  return <Badge label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} dot />;
}

const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null);

/** Requested → Accepted → In progress → Completed, with server timestamps. */
export function ServiceTimeline({ request }: { request: ServiceRequestView }) {
  const t = useTheme();
  const steps = request.status === 'CANCELLED'
    ? [{ label: 'Requested', at: request.createdAt }, { label: 'Cancelled', at: request.cancelledAt }]
    : [
        { label: 'Requested', at: request.createdAt },
        { label: request.acceptedBy ? `Accepted by ${request.acceptedBy.fullName.split(' ')[0]}` : 'Accepted', at: request.acceptedAt },
        { label: 'In progress', at: request.startedAt ?? (request.completedAt ? request.acceptedAt : null) },
        { label: 'Completed', at: request.completedAt },
      ];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      {steps.map((s, i) => {
        const done = Boolean(s.at);
        const nextDone = Boolean(steps[i + 1]?.at);
        return (
          <View key={s.label} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
              <View style={{ flex: 1, height: 2, backgroundColor: i === 0 ? 'transparent' : done ? t.colors.primary : t.colors.borderStrong }} />
              <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? t.colors.primary : t.colors.surface, borderWidth: done ? 0 : 2, borderColor: t.colors.borderStrong }}>
                {done ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
              </View>
              <View style={{ flex: 1, height: 2, backgroundColor: i === steps.length - 1 ? 'transparent' : nextDone ? t.colors.primary : t.colors.borderStrong }} />
            </View>
            <Text variant="micro" color={done ? 'text' : 'textMuted'} align="center" style={{ marginTop: 6 }} numberOfLines={2}>{s.label}</Text>
            {s.at ? <Text variant="micro" color="textMuted">{time(s.at)}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

/** Live conversation for one request. Optimistic send with idempotent client ids. */
export function ServiceChat({ requestId, canSend, header }: { requestId: string; canSend: boolean; header?: React.ReactElement }) {
  const t = useTheme();
  const qc = useQueryClient();
  const me = useSession((s) => s.user?.id);
  const [text, setText] = useState('');
  const list = useRef<FlatList<ServiceMessageView>>(null);
  const messages = useQuery({ queryKey: queryKeys.serviceMessages(requestId), queryFn: () => api.services.messages(requestId) });

  useEffect(() => {
    void api.services.markRead(requestId).catch(() => undefined);
  }, [requestId, messages.data?.length]);

  const send = useMutation({
    mutationFn: (m: { body: string; clientMessageId: string }) => api.services.sendMessage(requestId, m),
    onMutate: (m) => {
      const optimistic: ServiceMessageView = { id: `local-${m.clientMessageId}`, requestId, senderRole: 'CUSTOMER', senderUserId: me ?? null, senderName: null, body: m.body, clientMessageId: m.clientMessageId, createdAt: new Date().toISOString() };
      qc.setQueryData<ServiceMessageView[]>(queryKeys.serviceMessages(requestId), (prev) => [...(prev ?? []), optimistic]);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.serviceMessages(requestId) }),
  });

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    send.mutate({ body, clientMessageId: newId() });
  };

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={list}
        data={messages.data ?? []}
        keyExtractor={(m) => m.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 20, gap: 8, flexGrow: 1 }}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item: m }) => {
          if (m.senderRole === 'SYSTEM') {
            return <Text variant="caption" color="textMuted" align="center" style={{ marginVertical: 4 }}>{m.body}</Text>;
          }
          const mine = m.senderUserId === me;
          return (
            <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', gap: 2 }}>
              {!mine && m.senderName ? <Text variant="micro" color="textMuted">{m.senderName}</Text> : null}
              {mine ? (
                <LinearGradient colors={t.colors.primaryGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderBottomRightRadius: 6 }}>
                  <Text variant="callout" style={{ color: t.colors.textOnPrimary }}>{m.body}</Text>
                </LinearGradient>
              ) : (
                <View style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderBottomLeftRadius: 6, backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border }}>
                  <Text variant="callout">{m.body}</Text>
                </View>
              )}
              <Text variant="micro" color="textMuted" align={mine ? 'right' : 'left'}>{m.id.startsWith('local-') ? 'Sending…' : time(m.createdAt)}</Text>
            </View>
          );
        }}
      />
      {canSend ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: t.colors.border, backgroundColor: t.colors.tabBar }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Write a message…"
            placeholderTextColor={t.colors.textMuted}
            onSubmitEditing={submit}
            returnKeyType="send"
            maxLength={1000}
            accessibilityLabel="Message"
            style={[t.typography.body, { flex: 1, height: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: t.colors.surfaceMuted, color: t.colors.text }]}
          />
          <Pressable onPress={submit} accessibilityLabel="Send" disabled={!text.trim()} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: text.trim() ? t.colors.primary : t.colors.surfacePressed, ...(text.trim() ? t.shadows.glow : {}) }}>
            <SendHorizontal size={20} color="#fff" />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
