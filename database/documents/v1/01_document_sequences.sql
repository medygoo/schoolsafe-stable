BEGIN;

-- SchoolSafe LOT 5-R1: Document Sequences (Canonical)
-- Supports atomic numbering for official school documents.
CREATE TABLE IF NOT EXISTS app.document_sequences (
    school_id UUID NOT NULL REFERENCES app.schools(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES app.academic_years(id) ON DELETE CASCADE,
    type_code VARCHAR(10) NOT NULL, -- e.g., 'DEV', 'REC', 'PREP'
    last_sequence INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (school_id, academic_year_id, type_code)
);

-- Index for faster lookups if needed by type across schools (rare but possible for audits)
CREATE INDEX IF NOT EXISTS idx_doc_sequences_type ON app.document_sequences(type_code);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION app.update_document_sequences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_document_sequences_updated_at ON app.document_sequences;
CREATE TRIGGER trg_update_document_sequences_updated_at
    BEFORE UPDATE ON app.document_sequences
    FOR EACH ROW
    EXECUTE FUNCTION app.update_document_sequences_updated_at();

COMMIT;