-- Phase 0.3 — pg_cron schedules for reminders + auto-cancel transition.
-- Each job calls a Supabase Edge Function (HTTPS) via pg_net or net.http_post.
-- Edge Function URLs and secrets are stored in private.cron_settings.

create schema if not exists private;

create table if not exists private.cron_settings (
  key   text primary key,
  value text not null
);

comment on table private.cron_settings is
  'Stores Edge Function base URL + service-role JWT for pg_cron HTTP calls. Insert via SQL editor.';

-- Helper: read a cron secret
create or replace function private.cs(key text)
returns text
language sql
stable
as $$
  select value from private.cron_settings where key = $1;
$$;

-- The actual cron HTTP calls go through Supabase Edge Functions. Examples below;
-- they will be ENABLED only after the Edge Function URLs are seeded into private.cron_settings.

-- Every 10 min: send 24h reminder for any confirmed reservation crossing the threshold
-- select cron.schedule(
--   'reminder_long',
--   '*/10 * * * *',
--   $$
--     select net.http_post(
--       url     := private.cs('edge_base_url') || '/reminders/long',
--       headers := jsonb_build_object(
--         'Authorization', 'Bearer ' || private.cs('service_role_jwt'),
--         'Content-Type',  'application/json'
--       )
--     );
--   $$
-- );

-- Every 5 min: send 2h reminder
-- select cron.schedule(
--   'reminder_short',
--   '*/5 * * * *',
--   $$ select net.http_post(
--        url     := private.cs('edge_base_url') || '/reminders/short',
--        headers := jsonb_build_object('Authorization', 'Bearer ' || private.cs('service_role_jwt'),
--                                      'Content-Type',  'application/json')
--      ); $$
-- );

-- Daily 02:00 Manila: mark past confirmed reservations as no_show if not completed
-- select cron.schedule(
--   'mark_no_show',
--   '0 18 * * *',  -- 02:00 Manila = 18:00 UTC
--   $$ select net.http_post(
--        url     := private.cs('edge_base_url') || '/cron/mark-no-show',
--        headers := jsonb_build_object('Authorization', 'Bearer ' || private.cs('service_role_jwt'),
--                                      'Content-Type',  'application/json')
--      ); $$
-- );

comment on schema private is
  'Server-only objects. Never granted to anon/authenticated. Read by service role.';
