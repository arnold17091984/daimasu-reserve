-- Phase 0.3 — extensions used across the schema.
-- pgcrypto: gen_random_uuid()
-- citext:    case-insensitive email
-- pg_cron:   scheduled reminders + auto-cancel charges
create extension if not exists "pgcrypto";
create extension if not exists "citext";
create extension if not exists "pg_cron";
