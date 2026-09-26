/**
 * Tier defaults for deal_configurations.fee_schedule. See docs/pricing.md.
 * Every charge is a flat fee; nothing here may ever be a percentage of
 * capital raised (the factory is not a broker-dealer).
 */
import type { FeeSchedule, PricingTier } from "./types.ts";

export const PRICING_TIERS = ["SPONSOR", "FUND", "PLATFORM"] as const;

export const DEFAULT_FEE_SCHEDULES: Record<PricingTier, FeeSchedule> = {
  SPONSOR: {
    tier: "SPONSOR",
    formation_fee: 3500,
    rush_track: false,
    rush_formation_fee: 6500,
    admin_fee_annual: 2400,
    onboarding_fee_per_investor: 95,
    form_d_fee: 600,
    blue_sky_fee_per_state: 300,
    late_filing_remediation_fee: 1500,
    registered_series_conversion_fee: 2500,
    audit_package_fee: 750,
    ein_manual_filing_fee: 250,
    currency: "USD",
  },
  FUND: {
    tier: "FUND",
    formation_fee: 2800,
    rush_track: false,
    rush_formation_fee: 6500,
    admin_fee_annual: 1900,
    onboarding_fee_per_investor: 75,
    form_d_fee: 600,
    blue_sky_fee_per_state: 300,
    late_filing_remediation_fee: 1500,
    registered_series_conversion_fee: 2500,
    audit_package_fee: 500,
    ein_manual_filing_fee: 250,
    currency: "USD",
  },
  PLATFORM: {
    tier: "PLATFORM",
    formation_fee: 1200,
    rush_track: false,
    rush_formation_fee: 6500,
    admin_fee_annual: 0,
    onboarding_fee_per_investor: 50,
    form_d_fee: 600,
    blue_sky_fee_per_state: 300,
    late_filing_remediation_fee: 1500,
    registered_series_conversion_fee: 2500,
    audit_package_fee: 0,
    ein_manual_filing_fee: 250,
    currency: "USD",
  },
};

/**
 * Platform license (white-label / API use of the engine). One published
 * price, no introductory discounts, 24-month price lock for every operator.
 * Decided 2026-09-21; see docs/pricing.md "Decisions".
 */
export const PLATFORM_LICENSE = {
  annual_fee: 60000,
  included_series: 25,
  additional_series_fee: 2000,
  price_lock_months: 24,
  introductory_discounts: false,
  currency: "USD",
} as const;

/** Form D is never bundled into the formation fee; counsel decides whether a filing is required. */
export const FORM_D_BUNDLED_IN_FORMATION = false;

/** Administration is billed per series, never per master; series count drives the compliance work. */
export const ADMIN_FEE_BASIS = "PER_SERIES" as const;

/**
 * Minimum AVAILABLE signatories before the 72-hour track may be offered.
 * Enforced by the deal_configurations_rush_track_gate trigger
 * (migration 20260926010000_rush_track_gate.sql); keep the two in sync.
 */
export const RUSH_TRACK_MIN_AVAILABLE_SIGNATORIES = 3;
