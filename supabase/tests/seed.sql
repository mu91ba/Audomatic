INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-1111-4111-8111-111111111111', 'muneeba.design@gmail.com', '{}'),
  ('22222222-2222-4222-8222-222222222222', 'colleague@example.com',    '{}'),
  ('33333333-3333-4333-8333-333333333333', 'invited@example.com',      '{"role":"invitee"}'),
  ('44444444-4444-4444-8444-444444444444', 'randomsignup@example.com', '{}');

INSERT INTO audits (id, url, status, user_id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'https://shared.example.com',  'completed', '11111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'https://private.example.com', 'completed', '11111111-1111-4111-8111-111111111111'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'https://colleague.example.com','completed','22222222-2222-4222-8222-222222222222');

INSERT INTO pages (audit_id, url, title, level) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'https://shared.example.com/',  'Home', 0),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'https://private.example.com/', 'Home', 0);

-- invited@example.com may see audit 1 only.
INSERT INTO audit_shares (audit_id, shared_with_user_id, shared_with_email, role, invited_by, status)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '33333333-3333-4333-8333-333333333333',
        'invited@example.com', 'commenter', '11111111-1111-4111-8111-111111111111', 'accepted');

-- A share addressed to someone with no account yet, for accept_pending_shares().
INSERT INTO audit_shares (audit_id, shared_with_user_id, shared_with_email, role, invited_by, status)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', NULL,
        'randomsignup@example.com', 'commenter', '11111111-1111-4111-8111-111111111111', 'pending');
