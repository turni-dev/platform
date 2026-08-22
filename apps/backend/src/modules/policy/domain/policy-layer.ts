import type { PolicyVerdict } from './policy-engine.js';

/**
 * A policy applies at exactly one of four layers, ordered from widest/strictest
 * to narrowest/most-specific:
 *
 *   locked (platform) -> workspace (tenant-wide) -> agent (per-agent) -> user (per-owner-user)
 *
 * `locked` is the pre-existing read-only platform floor (see
 * `locked-policy-seeds.ts`); it is not authored through this hierarchy and a
 * lower layer can never affect it (`policy-layer-resolver.ts` short-circuits on
 * it). `workspace`/`agent`/`user` replace the former single `custom` layer: they
 * let an owner narrow a rule progressively without a parallel "scope" concept
 * living next to `layer` in the schema. `custom` remains a legacy/back-compat
 * value in the DB CHECK constraint (see migration 0022) for any pre-existing
 * row; new code never writes it.
 */
export type PolicyLayer = 'locked' | 'workspace' | 'agent' | 'user';

/** Widest/strictest first. Index is used to validate that a resolved pair is
 * composed top-down (an upper layer must sit strictly above the proposed
 * layer), not merely any two distinct layers. */
export const POLICY_LAYER_ORDER: readonly PolicyLayer[] = Object.freeze([
  'locked',
  'workspace',
  'agent',
  'user'
]);

/**
 * The composable surface of one policy rule at one layer. This is deliberately
 * broader than `PolicyOutcome` (which is the result of matching guest text
 * against guards): a layer rule also carries the configuration knobs that an
 * owner can narrow per layer — allowlisted tools, whether approval is
 * required, and a spend budget — per the "Композиционные профили агентов" and
 * "Монотонный резолвер политик" cards.
 *
 * `undefined` on `allowlist`/`budgetLimit` means "unrestricted" — the widest,
 * least strict value a layer can hold for that field.
 */
export interface PolicyLayerRule {
  readonly layer: PolicyLayer;
  readonly verdict: PolicyVerdict;
  readonly riskScore: number;
  /** Allowed tool/action identifiers. `undefined` = unrestricted. */
  readonly allowlist: readonly string[] | undefined;
  readonly approvalRequired: boolean;
  /** Spend cap in the smallest currency unit. `undefined` = unlimited. */
  readonly budgetLimit: number | undefined;
}
