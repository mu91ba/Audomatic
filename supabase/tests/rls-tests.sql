\set QUIET on
\set ON_ERROR_STOP off
\pset pager off

CREATE OR REPLACE FUNCTION test_as(p_user UUID, p_email TEXT) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'email', p_email)::text, true);
END; $$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS results(name TEXT, passed BOOLEAN, detail TEXT);
TRUNCATE results;
GRANT ALL ON results TO authenticated;

CREATE OR REPLACE FUNCTION check_result(p_name TEXT, p_passed BOOLEAN, p_detail TEXT DEFAULT '') RETURNS VOID AS $$
BEGIN INSERT INTO results VALUES (p_name, p_passed, p_detail); END; $$ LANGUAGE plpgsql;

DO $$
DECLARE
  n INT;
  ok BOOLEAN;
  viewer  UUID := '33333333-3333-4333-8333-333333333333';
  member  UUID := '22222222-2222-4222-8222-222222222222';
  owner   UUID := '11111111-1111-4111-8111-111111111111';
  shared  UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  private UUID := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
BEGIN
  SET LOCAL ROLE authenticated;

  -- ---------- viewer ----------
  PERFORM test_as(viewer, 'invited@example.com');

  SELECT COUNT(*) INTO n FROM audits WHERE id = shared;
  PERFORM check_result('viewer CAN read the audit shared with them', n = 1, 'rows=' || n);

  SELECT COUNT(*) INTO n FROM audits WHERE id = private;
  PERFORM check_result('viewer CANNOT read an unshared audit', n = 0, 'rows=' || n);

  SELECT COUNT(*) INTO n FROM pages WHERE audit_id = shared;
  PERFORM check_result('viewer CAN read pages of the shared audit', n = 1, 'rows=' || n);

  SELECT COUNT(*) INTO n FROM pages WHERE audit_id = private;
  PERFORM check_result('viewer CANNOT read pages of an unshared audit', n = 0, 'rows=' || n);

  BEGIN
    INSERT INTO audits (url, status, user_id) VALUES ('https://evil.example', 'pending', viewer);
    PERFORM check_result('viewer CANNOT create an audit', false, 'insert succeeded');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    PERFORM check_result('viewer CANNOT create an audit', true, 'blocked by RLS');
  END;

  BEGIN
    INSERT INTO annotations (audit_id, type, position_x, position_y, color, stroke_color, font_size, z_index)
    VALUES (shared, 'sticky_note', 0, 0, '#fff', '#000', 16, 0);
    PERFORM check_result('viewer CANNOT annotate a shared audit', false, 'insert succeeded');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    PERFORM check_result('viewer CANNOT annotate a shared audit', true, 'blocked by RLS');
  END;

  UPDATE audits SET canvas_layout = '{"x":1}'::jsonb WHERE id = shared;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM check_result('viewer CANNOT move nodes on a shared audit', n = 0, 'rows=' || n);

  -- The escalation this whole migration exists to stop.
  UPDATE app_users SET role = 'admin' WHERE id = viewer;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM check_result('viewer CANNOT promote themselves', n = 0, 'rows=' || n);

  -- Repointing their own share row at someone else's audit (the 011 hole).
  UPDATE audit_shares SET audit_id = private WHERE shared_with_user_id = viewer;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM check_result('viewer CANNOT repoint their share at another audit', n = 0, 'rows=' || n);

  SELECT COUNT(*) INTO n FROM audits WHERE id = private;
  PERFORM check_result('viewer STILL cannot read the unshared audit afterwards', n = 0, 'rows=' || n);

  SELECT COUNT(*) INTO n FROM app_users;
  PERFORM check_result('viewer sees only their own app_users row', n = 1, 'rows=' || n);

  BEGIN
    SELECT COUNT(*) INTO n FROM access_requests;
    PERFORM check_result('viewer CANNOT read the applications queue', n = 0, 'rows=' || n);
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM check_result('viewer CANNOT read the applications queue', true, 'denied');
  END;

  BEGIN
    INSERT INTO access_requests (email) VALUES ('forged@example.com');
    PERFORM check_result('viewer CANNOT forge an application', false, 'insert succeeded');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    PERFORM check_result('viewer CANNOT forge an application', true, 'blocked by RLS');
  END;

  -- ---------- member ----------
  PERFORM test_as(member, 'colleague@example.com');

  BEGIN
    INSERT INTO audits (url, status, user_id) VALUES ('https://ok.example', 'pending', member);
    PERFORM check_result('member CAN create an audit', true, 'inserted');
  EXCEPTION WHEN OTHERS THEN
    PERFORM check_result('member CAN create an audit', false, SQLERRM);
  END;

  BEGIN
    INSERT INTO audits (url, status, user_id) VALUES ('https://spoof.example', 'pending', owner);
    PERFORM check_result('member CANNOT create an audit owned by someone else', false, 'insert succeeded');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    PERFORM check_result('member CANNOT create an audit owned by someone else', true, 'blocked by RLS');
  END;

  SELECT COUNT(*) INTO n FROM audits WHERE id IN (shared, private);
  PERFORM check_result('member CANNOT read audits not shared with them', n = 0, 'rows=' || n);

  -- ---------- owner ----------
  PERFORM test_as(owner, 'muneeba.design@gmail.com');

  BEGIN
    INSERT INTO annotations (audit_id, type, position_x, position_y, color, stroke_color, font_size, z_index)
    VALUES (shared, 'sticky_note', 0, 0, '#fff', '#000', 16, 0);
    PERFORM check_result('owner CAN annotate their own audit', true, 'inserted');
  EXCEPTION WHEN OTHERS THEN
    PERFORM check_result('owner CAN annotate their own audit', false, SQLERRM);
  END;

  UPDATE audits SET canvas_layout = '{"x":2}'::jsonb WHERE id = shared;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM check_result('owner CAN move nodes on their own audit', n = 1, 'rows=' || n);

  -- ---------- accept_pending_shares ----------
  PERFORM test_as('44444444-4444-4444-8444-444444444444', 'randomsignup@example.com');
  SELECT accept_pending_shares() INTO n;
  PERFORM check_result('accept_pending_shares claims a share addressed to you', n = 1, 'claimed=' || n);

  PERFORM test_as(viewer, 'invited@example.com');
  SELECT accept_pending_shares() INTO n;
  PERFORM check_result('accept_pending_shares claims nothing for anyone else', n = 0, 'claimed=' || n);

  RESET ROLE;
END $$;

\set QUIET off
SELECT CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS r, name, detail FROM results ORDER BY passed, name;
SELECT COUNT(*) FILTER (WHERE passed) AS passed, COUNT(*) FILTER (WHERE NOT passed) AS failed FROM results;
