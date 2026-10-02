# DIBS SPV Factory — operator console UI kit

The "Ledger & Ivory" design system and the operator console layout, in the
stack Lovable generates: Vite, React 18, TypeScript, Tailwind CSS 3,
shadcn/ui conventions and lucide icons. MIT (published demonstration UI; see
`NOTICE.md`).

```
npm install
npm run dev      # local preview
npm run build    # type check + production build (what CI runs)
npm test         # unit tests (and the database test when configured)
```

## What is here

| File | What it is |
| --- | --- |
| `src/index.css` | Theme tokens as shadcn CSS variables (light and `.dark`), plus DIBS tokens: status colors, brass, sidebar, focus ring |
| `tailwind.config.ts` | Maps the tokens to Tailwind (`bg-primary`, `text-critical`, `bg-sidebar`, `font-display`, …) |
| `src/components/ui/button.tsx` | Button: shadcn API, DIBS look. Variants `default` (primary), `secondary`/`outline`, `ghost`/`quiet`, `destructive`, `ink`, `link`; sizes `sm`/`default`/`lg`/`icon`; `loading` + `loadingText` |
| `src/components/ui/status-badge.tsx` | Status chip: `success`, `info`, `warning`, `critical`, `neutral`; `code` for stage and event codes |
| `src/components/ui/page-tabs.tsx` | `PageTabs` (keyboard arrows, Home/End) and `SegmentedControl` |
| `src/components/layout/AppShell.tsx` | Sidebar + top bar + page; bottom tab bar below `lg`; skip link |
| `src/components/layout/AppSidebar.tsx` | Grouped navigation (Operate / Compliance / Money), collapses to an 80 px rail (remembered), counts, master-entity notice, operator |
| `src/components/layout/TopBar.tsx` | Breadcrumb from the route, search, notifications, the one primary action |
| `src/components/layout/MobileTabBar.tsx` | Phone navigation with safe-area inset |
| `src/lib/navigation.ts` | The navigation map: one place to add or rename sections |
| `src/pages/Overview.tsx` | The operator console: key figures, pipeline table with filter, alerts, EIN pool, ledger integrity with on-demand chain verification |
| `src/pages/SignIn.tsx`, `src/hooks/useAuth.tsx` | Email/password sign-in with Supabase Auth; the console needs a session because every table is behind RLS |
| `src/integrations/supabase/client.ts` | The Supabase client, from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` |
| `src/lib/overview-data.ts`, `src/hooks/useFactory.ts` | The queries (React Query, refresh every 60 s) and the nav counts, operator profile and ledger check |
| `src/lib/factory.ts` | Pure rules turning rows into what the console shows (stage progress, hold reasons, signatory pool, alert order); unit-tested |
| `src/lib/sample-data.ts` | **Demo mode only**: used when no Supabase project is configured, with a "Sample data" badge |

## Live data

Set the two variables (Lovable Cloud projects already have them; locally,
copy `.env.example` to `.env.local`). Without them the console runs in demo
mode on sample data.

| On screen | Source |
| --- | --- |
| Series in formation, 72-hour count | `spv_pipeline` (stage ≠ `INVESTOR_READY`) joined to `deal_configurations.fee_schedule.rush_track` |
| Investor-ready this month / in total | `spv_pipeline` stage `INVESTOR_READY`, `last_transition_at` in the current UTC month |
| Form D windows ≤ 5 days, overdue | `form_d_filings`: `PENDING` with `filing_deadline` in the next 5 days; `OVERDUE` |
| Pending invoices | `billing_invoice_feed` (sum and count) |
| Pipeline table | `spv_pipeline`, holds first (blocked, then held), then most recently moved; 12 rows shown |
| Needs attention | `alert_log` where `acknowledged = false`, critical first |
| EIN signatory pool, 72-hour badge | `responsible_parties`, counted with the same lazy-reset rule as the database's rush-track gate (IRS Eastern day) |
| Ledger integrity | latest `series_registry_log` entry and entry count; **Verify recent chains** calls `verifySeriesLedger` for the 5 most recently active SPVs |
| Sidebar counts | head counts on `spv_pipeline`, `alert_log`, `billing_invoice_feed` |
| Operator, master entity | `user_roles` (own roles), `master_entities` where `status = 'ACTIVE'` |

Access follows the migrations' RLS: an `admin` sees everything; compliance
reviewers and counsel see the ledger, alerts, Form D filings and the pipeline
only; a user with
no role sees empty tables and a notice saying so. Grant a role with
`insert into public.user_roles (user_id, role) values (…, 'admin')`. The
frontend only ever holds the public anon key.

### Testing against a database

`npm test` runs the unit tests. `src/lib/overview-data.integration.test.ts`
also runs the real queries, under real RLS, when `DIBS_IT_URL` (a URL serving
PostgREST at `/rest/v1`) and `DIBS_IT_JWT_SECRET` (PostgREST's `jwt-secret`)
are set. To build that database: create an empty Postgres, run
`tests/db/01_supabase_stub.sql`, every file in `supabase/migrations/` in
order, then `tests/db/02_grants.sql` and `tests/db/03_seed.sql`; point
PostgREST at it with `db-anon-role = "anon"` and put a proxy in front that
strips the `/rest/v1` prefix. It was run this way against PostgreSQL 16 and
PostgREST 12.

## Bringing it into the Lovable app

A Lovable project already has `src/components/ui/`, `src/lib/utils.ts`,
`tailwind.config.ts` and `src/index.css`. Copy in this order:

1. **Theme.** Replace the `:root` and `.dark` blocks in the app's
   `src/index.css` with the ones here, and add the base `body` and
   `:focus-visible` rules. Merge `fontFamily` and the extra `colors`
   (`topbar`, `brass`, `subtle`, `success`, `warning`, `critical`, `info`,
   `neutral-status`, the `primary` shades, `sidebar.*`) into
   `tailwind.config.ts`. Add the Google Fonts `<link>` from `index.html`.
   Existing shadcn components restyle themselves at this point.
2. **Button.** Replace `src/components/ui/button.tsx`. Existing
   `variant="outline"` and `variant="ghost"` calls keep working.
3. **Components and layout.** Copy `status-badge.tsx`, `page-tabs.tsx`,
   `src/components/layout/` and `src/lib/navigation.ts`, then wrap the app's
   routes in `<Route element={<AppShell />}>` as in `src/App.tsx`.
4. **Data.** Copy `src/integrations/supabase/client.ts` (or point
   `src/lib/overview-data.ts` at the client Lovable already generated), the
   hooks, `src/lib/factory.ts` and `src/lib/overview-data.ts`, and wrap the app
   in `QueryClientProvider` and `AuthProvider` as in `src/App.tsx`. If the app
   already has its own sign-in, keep it and drop `SignIn.tsx`.

## Rules the components encode

- One primary button per view. Labels are verbs ("File Form D").
- Anything that writes to the ledger or moves money asks for confirmation;
  the confirm button repeats the verb and Cancel is never the primary.
- Controls are 40–48 px tall (icon buttons 44 px); the 32 px `sm` button is
  for dense table rows only. Icon-only buttons carry `aria-label`.
- Status colors differ in lightness as well as hue; text on tint is 4.5:1 or
  better. Brass is decorative only, never text.
- Stage codes, hashes and IDs are set in IBM Plex Mono.
