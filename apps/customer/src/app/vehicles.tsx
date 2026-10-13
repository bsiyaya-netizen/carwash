import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../lib/api';
import type { Vehicle } from '../lib/types';
import { Button, Card, colors, H, Input, Muted, styles } from '../lib/ui';

export default function Vehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [form, setForm] = useState({ make: '', model: '', color: '', plate: '' });
  const [busy, setBusy] = useState(false);

  const load = () => api<Vehicle[]>('/vehicles').then(setVehicles);
  useEffect(() => { load(); }, []);

  const add = async () => {
    setBusy(true);
    try {
      await api('/vehicles', { body: form });
      setForm({ make: '', model: '', color: '', plate: '' });
      await load();
    } catch (e: any) {
      Alert.alert('Could not save vehicle', e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = (v: Vehicle) =>
    Alert.alert('Remove vehicle?', `${v.make} ${v.model} (${v.plate})`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: () => api(`/vehicles/${v.id}`, { method: 'DELETE' }).then(load).catch((e) => Alert.alert('Could not remove', e.message)),
      },
    ]);

  const set = (k: keyof typeof form) => (t: string) => setForm((f) => ({ ...f, [k]: t }));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {vehicles.length === 0 && <Muted>Add your first car to start booking.</Muted>}
      {vehicles.map((v) => (
        <Card key={v.id}>
          <View style={styles.row}>
            <View>
              <Text style={{ fontWeight: '600', fontSize: 16 }}>{v.make} {v.model}</Text>
              <Muted>{v.color} · {v.plate}</Muted>
            </View>
            <Pressable onPress={() => remove(v)}><Text style={{ color: colors.danger }}>Remove</Text></Pressable>
          </View>
        </Card>
      ))}
      <H>Add a vehicle</H>
      <Input label="Make" placeholder="Toyota" value={form.make} onChangeText={set('make')} />
      <Input label="Model" placeholder="Corolla" value={form.model} onChangeText={set('model')} />
      <Input label="Colour" placeholder="White" value={form.color} onChangeText={set('color')} />
      <Input label="License plate" placeholder="CA 123-456" autoCapitalize="characters" value={form.plate} onChangeText={set('plate')} />
      <Button title="Save vehicle" onPress={add} loading={busy} disabled={Object.values(form).some((x) => !x)} />
    </ScrollView>
  );
}
