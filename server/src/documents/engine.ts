// SchoolSafe Document Engine — Core Service.
// Handles document creation, numbering, and snapshotting.
import type { BusinessPool } from "../db/pool.js";
import { getNextDocumentSequence, formatDocumentCode } from "./numbering.js";

export interface CreateDocumentParams {
  schoolId: string;
  academicYearId: string;
  typeCode: string; // 'DEV', 'REC', etc.
  metadata: Record<string, any>; // Contextual data (studentId, amount, etc.)
  createdBy: string; // User ID
}

export interface DocumentRecord {
  id: string;
  code: string;
  sequence: number;
  status: 'DRAFT' | 'VALIDATED' | 'ISSUED' | 'CANCELLED';
  snapshot: Record<string, any>;
}

export async function createDocument(
  pool: BusinessPool,
  params: CreateDocumentParams
): Promise<DocumentRecord> {
  const { schoolId, academicYearId, typeCode, metadata, createdBy } = params;

  // 1. Get School Profile for Snapshot
  const schoolRes = await pool.query("SELECT * FROM schools WHERE id = $1", [schoolId]);
  const school = schoolRes.rows[0];
  if (!school) throw new Error("School not found");

  // 2. Get Academic Year for Snapshot
  const yearRes = await pool.query("SELECT * FROM academic_years WHERE id = $1", [academicYearId]);
  const year = yearRes.rows[0];
  if (!year) throw new Error("Academic year not found");

  // 3. Atomic Numbering
  const sequence = await getNextDocumentSequence(pool, { schoolId, academicYearId, typeCode });
  const code = formatDocumentCode(typeCode, school.school_code || 'SCHOOL', year.label || 'YEAR', sequence);

  // 4. Create Snapshot of Institutional Identity
  const snapshot = {
    school_name: school.name,
    legal_name: school.legal_name,
    address: school.address,
    phone: school.phone,
    email: school.email,
    logo_path: school.logo_path,
    academic_year: year.label,
    generated_at: new Date().toISOString()
  };

  // 5. Insert Document Record
  const insertRes = await pool.query(
    `INSERT INTO documents (
      school_id, academic_year_id, type_code, sequence_number,
      document_code, metadata, snapshot, created_by, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'DRAFT')
    RETURNING id, document_code as code, sequence_number as sequence, status, snapshot`,
    [schoolId, academicYearId, typeCode, sequence, code, metadata, snapshot, createdBy]
  );

  return insertRes.rows[0];
}

export async function issueDocument(pool: BusinessPool, documentId: string): Promise<void> {
  await pool.query(
    "UPDATE documents SET status = 'ISSUED', issued_at = NOW() WHERE id = $1 AND status = 'VALIDATED'",
    [documentId]
  );
}