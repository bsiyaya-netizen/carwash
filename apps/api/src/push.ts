import { query } from './db.js';

interface PushMessage { title: string; body: string; data?: Record<string, unknown> }

/** Sends via Expo's push service. Users without a registered device token are skipped. */
export async function pushToUsers(userIds: string[], msg: PushMessage): Promise<number> {
  if (!userIds.length) return 0;
  const rows = await query<{ push_token: string }>(
    'SELECT push_token FROM users WHERE id = ANY($1::uuid[]) AND push_token IS NOT NULL',
    [userIds],
  );
  const messages = rows.map((r) => ({ to: r.push_token, sound: 'default', ...msg }));
  // Expo accepts up to 100 messages per request.
  for (let i = 0; i < messages.length; i += 100) {
    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages.slice(i, i + 100)),
      });
    } catch (err) {
      console.warn('[push] send failed', err);
    }
  }
  return messages.length;
}
