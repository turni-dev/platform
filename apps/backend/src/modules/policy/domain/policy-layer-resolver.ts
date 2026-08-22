import { VERDICT_PRIORITY } from './policy-engine.js';
import { POLICY_LAYER_ORDER, type PolicyLayer, type PolicyLayerRule } from './policy-layer.js';

export type PolicyResolverField =
  | 'riskScore'
  | 'verdict'
  | 'allowlist'
  | 'approvalRequired'
  | 'budgetLimit'
  | 'layer';

/**
 * Thrown when a lower-layer rule would weaken what an upper layer already
 * established. This is a save-time validation failure, not a runtime warning
 * and not a silent clamp — the caller must fix the proposed rule or leave the
 * upper layer's value untouched.
 */
export class PolicyResolverValidationError extends Error {
  public constructor(
    public readonly field: PolicyResolverField,
    public readonly upperLayer: PolicyLayer,
    public readonly proposedLayer: PolicyLayer,
    message: string
  ) {
    super(message);
    this.name = 'PolicyResolverValidationError';
  }
}

function layerIndex(layer: PolicyLayer): number {
  return POLICY_LAYER_ORDER.indexOf(layer);
}

/**
 * Resolves one policy path across two adjacent layers: `upper` is the already
 * effective rule (the result of every layer above, or the locked seed itself);
 * `proposed` is what a lower layer wants to save. The lower layer may only
 * hold the line or tighten it — never loosen it. Fold this pairwise across
 * workspace -> agent -> user (see `resolvePolicyLayers`) to get the tenant's
 * effective rule for a path.
 *
 * `locked` is a special case: nothing composes on top of it. Once `upper` is
 * `locked`, it is returned unchanged — this mirrors (and is independent of)
 * the DB RLS restrictive policy `layer <> 'locked'`, which already stops a
 * locked row from being mutated. The domain check exists so the same
 * guarantee holds for in-process composition that never touches the DB (e.g.
 * previewing a save before it is persisted).
 */
export function resolvePolicyLayer(
  upper: PolicyLayerRule,
  proposed: PolicyLayerRule
): PolicyLayerRule {
  if (upper.layer === 'locked') {
    return upper;
  }

  if (layerIndex(proposed.layer) <= layerIndex(upper.layer)) {
    throw new PolicyResolverValidationError(
      'layer',
      upper.layer,
      proposed.layer,
      `Layer '${proposed.layer}' must sit below '${upper.layer}' in the workspace -> agent -> user hierarchy.`
    );
  }

  if (proposed.riskScore < upper.riskScore) {
    throw new PolicyResolverValidationError(
      'riskScore',
      upper.layer,
      proposed.layer,
      `Layer '${proposed.layer}' lowers riskScore below the '${upper.layer}' layer (upper=${upper.riskScore}, proposed=${proposed.riskScore}).`
    );
  }

  if (VERDICT_PRIORITY[proposed.verdict] < VERDICT_PRIORITY[upper.verdict]) {
    throw new PolicyResolverValidationError(
      'verdict',
      upper.layer,
      proposed.layer,
      `Layer '${proposed.layer}' changes verdict to a less strict one than the '${upper.layer}' layer (upper='${upper.verdict}', proposed='${proposed.verdict}').`
    );
  }

  if (upper.approvalRequired && !proposed.approvalRequired) {
    throw new PolicyResolverValidationError(
      'approvalRequired',
      upper.layer,
      proposed.layer,
      `Layer '${proposed.layer}' removes the approval requirement set by the '${upper.layer}' layer.`
    );
  }

  if (upper.allowlist !== undefined) {
    if (proposed.allowlist === undefined) {
      throw new PolicyResolverValidationError(
        'allowlist',
        upper.layer,
        proposed.layer,
        `Layer '${proposed.layer}' removes the allowlist set by the '${upper.layer}' layer.`
      );
    }

    const upperAllowlist = new Set(upper.allowlist);
    const additions = proposed.allowlist.filter((item) => !upperAllowlist.has(item));
    if (additions.length > 0) {
      throw new PolicyResolverValidationError(
        'allowlist',
        upper.layer,
        proposed.layer,
        `Layer '${proposed.layer}' widens the allowlist set by the '${upper.layer}' layer with: ${additions.join(', ')}.`
      );
    }
  }

  if (upper.budgetLimit !== undefined) {
    if (proposed.budgetLimit === undefined || proposed.budgetLimit > upper.budgetLimit) {
      throw new PolicyResolverValidationError(
        'budgetLimit',
        upper.layer,
        proposed.layer,
        `Layer '${proposed.layer}' raises the budget above the '${upper.layer}' layer (upper=${upper.budgetLimit}, proposed=${String(proposed.budgetLimit)}).`
      );
    }
  }

  return proposed;
}

/**
 * Folds a `workspace -> agent -> user` stack: the first layer is the base
 * (nothing above it to validate against inside this call), and every
 * following layer is checked against the fold-so-far with
 * `resolvePolicyLayer`. The first violation throws.
 *
 * This deliberately does not take a `locked` seed: most policy paths have no
 * matching locked guard at all, so there is nothing to fold from. When a path
 * *does* have one, call `resolvePolicyLayer(locked, resolvePolicyLayers(layers))`
 * — `resolvePolicyLayer` returns the locked rule unchanged no matter what the
 * composed workspace/agent/user result is, so locked still always wins.
 */
export function resolvePolicyLayers(
  layers: readonly [PolicyLayerRule, ...PolicyLayerRule[]]
): PolicyLayerRule {
  const [base, ...rest] = layers;
  return rest.reduce(resolvePolicyLayer, base);
}
