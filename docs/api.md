# DIBS SPV Factory — API reference

Base URL: `https://<project-ref>.supabase.co/functions/v1` (also reported as `SPVFACTORY_BASE_URL` by `factoryInfo`).

## Authentication

Every request carries two headers:

| Header | Value |
|---|---|
| `Authorization` | `Bearer <token>` where token is a signed-in user's Supabase JWT, or the service-role key for server-to-server calls |
| `apikey` | the project's anon key |

A user JWT must belong to a user with a row in `public.user_roles` whose role is in `DIBS_FUNCTION_ALLOWED_ROLES` (default `admin`). The service-role key always passes. `factoryInfo` accepts any signed-in user. From a Lovable frontend, `supabase.functions.invoke(name, { body })` sets both headers automatically. Browser calls must come from an origin listed in `DIBS_CORS_ORIGINS` (unset allows any origin).

All bodies are JSON objects. All responses are JSON with `success` (boolean) and, on failure, `error` (code) and `message`.

| Status | Meaning |
|---|---|
| 400 | validation error (`MISSING_REQUIRED_FIELDS`, `INVALID_<FIELD>`, `INVALID_JSON`, `TIMESTAMP_TOO_OLD`, …) |
| 401 | `UNAUTHENTICATED` — missing or invalid token |
| 403 | `FORBIDDEN` — user lacks an allowed role; `SERVICE_TOKEN_REQUIRED` — runners, `OFAC_FLAG` and `CRITICAL` alerts need the service-role token |
| 409 | `LEDGER_CONTENTION` — retry the ledger append |
| 422 | a business gate failed (`STATUTORY_BLOCK`, `ESCALATION_BLOCK`, `NO_ACTIVE_MASTER`, `MULTIPLE_ACTIVE_MASTERS`, `NO_MASTER_ENTITY`) |
| 429 | `NO_AVAILABLE_PARTY` — every SS-4 signatory is used today |
| 500 | `SYSTEM_ERROR` |

## Endpoints

### `GET /factoryInfo`
Configuration and health. Any signed-in user.

Response: `factory`, `version`, `platform`, `base_url`, `tenant_id`, `env`, `allowed_roles`, `caller { is_service, roles }`, `functions[] { name, method, url }`, `form_d_window_days`, `ledger_hash_preimage`, `rush_track { available, min_available_signatories }`.

`rush_track.available` is whether the 72-hour track may be offered right now (at least 3 EIN signatories available on the IRS Eastern day); hide the option when it is `false`. It is `null` if the check could not run. Only the yes/no is reported, never the pool size.

### `GET /checkMasterEntityLiabilityNotice`
Statutory kill-switch. Resolves the single ACTIVE master Delaware Series LLC.

Response: `has_notice`, `master_entity_id`, `legal_name`, `status`, `message`. `has_notice: false` is a hard block on all formation. 422 when there is no master, no ACTIVE master, or more than one.

### `POST /checkFormationGate`
Pre-flight for every pipeline transition.

Body: `spv_id` (string, required), `target_stage` (one of the 17 formation stages, required).

Response 200: `gate_passed: true`, `master_entity`, `last_escalation_resolved_at`. Response 422: `gate_passed: false` with `error` `STATUTORY_BLOCK` or `ESCALATION_BLOCK` (`escalation_entry_id`, `escalated_at`, `escalation`). An escalation is cleared by appending an `ESCALATION_RESOLVED` ledger event.

### `POST /createSeriesLedgerEntry`
Hash-chained, append-only event.

Body: `spv_id` (required), `event_type` (one of the ledger event types, required), `event_data` (object), `series_id`, `correlation_id` (strings). `actor` and `actor_role` are accepted only from a service token; for a user JWT they are set from the authenticated user and their roles.

Response: `entry_id`, `actor`, `hash`, `previous_hash`, `sequence`, `timestamp`, `attempts`, `hash_preimage`. Hash = SHA-256 of `previous_hash|spv_id|event_type|timestamp|canonical_json(event_data)`.

### `POST /verifySeriesLedger`
Chain verification. Read-only unless an audit package is requested.

Body: `spv_id` (required); `audit_package` (boolean, optional) — set when a client asks for an audit evidence package.

Response: `valid`, `entries_checked`, `legacy_preimage_entries`, `head_hash`, `head_sequence`, `problems[] { entry_id, sequence, reason }`. With `audit_package: true`, also `audit_package { charged, source_ref?, amount?, currency?, reason? }`.

With `audit_package: true`, a chain that verifies is billed one `AUDIT_PACKAGE` charge per ledger head (`audit:<spv>:<head sequence>`) at the SPV's `audit_package_fee`. Asking again before a new entry is appended does not bill again. An invalid chain, an empty ledger, or a tier where the package is included (PLATFORM) is never billed; `reason` says why. The ledger itself is never written.

### `POST /logAlert`
The covenant monitor's only write path.

Body: `spv_id`, `alert_type`, `severity` (`INFO | WARNING | CRITICAL`) required; `covenant_type`, `evidence` (object), `deal_id`, `recommended_action`, `escalated_to`, `channels_sent` (string[]) optional.

`OFAC_FLAG` alerts and `CRITICAL` severity require a service token (403 `SERVICE_TOKEN_REQUIRED` otherwise).

Response: `alert_id`, `alert_type`, `severity`, `spv_id`.

### `POST /getNextResponsibleParty`
IRS SS-4 signatory rotation on the Eastern calendar day.

Body (optional): `spv_id` — makes the call idempotent per SPV and opens an `ein_requests` row; `monthly_cap` (integer ≥ 1).

Response: `already_assigned`, `responsible_party_id`, `name`, `ein_count_this_month`, `ein_request_id`, `irs_calendar_date`. 429 when the pool is exhausted for today.

### `POST /processCapitalCall`
Creates capital calls for executed, KYC-passed subscriptions supplied by the caller.

Body: `spv_id` (required), `investor_list` (required, `[{ investor_id, subscription_id, amount }]`), `call_percentage` (0 < n ≤ 100, default 100), `due_date_days` (integer ≥ 1, default 10).

Response: `calls_created`, `calls_skipped`, `calls_failed`, `total_called`, `call_percentage`, `due_date`, `ledger { entry_id, hash } | { error }`, `results[] { investor_id, subscription_id, status: CREATED | SKIPPED | FAILED, call_id, call_amount, message }`. Amounts are rounded to cents; duplicates per subscription are skipped.

### `POST /triggerFirstSaleClock`
Records a commitment milestone. Only `IRREVOCABLE_COMMITMENT` starts the Form D clock.

Body: `spv_id`, `commitment_type` (`IRREVOCABLE_COMMITMENT | SOFT_CIRCLE | SUBSCRIPTION_SIGNED | FUNDS_RECEIVED | FUNDS_CLEARED`) required; `committed_at` (ISO timestamp, not in the future, default now), `acknowledge_late` (boolean; required when `committed_at` is more than 15 days old, otherwise 400 `TIMESTAMP_TOO_OLD`), `subscription_id`, `investor_id` optional. A late-acknowledged first sale whose window has closed is created with status `OVERDUE`.

Response: `form_d_filing_id`, `commitment_type`, `recorded_at`, `clock_started`, `clock_running`, `first_sale_date`, `filing_deadline`, `days_remaining`, `ledger`, `message`. Soft circles, signed subscriptions and bank receipts never start the clock; the clock is never restarted.

## Scheduled runners

`POST /dibs-covenant-monitor`, `POST /dibs-form-d-deadline-tracker`, `POST /dibs-spv-formation-pipeline`, `POST /dibs-investor-onboarding-monitor`, `POST /dibs-billing`

Invoked by pg_cron with the service-role token; any other caller gets `403 SERVICE_TOKEN_REQUIRED`. Empty body. Each returns `runner`, `started_at`, `duration_ms` and counts of what it found or changed, plus `skipped` for checks that need data outside this repository. What each one does is in `workflows/README.md`. Calling a runner by hand (for example after seeding data) is safe: every action is idempotent and alerts are deduplicated against unacknowledged ones.

## Enumerations

Ledger event types, alert types, severities, commitment types and formation stages are defined once in `schemas/constants.ts` and mirrored by the Postgres enums in `supabase/migrations/`.

## Example

```ts
// Lovable frontend
const { data, error } = await supabase.functions.invoke("triggerFirstSaleClock", {
  body: { spv_id: "spv_123", commitment_type: "IRREVOCABLE_COMMITMENT", committed_at: "2026-09-21T14:00:00Z" },
});
```

```bash
# server-to-server
curl -X POST "$SPVFACTORY_BASE_URL/checkFormationGate" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"spv_id":"spv_123","target_stage":"EIN_PENDING"}'
```
