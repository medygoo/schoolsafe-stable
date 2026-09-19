import { describe, expect, it } from "vitest";
import { computeStudentAverages } from "../src/pedagogy/averages.js";

describe("Pedagogy averages", () => {
  it("computes weighted subject averages and overall average", () => {
    const subjects = [
      { id: "subj-math", name: "Mathématiques", code: "MATH", cycle_key: "primary" },
      { id: "subj-fr", name: "Français", code: "FR", cycle_key: "primary" },
    ];

    const grades = [
      {
        id: "g1",
        student_id: "student-1",
        assignment_id: "a1",
        value_numeric: 10,
        value_text: null,
        normalized_value: null,
        status: "published",
        assignments: { id: "a1", subject_id: "subj-math", coefficient: 2, scale_max: 20, type: "homework" },
      },
      {
        id: "g2",
        student_id: "student-1",
        assignment_id: "a2",
        value_numeric: 20,
        value_text: null,
        normalized_value: null,
        status: "published",
        assignments: { id: "a2", subject_id: "subj-math", coefficient: 1, scale_max: 20, type: "exam" },
      },
      {
        id: "g3",
        student_id: "student-1",
        assignment_id: "a3",
        value_numeric: 15,
        value_text: null,
        normalized_value: null,
        status: "published",
        assignments: { id: "a3", subject_id: "subj-fr", coefficient: 1, scale_max: 20, type: "homework" },
      },
    ];

    const result = computeStudentAverages("student-1", grades, subjects);

    expect(result.student_id).toBe("student-1");
    expect(result.overall_average).toBe(14.17);
    expect(result.subjects).toHaveLength(2);

    const math = result.subjects.find((s) => s.subject_id === "subj-math");
    expect(math?.average).toBe(13.33);
    expect(math?.total_coefficient).toBe(3);

    const french = result.subjects.find((s) => s.subject_id === "subj-fr");
    expect(french?.average).toBe(15);
  });

  it("applies subject coefficients for overall average", () => {
    const subjects = [
      { id: "subj-math", name: "Mathématiques", code: "MATH", cycle_key: "primary", coefficient: 2 },
      { id: "subj-fr", name: "Français", code: "FR", cycle_key: "primary", coefficient: 1 },
    ];

    const grades = [
      {
        id: "g1",
        student_id: "student-1",
        assignment_id: "a1",
        value_numeric: 10,
        value_text: null,
        normalized_value: null,
        status: "published",
        assignments: { id: "a1", subject_id: "subj-math", coefficient: 2, scale_max: 20, type: "homework" },
      },
      {
        id: "g2",
        student_id: "student-1",
        assignment_id: "a2",
        value_numeric: 20,
        value_text: null,
        normalized_value: null,
        status: "published",
        assignments: { id: "a2", subject_id: "subj-math", coefficient: 1, scale_max: 20, type: "exam" },
      },
      {
        id: "g3",
        student_id: "student-1",
        assignment_id: "a3",
        value_numeric: 15,
        value_text: null,
        normalized_value: null,
        status: "published",
        assignments: { id: "a3", subject_id: "subj-fr", coefficient: 1, scale_max: 20, type: "homework" },
      },
    ];

    const result = computeStudentAverages("student-1", grades, subjects);
    expect(result.overall_average).toBe(13.89);
  });

  it("ignores draft grades", () => {
    const subjects = [{ id: "subj-math", name: "Mathématiques", code: "MATH", cycle_key: "primary" }];
    const grades = [
      {
        id: "g1",
        student_id: "student-1",
        assignment_id: "a1",
        value_numeric: 10,
        value_text: null,
        normalized_value: null,
        status: "draft",
        assignments: { id: "a1", subject_id: "subj-math", coefficient: 1, scale_max: 20, type: "homework" },
      },
    ];

    const result = computeStudentAverages("student-1", grades, subjects);
    expect(result.overall_average).toBeNull();
    expect(result.subjects).toHaveLength(0);
  });

  it("uses normalized_value when available", () => {
    const subjects = [{ id: "subj-math", name: "Mathématiques", code: "MATH", cycle_key: "primary" }];
    const grades = [
      {
        id: "g1",
        student_id: "student-1",
        assignment_id: "a1",
        value_numeric: 5,
        value_text: null,
        normalized_value: 10,
        status: "published",
        assignments: { id: "a1", subject_id: "subj-math", coefficient: 1, scale_max: 20, type: "homework" },
      },
    ];

    const result = computeStudentAverages("student-1", grades, subjects);
    expect(result.subjects[0]?.average).toBe(10);
  });
});
