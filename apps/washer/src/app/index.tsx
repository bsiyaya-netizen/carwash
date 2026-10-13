import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, STATUS_LABEL, when } from '../lib/format';
import { getSocket } from '../lib/socket';
import { useLocationStreaming } from '../lib/tracking';
import type { Booking } from '../lib/types';
import { Button, Card, colors, H, Muted, styles } from '../lib/ui';

const ACTIVE = ['accepted', 'en_route', 'arrived', 'in_progress'];

export default function Jobs() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [online, setOnline] = useState(false);
  const [available, setAvailable] = useState<Booking[]>([]);
  const [mine, setMine] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, m, me] = await Promise.all([api<Booking[]>('/washer/jobs/available'), api<Booking[]>('/washer/jobs'), api('/auth/me')]);
      setAvailable(a);
      setMine(m);
      setOnline(me.is_online);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Live queue: new jobs appear, taken jobs disappear.
  useEffect(() => {
    const socket = getSocket();
    const onNew = (b: Booking) => setAvailable((list) => (list.some((x) => x.id === b.id) ? list : [b, ...list]));
    const onTaken = ({ bookingId }: { bookingId: string }) => setAvailable((list) => list.filter((x) => x.id !== bookingId));
    socket.on('job:new', onNew);
    socket.on('job:taken', onTaken);
    return () => { socket.off('job:new', onNew); socket.off('job:taken', onTaken); };
  }, []);

  const current = mine.find((b) => ACTIVE.includes(b.status));
  useLocationStreaming(online || !!current);

  const toggleOnline = async (v: boolean) => {
    setOnline(v);
    await api('/washer/online', { body: { online: v } });
  };

  const accept = async (b: Booking) => {
    try {
      await api(`/washer/jobs/${b.id}/accept`, { method: 'POST' });
      router.push(`/job/${b.id}`);
    } catch (e: any) {
      Alert.alert('Could not accept', e.message);
      load();
    }
  };

  const decline = async (b: Booking) => {
    await api(`/washer/jobs/${b.id}/decline`, { method: 'POST' });
    setAvailable((list) => list.filter((x) => x.id !== b.id));
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Card>
        <View style={styles.row}>
          <View>
            <Text style={{ fontSize: 18, fontWeight: '700' }}>{user?.name}</Text>
            <Muted>{online ? 'Online. You will get new job alerts.' : 'Offline'}</Muted>
          </View>
          <Switch value={online} onValueChange={toggleOnline} trackColor={{ true: colors.success }} />
        </View>
      </Card>

      {current && (
        <>
          <H>Current job</H>
          <Pressable onPress={() => router.push(`/job/${current.id}`)}>
            <Card style={{ borderColor: colors.primary, borderWidth: 2 }}>
              <Text style={{ fontWeight: '700', fontSize: 16 }}>{current.package.name}</Text>
              <Muted>{current.address} · {when(current.scheduled_at)}</Muted>
              <Text style={{ color: colors.primary, fontWeight: '600', marginTop: 6 }}>{STATUS_LABEL[current.status]} ›</Text>
            </Card>
          </Pressable>
        </>
      )}

      <H>New requests ({available.length})</H>
      {available.length === 0 && <Muted>No open jobs right now. Pull to refresh.</Muted>}
      {available.map((b) => (
        <Card key={b.id}>
          <View style={styles.row}>
            <Text style={{ fontWeight: '700', fontSize: 16 }}>{b.package.name}</Text>
            <Text style={{ fontWeight: '700', color: colors.success }}>{money(b.total_cents)}</Text>
          </View>
          {b.addons.length > 0 && <Muted>+ {b.addons.map((a) => a.name).join(', ')}</Muted>}
          <Muted>{when(b.scheduled_at)} · ~{b.package.duration_min} min</Muted>
          <Muted>{b.vehicle.color} {b.vehicle.make} {b.vehicle.model}</Muted>
          <Muted>
            {b.hub ? `Hub: ${b.hub.name}` : b.address || `${b.lat.toFixed(4)}, ${b.lng.toFixed(4)}`}
            {b.distance_km != null ? ` · ${b.distance_km} km away` : ''} · {b.payment_method === 'cash' ? 'collect cash' : 'prepaid'}
          </Muted>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Button title="Decline" variant="secondary" onPress={() => decline(b)} style={{ flex: 1 }} />
            <Button title="Accept" onPress={() => accept(b)} disabled={!!current} style={{ flex: 1 }} />
          </View>
        </Card>
      ))}

      <View style={{ height: 16 }} />
      <Button title="Earnings & history" variant="secondary" onPress={() => router.push('/earnings')} />
      <Button title="Sign out" variant="secondary" onPress={signOut} />
      <Button title="Delete account" variant="danger" onPress={() =>
        Alert.alert('Delete your account?', 'Your personal details are removed. This cannot be undone.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => api('/auth/me', { method: 'DELETE' }).then(signOut).catch((e) => Alert.alert('Could not delete', e.message)) },
        ])} />
    </ScrollView>
  );
}
