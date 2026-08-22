import { resolvePolicyLayer } from './policy-layer-resolver.js';
import type { PolicyLayer, PolicyLayerRule } from './policy-layer.js';
import { toPolicyLayerRule, type CompiledSelectorPolicy } from './policy-rule-selector.js';

export interface StoredPolicyLayerEntry {
  readonly layer: PolicyLayer;
  readonly compiled: CompiledSelectorPolicy;
}

/**
 * Validates one write to a `policies.compiled` value against whatever is
 * already effective for that path, before the caller persists it. This is
 * the bridge a policy-authoring write path -- narrowing an existing path at
 * a deeper layer -- uses to run selector-parser output
 * (`policy-rule-selector.ts`/`policy-rule-yaml-parser.ts`) through the
 * monotonic layer resolver: `resolvePolicyLayer`'s own logic is untouched,
 * this only adapts the compiled selector-rule shape to the
 * `PolicyLayerRule` it expects (via `toPolicyLayerRule`).
 *
 * `existing` is the row currently stored at that path (`undefined` for a
 * brand-new path, which trivially passes -- there is nothing above it to
 * narrow). Returns the `PolicyLayerRule` to persist; throws
 * `PolicyResolverValidationError` when `proposed` would weaken `existing`.
 */
export function validatePolicyWrite(
  existing: StoredPolicyLayerEntry | undefined,
  proposed: StoredPolicyLayerEntry
): PolicyLayerRule {
  const proposedRule = toPolicyLayerRule(proposed.layer, proposed.compiled);
  if (existing === undefined) {
    return proposedRule;
  }

  return resolvePolicyLayer(toPolicyLayerRule(existing.layer, existing.compiled), proposedRule);
}
