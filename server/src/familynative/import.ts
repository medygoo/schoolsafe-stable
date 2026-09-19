// SchoolSafe Familles — Lot E : import collectif des élèves (service).
// Parseur CSV sans dépendance externe + empreinte SHA-256 + appel des RPC
// api.import_prepare / import_preview / import_commit prouvés en base.
// L'école vient du contexte serveur, jamais du fichier (§8).
import type { PoolClient } from "pg";
import type { BusinessPool } from "../db/pool.js";
import { withRequestContext, type RequestContext } from "../db/context.js";
import { createHash } from "node:crypto";

export interface ParsedImportRow {
  line_no: number;
  eleve_ref: string | null;
  matricule: string | null;
  first_name: string | null;
  last_name: string | null;
  class_code: string | null;
  guardian_data: Record<string, unknown>;
}

/** Parse un CSV simple (séparateur ; ou , détecté sur l'en-tête).
 * En-têtes reconnus : eleve_ref, matricule, first_name, last_name, class_code.
 * Toute autre colonne est conservée dans guardian_data (ex. pere, mere, tuteur). */
export function parseStudentCsv(content: string): { rows: ParsedImportRow[]; errors: string[] } {
  const errors: string[] = [];
  const lines = content.replace(/\r\n?/g, "\n").split("\n").filter((line) => line.trim().length > 0);
  if (lines.length < 2) return { rows: [], errors: ["Fichier vide ou sans ligne de données."] };

  const delimiter = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ";" : ",";
  const headers = splitCsvLine(lines[0], delimiter).map((h) => h.trim().toLowerCase());
  const required = ["matricule", "first_name", "last_name", "class_code"];
  for (const field of required) {
    if (!headers.includes(field)) errors.push(`Colonne obligatoire absente : ${field}`);
  }
  if (errors.length) return { rows: [], errors };

  const known = new Set(["eleve_ref", "matricule", "first_name", "last_name", "class_code"]);
  const rows: ParsedImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delimiter);
    const row: ParsedImportRow = {
      line_no: i + 1,
      eleve_ref: null, matricule: null, first_name: null, last_name: null, class_code: null,
      guardian_data: {},
    };
    headers.forEach((header, index) => {
      const value = (cells[index] ?? "").trim();
      if (known.has(header)) {
        (row as unknown as Record<string, string | null>)[header] = value || null;
      } else if (value) {
        row.guardian_data[header] = value;
      }
    });
    rows.push(row);
  }
  return { rows, errors };
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; continue; }
    if (char === delimiter && !inQuotes) { cells.push(current); current = ""; continue; }
    current += char;
  }
  cells.push(current);
  return cells;
}

export function createFamilyImportService(businessPool: BusinessPool) {
  return {
    async prepare(context: RequestContext, input: {
      filename: string;
      fileContent: string;
    }): Promise<Record<string, unknown>> {
      const fileSha256 = createHash("sha256").update(input.fileContent, "utf8").digest("hex");
      const { rows, errors } = parseStudentCsv(input.fileContent);
      if (errors.length) {
        return { error_codes: errors, parsed_rows: rows.length };
      }
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          "select api.import_prepare($1, $2, $3::jsonb) as result",
          [input.filename, fileSha256, JSON.stringify(rows)],
        );
        return r.rows[0].result as Record<string, unknown>;
      });
    },

    async preview(context: RequestContext, jobId: string): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query("select api.import_preview($1) as result", [jobId]);
        return r.rows[0].result as Record<string, unknown>;
      });
    },

    async commit(context: RequestContext, jobId: string): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query("select api.import_commit($1) as result", [jobId]);
        return r.rows[0].result as Record<string, unknown>;
      });
    },
  };
}

export type FamilyImportService = ReturnType<typeof createFamilyImportService>;