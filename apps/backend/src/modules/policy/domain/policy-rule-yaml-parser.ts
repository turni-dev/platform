import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import {
  compileSelectorRule,
  SelectorPolicyRuleSchema,
  type CompiledSelectorPolicyRow
} from './policy-rule-selector.js';

const PolicyRuleDocumentSchema = z.strictObject({
  rules: z.array(SelectorPolicyRuleSchema).min(1)
});

/**
 * Compiles an already-parsed list of selector rules (as produced by
 * `PolicyRuleDocumentSchema` or any other document shape that nests a
 * `rules` array, e.g. `default-policies-loader.ts`'s `default_policies`
 * wrapper) into `(path, layer, compiled)` rows, rejecting a duplicate id --
 * two rules compiling to the same `path` would collide on the DB's
 * `policies_agent_path_uidx` for any agent that applies both.
 */
export function compileSelectorRuleList(
  rules: readonly z.infer<typeof SelectorPolicyRuleSchema>[]
): readonly CompiledSelectorPolicyRow[] {
  const rows = rules.map((rule) => compileSelectorRule(rule));

  const seenPaths = new Set<string>();
  for (const row of rows) {
    if (seenPaths.has(row.path)) {
      throw new Error(`Duplicate policy rule id in YAML document: ${row.path}`);
    }
    seenPaths.add(row.path);
  }

  return Object.freeze(rows);
}

/**
 * Parses a YAML document of the shape `{ rules: [...] }` -- one selector
 * rule per entry, `target/effect/params` -- into the runtime `compiled`
 * representation the `policies` table stores. This is the general-purpose
 * entry point; `default-policies-loader.ts` parses the `default_policies`
 * wrapper document shape and reuses `compileSelectorRuleList` for the actual
 * compile+dedupe step.
 */
export function parseSelectorPolicyYaml(yamlText: string): readonly CompiledSelectorPolicyRow[] {
  const parsed: unknown = parseYaml(yamlText);
  const document = PolicyRuleDocumentSchema.parse(parsed);

  return compileSelectorRuleList(document.rules);
}

export { SelectorPolicyRuleSchema };
