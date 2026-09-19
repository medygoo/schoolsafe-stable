export interface GradeWithAssignment {
  id: string;
  student_id: string;
  assignment_id: string;
  value_numeric: number | null;
  value_text: string | null;
  normalized_value: number | null;
  status: string;
  assignments: {
    id: string;
    subject_id: string;
    coefficient: number;
    scale_max: number | null;
    type: string;
  } | null;
}

export interface SubjectInfo {
  id: string;
  name: string;
  code: string;
  cycle_key: string;
  coefficient?: number | null;
}

export interface SubjectAverage {
  subject_id: string;
  subject_name: string;
  subject_code: string;
  average: number | null;
  total_coefficient: number;
  grade_count: number;
}

export interface StudentAverages {
  student_id: string;
  overall_average: number | null;
  total_subject_coefficient: number;
  subjects: SubjectAverage[];
}

function toNumericGrade(grade: GradeWithAssignment): number | null {
  if (grade.normalized_value !== null && grade.normalized_value !== undefined) {
    return Number(grade.normalized_value);
  }
  if (grade.value_numeric !== null && grade.value_numeric !== undefined) {
    return Number(grade.value_numeric);
  }
  if (grade.value_text) {
    const parsed = Number(grade.value_text.replace(",", "."));
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function computeWeightedAverage(items: Array<{ value: number; coefficient: number }>): number | null {
  if (items.length === 0) return null;
  let weightedSum = 0;
  let totalCoefficient = 0;
  for (const item of items) {
    weightedSum += item.value * item.coefficient;
    totalCoefficient += item.coefficient;
  }
  if (totalCoefficient === 0) return null;
  return Math.round((weightedSum / totalCoefficient) * 100) / 100;
}

export function computeSubjectAverages(
  grades: GradeWithAssignment[],
  subjects: SubjectInfo[],
): { subjects: SubjectAverage[]; overall_average: number | null; total_subject_coefficient: number } {
  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const bySubject = new Map<string, Array<{ value: number; coefficient: number }>>();

  for (const grade of grades) {
    if (grade.status !== "published") continue;
    const value = toNumericGrade(grade);
    if (value === null) continue;
    const assignment = grade.assignments;
    if (!assignment) continue;
    const coefficient = assignment.coefficient || 1;
    if (!bySubject.has(assignment.subject_id)) {
      bySubject.set(assignment.subject_id, []);
    }
    bySubject.get(assignment.subject_id)!.push({ value, coefficient });
  }

  const subjectAverages: SubjectAverage[] = [];
  const overallInputs: Array<{ value: number; coefficient: number }> = [];

  for (const [subjectId, items] of bySubject.entries()) {
    const subject = subjectMap.get(subjectId);
    const subjectCoefficient = subject?.coefficient ?? 1;
    const average = computeWeightedAverage(items);
    subjectAverages.push({
      subject_id: subjectId,
      subject_name: subject?.name || "Matière inconnue",
      subject_code: subject?.code || "",
      average,
      total_coefficient: items.reduce((sum, i) => sum + i.coefficient, 0),
      grade_count: items.length,
    });
    if (average !== null) {
      overallInputs.push({ value: average, coefficient: subjectCoefficient });
    }
  }

  const overall_average = computeWeightedAverage(overallInputs);
  const total_subject_coefficient = overallInputs.reduce((sum, i) => sum + i.coefficient, 0);

  return { subjects: subjectAverages, overall_average, total_subject_coefficient };
}

export function computeStudentAverages(
  studentId: string,
  grades: GradeWithAssignment[],
  subjects: SubjectInfo[],
): StudentAverages {
  const result = computeSubjectAverages(grades, subjects);
  return {
    student_id: studentId,
    overall_average: result.overall_average,
    total_subject_coefficient: result.total_subject_coefficient,
    subjects: result.subjects,
  };
}
