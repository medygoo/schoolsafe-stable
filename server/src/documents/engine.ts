// SchoolSafe Document Engine — Core Service.
// Handles document creation, numbering, and snapshotting using canonical schemas.
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

  // 1. Get School Profile for Snapshot (Canonical app.schools + app.school_contacts)
  const schoolRes = await pool.query(
    `SELECT s.id, s.name, s.legal_name, s.code as school_code, s.logo_path, 
            s.primary_color, s.accent_color, s.document_footer,
            sc.address, sc.phone, sc.email, sc.website
     FROM app.schools s
     LEFT JOIN app.school_contacts sc ON sc.school_id = s.id
     WHERE s.id = $1`,
    [schoolId]
  );
  const school = schoolRes.rows[0];
  if (!school) throw new Error("School not found");

  // 2. Get Academic Year for Snapshot
  const yearRes = await pool.query(
    "SELECT label FROM app.academic_years WHERE id = $1 AND school_id = $2",
    [academicYearId, schoolId]
  );
  const year = yearRes.rows[0];
  if (!year) throw new Error("Academic year not found or mismatched");

  // 3. Atomic Numbering
  const sequence = await getNextDocumentSequence(pool, { schoolId, academicYearId, typeCode });
  
  // Refuse if school code is missing to avoid invalid official documents
  if (!school.school_code) {
    throw new Error("CONFIGURATION_ERROR: School code is missing. Cannot generate official document code.");
  }

  const code = formatDocumentCode(typeCode, school.school_code, year.label, sequence);

  // 4. Create Snapshot of Institutional Identity
  const snapshot = {
    school_name: school.name,
    legal_name: school.legal_name,
    school_code: school.school_code,
    address: school.address,
    phone: school.phone,
    email: school.email,
    website: school.website,
    logo_path: school.logo_path,
    primary_color: school.primary_color,
    accent_color: school.accent_color,
    document_footer: school.document_footer,
    academic_year: year.label,
    generated_at: new Date().toISOString()
  };

  // 5. Insert Document Record (Canonical app.documents)
  const insertRes = await pool.query(
    `INSERT INTO app.documents (
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
    "UPDATE app.documents SET status = 'ISSUED', issued_at = NOW() WHERE id = $1 AND status = 'VALIDATED'",
    [documentId]
  );
}