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

/** Minimum AVAILABLE signatories before the 72-hour track may be offered. */
export const RUSH_TRACK_MIN_AVAILABLE_SIGNATORIES = 3;
