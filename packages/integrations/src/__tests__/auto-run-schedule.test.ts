import { describe, expect, it } from "vitest";
import { isAutoRunDue } from "@ama/shared";

// 2026-10-23 is a Friday. JST = UTC+9.
const fri18Jst = new Date("2026-10-23T09:30:00Z");

describe("isAutoRunDue", () => {
  it("fires in the scheduled JST hour", () => {
    expect(isAutoRunDue("毎日 18:00", fri18Jst, null)).toBe(true);
  });

  it("does not fire in other hours", () => {
    expect(isAutoRunDue("毎日 18:00", new Date("2026-10-23T08:59:00Z"), null)).toBe(false);
    expect(isAutoRunDue("毎日 18:00", new Date("2026-10-23T10:00:00Z"), null)).toBe(false);
  });

  it("does not fire twice in the same hour", () => {
    expect(isAutoRunDue("毎日 18:00", fri18Jst, "2026-10-23T09:00:05Z")).toBe(false);
  });

  it("fires again the next day", () => {
    expect(isAutoRunDue("毎日 18:00", new Date("2026-10-24T09:00:00Z"), "2026-10-23T09:00:05Z")).toBe(true);
  });

  it("respects weekdays and the JST date rollover", () => {
    // Sat 2026-10-24 09:00 JST is 00:00Z the same day; weekdays-only must skip it.
    expect(isAutoRunDue("平日 9:00", new Date("2026-10-24T00:00:00Z"), null)).toBe(false);
    expect(isAutoRunDue("平日 9:00", new Date("2026-10-23T00:00:00Z"), null)).toBe(true);
  });

  it("limits 週3回 to Tue/Thu/Sat", () => {
    expect(isAutoRunDue("週3回 (火・木・土)", fri18Jst, null)).toBe(false);
    expect(isAutoRunDue("週3回 (火・木・土)", new Date("2026-10-24T09:00:00Z"), null)).toBe(true);
  });

  it("ignores unknown schedules", () => {
    expect(isAutoRunDue("nope", fri18Jst, null)).toBe(false);
  });
});
