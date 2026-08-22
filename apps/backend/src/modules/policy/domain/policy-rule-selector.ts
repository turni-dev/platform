import { z } from 'zod';

import type { PolicyVerdict } from './policy-engine.js';
import type { PolicyLayer, PolicyLayerRule } from './policy-layer.js';

const RULE_ID_PATTERN = /^[a-z][a-z0-9-]{0,99}$/u;
const TOOL_ID_PATTERN = /^[a-z][a-z0-9.-]{0,99}$/u;

/**
 * `target/effect/params`: the selector-based rule shape referenced from the
 * task-board card (AgentArea's model). `target` picks what a rule watches —
 * guest text via a keyword/regex probe, or a tool/capability id; `effect` is
 * the outcome it produces when the target matches; `params` carries the
 * effect's tunables (risk score, allowlist, budget, an explicit approval
 * override). This is the authoring shape a YAML file uses
 * (`policy-rule-yaml-parser.ts`); `compileSelectorRule` below turns one rule
 * into the `(path, layer, compiled)` triple that lands in the `policies`
 * table — `compiled` is exactly the shape `policy-layer-resolver.ts` composes
 * (via `toPolicyLayerRule`), so the monotonic check runs unmodified against
 * parser output.
 */
const KeywordTargetSchema = z.strictObject({
  type: z.literal('keyword'),
  source: z.string().min(1).max(1_000),
  flags: z.enum(['', 'i', 'u', 'iu'])
});

const ToolTargetSchema = z.strictObject({
  type: z.literal('tool'),
  toolId: z.string().regex(TOOL_ID_PATTERN)
});

export const PolicyTargetSchema = z.discriminatedUnion('type', [KeywordTargetSchema, ToolTargetSchema]);
export type PolicyTarget = z.infer<typeof PolicyTargetSchema>;

const PolicyEffectSchema = z.enum(['allow', 'require_approval', 'escalate_human', 'refuse', 'out_of_kb']);
export type PolicyEffect = z.infer<typeof PolicyEffectSchema>;

/** Every effect maps to exactly one `PolicyVerdict` so a compiled rule can
 * feed the same verdict vocabulary `PolicyEngine`/`resolvePolicyLayer` use. */
const EFFECT_TO_VERDICT: Readonly<Record<PolicyEffect, PolicyVerdict>> = Object.freeze({
  allow: 'auto',
  require_approval: 'approval',
  escalate_human: 'escalate_human',
  refuse: 'refuse',
  out_of_kb: 'out_of_kb'
});

const PolicyParamsSchema = z.strictObject({
  riskScore: z.number().int().min(1).max(10),
  allowlist: z.array(z.string().min(1)).optional(),
  budgetLimit: z.number().int().nonnegative().optional(),
  /** Independent of `effect`: lets a rule require approval even when the
   * effect itself is `allow` (auto-execute only after sign-off). */
  approvalRequired: z.boolean().optional()
});
export type PolicyParams = z.infer<typeof PolicyParamsSchema>;

export const SelectorPolicyRuleSchema = z.strictObject({
  id: z.string().regex(RULE_ID_PATTERN),
  layer: z.enum(['locked', 'workspace', 'agent', 'user']),
  target: PolicyTargetSchema,
  effect: PolicyEffectSchema,
  params: PolicyParamsSchema
});
export type SelectorPolicyRule = z.infer<typeof SelectorPolicyRuleSchema>;

/**
 * The runtime representation stored in `policies.compiled`. Deliberately a
 * superset of `PolicyLayerRule`: it carries everything the resolver needs
 * (`verdict`, `riskScore`, `allowlist`, `approvalRequired`, `budgetLimit`)
 * plus `ruleId`/`target` for audit and future guest-text matching. Optional
 * fields are `| undefined` (not absent-optional-key) to match
 * `PolicyLayerRule`'s own convention under `exactOptionalPropertyTypes`; JSON
 * serialization to jsonb drops an `undefined` value's key regardless.
 */
export interface CompiledSelectorPolicy {
  readonly ruleId: string;
  readonly target: PolicyTarget;
  readonly verdict: PolicyVerdict;
  readonly riskScore: number;
  readonly approvalRequired: boolean;
  readonly allowlist: readonly string[] | undefined;
  readonly budgetLimit: number | undefined;
}

export interface CompiledSelectorPolicyRow {
  readonly path: string;
  readonly layer: PolicyLayer;
  readonly compiled: CompiledSelectorPolicy;
}

function assertValidPattern(source: string, flags: string): void {
  try {
    void new RegExp(source, flags);
  } catch {
    throw new Error('Invalid policy rule target pattern.');
  }
}

/**
 * Parses and compiles one selector rule (already-parsed YAML/JSON, not raw
 * text) into the `(path, layer, compiled)` triple the `policies` table
 * stores. `path` is the rule's own id: selector rules are already scoped one
 * concern per id, so the id doubles as the per-agent unique path the table's
 * `policies_agent_path_uidx` expects.
 */
export function compileSelectorRule(input: unknown): CompiledSelectorPolicyRow {
  const rule = SelectorPolicyRuleSchema.parse(input);

  if (rule.target.type === 'keyword') {
    assertValidPattern(rule.target.source, rule.target.flags);
  }

  const compiled: CompiledSelectorPolicy = Object.freeze({
    ruleId: rule.id,
    target: rule.target,
    verdict: EFFECT_TO_VERDICT[rule.effect],
    riskScore: rule.params.riskScore,
    approvalRequired: rule.params.approvalRequired ?? rule.effect === 'require_approval',
    allowlist: rule.params.allowlist,
    budgetLimit: rule.params.budgetLimit
  });

  return Object.freeze({ path: rule.id, layer: rule.layer, compiled });
}

/**
 * Projects a stored `(layer, compiled)` pair into the `PolicyLayerRule`
 * shape `resolvePolicyLayer`/`resolvePolicyLayers` operate on. This is the
 * only bridge between this module and the resolver — the resolver's own
 * logic is untouched.
 */
export function toPolicyLayerRule(layer: PolicyLayer, compiled: CompiledSelectorPolicy): PolicyLayerRule {
  return {
    layer,
    verdict: compiled.verdict,
    riskScore: compiled.riskScore,
    allowlist: compiled.allowlist,
    approvalRequired: compiled.approvalRequired,
    budgetLimit: compiled.budgetLimit
  };
}

/**
 * Matches normalized guest text (or a tool id) against one target. Not used
 * by the resolver -- kept alongside the format for tests and any future
 * evaluator that reads `policies.compiled` at runtime.
 */
export function matchesPolicyTarget(target: PolicyTarget, candidate: string): boolean {
  if (target.type === 'tool') {
    return target.toolId === candidate;
  }

  return new RegExp(target.source, target.flags).test(candidate);
}
