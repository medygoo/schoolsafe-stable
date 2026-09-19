// SchoolSafe Device Hub — service natif PostgreSQL (Phases 3/6).
// Enregistrement des appareils, mappings et jobs de synchronisation,
// ingestion d'événements avec idempotence fournisseur. L'exécution des
// jobs passe par un DeviceAdapter (mock en développement, Hikvision plus
// tard via le Bridge) — jamais d'appel réseau dans une transaction SQL.
import type { PoolClient } from "pg";
import type { BusinessPool } from "../db/pool.js";
import { withRequestContext, type RequestContext } from "../db/context.js";
import type { DeviceAdapter } from "./adapter.js";
import { createMockDeviceAdapter } from "./mock.js";
import { pushDeviceRegistration, type ControlAppConfig } from "../control-app/client.js";

export function createDeviceHubService(
  businessPool: BusinessPool,
  controlAppConfig?: ControlAppConfig,
) {
  // Adaptateurs par protocole. Le mock sert le développement sans matériel ;
  // le HikvisionAdapter viendra plus tard via le Bridge local (§11/§26).
  const adapters = new Map<string, DeviceAdapter>();
  const mock = createMockDeviceAdapter();
  adapters.set("mock", mock.adapter);

  return {
    /** Exposer le mock pour les tests et le développement local. */
    mockState: mock.state,

    async registerDevice(context: RequestContext, input: {
      code: string;
      vendor: string;
      model: string;
      serial_number: string;
      location?: string;
      protocol?: string;
      connection_mode?: string;
    }): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          "select api.device_register($1, $2, $3, $4, $5, $6, $7) as result",
          [input.code, input.vendor, input.model, input.serial_number, input.location ?? null,
           input.protocol ?? "mock", input.connection_mode ?? "bridge"],
        );
        const result = r.rows[0].result as Record<string, unknown>;
        // Déclaration auprès de Control (registre maître matériel) — non
        // bloquante : l'appareil reste enregistré localement si Control
        // est injoignable, la déclaration sera rejouée à la prochaine
        // modification.
        if (controlAppConfig) {
          try {
            await pushDeviceRegistration(controlAppConfig, {
              school_id: context.schoolId,
              device_code: input.code,
              vendor: input.vendor,
              model: input.model,
              serial_number: input.serial_number,
              location: input.location,
            });
          } catch (err) {
            result.control_registration = "failed";
            result.control_registration_error = err instanceof Error ? err.message : String(err);
          }
        }
        return result;
      });
    },

    async ensureMapping(context: RequestContext, input: {
      device_id: string;
      student_id?: string;
      subject_type?: "student" | "staff";
      person_name?: string;
    }): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          "select api.device_mapping_ensure($1, $2, $3, $4) as result",
          [input.device_id, input.student_id ?? null, input.subject_type ?? "student", input.person_name ?? null],
        );
        return r.rows[0].result as Record<string, unknown>;
      });
    },

    async ingestEvent(context: RequestContext, input: {
      device_id?: string;
      source?: "terminal" | "mobile";
      raw_provider_event_id?: string;
      external_person_id?: string;
      credential_type: "fingerprint" | "pin" | "card" | "qr";
      event_type: "check_in" | "check_out" | "authentication" | "access" | "unknown";
      occurred_at: string;
      metadata?: Record<string, unknown>;
    }): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query(
          "select api.device_event_ingest($1, $2, $3, $4, $5, $6, $7, $8::jsonb) as result",
          [input.device_id ?? null, input.source ?? "terminal", input.raw_provider_event_id ?? null,
           input.external_person_id ?? null, input.credential_type, input.event_type,
           input.occurred_at, JSON.stringify(input.metadata ?? {})],
        );
        return r.rows[0].result as Record<string, unknown>;
      });
    },

    /** Consolider les présences du jour à partir des événements résolus (§47/§48). */
    async attendanceApply(context: RequestContext, day?: string): Promise<Record<string, unknown>> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query("select api.attendance_apply($1) as result", [day ?? null]);
        return r.rows[0].result as Record<string, unknown>;
      });
    },

    /** Exécuter les jobs dus via l'adaptateur du protocole — hors transaction
     *  de données : un échec réseau ne casse jamais la file durable (§9). */
    async runSyncJobs(context: RequestContext, protocol = "mock"): Promise<Record<string, unknown>> {
      const adapter = adapters.get(protocol);
      if (!adapter) throw new Error(`Aucun adaptateur pour le protocole ${protocol}`);

      const claimed = await withRequestContext(businessPool, context, async (client: PoolClient) => {
        const r = await client.query("select api.device_sync_job_claim($1) as result", [10]);
        return r.rows[0].result as { jobs: Array<{ job_id: string; mapping_id: string; operation: string }> };
      });
      const jobs = claimed?.jobs ?? [];
      const results: Array<{ job_id: string; status: string; detail?: string }> = [];

      for (const job of jobs) {
        try {
          let outcome: "done" | "unsupported" = "done";
          if (job.operation === "create_person" || job.operation === "update_person") {
            const created = await adapter.createPerson({ external_person_id: "", name: "", active: true });
            outcome = created.ok ? "done" : "unsupported";
          }
          results.push({ job_id: job.job_id, status: outcome });
        } catch (err) {
          results.push({ job_id: job.job_id, status: "failed", detail: err instanceof Error ? err.message : String(err) });
        }
      }

      return { claimed: jobs.length, results };
    },
  };
}

export type DeviceHubService = ReturnType<typeof createDeviceHubService>;
