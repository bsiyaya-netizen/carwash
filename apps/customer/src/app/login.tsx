import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Chip, colors, Input, Muted, styles } from '../lib/ui';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE = {
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
};
const googleConfigured = !!(Platform.OS === 'ios' ? GOOGLE.iosClientId : Platform.OS === 'android' ? GOOGLE.androidClientId : GOOGLE.webClientId);

export default function Login() {
  const { signIn } = useAuth();
  const [channel, setChannel] = useState<'phone' | 'email'>('phone');
  const [step, setStep] = useState<'target' | 'code'>('target');
  const [target, setTarget] = useState('');
  const [code, setCode] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [name, setName] = useState('');
  const [referral, setReferral] = useState('');
  const [busy, setBusy] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => { AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {}); }, []);

  const finish = async (res: any) => {
    if (res.user.role !== 'customer') throw new Error('This account belongs to a washer or admin. Use the Sparkle Wash Pro app instead.');
    await signIn(res.token, res.user);
  };

  const run = async (fn: () => Promise<void>, title: string) => {
    setBusy(true);
    try { await fn(); } catch (e: any) { Alert.alert(title, e.message); } finally { setBusy(false); }
  };

  const clean = () => (channel === 'phone' ? target.replace(/\s/g, '') : target.trim());

  const requestCode = () => run(async () => {
    const res = await api('/auth/request-code', { body: { [channel]: clean() } });
    setIsNew(res.isNewUser);
    if (res.devCode) setCode(res.devCode); // dev only: the API returns the code until SMS/email delivery is set up
    setStep('code');
  }, 'Could not send code');

  const verify = () => run(async () => {
    await finish(await api('/auth/verify', {
      body: { [channel]: clean(), code, role: 'customer', ...(isNew ? { name, referralCode: referral || undefined } : {}) },
    }));
  }, 'Sign in failed');

  // Google: returns an ID token that the API verifies against Google's keys.
  const [request, response, promptGoogle] = Google.useIdTokenAuthRequest(GOOGLE);
  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken = response.params.id_token;
    run(async () => finish(await api('/auth/google', { body: { idToken, referralCode: referral || undefined } })), 'Google sign-in failed');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  const signInWithApple = () => run(async () => {
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      });
      // Apple only shares the name the first time, so pass it along for new accounts.
      const fullName = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ');
      await finish(await api('/auth/apple', { body: { identityToken: cred.identityToken, name: fullName || undefined, referralCode: referral || undefined } }));
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return;
      throw e;
    }
  }, 'Apple sign-in failed');

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 96 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 32, fontWeight: '800', color: colors.primary }}>Sparkle Wash</Text>
        <Muted>We come to you. Book a car wash in under a minute.</Muted>
        <View style={{ height: 32 }} />
        {step === 'target' ? (
          <>
            <View style={[styles.wrap, { marginBottom: 8 }]}>
              <Chip label="Phone" selected={channel === 'phone'} onPress={() => { setChannel('phone'); setTarget(''); }} />
              <Chip label="Email" selected={channel === 'email'} onPress={() => { setChannel('email'); setTarget(''); }} />
            </View>
            {channel === 'phone'
              ? <Input label="Phone number" placeholder="+27 82 123 4567" keyboardType="phone-pad" autoComplete="tel" value={target} onChangeText={setTarget} />
              : <Input label="Email" placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" value={target} onChangeText={setTarget} />}
            <Button title="Send code" onPress={requestCode} loading={busy} disabled={target.length < 5} />
            {(googleConfigured || appleAvailable) && <Muted>{'\n'}Or continue with</Muted>}
            {googleConfigured && <Button title="Continue with Google" variant="secondary" disabled={!request || busy} onPress={() => promptGoogle()} />}
            {appleAvailable && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={12}
                style={{ height: 50, marginVertical: 6 }}
                onPress={signInWithApple}
              />
            )}
          </>
        ) : (
          <>
            <Muted>We sent a code to {target}.</Muted>
            <View style={{ height: 8 }} />
            <Input label="6-digit code" keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} value={code} onChangeText={setCode} />
            {isNew && (
              <>
                <Input label="Your name" value={name} onChangeText={setName} autoComplete="name" />
                <Input label="Referral code (optional)" autoCapitalize="characters" value={referral} onChangeText={setReferral} />
              </>
            )}
            <Button title={isNew ? 'Create account' : 'Sign in'} onPress={verify} loading={busy} disabled={code.length !== 6 || (isNew && !name)} />
            <Button title="Back" variant="secondary" onPress={() => setStep('target')} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
