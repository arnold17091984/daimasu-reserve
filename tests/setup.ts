/**
 * Provides dummy env vars so server modules pass zod validation in tests.
 * No real network is touched in unit tests; values are placeholders.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||=
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.test";
process.env.SUPABASE_SERVICE_ROLE_KEY ||=
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.test";
process.env.STRIPE_SECRET_KEY ||= "sk_test_dummy_for_unit_tests";
process.env.STRIPE_WEBHOOK_SECRET ||= "whsec_dummy_for_unit_tests";
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||= "pk_test_dummy";
// E2E 2026-05-02: RESEND_API_KEY is now optional. Leaving it unset
// exercises the "email skipped" branch in sendEmail(), which is the
// preferred path for unit tests that don't actually send mail.
// (Previous dummy "re_dummy_..." would now fail the placeholder-rejection
// refine() in env.ts.)
delete process.env.RESEND_API_KEY;
process.env.CANCEL_TOKEN_SECRET ||=
  "test_cancel_token_secret_for_unit_tests_xyz_32_chars_min";
process.env.CRON_SHARED_SECRET ||=
  "test_cron_secret_for_unit_tests_xyz_32_chars_min";
process.env.NEXT_PUBLIC_SITE_URL ||= "https://bar.test.local";
