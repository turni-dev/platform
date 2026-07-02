ALTER TABLE memory_revisions ADD CONSTRAINT memory_revisions_source_approval_fk
  FOREIGN KEY (source_approval_id) REFERENCES approvals(id)
  ON DELETE RESTRICT;
