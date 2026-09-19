import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SchoolSafeError } from "../../http/errors.js";

export interface Ranking {
  id: string;
  school_id: string;
  class_id: string | null;
  month: string;
  status: "draft" | "published";
  computed_at: string;
  published_at: string | null;
  computed_by_profile_id: string;
}

export interface RankingEntry {
  id: string;
  ranking_id: string;
  student_id: string;
  rank: number;
  monthly_average: number;
  metadata: Record<string, unknown>;
  students?: {
    id: string;
    first_name: string;
    last_name: string;
    matricule: string | null;
    photo_path: string | null;
    class_id: string;
    classes: { name: string } | null;
  } | null;
}

export interface RankingWithEntries extends Ranking {
  entries: RankingEntry[];
}

export interface Star {
  id: string;
  ranking_id: string;
  student_id: string;
  parent_profile_id: string;
  created_at: string;
}

export interface RankingsService {
  listRankings(schoolId: string, options?: { classId?: string | null; month?: string; status?: string }): Promise<Ranking[]>;
  getRanking(
    schoolId: string,
    rankingId: string,
    viewerOwnChildrenStudentIds?: string[],
  ): Promise<RankingWithEntries | null>;
  computeMonthlyRanking(
    schoolId: string,
    profileId: string,
    yearMonth: string,
    classId?: string,
  ): Promise<RankingWithEntries>;
  publishRanking(schoolId: string, profileId: string, rankingId: string): Promise<Ranking>;
  addStar(schoolId: string, parentProfileId: string, rankingId: string, studentId: string): Promise<Star>;
  removeStar(schoolId: string, parentProfileId: string, rankingId: string, studentId: string): Promise<void>;
  listStars(schoolId: string, rankingId: string): Promise<Star[]>;
  getParentChildrenClassIds(schoolId: string, profileId: string): Promise<string[]>;
  getParentChildrenStudentIds(schoolId: string, profileId: string): Promise<string[]>;
}

function createServiceClient(supabaseUrl: string, serviceRoleKey: string): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function firstDayOfMonth(yearMonth: string): string {
  return `${yearMonth}-01`;
}

function lastDayOfMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const last = new Date(year, month, 0);
  const day = String(last.getDate()).padStart(2, "0");
  return `${yearMonth}-${day}`;
}

function toNumericGrade(valueNumeric: number | null, valueText: string | null, normalizedValue: number | null): number | null {
  if (normalizedValue !== null && normalizedValue !== undefined) return Number(normalizedValue);
  if (valueNumeric !== null && valueNumeric !== undefined) return Number(valueNumeric);
  if (valueText) {
    const parsed = Number(valueText.replace(",", "."));
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

export function computeMonthlyAverage(
  grades: Array<{
    value_numeric: number | null;
    value_text: string | null;
    normalized_value: number | null;
    assignments: { coefficient: number } | null;
  }>,
): number | null {
  let weightedSum = 0;
  let totalCoefficient = 0;
  for (const grade of grades) {
    const value = toNumericGrade(grade.value_numeric, grade.value_text, grade.normalized_value);
    if (value === null) continue;
    const coefficient = grade.assignments?.coefficient || 1;
    weightedSum += value * coefficient;
    totalCoefficient += coefficient;
  }
  if (totalCoefficient === 0) return null;
  return Math.round((weightedSum / totalCoefficient) * 100) / 100;
}

export function createRankingsService(supabaseUrl: string, serviceRoleKey: string): RankingsService {
  const client = createServiceClient(supabaseUrl, serviceRoleKey);

  return {
    async listRankings(schoolId, options = {}) {
      let query = client.from("rankings").select("*").eq("school_id", schoolId).order("month", { ascending: false });
      if (options.classId !== undefined) query = options.classId === null ? query.is("class_id", null) : query.eq("class_id", options.classId);
      if (options.month) query = query.eq("month", options.month);
      if (options.status) query = query.eq("status", options.status);
      const { data, error } = await query;
      if (error) throw new Error(`Failed to list rankings: ${error.message}`);
      return (data ?? []) as Ranking[];
    },

    async getRanking(schoolId, rankingId, viewerOwnChildrenStudentIds) {
      const { data: ranking, error: rankingError } = await client
        .from("rankings")
        .select("*")
        .eq("id", rankingId)
        .eq("school_id", schoolId)
        .single();
      if (rankingError) return null;

      const { data: entries, error: entriesError } = await client
        .from("ranking_entries")
        .select("*, students(id, first_name, last_name, matricule, photo_path, class_id, classes(name))")
        .eq("ranking_id", rankingId)
        .order("rank", { ascending: true });
      if (entriesError) throw new Error(`Failed to load ranking entries: ${entriesError.message}`);

      const childStudentIds = viewerOwnChildrenStudentIds ? new Set(viewerOwnChildrenStudentIds) : undefined;
      const redactedEntries = (entries ?? []).map((entry) => {
        const entryTyped = entry as RankingEntry;
        if (!childStudentIds || childStudentIds.has(entryTyped.student_id)) return entryTyped;
        return { ...entryTyped, metadata: {} };
      });

      return { ...ranking, entries: redactedEntries } as RankingWithEntries;
    },

    async computeMonthlyRanking(schoolId, profileId, yearMonth, classId) {
      const start = firstDayOfMonth(yearMonth);
      const end = lastDayOfMonth(yearMonth);

      let assignmentQuery = client
        .from("assignments")
        .select("id")
        .eq("school_id", schoolId)
        .gte("due_date", start)
        .lte("due_date", end);
      if (classId) assignmentQuery = assignmentQuery.eq("class_id", classId);
      const { data: assignments, error: assignmentError } = await assignmentQuery;
      if (assignmentError) throw new Error(`Failed to list assignments: ${assignmentError.message}`);
      const assignmentIds = (assignments ?? []).map((a) => a.id);

      if (assignmentIds.length === 0) {
        throw new SchoolSafeError(400, "VALIDATION_INVALID", "Aucune évaluation trouvée pour ce mois.", false);
      }

      let gradesQuery = client
        .from("grades")
        .select("*, assignments(id, coefficient)")
        .in("assignment_id", assignmentIds)
        .eq("status", "published");
      const { data: grades, error: gradesError } = await gradesQuery;
      if (gradesError) throw new Error(`Failed to load grades: ${gradesError.message}`);

      const byStudent = new Map<string, typeof grades>();
      for (const grade of grades ?? []) {
        if (!byStudent.has(grade.student_id)) byStudent.set(grade.student_id, []);
        byStudent.get(grade.student_id)!.push(grade);
      }

      let studentQuery = client
        .from("students")
        .select("id, class_id")
        .eq("school_id", schoolId)
        .eq("lifecycle_status", "active");
      if (classId) studentQuery = studentQuery.eq("class_id", classId);
      const { data: students, error: studentsError } = await studentQuery;
      if (studentsError) throw new Error(`Failed to load students: ${studentsError.message}`);

      const ranked = (students ?? [])
        .map((student) => {
          const studentGrades = byStudent.get(student.id) ?? [];
          const average = computeMonthlyAverage(studentGrades);
          return {
            student_id: student.id,
            class_id: student.class_id,
            monthly_average: average,
            metadata: {
              grades: studentGrades.map((g) => ({
                assignment_id: g.assignment_id,
                value: g.normalized_value ?? g.value_numeric ?? g.value_text,
                coefficient: g.assignments?.coefficient ?? 1,
              })),
            },
          };
        })
        .filter((item) => item.monthly_average !== null)
        .sort((a, b) => (b.monthly_average as number) - (a.monthly_average as number));

      if (ranked.length === 0) {
        throw new SchoolSafeError(400, "VALIDATION_INVALID", "Aucune cote publiée pour ce mois.", false);
      }

      const now = new Date().toISOString();
      const { data: ranking, error: rankingUpsertError } = await client
        .from("rankings")
        .upsert(
          {
            school_id: schoolId,
            class_id: classId ?? null,
            month: yearMonth,
            status: "draft",
            computed_at: now,
            computed_by_profile_id: profileId,
            updated_at: now,
          },
          { onConflict: "school_id, class_id, month" },
        )
        .select("*")
        .single();
      if (rankingUpsertError || !ranking) throw new Error(`Failed to upsert ranking: ${rankingUpsertError?.message}`);

      await client.from("ranking_entries").delete().eq("ranking_id", ranking.id);

      const entriesToInsert = ranked.slice(0, 10).map((item, index) => ({
        ranking_id: ranking.id,
        student_id: item.student_id,
        rank: index + 1,
        monthly_average: item.monthly_average as number,
        metadata: item.metadata,
      }));

      const { error: insertError } = await client.from("ranking_entries").insert(entriesToInsert);
      if (insertError) throw new Error(`Failed to insert ranking entries: ${insertError.message}`);

      return this.getRanking(schoolId, ranking.id) as Promise<RankingWithEntries>;
    },

    async publishRanking(schoolId, profileId, rankingId) {
      const { data, error } = await client
        .from("rankings")
        .update({ status: "published", published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", rankingId)
        .eq("school_id", schoolId)
        .select("*")
        .single();
      if (error || !data) throw new SchoolSafeError(404, "NOT_FOUND", "Palmarès introuvable.", false);
      return data as Ranking;
    },

    async addStar(schoolId, parentProfileId, rankingId, studentId) {
      const ranking = await this.getRanking(schoolId, rankingId);
      if (!ranking) throw new SchoolSafeError(404, "NOT_FOUND", "Palmarès introuvable.", false);
      if (ranking.status !== "published") throw new SchoolSafeError(400, "VALIDATION_INVALID", "Le palmarès n’est pas encore publié.", false);

      const isEntry = ranking.entries.some((entry) => entry.student_id === studentId);
      if (!isEntry) throw new SchoolSafeError(400, "VALIDATION_INVALID", "Cet élève ne fait pas partie du palmarès.", false);

      const { data, error } = await client
        .from("ranking_stars")
        .insert({ ranking_id: rankingId, student_id: studentId, parent_profile_id: parentProfileId })
        .select("*")
        .single();
      if (error) {
        if (error.code === "23505") {
          throw new SchoolSafeError(409, "IDEMPOTENCY_DUPLICATE", "Vous avez déjà encouragé cet élève ce mois-ci.", false);
        }
        throw new Error(`Failed to add star: ${error.message}`);
      }
      return data as Star;
    },

    async removeStar(schoolId, parentProfileId, rankingId, studentId) {
      const { error } = await client
        .from("ranking_stars")
        .delete()
        .eq("ranking_id", rankingId)
        .eq("student_id", studentId)
        .eq("parent_profile_id", parentProfileId);
      if (error) throw new Error(`Failed to remove star: ${error.message}`);
    },

    async listStars(schoolId, rankingId) {
      const { data, error } = await client
        .from("ranking_stars")
        .select("*")
        .eq("ranking_id", rankingId);
      if (error) throw new Error(`Failed to list stars: ${error.message}`);
      return (data ?? []) as Star[];
    },

    async getParentChildrenClassIds(schoolId, profileId) {
      const studentIds = await this.getParentChildrenStudentIds(schoolId, profileId);
      if (studentIds.length === 0) return [];
      const { data, error } = await client
        .from("students")
        .select("class_id")
        .in("id", studentIds)
        .eq("school_id", schoolId)
        .eq("lifecycle_status", "active");
      if (error) throw new Error(`Failed to load children classes: ${error.message}`);
      const classIds = new Set<string>();
      for (const row of data ?? []) {
        if (row.class_id) classIds.add(row.class_id);
      }
      return Array.from(classIds);
    },

    async getParentChildrenStudentIds(schoolId, profileId) {
      const { data, error } = await client
        .from("student_guardians")
        .select("student_id")
        .eq("profile_id", profileId)
        .eq("school_id", schoolId);
      if (error) throw new Error(`Failed to load parent children: ${error.message}`);
      return (data ?? []).map((row) => row.student_id).filter((id): id is string => Boolean(id));
    },
  };
}
