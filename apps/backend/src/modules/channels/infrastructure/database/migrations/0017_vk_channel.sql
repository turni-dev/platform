-- A VK community becomes a channel connection, and its callbacks become inbox
-- rows. Both constraints are re-added NOT VALID and validated afterwards, so
-- neither table is held under an exclusive lock while existing rows are read.
ALTER TABLE channel_connections
  DROP CONSTRAINT channel_connections_type_check;
ALTER TABLE channel_connections
  ADD CONSTRAINT channel_connections_type_check
  CHECK (type IN ('telegram', 'widget', 'vk')) NOT VALID;
ALTER TABLE channel_connections
  VALIDATE CONSTRAINT channel_connections_type_check;

ALTER TABLE webhook_inbox
  DROP CONSTRAINT webhook_inbox_source_check;
ALTER TABLE webhook_inbox
  ADD CONSTRAINT webhook_inbox_source_check
  CHECK (source IN ('telegram', 'yookassa', 'vk')) NOT VALID;
ALTER TABLE webhook_inbox
  VALIDATE CONSTRAINT webhook_inbox_source_check;
