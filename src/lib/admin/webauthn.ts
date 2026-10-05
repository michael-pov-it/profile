import { createHash } from 'node:crypto';
import {
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { Account, Passkey } from './account';
import type { AdminConfig } from './config';

// Discoverable credentials with user verification (fingerprint, face or PIN) are required, so
// signing in needs no username and a stolen security key alone is not enough.
export function registrationOptions(config: AdminConfig, account: Account) {
  return generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userName: account.username,
    // A stable, non-identifying handle: the same account always gets the same one.
    userID: createHash('sha256').update(`admin:${account.username}`).digest(),
    attestationType: 'none',
    excludeCredentials: account.passkeys.map((p) => ({ id: p.id, transports: p.transports })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  });
}

export async function verifyRegistration(
  config: AdminConfig,
  response: RegistrationResponseJSON,
  challenge: string,
  name: string,
): Promise<Passkey | null> {
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpID,
    requireUserVerification: true,
  });
  if (!result.verified) return null;
  const { credential } = result.registrationInfo;
  return {
    id: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports,
    name,
    createdAt: new Date().toISOString(),
  };
}

export function authenticationOptions(config: AdminConfig) {
  return generateAuthenticationOptions({ rpID: config.rpID, userVerification: 'required' });
}

export async function verifyAuthentication(
  config: AdminConfig,
  account: Account,
  response: AuthenticationResponseJSON,
  challenge: string,
): Promise<{ passkey: Passkey; counter: number } | null> {
  const passkey = account.passkeys.find((p) => p.id === response.id);
  if (!passkey) return null;
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: config.origin,
    expectedRPID: config.rpID,
    requireUserVerification: true,
    credential: {
      id: passkey.id,
      publicKey: Buffer.from(passkey.publicKey, 'base64url'),
      counter: passkey.counter,
      transports: passkey.transports as never,
    },
  });
  return result.verified ? { passkey, counter: result.authenticationInfo.newCounter } : null;
}
