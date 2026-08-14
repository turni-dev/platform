import { OwnerEmailSchema } from '@turni/contracts';
import { z } from 'zod';
import type { OwnerAuthFlow } from './owner-auth-client';

const VerifyParamsSchema = z.object({
  flow: z.enum(['register', 'login']).default('login'),
  email: OwnerEmailSchema
});

export interface VerifyParams {
  readonly flow: OwnerAuthFlow;
  readonly email: string;
}

/** Query strings are user input; the verify screen only renders what parses. */
export function parseVerifyParams(
  searchParams: Readonly<Record<string, string | readonly string[] | undefined>>
): VerifyParams | undefined {
  const parsed = VerifyParamsSchema.safeParse(searchParams);

  return parsed.success ? parsed.data : undefined;
}
