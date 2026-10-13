import 'dotenv/config';

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/carwash',
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret',
  currency: process.env.CURRENCY ?? 'zar',
  washerShare: Number(process.env.WASHER_SHARE ?? 0.75),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || undefined,
  devReturnLoginCode: (process.env.DEV_RETURN_LOGIN_CODE ?? 'true') === 'true',
};
