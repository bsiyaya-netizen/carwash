import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Share, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money, STATUS_LABEL, when } from '../lib/format';
import type { Booking } from '../lib/types';
import { Button, Card, colors, H, Muted, styles } from '../lib/ui';

export default function Home() {
  const { user, signOut, refresh } = useAuth();
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b] = await Promise.all([api<Booking[]>('/bookings'), refresh()]);
      setBookings(b);
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const upcoming = bookings.filter((b) => !['completed', 'cancelled'].includes(b.status));
  const past = bookings.filter((b) => ['completed', 'cancelled'].includes(b.status));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>Hi {user?.name?.split(' ')[0]} 👋</Text>
      <Button title="Book a wash" onPress={() => router.push('/book')} style={{ marginTop: 16 }} />

      <Card style={{ marginTop: 12 }}>
        <View style={styles.row}>
          <View>
            <Muted>Loyalty points</Muted>
            <Text style={{ fontSize: 28, fontWeight: '800', color: colors.primary }}>{user?.loyalty_points ?? 0}</Text>
          </View>
          <Pressable onPress={() => Share.share({ message: `Get your car washed at your door with Sparkle Wash. Use my code ${user?.referral_code} for bonus points!` })}>
            <Muted>Refer a friend</Muted>
            <Text style={{ fontSize: 18, fontWeight: '700' }}>{user?.referral_code} ↗</Text>
          </Pressable>
        </View>
      </Card>

      <H>Upcoming</H>
      {upcoming.length === 0 && <Muted>No upcoming washes.</Muted>}
      {upcoming.map((b) => <BookingRow key={b.id} b={b} onPress={() => router.push(`/booking/${b.id}`)} />)}

      {past.length > 0 && <H>History</H>}
      {past.map((b) => <BookingRow key={b.id} b={b} onPress={() => router.push(`/booking/${b.id}`)} />)}

      <View style={{ height: 24 }} />
      <Button title="My vehicles" variant="secondary" onPress={() => router.push('/vehicles')} />
      <Button title="Sign out" variant="secondary" onPress={signOut} />
    </ScrollView>
  );
}

function BookingRow({ b, onPress }: { b: Booking; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <Card>
        <View style={styles.row}>
          <Text style={{ fontWeight: '600', fontSize: 16 }}>{b.package.name}</Text>
          <Text style={{ fontWeight: '600' }}>{money(b.total_cents)}</Text>
        </View>
        <Muted>{when(b.scheduled_at)} · {b.vehicle.make} {b.vehicle.model}</Muted>
        <Text style={{ marginTop: 6, color: b.status === 'cancelled' ? colors.danger : colors.primary, fontWeight: '600' }}>
          {STATUS_LABEL[b.status]}{b.recurrence !== 'none' ? ` · repeats ${b.recurrence}` : ''}
        </Text>
      </Card>
    </Pressable>
  );
}
