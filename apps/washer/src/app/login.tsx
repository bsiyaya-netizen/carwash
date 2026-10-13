import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, colors, Input, Muted, styles } from '../lib/ui';

export default function Login() {
  const { signIn } = useAuth();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const requestCode = async () => {
    setBusy(true);
    try {
      const res = await api('/auth/request-code', { body: { phone: phone.replace(/\s/g, '') } });
      setIsNew(res.isNewUser);
      if (res.devCode) setCode(res.devCode); // dev only: API returns the code until SMS is wired up
      setStep('code');
    } catch (e: any) {
      Alert.alert('Could not send code', e.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    try {
      const res = await api('/auth/verify', {
        body: {
          phone: phone.replace(/\s/g, ''), code, role: 'washer',
          ...(isNew ? { name, email: email || undefined } : {}),
        },
      });
      if (res.user.role !== 'washer') throw new Error('This number belongs to a customer or admin account. Use the Sparkle Wash app instead.');
      await signIn(res.token, res.user);
    } catch (e: any) {
      Alert.alert('Sign in failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.screen, { justifyContent: 'center', padding: 24 }]}>
      <Text style={{ fontSize: 32, fontWeight: '800', color: colors.primary }}>Sparkle Wash Pro</Text>
      <Muted>Accept jobs, wash cars, get paid.</Muted>
      <View style={{ height: 32 }} />
      {step === 'phone' ? (
        <>
          <Input label="Phone number" placeholder="+27 82 123 4567" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
          <Button title="Send code" onPress={requestCode} loading={busy} disabled={phone.length < 8} />
        </>
      ) : (
        <>
          <Input label="6-digit code" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} />
          {isNew && (
            <>
              <Input label="Your name" value={name} onChangeText={setName} />
              <Input label="Email (optional)" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
            </>
          )}
          <Button title={isNew ? 'Create account' : 'Sign in'} onPress={verify} loading={busy} disabled={code.length !== 6 || (isNew && !name)} />
          <Button title="Use a different number" variant="secondary" onPress={() => setStep('phone')} />
        </>
      )}
    </KeyboardAvoidingView>
  );
}
