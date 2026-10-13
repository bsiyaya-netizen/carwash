import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Share, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money } from '../lib/format';
import { useClientConfig, usePaymentSheet } from '../lib/payments';
import type { Membership, Plan } from '../lib/types';
import { Button, Card, colors, H, Input, Muted, styles } from '../lib/ui';

export default function Account() {
  const { user, refresh, signOut } = useAuth();
  const router = useRouter();
  const { pointValueCents } = useClientConfig();
  const pay = usePaymentSheet();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [profile, setProfile] = useState({ name: user?.name ?? '', email: user?.email ?? '', phone: user?.phone ?? '' });
  const [busy, setBusy] = useState(false);

  const loadMembership = useCallback(() => api<Membership | null>('/memberships/me').then(setMembership), []);
  useEffect(() => {
    loadMembership();
    api<Plan[]>('/plans').then(setPlans);
  }, [loadMembership]);

  const join = async (plan: Plan) => {
    setBusy(true);
    try {
      const res = await api('/memberships', { body: { planId: plan.id } });
      if (await pay(res.payment, plan.name)) {
        Alert.alert('Welcome to ' + plan.name, 'Your covered washes are free from your next booking.');
        setTimeout(loadMembership, res.payment ? 2000 : 0);
      }
    } catch (e: any) {
      Alert.alert('Could not start membership', e.message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () =>
    Alert.alert('Cancel membership?', 'You keep your remaining washes until the end of this period.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel membership', style: 'destructive', onPress: () => api('/memberships/cancel', { method: 'POST' }).then(loadMembership) },
    ]);

  const save = async () => {
    setBusy(true);
    try {
      await api('/auth/me', { method: 'PATCH', body: { name: profile.name, email: profile.email || null, phone: profile.phone.replace(/\s/g, '') || null } });
      await refresh();
      Alert.alert('Saved');
    } catch (e: any) {
      Alert.alert('Could not save', e.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = () =>
    Alert.alert('Delete your account?', 'This removes your personal details and cancels any membership. It cannot be undone.', [
      { text: 'Keep my account', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await api('/auth/me', { method: 'DELETE' });
            await signOut();
          } catch (e: any) {
            Alert.alert('Could not delete account', e.message);
          }
        },
      },
    ]);

  if (!user) return null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Muted>Loyalty points</Muted>
        <Text style={{ fontSize: 30, fontWeight: '800', color: colors.primary }}>{user.loyalty_points}</Text>
        <Muted>Worth {money(user.loyalty_points * pointValueCents)} off. Use them when you book.</Muted>
        <View style={{ height: 10 }} />
        <Muted>Referral code: {user.referral_code}. You and each friend get 100 points.</Muted>
        <Button title="Invite a friend" variant="secondary"
          onPress={() => Share.share({ message: `Get your car washed at your door with Sparkle Wash. Sign up with my code ${user.referral_code} for 100 bonus points.` })} />
      </Card>

      <H>Membership</H>
      {membership ? (
        <Card>
          <Text style={{ fontWeight: '700', fontSize: 16 }}>{membership.plan_name}</Text>
          <Muted>{membership.remaining} of {membership.washes_per_period} washes left this period</Muted>
          <Muted>{membership.cancel_at_period_end ? 'Ends' : 'Renews'} {new Date(membership.current_period_end).toLocaleDateString()}</Muted>
          {!membership.cancel_at_period_end && <Button title="Cancel membership" variant="secondary" onPress={cancel} />}
        </Card>
      ) : (
        plans.map((p) => (
          <Card key={p.id}>
            <View style={styles.row}>
              <Text style={{ fontWeight: '700', fontSize: 16 }}>{p.name}</Text>
              <Text style={{ fontWeight: '700' }}>{money(p.price_cents)}/mo</Text>
            </View>
            <Muted>{p.description}</Muted>
            <Button title={`Join ${p.name}`} onPress={() => join(p)} loading={busy} />
          </Card>
        ))
      )}

      <H>Profile</H>
      <Input label="Name" value={profile.name} onChangeText={(t) => setProfile({ ...profile, name: t })} />
      <Input label="Email" keyboardType="email-address" autoCapitalize="none" value={profile.email} onChangeText={(t) => setProfile({ ...profile, email: t })} />
      <Input label="Phone" keyboardType="phone-pad" value={profile.phone} onChangeText={(t) => setProfile({ ...profile, phone: t })} placeholder="+27…" />
      <Button title="Save profile" onPress={save} loading={busy} disabled={!profile.name} />

      <View style={{ height: 24 }} />
      <Button title="My vehicles" variant="secondary" onPress={() => router.push('/vehicles')} />
      <Button title="Delete account" variant="danger" onPress={deleteAccount} />
    </ScrollView>
  );
}
