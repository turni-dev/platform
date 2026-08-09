import { z } from 'zod';

const PolicyVerdictSchema = z.enum([
  'auto',
  'approval',
  'escalate_human',
  'out_of_kb',
  'refuse'
]);

const PolicyRuleSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,99}$/u),
  verdict: PolicyVerdictSchema,
  riskScore: z.number().int().min(1).max(10),
  locked: z.boolean(),
  pattern: z.strictObject({
    source: z.string().min(1).max(1_000),
    flags: z.enum(['', 'i', 'u', 'iu'])
  })
});

export type CompiledPolicyRule = Readonly<{
  id: string;
  verdict: z.infer<typeof PolicyVerdictSchema>;
  riskScore: number;
  locked: boolean;
  matches(text: string): boolean;
}>;

export function compilePolicyRule(input: unknown): CompiledPolicyRule {
  const rule = PolicyRuleSchema.parse(input);
  let expression: RegExp;
  try {
    expression = new RegExp(rule.pattern.source, rule.pattern.flags);
  } catch {
    throw new Error('Invalid policy rule pattern.');
  }

  return Object.freeze({
    id: rule.id,
    verdict: rule.verdict,
    riskScore: rule.riskScore,
    locked: rule.locked,
    matches: (text: string) => expression.test(text)
  });
}
