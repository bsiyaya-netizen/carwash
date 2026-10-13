import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { api } from '../../lib/api';
import { money, STATUS_LABEL, STATUS_STEPS, when } from '../../lib/format';
import { getSocket } from '../../lib/socket';
import type { Booking } from '../../lib/types';
import { Button, Card, Chip, colors, H, Input, Muted, styles } from '../../lib/ui';

export default function BookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [b, setB] = useState<Booking | null>(null);
  const [washerPos, setWasherPos] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    api<Booking>(`/bookings/${id}`).then((bk) => {
      setB(bk);
      if (bk.washer?.lat != null && bk.washer.lng != null) setWasherPos({ latitude: bk.washer.lat, longitude: bk.washer.lng });
    });
    const socket = getSocket();
    const watch = () => socket.emit('booking:watch', id);
    watch();
    socket.on('connect', watch);
    // Status updates arrive on our user room (OTP stripped), so keep the OTP we already have.
    const onUpdate = (u: Booking) => u.id === id && setB((prev) => ({ ...u, handover_otp: prev?.handover_otp ?? u.handover_otp }));
    const onLocation = (p: { bookingId: string; lat: number; lng: number }) =>
      p.bookingId === id && setWasherPos({ latitude: p.lat, longitude: p.lng });
    socket.on('booking:updated', onUpdate);
    socket.on('washer:location', onLocation);
    return () => {
      socket.off('connect', watch);
      socket.off('booking:updated', onUpdate);
      socket.off('washer:location', onLocation);
    };
  }, [id]);

  if (!b) return <View style={styles.screen} />;

  const stepIndex = STATUS_STEPS.indexOf(b.status);
  const pin = { latitude: b.lat, longitude: b.lng };
  const showOtp = ['accepted', 'en_route', 'arrived'].includes(b.status);

  const cancel = () =>
    Alert.alert('Cancel this booking?', undefined, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel booking', style: 'destructive', onPress: () => api(`/bookings/${id}/cancel`, { method: 'POST' }).then(setB) },
    ]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: b.status === 'cancelled' ? colors.danger : colors.text }}>
        {STATUS_LABEL[b.status]}
      </Text>
      <Muted>{b.package.name} · {when(b.scheduled_at)}</Muted>

      {b.status !== 'cancelled' && (
        <View style={{ flexDirection: 'row', marginVertical: 14 }}>
          {STATUS_STEPS.map((s, i) => (
            <View key={s} style={{ flex: 1, height: 6, marginRight: 4, borderRadius: 3, backgroundColor: i <= stepIndex ? colors.primary : colors.border }} />
          ))}
        </View>
      )}

      {showOtp && b.handover_otp && (
        <Card style={{ alignItems: 'center', borderColor: colors.primary }}>
          <Muted>Handover code. Give this to your washer when they arrive.</Muted>
          <Text style={{ fontSize: 40, fontWeight: '800', letterSpacing: 12, color: colors.primary, marginTop: 6 }}>{b.handover_otp}</Text>
        </Card>
      )}

      <MapView style={{ height: 240, borderRadius: 12, marginBottom: 12 }} initialRegion={{ ...pin, latitudeDelta: 0.03, longitudeDelta: 0.03 }}>
        <Marker coordinate={pin} title="Your car" />
        {washerPos && <Marker coordinate={washerPos} title={b.washer?.name ?? 'Washer'} pinColor={colors.primary} />}
      </MapView>

      {b.washer && (
        <Card>
          <View style={styles.row}>
            <View>
              <Text style={{ fontWeight: '600', fontSize: 16 }}>{b.washer.name}</Text>
              <Muted>{b.washer.rating ? `★ ${b.washer.rating}` : 'New washer'}</Muted>
            </View>
            <Button title="Call" variant="secondary" onPress={() => Linking.openURL(`tel:${b.washer!.phone}`)} />
          </View>
        </Card>
      )}

      <Card>
        <Muted>{b.vehicle.color} {b.vehicle.make} {b.vehicle.model} · {b.vehicle.plate}</Muted>
        <Muted>{b.address}</Muted>
        {b.addons.length > 0 && <Muted>Add-ons: {b.addons.map((a) => a.name).join(', ')}</Muted>}
        <View style={[styles.row, { marginTop: 8 }]}>
          <Text style={{ fontWeight: '600' }}>Total ({b.payment_method})</Text>
          <Text style={{ fontWeight: '600' }}>{money(b.total_cents)}</Text>
        </View>
        {b.tip_cents > 0 && <Muted>Tip: {money(b.tip_cents)}</Muted>}
      </Card>

      {['pending', 'accepted'].includes(b.status) && <Button title="Cancel booking" variant="danger" onPress={cancel} />}
      {b.status === 'completed' && <AfterWash b={b} onChange={setB} />}
    </ScrollView>
  );
}

function AfterWash({ b, onChange }: { b: Booking; onChange: (b: Booking) => void }) {
  const [rating, setRating] = useState(b.review?.rating ?? 0);
  const [comment, setComment] = useState(b.review?.comment ?? '');
  const [saved, setSaved] = useState(!!b.review);

  const submit = async () => {
    await api(`/bookings/${b.id}/review`, { body: { rating, comment } });
    setSaved(true);
  };
  const tip = async (cents: number) => {
    const res = await api(`/bookings/${b.id}/tip`, { body: { amountCents: cents } });
    onChange(res.booking);
    Alert.alert('Thank you!', `Your ${money(cents)} tip goes straight to ${b.washer?.name ?? 'your washer'}.`);
  };

  return (
    <>
      <H>Rate your wash</H>
      <View style={{ flexDirection: 'row', marginBottom: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Text key={n} onPress={() => { setRating(n); setSaved(false); }} style={{ fontSize: 34, color: n <= rating ? '#F59E0B' : colors.border, marginRight: 6 }}>★</Text>
        ))}
      </View>
      <Input placeholder="Tell us how it went (optional)" value={comment} onChangeText={(t) => { setComment(t); setSaved(false); }} multiline />
      <Button title={saved ? 'Review saved' : 'Submit review'} onPress={submit} disabled={!rating || saved} />
      <H>Add a tip</H>
      <View style={styles.wrap}>
        {[2000, 5000, 10000].map((c) => <Chip key={c} label={money(c)} selected={false} onPress={() => tip(c)} />)}
      </View>
    </>
  );
}
