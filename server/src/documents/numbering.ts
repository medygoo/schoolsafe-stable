// SchoolSafe Document Engine — Atomic Numbering Service.
// Ensures unique, non-reusable sequence numbers per school/year/type using canonical schemas.
import type { BusinessPool } from "../db/pool.js";

export interface DocumentSequenceParams {
  schoolId: string;
  academicYearId: string;
  typeCode: string; // e.g., 'DEV', 'REC', 'PREP'
}

export async function getNextDocumentSequence(
  pool: BusinessPool,
  params: DocumentSequenceParams
): Promise<number> {
  const { schoolId, academicYearId, typeCode } = params;

  // Use a database-level atomic increment to prevent concurrency collisions.
  const result = await pool.query(
    `INSERT INTO app.document_sequences (school_id, academic_year_id, type_code, last_sequence)
     VALUES ($1, $2, $3, 0)
     ON CONFLICT (school_id, academic_year_id, type_code)
     DO UPDATE SET last_sequence = app.document_sequences.last_sequence + 1
     RETURNING last_sequence;`,
    [schoolId, academicYearId, typeCode]
  );

  return result.rows[0].last_sequence;
}

export function formatDocumentCode(typeCode: string, schoolCode: string, yearLabel: string, sequence: number): string {
  // Format: TYPE-SCHOOL_CODE-YEAR-SEQ (e.g., DEV-LESAGE-2026-2027-000015)
  const cleanYear = yearLabel.replace(/[^0-9]/g, '-');
  const paddedSeq = String(sequence).padStart(6, '0');
  return `${typeCode}-${schoolCode}-${cleanYear}-${paddedSeq}`;
}