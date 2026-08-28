"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = __importDefault(require("node:assert"));
const node_test_1 = require("node:test");
const helpers_1 = require("./helpers");
(0, node_test_1.describe)("Date & Description Helper Functions", () => {
    (0, node_test_1.describe)("calculateNewDate", () => {
        (0, node_test_1.test)("subtracts exactly 1 day from 2026-08-19 to get 2026-08-18", () => {
            const newDate = (0, helpers_1.calculateNewDate)("2026-08-19");
            node_assert_1.default.strictEqual((0, helpers_1.formatYYYYMMDD)(newDate), "2026-08-18");
        });
        (0, node_test_1.test)("handles month boundary (e.g., 2026-03-01 to 2026-02-28)", () => {
            const newDate = (0, helpers_1.calculateNewDate)("2026-03-01");
            node_assert_1.default.strictEqual((0, helpers_1.formatYYYYMMDD)(newDate), "2026-02-28");
        });
        (0, node_test_1.test)("handles leap year (e.g., 2024-03-01 to 2024-02-29)", () => {
            const newDate = (0, helpers_1.calculateNewDate)("2024-03-01");
            node_assert_1.default.strictEqual((0, helpers_1.formatYYYYMMDD)(newDate), "2024-02-29");
        });
        (0, node_test_1.test)("handles year boundary (e.g., 2026-01-01 to 2025-12-31)", () => {
            const newDate = (0, helpers_1.calculateNewDate)("2026-01-01");
            node_assert_1.default.strictEqual((0, helpers_1.formatYYYYMMDD)(newDate), "2025-12-31");
        });
        (0, node_test_1.test)("throws error on invalid format", () => {
            node_assert_1.default.throws(() => (0, helpers_1.calculateNewDate)("invalid-date"));
        });
    });
    (0, node_test_1.describe)("formatDateDdMmmYy", () => {
        (0, node_test_1.test)("formats UTC date object to dd-MMM-yy string", () => {
            const date = new Date(Date.UTC(2026, 7, 18)); // Month 7 is August (0-indexed)
            node_assert_1.default.strictEqual((0, helpers_1.formatDateDdMmmYy)(date), "18-Aug-26");
        });
    });
    (0, node_test_1.describe)("transformDescription", () => {
        (0, node_test_1.test)("replaces matched dd-MMM-yy date substring with newly calculated date", () => {
            const newDateObj = (0, helpers_1.calculateNewDate)("2026-08-19"); // New date is 2026-08-18 -> 18-Aug-26
            const originalDesc = "GL Journal Entry for 19-Aug-26 - Stargroup Trigger";
            const result = (0, helpers_1.transformDescription)(originalDesc, newDateObj);
            node_assert_1.default.strictEqual(result, "GL Journal Entry for 18-Aug-26 - Stargroup Trigger");
        });
        (0, node_test_1.test)("replaces case-insensitively (e.g. 19-aug-26 to 18-Aug-26)", () => {
            const newDateObj = (0, helpers_1.calculateNewDate)("2026-08-19");
            const originalDesc = "Invoice dated 19-aug-26 processing";
            const result = (0, helpers_1.transformDescription)(originalDesc, newDateObj);
            node_assert_1.default.strictEqual(result, "Invoice dated 18-Aug-26 processing");
        });
        (0, node_test_1.test)("returns original description unchanged if no date pattern found", () => {
            const newDateObj = (0, helpers_1.calculateNewDate)("2026-08-19");
            const originalDesc = "Regular Description without date";
            const result = (0, helpers_1.transformDescription)(originalDesc, newDateObj);
            node_assert_1.default.strictEqual(result, "Regular Description without date");
        });
    });
});
//# sourceMappingURL=helpers.test.js.map