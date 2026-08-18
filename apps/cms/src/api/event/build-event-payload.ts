export interface LeadEventSource {
  readonly id: number;
  /**
   * The full created lead is passed in (it is what the `afterCreate`
   * lifecycle receives), but only `id`, `page` and `source` are ever read —
   * everything else on the lead (name, contact, company, task, channels,
   * ...) is deliberately ignored so it can never end up in the event.
   */
  readonly [key: string]: unknown;
}

export interface LeadEventPayload {
  readonly data: {
    readonly type: 'lead';
    readonly leadId: number;
    readonly page: string;
    readonly source: string;
  };
}

export interface IntegrationRequestEventPayload {
  readonly data: {
    readonly type: 'integration_requested';
    readonly leadId: number;
    readonly integrationSlug: string;
    readonly page: string;
    readonly source: string;
  };
}

/**
 * The catalog slug format, repeated here on purpose: the CMS cannot import
 * the site's Zod schema, and an event must never carry whatever text ended
 * up in the column. Anything that is not a slug produces no event at all.
 */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,59}$/;

/**
 * Builds the metadata-only analytics event for a newly created lead: the
 * lead id, the page it was submitted from and the traffic source. Never the
 * name, contact or task — those never leave this function's argument list.
 */
export function buildLeadEventPayload(lead: LeadEventSource): LeadEventPayload {
  const { page, source } = attribution(lead);

  return { data: { type: 'lead', leadId: lead.id, page, source } };
}

/**
 * Builds the `integration_requested` event (spec §4) for a lead that came
 * from the catalog. Like the lead event it is metadata-only: the slug plus
 * the same page/source attribution, and nothing the visitor typed. Returns
 * `undefined` when the lead requested no integration — a lead without one
 * simply produces no such event.
 */
export function buildIntegrationRequestEventPayload(
  lead: LeadEventSource
): IntegrationRequestEventPayload | undefined {
  const requested = lead['requestedIntegration'];
  if (typeof requested !== 'string' || !SLUG_PATTERN.test(requested)) {
    return undefined;
  }

  const { page, source } = attribution(lead);

  return {
    data: { type: 'integration_requested', leadId: lead.id, integrationSlug: requested, page, source }
  };
}

function attribution(lead: LeadEventSource): { page: string; source: string } {
  const page = typeof lead['page'] === 'string' && lead['page'].length > 0 ? lead['page'] : 'unknown';
  const source =
    typeof lead['source'] === 'string' && lead['source'].length > 0 ? lead['source'] : 'direct';

  return { page, source };
}
