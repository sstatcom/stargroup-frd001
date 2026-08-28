import assert from "node:assert";
import { test, describe } from "node:test";
import {
  calculateNewDate,
  formatYYYYMMDD,
  formatDateDdMmmYy,
  transformDescription
} from "./helpers";

describe("Date & Description Helper Functions", () => {
  describe("calculateNewDate", () => {
    test("subtracts exactly 1 day from 2026-08-19 to get 2026-08-18", () => {
      const newDate = calculateNewDate("2026-08-19");
      assert.strictEqual(formatYYYYMMDD(newDate), "2026-08-18");
    });

    test("handles month boundary (e.g., 2026-03-01 to 2026-02-28)", () => {
      const newDate = calculateNewDate("2026-03-01");
      assert.strictEqual(formatYYYYMMDD(newDate), "2026-02-28");
    });

    test("handles leap year (e.g., 2024-03-01 to 2024-02-29)", () => {
      const newDate = calculateNewDate("2024-03-01");
      assert.strictEqual(formatYYYYMMDD(newDate), "2024-02-29");
    });

    test("handles year boundary (e.g., 2026-01-01 to 2025-12-31)", () => {
      const newDate = calculateNewDate("2026-01-01");
      assert.strictEqual(formatYYYYMMDD(newDate), "2025-12-31");
    });

    test("throws error on invalid format", () => {
      assert.throws(() => calculateNewDate("invalid-date"));
    });
  });

  describe("formatDateDdMmmYy", () => {
    test("formats UTC date object to dd-MMM-yy string", () => {
      const date = new Date(Date.UTC(2026, 7, 18)); // Month 7 is August (0-indexed)
      assert.strictEqual(formatDateDdMmmYy(date), "18-Aug-26");
    });
  });

  describe("transformDescription", () => {
    test("replaces matched dd-MMM-yy date substring with newly calculated date", () => {
      const newDateObj = calculateNewDate("2026-08-19"); // New date is 2026-08-18 -> 18-Aug-26
      const originalDesc = "GL Journal Entry for 19-Aug-26 - Stargroup Trigger";
      const result = transformDescription(originalDesc, newDateObj);

      assert.strictEqual(result, "GL Journal Entry for 18-Aug-26 - Stargroup Trigger");
    });

    test("replaces case-insensitively (e.g. 19-aug-26 to 18-Aug-26)", () => {
      const newDateObj = calculateNewDate("2026-08-19");
      const originalDesc = "Invoice dated 19-aug-26 processing";
      const result = transformDescription(originalDesc, newDateObj);

      assert.strictEqual(result, "Invoice dated 18-Aug-26 processing");
    });

    test("returns original description unchanged if no date pattern found", () => {
      const newDateObj = calculateNewDate("2026-08-19");
      const originalDesc = "Regular Description without date";
      const result = transformDescription(originalDesc, newDateObj);

      assert.strictEqual(result, "Regular Description without date");
    });
  });
});
