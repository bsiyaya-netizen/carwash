import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, ScrollView, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { api } from '../../lib/api';
import { money, STATUS_LABEL, when } from '../../lib/format';
import { getSocket } from '../../lib/socket';
import { useLocationStreaming } from '../../lib/tracking';
import type { Booking } from '../../lib/types';
import { Button, Card, colors, H, Input, Muted, styles } from '../../lib/ui';

export default function Job() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [b, setB] = useState<Booking | null>(null);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<Booking>(`/bookings/${id}`).then(setB), [id]);

  useEffect(() => {
    load();
    const socket = getSocket();
    socket.emit('booking:watch', id);
    // Picks up a customer cancellation while we are on the way.
    const onUpdate = (u: Booking) => u.id === id && setB(u);
    socket.on('booking:updated', onUpdate);
    return () => { socket.off('booking:updated', onUpdate); };
  }, [id, load]);

  useLocationStreaming(!!b && ['accepted', 'en_route', 'arrived'].includes(b.status));

  if (!b) return <View style={styles.screen} />;

  const act = async (fn: () => Promise<Booking>) => {
    setBusy(true);
    try {
      setB(await fn());
    } catch (e: any) {
      Alert.alert('Something went wrong', e.message);
    } finally {
      setBusy(false);
    }
  };
  const setStatus = (status: string) => act(() => api(`/washer/jobs/${id}/status`, { body: { status } }));

  const navigate = () => {
    const dest = `${b.lat},${b.lng}`;
    const url = Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${dest}&dirflg=d`
      : `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
    Linking.openURL(url);
  };

  const pin = { latitude: b.lat, longitude: b.lng };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: b.status === 'cancelled' ? colors.danger : colors.text }}>
        {STATUS_LABEL[b.status]}
      </Text>
      <Muted>{b.package.name}{b.addons.length ? ` + ${b.addons.map((a) => a.name).join(', ')}` : ''}</Muted>

      <MapView style={{ height: 220, borderRadius: 12, marginVertical: 12 }} initialRegion={{ ...pin, latitudeDelta: 0.02, longitudeDelta: 0.02 }} showsUserLocation>
        <Marker coordinate={pin} title={b.vehicle.plate} />
      </MapView>

      <Card>
        <Text style={{ fontWeight: '600', fontSize: 16 }}>{b.customer.name}</Text>
        <Muted>{b.vehicle.color} {b.vehicle.make} {b.vehicle.model} · {b.vehicle.plate}</Muted>
        <Muted>{b.address}</Muted>
        <Muted>{when(b.scheduled_at)}</Muted>
        <View style={[styles.row, { marginTop: 8 }]}>
          <Text style={{ fontWeight: '600' }}>{b.payment_method === 'cash' ? 'Collect cash' : 'Paid by card'}</Text>
          <Text style={{ fontWeight: '600' }}>{money(b.total_cents)}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Button title="Navigate" variant="secondary" onPress={navigate} style={{ flex: 1 }} />
          <Button title="Call" variant="secondary" onPress={() => Linking.openURL(`tel:${b.customer.phone}`)} style={{ flex: 1 }} />
        </View>
      </Card>

      {b.status === 'accepted' && <Button title="Start driving" onPress={() => setStatus('en_route')} loading={busy} />}
      {b.status === 'en_route' && <Button title="I've arrived" onPress={() => setStatus('arrived')} loading={busy} />}
      {b.status === 'arrived' && (
        <>
          <H>Vehicle handover</H>
          <Muted>Ask the customer for the 4-digit code shown in their app.</Muted>
          <Input keyboardType="number-pad" maxLength={4} value={otp} onChangeText={setOtp} placeholder="0000"
            style={{ fontSize: 28, letterSpacing: 10, textAlign: 'center', marginTop: 8 }} />
          <Button title="Verify and start wash" disabled={otp.length !== 4} loading={busy}
            onPress={() => act(() => api(`/washer/jobs/${id}/start`, { body: { otp } }))} />
        </>
      )}
      {b.status === 'in_progress' && <Button title="Mark wash complete" onPress={() => setStatus('completed')} loading={busy} />}
      {b.status === 'completed' && b.payment_method === 'cash' && b.payment_status !== 'paid' && (
        <Button title={`Cash collected (${money(b.total_cents)})`} loading={busy}
          onPress={() => act(() => api(`/washer/jobs/${id}/cash-collected`, { method: 'POST' }))} />
      )}
      {['completed', 'cancelled'].includes(b.status) && <Button title="Back to jobs" variant="secondary" onPress={() => router.replace('/')} />}
    </ScrollView>
  );
}
