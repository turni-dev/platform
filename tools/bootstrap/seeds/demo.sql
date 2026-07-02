INSERT INTO tenants (id, name, plan, status, settings)
VALUES ('01900000-0000-7000-8000-000000000100', 'Turni Demo', 'trial', 'active',
  jsonb_build_object('seed_target', current_setting('turni.seed_target'), 'sla_minutes', 15))
ON CONFLICT (id) DO NOTHING;

INSERT INTO locations (id, tenant_id, name, tz, address, capacity)
VALUES ('01900000-0000-7000-8000-000000000101', '01900000-0000-7000-8000-000000000100',
  'Демо-кафе', 'Europe/Moscow', 'Учебная площадка', 24)
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, tenant_id, role, email, notify_prefs)
VALUES ('01900000-0000-7000-8000-000000000102', '01900000-0000-7000-8000-000000000100',
  'owner', 'demo.owner@turni.local', '{"approval":"web"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO agents (id, tenant_id, name, template, status, autonomy)
VALUES ('01900000-0000-7000-8000-000000000103', '01900000-0000-7000-8000-000000000100',
  'Администратор Демо-кафе', 'dining', 'active',
  '{"booking":false,"complaints":false,"money":false}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO channel_connections (id, tenant_id, agent_id, type, allowed_origins, status, meta)
VALUES ('01900000-0000-7000-8000-000000000104', '01900000-0000-7000-8000-000000000100',
  '01900000-0000-7000-8000-000000000103', 'widget', ARRAY['http://localhost:3000'],
  'active', '{"seed":"demo"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO guests (id, tenant_id, name, meta)
VALUES ('01900000-0000-7000-8000-000000000105', '01900000-0000-7000-8000-000000000100',
  'Тестовый гость', '{"synthetic":true}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO conversations (id, tenant_id, agent_id, guest_id, connection_id, status, last_msg_at, next_seq)
VALUES ('01900000-0000-7000-8000-000000000106', '01900000-0000-7000-8000-000000000100',
  '01900000-0000-7000-8000-000000000103', '01900000-0000-7000-8000-000000000105',
  '01900000-0000-7000-8000-000000000104', 'active', '2026-07-02T10:00:05Z', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO messages (id, conversation_id, tenant_id, seq, role, content, created_at)
VALUES
  ('01900000-0000-7000-8000-000000000107', '01900000-0000-7000-8000-000000000106',
   '01900000-0000-7000-8000-000000000100', 1, 'guest', 'Во сколько вы открываетесь?', '2026-07-02T10:00:00Z'),
  ('01900000-0000-7000-8000-000000000108', '01900000-0000-7000-8000-000000000106',
   '01900000-0000-7000-8000-000000000100', 2, 'agent',
   'Я ИИ-помощник Демо-кафе. Мы открыты ежедневно с 09:00.', '2026-07-02T10:00:05Z')
ON CONFLICT (id) DO NOTHING;

INSERT INTO memory_files (id, tenant_id, agent_id, path, current_rev, status, pin_to_context)
VALUES
  ('01900000-0000-7000-8000-000000000109', '01900000-0000-7000-8000-000000000100',
   '01900000-0000-7000-8000-000000000103', 'venue.md', 1, 'active', true),
  ('01900000-0000-7000-8000-00000000010a', '01900000-0000-7000-8000-000000000100',
   '01900000-0000-7000-8000-000000000103', 'owner.md', 1, 'active', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO memory_revisions (id, tenant_id, file_id, rev, content, author, created_by)
VALUES
  ('01900000-0000-7000-8000-00000000010b', '01900000-0000-7000-8000-000000000100',
   '01900000-0000-7000-8000-000000000109', 1,
   '# Демо-кафе\n\nЧасы работы: ежедневно 09:00-22:00. Вместимость: 24 гостя.', 'system',
   '01900000-0000-7000-8000-000000000102'),
  ('01900000-0000-7000-8000-00000000010c', '01900000-0000-7000-8000-000000000100',
   '01900000-0000-7000-8000-00000000010a', 1,
   '# Владелец\n\nВсе аллергены, деньги и жалобы передавать на согласование.', 'system',
   '01900000-0000-7000-8000-000000000102')
ON CONFLICT (id) DO NOTHING;
