// SchoolSafe Cartes — Lot 1 : regroupement ZIP des cartes d'une école.
// Construit cards.zip (manifest.json + PNG recto/verso par carte, SHA-256 de
// chaque fichier), l'upload dans R2 sous cards/{school_id}/batches/{batch_id}/{version}/
// et pousse la référence à Control via le contrat HMAC existant.
// Une correction crée une nouvelle version de lot ; jamais d'écrasement.
import type { PoolClient } from "pg";
import type { BusinessPool } from "../db/pool.js";
import { withRequestContext, type RequestContext } from "../db/context.js";
import { createR2Client, uploadBuffer, getSignedDownloadUrl, type R2Config } from "../storage/r2.js";
import { pushCardPrintBatch, type ControlAppConfig } from "../control-app/client.js";
import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";

// ————— ZIP minimal (entrées locales, deflate ou store) —————
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry { name: string; data: Buffer }

/** ZIP sans dépendance externe : une entrée par fichier, deflate sinon store. */
export function buildZip(entries: ZipEntry[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    let method = 8;
    let payload = deflateRawSync(entry.data, { level: 6 });
    if (payload.length >= entry.data.length) {
      method = 0;
      payload = entry.data;
    }
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12); // date DOS fictive (2026-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, payload);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0x21, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(payload.length, 20);
    cd.writeUInt32LE(entry.data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += local.length + nameBuf.length + payload.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralBuf, end]);
}

// ————— Service de lot —————

export interface BatchCardRow {
  request_id: string;
  student_id: string;
  student_name: string;
  matricule: string;
  card_number: string;
  format: string;
  version: number;
  front_r2_key: string | null;
  back_r2_key: string | null;
}

export interface BatchManifestCard {
  card_number: string;
  student_id: string;
  student_name: string;
  matricule: string;
  version: number;
  front_file: string;
  back_file: string;
  front_sha256: string;
  back_sha256: string;
}

export interface BatchResult {
  batch_id: string;
  version: number;
  card_count: number;
  r2_key: string;
  signed_url: string;
  signed_url_expires_at: string;
  zip_sha256: string;
  control_batch_id?: string;
}

async function fetchR2Object(r2Config: R2Config, key: string): Promise<Buffer> {
  // Téléchargement via URL signée courte durée — aucune clé publique.
  const client = createR2Client(r2Config);
  const url = await getSignedDownloadUrl(client, r2Config.bucket ?? "cards", key);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`R2 fetch ${key}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export function createCardsBatchService(
  businessPool: BusinessPool,
  r2Config?: R2Config,
  controlAppConfig?: ControlAppConfig,
) {
  async function buildBatch(context: RequestContext, input: {
    request_ids?: string[];
    status?: string;
  }): Promise<BatchResult> {
    if (!r2Config) throw new Error("R2 non configuré pour les lots de cartes");

    return withRequestContext(businessPool, context, async (client: PoolClient) => {
      // Sélection des demandes prêtes de l'école (isolation par contexte serveur).
      const args: unknown[] = [context.schoolId];
      let filter = "r.school_id = $1 and r.status in ('submitted','pending')";
      if (input.request_ids?.length) {
        filter += ` and r.id = any($2::uuid[])`;
        args.push(input.request_ids);
      } else if (input.status) {
        filter += ` and r.status = $2`;
        args.push(input.status);
      }
      const rows = (
        await client.query<BatchCardRow>(
          `select r.id request_id, r.student_id, s.first_name || ' ' || s.last_name student_name,
                  s.matricule, coalesce(c.card_number, 'CARD-' || r.student_id) card_number,
                  r.format, r.version, r.front_r2_key, r.back_r2_key
           from app.card_print_requests r
           join app.students s on s.id = r.student_id
           left join app.student_cards c on c.student_id = r.student_id
           where ${filter}`,
          args as never[],
        )
      ).rows;
      if (!rows.length) throw new Error("Aucune demande à regrouper pour ce lot");

      // Résolution du prochain numéro de version de lot pour cette école.
      const versionRow = await client.query<{ n: number }>(
        `select coalesce(max((metadata->>'batch_version')::int), 0) + 1 n
         from app.card_print_requests
         where school_id = $1 and metadata ? 'batch_version'`,
        [context.schoolId],
      );
      const batchId = `batch-${context.schoolId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}`;
      const version = versionRow.rows[0]?.n ?? 1;

      const entries: ZipEntry[] = [];
      const manifestCards: BatchManifestCard[] = [];
      for (const row of rows) {
        if (!row.front_r2_key || !row.back_r2_key) continue;
        const [frontBuf, backBuf] = await Promise.all([
          fetchR2Object(r2Config, row.front_r2_key),
          fetchR2Object(r2Config, row.back_r2_key),
        ]);
        const safeCard = row.card_number.replace(/[^\w.-]/g, "_");
        const frontFile = `${safeCard}_v${row.version}_recto.png`;
        const backFile = `${safeCard}_v${row.version}_verso.png`;
        entries.push({ name: frontFile, data: frontBuf }, { name: backFile, data: backBuf });
        manifestCards.push({
          card_number: row.card_number,
          student_id: row.student_id,
          student_name: row.student_name,
          matricule: row.matricule,
          version: row.version,
          front_file: frontFile,
          back_file: backFile,
          front_sha256: createHash("sha256").update(frontBuf).digest("hex"),
          back_sha256: createHash("sha256").update(backBuf).digest("hex"),
        });
      }
      if (!manifestCards.length) throw new Error("Aucun PNG disponible pour ce lot (R2)");

      const schoolRow = await client.query<{ name: string }>("select name from app.schools where id = $1", [context.schoolId]);
      const manifest = {
        school_id: context.schoolId,
        school_name: schoolRow.rows[0]?.name ?? "",
        batch_id: batchId,
        version,
        generated_at: new Date().toISOString(),
        card_count: manifestCards.length,
        cards: manifestCards,
      };
      entries.unshift({ name: "manifest.json", data: Buffer.from(JSON.stringify(manifest, null, 2), "utf8") });

      const zipBuf = buildZip(entries);
      const zipSha256 = createHash("sha256").update(zipBuf).digest("hex");
      const r2Key = `cards/${context.schoolId}/batches/${batchId}/v${version}/cards.zip`;
      const bucket = r2Config.bucket ?? "cards";
      const s3 = createR2Client(r2Config);
      await uploadBuffer(s3, bucket, r2Key, zipBuf, "application/zip");
      const signedUrl = await getSignedDownloadUrl(s3, bucket, r2Key);
      const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

      // Trace du lot sur chaque demande incluse — sans écraser le statut métier.
      await client.query(
        `update app.card_print_requests
         set metadata = metadata || jsonb_build_object('batch_id', $2, 'batch_version', $3, 'batch_r2_key', $4, 'batch_zip_sha256', $5)
         where id = any($6::uuid[])`,
        [context.schoolId, batchId, version, r2Key, zipSha256, rows.map((r) => r.request_id)],
      );

      // Notification Control (HMAC) — hors transaction de données : un échec
      // Control ne perd pas le ZIP ni les métadonnées ; il est seulement remonté.
      let controlBatchId: string | undefined;
      if (controlAppConfig) {
        try {
          controlBatchId = (await pushCardPrintBatch(controlAppConfig, {
            school_id: context.schoolId,
            batch_id: batchId,
            version,
            card_count: manifestCards.length,
            r2_key: r2Key,
            zip_signed_url: signedUrl,
            signed_url_expires_at: expiresAt,
            zip_sha256: zipSha256,
          })).id;
        } catch (err) {
          throw new Error(`Lot ${batchId} v${version} stocké (${r2Key}) mais notification Control échouée : ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      return {
        batch_id: batchId,
        version,
        card_count: manifestCards.length,
        r2_key: r2Key,
        signed_url: signedUrl,
        signed_url_expires_at: expiresAt,
        zip_sha256: zipSha256,
        control_batch_id: controlBatchId,
      };
    });
  }

  return { buildBatch };
}

export type CardsBatchService = ReturnType<typeof createCardsBatchService>;