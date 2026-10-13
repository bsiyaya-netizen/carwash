import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from './config.js';
import { HttpError } from './errors.js';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const appleKeys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export interface SocialProfile { sub: string; email?: string; emailVerified: boolean; name?: string }

export async function verifyGoogle(idToken: string): Promise<SocialProfile> {
  if (!config.googleClientIds.length) throw new HttpError(501, 'Google sign-in is not configured');
  try {
    const { payload } = await jwtVerify(idToken, googleKeys, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: config.googleClientIds,
    });
    return {
      sub: String(payload.sub),
      email: payload.email as string | undefined,
      emailVerified: payload.email_verified === true,
      name: payload.name as string | undefined,
    };
  } catch {
    throw new HttpError(401, 'Google sign-in could not be verified');
  }
}

export async function verifyApple(identityToken: string): Promise<SocialProfile> {
  try {
    const { payload } = await jwtVerify(identityToken, appleKeys, {
      issuer: 'https://appleid.apple.com',
      audience: config.appleAudiences,
    });
    return {
      sub: String(payload.sub),
      email: payload.email as string | undefined,
      emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    };
  } catch {
    throw new HttpError(401, 'Apple sign-in could not be verified');
  }
}
