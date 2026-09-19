import type { SupabaseClient } from "@supabase/supabase-js";
import { SchoolSafeError } from "../http/errors.js";

export async function assertStudentOperational(client: SupabaseClient, studentId: string): Promise<void> {
  const { data, error } = await client.rpc("is_student_operational", { student_id: studentId });
  if (error) {
    throw new SchoolSafeError(503, "DEPENDENCY_UNAVAILABLE", "Vérification opérationnelle indisponible", true);
  }
  if (data !== true) {
    throw new SchoolSafeError(
      409,
      "STUDENT_NOT_OPERATIONAL",
      "Ce dossier élève est en préparation et ne peut pas être utilisé par un module opérationnel.",
      false,
    );
  }
}
