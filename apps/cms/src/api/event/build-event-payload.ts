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

/**
 * Builds the metadata-only analytics event for a newly created lead: the
 * lead id, the page it was submitted from and the traffic source. Never the
 * name, contact or task — those never leave this function's argument list.
 */
export function buildLeadEventPayload(lead: LeadEventSource): LeadEventPayload {
  const page = typeof lead['page'] === 'string' && lead['page'].length > 0 ? lead['page'] : 'unknown';
  const source =
    typeof lead['source'] === 'string' && lead['source'].length > 0 ? lead['source'] : 'direct';

  return { data: { type: 'lead', leadId: lead.id, page, source } };
}
