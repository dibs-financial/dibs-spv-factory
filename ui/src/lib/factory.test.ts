import { describe, expect, it } from "vitest";
import {
  ageLabel,
  alertOrder,
  alertTitle,
  easternDate,
  isRushTrack,
  pipelineOrder,
  pipelineStatus,
  shortHash,
  signatoryPool,
  stageStep,
  stageTone,
} from "./factory";

describe("stageStep", () => {
  it("counts the 14 pipeline stages from 1", () => {
    expect(stageStep("INTAKE", null)).toBe(1);
    expect(stageStep("KYC_BATCH_PENDING", null)).toBe(9);
    expect(stageStep("INVESTOR_READY", null)).toBe(14);
  });
  it("shows a hold where the series stopped", () => {
    expect(stageStep("BLOCKED", "DOCS_PENDING")).toBe(7);
    expect(stageStep("EIN_PENDING_MANUAL", null)).toBe(3);
    expect(stageStep("BLOCKED", null)).toBe(1);
  });
});

describe("stageTone and pipelineStatus", () => {
  it("maps stages to tones", () => {
    expect(stageTone("INVESTOR_READY")).toBe("success");
    expect(stageTone("BLOCKED")).toBe("critical");
    expect(stageTone("EIN_PENDING_MANUAL")).toBe("warning");
    expect(stageTone("DOCS_PENDING")).toBe("info");
  });
  it("explains why a series is where it is", () => {
    expect(pipelineStatus({ stage: "BLOCKED", hold_reason: "gate: NO_NOTICE" })).toEqual({
      text: "Blocked · gate: NO_NOTICE",
      tone: "critical",
    });
    expect(pipelineStatus({ stage: "EIN_PENDING_MANUAL" }).text).toBe("Held · ein pending manual");
    expect(pipelineStatus({ stage: "KYC_BATCH_PENDING", wait_reason: "KYC failed; human review" }).tone).toBe(
      "neutral",
    );
    expect(pipelineStatus({ stage: "DOCS_PENDING" }).text).toBe("On track");
    expect(pipelineStatus({ stage: "INVESTOR_READY" }).text).toBe("Complete");
  });
  it("puts blocked, then held, then most recent first", () => {
    const rows = [
      { stage: "DOCS_PENDING", movedAt: 3 },
      { stage: "EIN_PENDING_MANUAL", movedAt: 1 },
      { stage: "BLOCKED", movedAt: 0 },
      { stage: "INTAKE", movedAt: 5 },
    ].sort(pipelineOrder);
    expect(rows.map((r) => r.stage)).toEqual(["BLOCKED", "EIN_PENDING_MANUAL", "INTAKE", "DOCS_PENDING"]);
  });
});

describe("signatoryPool", () => {
  // 2026-09-27 14:00 UTC is 10:00 on 2026-09-27 in New York
  const now = new Date("2026-09-27T14:00:00Z");
  it("uses the IRS Eastern day", () => {
    expect(easternDate(new Date("2026-09-27T03:00:00Z"))).toBe("2026-09-26");
    expect(easternDate(now)).toBe("2026-09-27");
  });
  it("counts parties the lazy reset would return to the pool", () => {
    const pool = signatoryPool(
      [
        { status: "AVAILABLE", last_used_date: null },
        { status: "USED_TODAY", last_used_date: "2026-09-27" },
        { status: "USED_TODAY", last_used_date: "2026-09-26" },
        { status: "EXHAUSTED", last_used_date: "2026-09-02" },
        { status: "EXHAUSTED", last_used_date: "2026-08-30" },
        { status: "INACTIVE", last_used_date: null },
      ],
      now,
    );
    expect(pool).toEqual({ available: 3, total: 5 });
  });
});

describe("alerts", () => {
  it("titles alerts in plain words", () => {
    expect(alertTitle("FORM_D_OVERDUE", "SPV-1")).toBe("Form D overdue · SPV-1");
    expect(alertTitle("SOMETHING_NEW", "SPV-1")).toBe("something new · SPV-1");
  });
  it("orders critical first, then newest", () => {
    const a = [
      { severity: "INFO", created_at: "2026-09-27T10:00:00Z" },
      { severity: "WARNING", created_at: "2026-09-26T10:00:00Z" },
      { severity: "CRITICAL", created_at: "2026-09-20T10:00:00Z" },
      { severity: "WARNING", created_at: "2026-09-27T09:00:00Z" },
    ].sort(alertOrder);
    expect(a.map((x) => x.severity + x.created_at.slice(8, 10))).toEqual([
      "CRITICAL20",
      "WARNING27",
      "WARNING26",
      "INFO27",
    ]);
  });
});

describe("small helpers", () => {
  it("formats age, rush flag and hashes", () => {
    const now = new Date("2026-09-27T12:00:00Z");
    expect(ageLabel("2026-09-27T09:00:00Z", now)).toBe("3h");
    expect(ageLabel("2026-09-24T11:00:00Z", now)).toBe("3d");
    expect(ageLabel(null, now)).toBe("—");
    expect(isRushTrack({ rush_track: true })).toBe(true);
    expect(isRushTrack({ rush_track: "true" })).toBe(false);
    expect(isRushTrack(null)).toBe(false);
    expect(shortHash("9f2c00000000000000a41e")).toBe("9f2c…a41e");
  });
});
