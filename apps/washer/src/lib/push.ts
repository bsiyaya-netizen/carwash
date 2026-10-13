import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Registers this device for push and saves the token on the user's profile. Best effort. */
export async function registerForPush() {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api('/auth/me', { method: 'PATCH', body: { pushToken: data } });
  } catch (err) {
    console.warn('Push registration skipped:', err);
  }
}
