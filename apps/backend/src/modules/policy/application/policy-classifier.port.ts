import { z } from 'zod';

const policyVerdictSchema = z.enum(['auto', 'approval', 'escalate_human', 'out_of_kb', 'refuse']);

export const policyClassifierInputSchema = z.object({
  text: z.string()
});

export const policyClassifierCandidateSchema = z.object({
  verdict: policyVerdictSchema,
  riskScore: z.number().int().min(0).max(10),
  rule: z.string().min(1).max(128)
});

export const policyClassifierResultSchema = z.object({
  confidence: z.number().min(0).max(1),
  candidates: z.array(policyClassifierCandidateSchema).max(16)
});

export type PolicyClassifierInput = z.infer<typeof policyClassifierInputSchema>;
export type PolicyClassifierCandidate = z.infer<typeof policyClassifierCandidateSchema>;
export type PolicyClassifierResult = z.infer<typeof policyClassifierResultSchema>;

export interface PolicyClassifierPort {
  classify(input: PolicyClassifierInput): Promise<PolicyClassifierResult>;
}
