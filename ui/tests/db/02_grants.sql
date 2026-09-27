-- Run after the migrations: the table grants Supabase applies by default.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant select on all tables in schema public to anon;
grant execute on all functions in schema public to authenticated;
