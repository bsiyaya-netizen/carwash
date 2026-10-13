import { config } from './config.js';

/** Sends a text message. "console" just logs it, for local development. */
export async function sendSms(to: string, body: string) {
  if (config.smsProvider === 'console') {
    console.log(`[sms] to ${to}: ${body}`);
    return;
  }
  const params = new URLSearchParams({ To: to, Body: body });
  params.set(config.twilioFrom.startsWith('MG') ? 'MessagingServiceSid' : 'From', config.twilioFrom);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
  if (!res.ok) throw new Error(`Twilio error ${res.status}: ${await res.text()}`);
}

export async function sendEmail(to: string, subject: string, text: string) {
  if (config.emailProvider === 'console') {
    console.log(`[email] to ${to}: ${subject} / ${text}`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.emailFrom, to, subject, text }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}
