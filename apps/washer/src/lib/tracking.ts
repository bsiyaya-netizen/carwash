import * as Location from 'expo-location';
import { useEffect } from 'react';
import { getSocket } from './socket';

/**
 * Streams the washer's GPS position to the API while `active` is true.
 * The API relays it to the customer of the job in progress.
 * Foreground only for the MVP; background tracking needs expo-task-manager + a dev build.
 */
export function useLocationStreaming(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let sub: Location.LocationSubscription | undefined;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 10_000, distanceInterval: 25 },
        (pos) => getSocket().emit('washer:location', { lat: pos.coords.latitude, lng: pos.coords.longitude }),
      );
      if (cancelled) sub.remove();
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [active]);
}
