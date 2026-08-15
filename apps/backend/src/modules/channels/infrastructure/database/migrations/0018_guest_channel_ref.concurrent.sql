-- One guest per tenant per channel identity. The reference is written as
-- '<channel>:<external id>' so every future channel reuses this index instead
-- of adding its own column, and phone identification later merges into the
-- same row through phone_hash.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS guests_tenant_channel_ref_uidx
  ON guests (tenant_id, (meta ->> 'channel_ref'))
  WHERE meta ? 'channel_ref';
