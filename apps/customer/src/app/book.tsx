import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import MapView, { Marker, type LatLng } from 'react-native-maps';
import { api } from '../lib/api';
import { money, when } from '../lib/format';
import type { Package, Vehicle } from '../lib/types';
import { Button, Card, Chip, colors, H, Input, Muted, styles } from '../lib/ui';

interface Quote { subtotalCents: number; discountCents: number; totalCents: number; durationMin: number }

const DEFAULT_PIN = { latitude: -26.2041, longitude: 28.0473 }; // Johannesburg, until we have the user's location

export default function Book() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [slots, setSlots] = useState<string[]>([]);

  const [vehicleId, setVehicleId] = useState<string>();
  const [packageId, setPackageId] = useState<string>();
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [slot, setSlot] = useState<string>();
  const [recurrence, setRecurrence] = useState<'none' | 'weekly' | 'monthly'>('none');
  const [pin, setPin] = useState<LatLng>(DEFAULT_PIN);
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [promo, setPromo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash'>('card');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Vehicle[]>('/vehicles').then((v) => { setVehicles(v); setVehicleId(v[0]?.id); });
    api<Package[]>('/packages').then(setPackages);
    api<string[]>('/slots').then(setSlots);
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({});
      movePin({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    })();
  }, []);

  const movePin = async (p: LatLng) => {
    setPin(p);
    try {
      const [place] = await Location.reverseGeocodeAsync(p);
      if (place) setAddress([place.streetNumber, place.street, place.district ?? place.city].filter(Boolean).join(' '));
    } catch { /* address stays editable */ }
  };

  useEffect(() => {
    if (!packageId) return setQuote(null);
    api<Quote>('/bookings/quote', { body: { packageId, addonIds, promoCode: promo || null } })
      .then((q) => { setQuote(q); setQuoteError(''); })
      .catch((e) => { setQuoteError(e.message); setQuote(null); });
  }, [packageId, addonIds, promo]);

  const confirm = async () => {
    setBusy(true);
    try {
      const res = await api('/bookings', {
        body: {
          vehicleId, packageId, addonIds, scheduledAt: slot, recurrence, lat: pin.latitude, lng: pin.longitude,
          address, notes, promoCode: promo || null, paymentMethod,
        },
      });
      // With live Stripe keys, res.clientSecret is confirmed here with @stripe/stripe-react-native's PaymentSheet.
      router.replace(`/booking/${res.booking.id}`);
    } catch (e: any) {
      Alert.alert('Booking failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  const mains = packages.filter((p) => !p.is_addon);
  const addons = packages.filter((p) => p.is_addon);
  const toggleAddon = (id: string) => setAddonIds((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  if (vehicles.length === 0) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Muted>Add a vehicle before booking.</Muted>
        <Button title="Add vehicle" onPress={() => router.push('/vehicles')} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <H>Vehicle</H>
      <View style={styles.wrap}>
        {vehicles.map((v) => (
          <Chip key={v.id} label={`${v.make} ${v.model} · ${v.plate}`} selected={vehicleId === v.id} onPress={() => setVehicleId(v.id)} />
        ))}
      </View>

      <H>Package</H>
      {mains.map((p) => (
        <Card key={p.id} style={packageId === p.id ? { borderColor: colors.primary, borderWidth: 2 } : undefined}>
          <Text onPress={() => setPackageId(p.id)}>
            <Text style={{ fontWeight: '700', fontSize: 16 }}>{p.name}  </Text>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>{money(p.price_cents)}</Text>
            {'\n'}
            <Text style={{ color: colors.muted }}>{p.description} · ~{p.duration_min} min</Text>
          </Text>
        </Card>
      ))}

      <H>Add-ons</H>
      <View style={styles.wrap}>
        {addons.map((a) => (
          <Chip key={a.id} label={`${a.name} +${money(a.price_cents)}`} selected={addonIds.includes(a.id)} onPress={() => toggleAddon(a.id)} />
        ))}
      </View>

      <H>When</H>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {slots.map((s) => <Chip key={s} label={when(s)} selected={slot === s} onPress={() => setSlot(s)} />)}
      </ScrollView>
      <View style={[styles.wrap, { marginTop: 8 }]}>
        {(['none', 'weekly', 'monthly'] as const).map((r) => (
          <Chip key={r} label={r === 'none' ? 'One-off' : `Repeat ${r}`} selected={recurrence === r} onPress={() => setRecurrence(r)} />
        ))}
      </View>

      <H>Where is the car?</H>
      <Muted>Drag the pin or tap the map to the exact spot.</Muted>
      <MapView
        style={{ height: 220, borderRadius: 12, marginVertical: 8 }}
        region={{ ...pin, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
        onPress={(e) => movePin(e.nativeEvent.coordinate)}
      >
        <Marker coordinate={pin} draggable onDragEnd={(e) => movePin(e.nativeEvent.coordinate)} />
      </MapView>
      <Input label="Address / landmark" value={address} onChangeText={setAddress} />
      <Input label="Notes for the washer (optional)" placeholder="e.g. Basement parking, bay 12" value={notes} onChangeText={setNotes} />

      <H>Payment</H>
      <View style={styles.wrap}>
        <Chip label="Card / Apple Pay / Google Pay" selected={paymentMethod === 'card'} onPress={() => setPaymentMethod('card')} />
        <Chip label="Cash" selected={paymentMethod === 'cash'} onPress={() => setPaymentMethod('cash')} />
      </View>
      <Input label="Promo code" autoCapitalize="characters" placeholder="WELCOME20" value={promo} onChangeText={setPromo} />
      {quoteError ? <Text style={{ color: colors.danger, marginBottom: 8 }}>{quoteError}</Text> : null}

      {quote && (
        <Card>
          <View style={styles.row}><Muted>Subtotal</Muted><Text>{money(quote.subtotalCents)}</Text></View>
          {quote.discountCents > 0 && (
            <View style={styles.row}><Muted>Discount</Muted><Text style={{ color: colors.success }}>-{money(quote.discountCents)}</Text></View>
          )}
          <View style={[styles.row, { marginTop: 6 }]}>
            <Text style={{ fontWeight: '700', fontSize: 16 }}>Total</Text>
            <Text style={{ fontWeight: '700', fontSize: 16 }}>{money(quote.totalCents)}</Text>
          </View>
          <Muted>About {quote.durationMin} minutes. Card is only charged when the wash is done.</Muted>
        </Card>
      )}
      <Button title="Confirm booking" onPress={confirm} loading={busy} disabled={!vehicleId || !packageId || !slot || !quote} />
    </ScrollView>
  );
}
