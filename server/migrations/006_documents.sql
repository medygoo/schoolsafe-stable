-- SchoolSafe LOT 5: Documents Table
-- Supports numbered, traceable official school documents with institutional snapshots.
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  type_code VARCHAR(10) NOT NULL, -- e.g., 'DEV', 'REC', 'PREP'
  sequence_number INTEGER NOT NULL,
  document_code VARCHAR(64) NOT NULL UNIQUE, -- e.g., DEV-LESAGE-2026-2027-000015
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT', -- DRAFT, VALIDATED, ISSUED, CANCELLED, ARCHIVED
  metadata JSONB NOT NULL DEFAULT '{}', -- Contextual data (studentId, amount, etc.)
  snapshot JSONB NOT NULL DEFAULT '{}', -- Institutional identity at time of creation
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  validated_by UUID REFERENCES users(id),
  validated_at TIMESTAMPTZ,
  issued_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  CONSTRAINT chk_document_status CHECK (status IN ('DRAFT', 'VALIDATED', 'ISSUED', 'CANCELLED', 'ARCHIVED'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_school_year_type ON documents(school_id, academic_year_id, type_code);
CREATE INDEX IF NOT EXISTS idx_documents_code ON documents(document_code);
CREATE INDEX IF NOT EXISTS idx_documents_created_by ON documents(created_by);

-- Trigger to update updated_at (if we add one later) or audit
CREATE OR REPLACE FUNCTION update_documents_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Prevent modification of ISSUED documents except for cancellation/archiving
    IF OLD.status = 'ISSUED' AND NEW.status NOT IN ('CANCELLED', 'ARCHIVED') THEN
      RAISE EXCEPTION 'Cannot modify an ISSUED document. Use cancellation or archiving instead.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_documents_timestamp ON documents;
CREATE TRIGGER trg_update_documents_timestamp
BEFORE UPDATE ON documents
FOR EACH ROW
EXECUTE FUNCTION update_documents_timestamp();