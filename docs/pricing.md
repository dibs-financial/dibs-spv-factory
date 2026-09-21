# DIBS SPV Factory — Revenue streams and pricing

Proposed 2026-09-21. Prices are proposals to validate against the cost base and competitor quotes.

## Pricing principle

Every charge is a flat fee for formation, administration or compliance work, never a percentage of capital raised and never contingent on a sale closing. The factory is not a broker-dealer, does not custody assets and makes no securities-law determinations, so transaction-based compensation would put DIBS on the wrong side of broker-dealer rules. Government and state fees pass through at cost; DIBS earns on the work around them.

## Revenue streams

Each stream is keyed to an event the factory already records, so invoicing can be driven from the ledger.

| Stream | Factory trigger | Price (USD) |
| --- | --- | --- |
| Series formation | `SERIES_CREATED` ledger event | 3,500 standard; 6,500 on the 72-hour track |
| Series administration | Formation and each anniversary, per active series | 2,400 per year |
| Investor onboarding | `KYC_PASS` per investor | 95 per investor (KYC/AML batch, e-signature, capital call) |
| Regulatory filings | `FORM_D_FILED`, `BLUE_SKY_FILED` | 600 per Form D; 300 per state notice; state fees at cost |
| Late-filing remediation | `FORM_D_OVERDUE` alert resolved | 1,500 flat |
| Registered-series conversion | `series_type` set to REGISTERED | 2,500 plus Delaware fees at cost |
| Audit evidence package | `verifySeriesLedger` export on request | 750 per package; included in Platform tier |
| EIN manual filing | `EIN_PENDING_MANUAL` hold | 250 per paper SS-4 |
| Platform license | White-label or API use of the engine under LICENSE-PROPRIETARY | 2,500 per month plus 1,200 per series, or 30,000 per year with 25 series included |

## Packages

A first-year Sponsor SPV with 20 investors costs 7,800 before filings; on the Fund tier, 6,200.

| | Sponsor | Fund | Platform |
| --- | --- | --- | --- |
| Who | One-off or occasional SPV | Rolling fund or multi-close, 5+ series a year | White-label operators |
| Formation (USD) | 3,500 each | 2,800 each | 1,200 each, engine licensed |
| Administration (USD, per series per year) | 2,400 | 1,900 | Included up to 25 series |
| Onboarding (USD, per investor) | 95 | 75 | 50 |
| Audit package (USD) | 750 | 500 | Included |
| Master LLC | DIBS master, protected series | DIBS master or sponsor's own | Sponsor's own master required |
| Support | Email | Named operator | Named operator plus counsel liaison hours |

## Cost drivers and margin

Gross margin per series should land near 70 percent at Sponsor and near 60 percent at Fund, with onboarding the thinnest line. Direct costs per series: registered agent share, bank sub-account provisioning, KYC checks at roughly 5 to 15 per investor, e-signature envelopes, and human review time on gate failures and escalations.

The 72-hour track earns its premium only when the responsible-party pool has enough daily EIN capacity. Offer it only while at least three signatories are `AVAILABLE`.

## Where pricing lives in the product

The per-deal fee schedule is the `fee_schedule` JSON column on `deal_configurations`; its shape is `FeeSchedule` in `schemas/types.ts` and the tier defaults are `DEFAULT_FEE_SCHEDULES` in `schemas/pricing.ts`.

```json
{
  "tier": "SPONSOR",
  "formation_fee": 3500,
  "rush_track": false,
  "admin_fee_annual": 2400,
  "onboarding_fee_per_investor": 95,
  "form_d_fee": 600,
  "blue_sky_fee_per_state": 300,
  "audit_package_fee": 750,
  "currency": "USD"
}
```

A billing runner (not yet built) would watch `SERIES_CREATED`, `KYC_PASS`, `FORM_D_FILED` and `BLUE_SKY_FILED` plus the administration anniversary, write one `billing_events` row per charge, and hand the rows to Stripe or an invoicing tool.

## Open decisions

1. Whether the standard formation fee includes the first Form D or charges it separately.
2. Whether administration is billed per series or per master.
3. The platform license floor; 30,000 per year is set to win the first three operators and should rise once reference customers exist.
