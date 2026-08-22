import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { computeDefaultPolicySet, type DefaultPolicySet } from '../../domain/default-policy-set.js';
import { SelectorPolicyRuleSchema } from '../../domain/policy-rule-yaml-parser.js';

const DEFAULT_POLICIES_PATH = fileURLToPath(new URL('./default-policies.yaml', import.meta.url));

const DefaultPoliciesDocumentSchema = z.strictObject({
  default_policies: z.strictObject({
    version: z.string().min(1),
    rules: z.array(SelectorPolicyRuleSchema).min(1)
  })
});

export type { DefaultPolicySet };

/**
 * Reads and validates `default-policies.yaml` (or, for tests, an in-memory
 * YAML string) and hands the parsed `{version, rules}` pair to the domain's
 * pure `computeDefaultPolicySet` for compiling and fingerprinting. This is
 * the only I/O boundary for the shipped default policy data -- everything
 * downstream (`policy-provisioning-service.ts`) only ever sees the resulting
 * `DefaultPolicySet` value.
 */
export function loadDefaultPolicies(
  yamlText: string = readFileSync(DEFAULT_POLICIES_PATH, 'utf8')
): DefaultPolicySet {
  const parsed: unknown = parseYaml(yamlText);
  const document = DefaultPoliciesDocumentSchema.parse(parsed);

  return computeDefaultPolicySet(document.default_policies.version, document.default_policies.rules);
}
