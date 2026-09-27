# DIBS SPV Factory — operator console UI kit

The "Ledger & Ivory" design system and the operator console layout, in the
stack Lovable generates: Vite, React 18, TypeScript, Tailwind CSS 3,
shadcn/ui conventions and lucide icons. MIT (published demonstration UI; see
`NOTICE.md`).

```
npm install
npm run dev      # local preview
npm run build    # type check + production build (what CI runs)
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
| `src/pages/Overview.tsx` | The operator console: key figures, pipeline table with filter, alerts, EIN pool, ledger integrity |
| `src/lib/sample-data.ts` | **Sample data only.** The top bar shows a "Sample data" badge while pages use it |

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
4. **Data.** Replace `sample-data.ts` with real reads, then drop the
   `sampleData` prop from `TopBar`:
   - pipeline: `spv_pipeline` table
   - alerts: `alert_log` where `acknowledged = false`
   - EIN pool and the 72-hour badge: `factoryInfo` → `rush_track.available`
     (after the rush-track migration in PR #7 is applied)
   - ledger integrity: `verifySeriesLedger`
   - nav counts: the same sources

## Rules the components encode

- One primary button per view. Labels are verbs ("File Form D").
- Anything that writes to the ledger or moves money asks for confirmation;
  the confirm button repeats the verb and Cancel is never the primary.
- Controls are 40–48 px tall (icon buttons 44 px); the 32 px `sm` button is
  for dense table rows only. Icon-only buttons carry `aria-label`.
- Status colors differ in lightness as well as hue; text on tint is 4.5:1 or
  better. Brass is decorative only, never text.
- Stage codes, hashes and IDs are set in IBM Plex Mono.
