import 'dotenv/config';

const list = (v?: string) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/carwash',
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret',
  corsOrigins: list(process.env.CORS_ORIGINS),
  currency: process.env.CURRENCY ?? 'zar',
  washerShare: Number(process.env.WASHER_SHARE ?? 0.75),
  /** Value of one loyalty point when redeemed, in cents. */
  pointValueCents: Number(process.env.POINT_VALUE_CENTS ?? 10),

  stripeSecretKey: process.env.STRIPE_SECRET_KEY || undefined,
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || undefined,

  devReturnLoginCode: (process.env.DEV_RETURN_LOGIN_CODE ?? 'true') === 'true',
  smsProvider: (process.env.SMS_PROVIDER ?? 'console') as 'console' | 'twilio',
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? '',
  twilioFrom: process.env.TWILIO_FROM ?? '',
  emailProvider: (process.env.EMAIL_PROVIDER ?? 'console') as 'console' | 'resend',
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  emailFrom: process.env.EMAIL_FROM ?? 'Sparkle Wash <no-reply@example.com>',

  /** OAuth client IDs whose Google ID tokens we accept (web, iOS, Android). */
  googleClientIds: list(process.env.GOOGLE_CLIENT_IDS),
  /** Apple audiences: the iOS bundle ID and, for web, the Services ID. */
  appleAudiences: list(process.env.APPLE_AUDIENCES ?? 'com.example.carwash.customer'),
};
