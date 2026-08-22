-- Expand phase: widen the policies.layer vocabulary from ('locked', 'custom')
-- to the workspace -> agent -> user hierarchy described in
-- domain/policy-layer.ts. 'custom' stays valid for any pre-existing row; a
-- follow-up contract migration (after data backfill, founder review) can drop
-- it once no row uses it. The DB still cannot verify that a lower layer only
-- tightens an upper one -- that is `resolvePolicyLayer`'s job in the domain
-- layer, run before a write reaches this table.
ALTER TABLE policies DROP CONSTRAINT policies_layer_check;
ALTER TABLE policies ADD CONSTRAINT policies_layer_check
  CHECK (layer IN ('locked', 'workspace', 'agent', 'user', 'custom'));
