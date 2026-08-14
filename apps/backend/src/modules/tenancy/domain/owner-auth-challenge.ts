import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { OwnerAuthCodeSchema, OwnerEmailSchema } from '@turni/contracts';

export const ownerAuthChallengeLifetimeMs = 5 * 60 * 1000;
export const maxOwnerAuthAttempts = 5;

const codeSpace = 1_000_000;

export interface StoredOwnerAuthChallenge {
  readonly id: string;
  readonly email: string;
  readonly codeHash: string;
  readonly attempts: number;
  readonly expiresAt: Date;
  readonly consumedAt?: Date;
}

export interface OwnerAuthChallengeDecisionInput {
  readonly challenge?: StoredOwnerAuthChallenge;
  readonly email: string;
  readonly code: string;
  readonly secret: string;
  readonly now: Date;
}

export type OwnerAuthChallengeDecision =
  | { readonly outcome: 'accepted'; readonly challengeId: string; readonly email: string }
  | { readonly outcome: 'denied'; readonly attempts: number };

export function normalizeOwnerEmail(email: string): string {
  return OwnerEmailSchema.parse(email);
}

export function generateOwnerAuthCode(
  random: (max: number) => number = (max) => randomInt(max)
): string {
  return String(random(codeSpace) % codeSpace).padStart(6, '0');
}

export function hashOwnerAuthCode(input: {
  readonly email: string;
  readonly code: string;
  readonly secret: string;
}): string {
  return createHmac('sha256', input.secret)
    .update(`${normalizeOwnerEmail(input.email)}:${input.code}`)
    .digest('base64url');
}

export function decideOwnerAuthChallenge(
  input: OwnerAuthChallengeDecisionInput
): OwnerAuthChallengeDecision {
  const { challenge } = input;
  if (challenge === undefined) {
    return denied(0);
  }

  const email = normalizeOwnerEmail(input.email);
  if (
    challenge.email !== email ||
    challenge.consumedAt !== undefined ||
    challenge.expiresAt <= input.now ||
    challenge.attempts >= maxOwnerAuthAttempts
  ) {
    return denied(challenge.attempts);
  }

  const parsedCode = OwnerAuthCodeSchema.safeParse(input.code);
  if (!parsedCode.success) {
    return denied(challenge.attempts);
  }

  const candidateHash = hashOwnerAuthCode({
    email,
    code: parsedCode.data,
    secret: input.secret
  });
  if (!matches(challenge.codeHash, candidateHash)) {
    return denied(challenge.attempts + 1);
  }

  return { outcome: 'accepted', challengeId: challenge.id, email };
}

function denied(attempts: number): OwnerAuthChallengeDecision {
  return { outcome: 'denied', attempts };
}

function matches(storedHash: string, candidateHash: string): boolean {
  const stored = Buffer.from(storedHash, 'base64url');
  const candidate = Buffer.from(candidateHash, 'base64url');

  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}
