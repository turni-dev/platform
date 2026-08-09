export interface FrontlineFaqEntry {
  readonly tenantId: string;
  readonly question: string;
  readonly response: string;
}

export interface FrontlineQuestion {
  readonly tenantId: string;
  readonly question: string;
}

export type FrontlineOutcome =
  | Readonly<{ verdict: 'auto'; response: string }>
  | Readonly<{ verdict: 'out_of_kb' }>;

const OUT_OF_KB: FrontlineOutcome = Object.freeze({ verdict: 'out_of_kb' });

function normalize(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase('ru-RU');
}

function assertValidFaqEntry(entry: FrontlineFaqEntry): void {
  if (entry.tenantId.trim().length === 0 || normalize(entry.question).length === 0) {
    throw new Error('FAQ entry requires a tenant and question.');
  }
  if (entry.response.trim().length === 0) {
    throw new Error('FAQ entry requires a non-empty response.');
  }
}

export class FrontlineWorkflow {
  private readonly responsesByTenant: ReadonlyMap<string, ReadonlyMap<string, string>>;

  public constructor(entries: readonly FrontlineFaqEntry[]) {
    const responsesByTenant = new Map<string, Map<string, string>>();
    for (const entry of entries) {
      assertValidFaqEntry(entry);
      const responses = responsesByTenant.get(entry.tenantId) ?? new Map<string, string>();
      responses.set(normalize(entry.question), entry.response);
      responsesByTenant.set(entry.tenantId, responses);
    }
    this.responsesByTenant = responsesByTenant;
  }

  public answer(input: FrontlineQuestion): FrontlineOutcome {
    const response = this.responsesByTenant.get(input.tenantId)?.get(normalize(input.question));
    return response === undefined ? OUT_OF_KB : Object.freeze({ verdict: 'auto', response });
  }
}
