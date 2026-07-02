ALTER TABLE actions
  ADD CONSTRAINT actions_conversation_id_conversations_id_fk
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  ON DELETE RESTRICT;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_guest_id_guests_id_fk
  FOREIGN KEY (guest_id) REFERENCES guests(id)
  ON DELETE RESTRICT;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_conversation_id_conversations_id_fk
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  ON DELETE RESTRICT;
