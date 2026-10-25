import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildScheduleInterval } from "./schedule-input.ts";

describe("schedule datetime validation", () => {
  it("allows a task without a scheduled interval", () => {
    assert.deepEqual(buildScheduleInterval("", "", "Africa/Algiers"), { ok: true, schedule: null });
  });

  it("requires both interval endpoints", () => {
    const result = buildScheduleInterval("2026-10-20T09:00", "", "Africa/Algiers");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /both a schedule start and end/i);
  });

  it("converts a local datetime using the selected IANA timezone", () => {
    assert.deepEqual(buildScheduleInterval("2026-10-20T09:30", "2026-10-20T10:45", "Africa/Algiers"), {
      ok: true,
      schedule: { startsAt: "2026-10-20T08:30:00.000Z", endsAt: "2026-10-20T09:45:00.000Z", timeZone: "Africa/Algiers" },
    });
  });

  it("rejects calendar overflow and invalid local time shapes", () => {
    for (const start of ["2026-02-30T09:00", "2026-10-20T25:00", "2026-10-20T9:00", "garbage"]) {
      assert.equal(buildScheduleInterval(start, "2026-10-20T10:00", "UTC").ok, false, start);
    }
  });

  it("rejects a schedule whose end is not later than the start", () => {
    const result = buildScheduleInterval("2026-10-20T10:00", "2026-10-20T10:00", "UTC");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /end must be later/i);
  });

  it("rejects nonexistent spring-forward local times", () => {
    const result = buildScheduleInterval("2026-03-08T02:30", "2026-03-08T03:30", "America/New_York");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /skipped or repeated/i);
  });

  it("rejects ambiguous fall-back local times instead of silently choosing an occurrence", () => {
    const result = buildScheduleInterval("2026-11-01T01:30", "2026-11-01T02:30", "America/New_York");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /skipped or repeated/i);
  });

  it("rejects an invalid timezone", () => {
    const result = buildScheduleInterval("2026-10-20T09:00", "2026-10-20T10:00", "not-a-zone");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, /timezone is not valid/i);
  });
});
