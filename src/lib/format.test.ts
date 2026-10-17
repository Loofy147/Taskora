import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDay, formatStamp, isDateKey, isOverdue, shiftDay, todayKey } from "./format.ts";

describe("isDateKey", () => {
  it("accepts a real calendar date in ISO date-key form", () => {
    assert.equal(isDateKey("2026-10-17"), true);
  });

  it("rejects missing, malformed, and impossible dates", () => {
    assert.equal(isDateKey(""), false);
    assert.equal(isDateKey("2026/10/17"), false);
    assert.equal(isDateKey("2026-02-30"), false);
    assert.equal(isDateKey("2026-13-01"), false);
  });
});

describe("due-date helpers", () => {
  it("does not classify a missing or invalid due date as overdue", () => {
    assert.equal(isOverdue("", "todo"), false);
    assert.equal(isOverdue("not-a-date", "progress"), false);
  });

  it("marks past unfinished tasks overdue but not completed or due-today tasks", () => {
    assert.equal(isOverdue(shiftDay(-1), "todo"), true);
    assert.equal(isOverdue(todayKey(), "progress"), false);
    assert.equal(isOverdue(shiftDay(-1), "done"), false);
  });

  it("formats invalid date values without throwing", () => {
    assert.equal(formatDay(""), "No due date");
    assert.equal(formatDay("2026-02-30"), "No due date");
  });
});


describe("timestamp formatting", () => {
  it("handles malformed persisted timestamps without throwing", () => {
    assert.equal(formatStamp("not-a-timestamp"), "Unknown date");
    assert.equal(formatStamp(""), "Unknown date");
  });
});
