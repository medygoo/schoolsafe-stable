import { describe, expect, it } from "vitest";
import { computeMonthlyAverage } from "../src/pedagogy/rankings/service.js";

describe("computeMonthlyAverage", () => {
  it("returns weighted average by coefficient", () => {
    const grades = [
      { value_numeric: 10, value_text: null, normalized_value: null, assignments: { coefficient: 2 } },
      { value_numeric: 16, value_text: null, normalized_value: null, assignments: { coefficient: 1 } },
    ];
    expect(computeMonthlyAverage(grades)).toBe(12);
  });

  it("prefers normalized_value over value_numeric", () => {
    const grades = [
      { value_numeric: 5, value_text: null, normalized_value: 10, assignments: { coefficient: 1 } },
    ];
    expect(computeMonthlyAverage(grades)).toBe(10);
  });

  it("parses value_text when numeric values are absent", () => {
    const grades = [
      { value_numeric: null, value_text: "15,5", normalized_value: null, assignments: { coefficient: 1 } },
    ];
    expect(computeMonthlyAverage(grades)).toBe(15.5);
  });

  it("ignores entries without gradable value", () => {
    const grades = [
      { value_numeric: null, value_text: null, normalized_value: null, assignments: { coefficient: 1 } },
      { value_numeric: 12, value_text: null, normalized_value: null, assignments: { coefficient: 1 } },
    ];
    expect(computeMonthlyAverage(grades)).toBe(12);
  });

  it("returns null when no gradable data", () => {
    expect(computeMonthlyAverage([])).toBeNull();
  });

  it("rounds to two decimals", () => {
    const grades = [
      { value_numeric: 10, value_text: null, normalized_value: null, assignments: { coefficient: 1 } },
      { value_numeric: 11, value_text: null, normalized_value: null, assignments: { coefficient: 2 } },
    ];
    expect(computeMonthlyAverage(grades)).toBe(10.67);
  });
});
