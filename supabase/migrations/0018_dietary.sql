-- 0018 — structured dietary information.
--
-- Why: until now, allergy / dietary info was scribbled into the
-- free-text `notes` column with no structured signal for the kitchen
-- and no acknowledgement loop in the confirmation email. UX research
-- 2026-05-06 (Persona A: shellfish-allergic Western traveller; Persona
-- B: Japanese expat clients with dietary preferences) flagged this as
-- a Critical safety + service gap.
--
-- Shape:
--   dietary_type   – coarse category (none / vegetarian / pescatarian / ...)
--   allergens      – free text list of specific allergens (peanuts, dairy)
--   severe         – boolean signalling "needs EpiPen / hospital risk"
--   instructions   – additional kitchen-visible instructions
--
-- Stored as jsonb so the shape can evolve without another migration.
-- Empty / null means "no dietary requirement" (most reservations).

alter table public.reservations
  add column if not exists dietary jsonb;

comment on column public.reservations.dietary is
  'Structured dietary info. NULL = none. Shape: { type, allergens, severe, instructions }';

-- Optional partial index — speeds up the kitchen prep query that filters
-- to "show me everyone with a dietary entry on this date+seating".
create index if not exists reservations_dietary_idx
  on public.reservations ((dietary is not null))
  where dietary is not null;
