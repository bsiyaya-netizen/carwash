import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '../lib/auth';
import { PaymentsProvider } from '../lib/payments';
import { registerForPush } from '../lib/push';
import { colors } from '../lib/ui';

function Gate() {
  const { user, ready } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    const onLogin = segments[0] === 'login';
    if (!user && !onLogin) router.replace('/login');
    if (user && onLogin) router.replace('/');
    if (user) registerForPush();
  }, [user, ready, segments, router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerTintColor: colors.primary, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="index" options={{ title: 'Sparkle Wash' }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="vehicles" options={{ title: 'My vehicles' }} />
      <Stack.Screen name="account" options={{ title: 'Account' }} />
      <Stack.Screen name="book" options={{ title: 'Book a wash' }} />
      <Stack.Screen name="booking/[id]" options={{ title: 'Your wash' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <PaymentsProvider>
        <StatusBar style="dark" />
        <Gate />
      </PaymentsProvider>
    </AuthProvider>
  );
}
