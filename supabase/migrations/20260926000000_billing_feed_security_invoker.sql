-- DIBS SPV Factory — lock down the invoice feed view.
--
-- A plain Postgres view runs with its owner's privileges, so it bypasses the
-- RLS on billing_events; Supabase exposes public views to the anon and
-- authenticated roles through the API. Without this, any signed-in user (and
-- anyone holding the anon key) could read every pending charge across all
-- SPVs. security_invoker makes the view apply the caller's RLS (admins only),
-- and the explicit revoke keeps the anon role out entirely.

alter view public.billing_invoice_feed set (security_invoker = true);
revoke all on public.billing_invoice_feed from anon;
