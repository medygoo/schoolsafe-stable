import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertStudentOperational } from "../students/operational.js";
import { createHmac, randomUUID } from "node:crypto";
import type { EventService } from "../events/service.js";
import type { SecurityScanInput, SecurityScanResult, SecurityEventDecision } from "./schema.js";

export interface SecurityService {
  createCard(studentId: string, profileId: string): Promise<{ card_number: string; signature: string }>;
  scan(input: SecurityScanInput & { scanned_by: string }): Promise<SecurityScanResult>;
  setLockdown(active: boolean, profileId: string): Promise<{ active: boolean; activated_at: string | null; activated_by: string | null }>;
  listEvents(options: { limit: number; offset: number; eventType?: string }): Promise<{ data: unknown[]; count: number }>;
}

type GuardianRow = {
  id: string;
  full_name: string;
  guardian_type: string;
  is_primary: boolean;
  is_authorized_pickup: boolean;
  phone: string | null;
};

type StudentRow = {
  id: string;
  school_id: string;
  matricule: string;
  first_name: string;
  last_name: string;
  class_id: string | null;
  photo_path: string | null;
};

type CardRow = {
  id: string;
  school_id: string;
  student_id: string;
  card_number: string;
  card_secret: string;
  signature: string;
  status: "active" | "lost" | "revoked" | "replaced";
};

function createServiceClient(supabaseUrl: string, serviceRoleKey: string): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

export function signCardNumber(cardNumber: string, secret: string): string {
  return createHmac("sha256", secret).update(cardNumber).digest("base64url").slice(0, 32);
}

export function parseQrPayload(payload: string): { cardNumber: string; signature: string } | null {
  const match = payload.match(/^schoolsafe:\/\/card\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  return { cardNumber: match[1], signature: match[2] };
}

function mapSecurityEventToBusinessEvent(
  eventType: string,
  decision: SecurityEventDecision,
): "STUDENT_ENTERED" | "STUDENT_EXITED" | "UNAUTHORIZED_EXIT_ATTEMPT" | null {
  if (eventType === "entry") return "STUDENT_ENTERED";
  if (eventType === "exit" || eventType === "exit_prepared") {
    return decision === "allowed" ? "STUDENT_EXITED" : "UNAUTHORIZED_EXIT_ATTEMPT";
  }
  return null;
}

export function createSecurityService(
  supabaseUrl: string,
  serviceRoleKey: string,
  cardHmacSecret?: string,
  eventService?: EventService,
): SecurityService {
  const client = createServiceClient(supabaseUrl, serviceRoleKey);

  async function getSchoolCode(schoolId: string): Promise<string> {
    const { data, error } = await client.from("school").select("code").eq("id", schoolId).single();
    if (error || !data) throw new Error(`School not found: ${error?.message}`);
    return data.code as string;
  }

  async function getStudentWithClass(studentId: string): Promise<StudentRow & { class_name: string | null }> {
    await assertStudentOperational(client, studentId);
    const { data: student, error } = await client
      .from("students")
      .select("id, school_id, matricule, first_name, last_name, class_id, photo_path")
      .eq("id", studentId)
      .single();
    if (error || !student) throw new Error(`Student not found: ${error?.message}`);

    let className: string | null = null;
    if (student.class_id) {
      const { data: cls } = await client.from("classes").select("name").eq("id", student.class_id).single();
      className = cls?.name ?? null;
    }

    return { ...(student as StudentRow), class_name: className };
  }

  async function getGuardians(studentId: string): Promise<GuardianRow[]> {
    const { data, error } = await client
      .from("student_guardians")
      .select("id, full_name, guardian_type, is_primary, is_authorized_pickup, phone")
      .eq("student_id", studentId)
      .eq("is_authorized_pickup", true)
      .order("is_primary", { ascending: false });
    if (error) throw new Error(`Guardians query failed: ${error.message}`);
    return (data ?? []) as GuardianRow[];
  }

  async function isLockdownActive(schoolId: string): Promise<boolean> {
    const { data, error } = await client
      .from("school_settings")
      .select("lockdown_active")
      .eq("school_id", schoolId)
      .single();
    if (error || !data) return false;
    return data.lockdown_active === true;
  }

  async function insertSecurityEvent(params: {
    school_id: string;
    student_id: string;
    card_id: string | null;
    location_id: string | null;
    event_type: string;
    scanned_by: string;
    authorized_person_id: string | null;
    decision: SecurityEventDecision;
    denial_reason: string | null;
    metadata: Record<string, unknown>;
  }): Promise<{ id: string; event_type: string; decision: SecurityEventDecision; occurred_at: string }> {
    const { data, error } = await client
      .from("security_events")
      .insert({
        school_id: params.school_id,
        student_id: params.student_id,
        card_id: params.card_id,
        location_id: params.location_id,
        event_type: params.event_type,
        scanned_by: params.scanned_by,
        authorized_person_id: params.authorized_person_id,
        decision: params.decision,
        denial_reason: params.denial_reason,
        metadata: params.metadata,
      })
      .select("id, event_type, decision, occurred_at")
      .single();
    if (error || !data) throw new Error(`Failed to insert security event: ${error?.message}`);
    return data as { id: string; event_type: string; decision: SecurityEventDecision; occurred_at: string };
  }

  async function createAlert(params: {
    school_id: string;
    rule_code: string;
    source_module: string;
    alert_type: string;
    severity: "critical" | "important" | "attention" | "information";
    title: string;
    message: string;
    entity_type: string;
    entity_id: string;
    dedup_key: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string; severity: string; title: string } | undefined> {
    const { data: rule, error: ruleError } = await client
      .from("alert_rules")
      .select("id")
      .or(`school_id.eq.${params.school_id},school_id.is.null`)
      .eq("code", params.rule_code)
      .maybeSingle();
    if (ruleError) {
      console.error("[SecurityService] alert rule lookup failed", ruleError);
      return undefined;
    }

    const { data, error } = await client
      .from("alerts")
      .insert({
        school_id: params.school_id,
        rule_id: rule?.id ?? null,
        source_module: params.source_module,
        alert_type: params.alert_type,
        severity: params.severity,
        title: params.title,
        message: params.message,
        entity_type: params.entity_type,
        entity_id: params.entity_id,
        dedup_key: params.dedup_key,
        metadata: params.metadata ?? {},
      })
      .select("id, severity, title")
      .single();
    if (error) {
      // Unique partial index may reject duplicates; ignore gracefully.
      if (error.code === "23505") return undefined;
      console.error("[SecurityService] alert insert failed", error);
      return undefined;
    }
    return data as { id: string; severity: string; title: string };
  }

  return {
    async createCard(studentId, profileId) {
      if (!cardHmacSecret) throw new Error("CARD_HMAC_SECRET is not configured");

      const student = await getStudentWithClass(studentId);
      const schoolCode = await getSchoolCode(student.school_id);
      const issuedAt = Date.now();
      const cardNumber = `SS-${schoolCode}-${student.matricule}-${issuedAt}`;
      const signature = signCardNumber(cardNumber, cardHmacSecret);
      const cardSecret = randomUUID();

      const { error } = await client.from("student_cards").insert({
        school_id: student.school_id,
        student_id: studentId,
        card_number: cardNumber,
        card_secret: cardSecret,
        signature,
        status: "active",
      });
      if (error) throw new Error(`Failed to create card: ${error.message}`);

      return { card_number: cardNumber, signature };
    },

    async scan(input) {
      if (!cardHmacSecret) throw new Error("CARD_HMAC_SECRET is not configured");

      const parsed = parseQrPayload(input.qr_payload);
      if (!parsed) {
        throw new Error("Invalid QR payload");
      }

      const expectedSignature = signCardNumber(parsed.cardNumber, cardHmacSecret);
      if (expectedSignature !== parsed.signature) {
        throw new Error("Invalid card signature");
      }

      const { data: card, error: cardError } = await client
        .from("student_cards")
        .select("id, school_id, student_id, card_number, card_secret, signature, status")
        .eq("card_number", parsed.cardNumber)
        .single();

      if (cardError || !card) {
        throw new Error("Card not found");
      }

      const cardRow = card as CardRow;

      if (cardRow.status !== "active") {
        throw new Error(`Card is ${cardRow.status}`);
      }

      const [student, guardians] = await Promise.all([
        getStudentWithClass(cardRow.student_id),
        getGuardians(cardRow.student_id),
      ]);

      const lockdownActive = await isLockdownActive(student.school_id);

      let decision: SecurityEventDecision = "allowed";
      let denialReason: string | null = null;
      let alert: { id: string; severity: string; title: string } | undefined;

      if (lockdownActive) {
        decision = "denied";
        denialReason = "lockdown";
      } else if (input.event_type === "exit" || input.event_type === "exit_prepared") {
        if (input.manual_override) {
          decision = "manual_override";
        } else if (!input.authorized_person_id) {
          decision = "denied";
          denialReason = "no_authorized_person";
        } else {
          const authorized = guardians.find((g) => g.id === input.authorized_person_id);
          if (!authorized || !authorized.is_authorized_pickup) {
            decision = "denied";
            denialReason = "person_not_authorized";
          }
        }
      }

      const event = await insertSecurityEvent({
        school_id: student.school_id,
        student_id: student.id,
        card_id: cardRow.id,
        location_id: input.location_id ?? null,
        event_type: input.event_type,
        scanned_by: input.scanned_by,
        authorized_person_id: input.authorized_person_id ?? null,
        decision,
        denial_reason: denialReason,
        metadata: {
          qr_payload: input.qr_payload,
          note: input.note ?? null,
          lockdown_active: lockdownActive,
        },
      });

      if (eventService) {
        const businessEventType = mapSecurityEventToBusinessEvent(input.event_type, decision);
        if (businessEventType) {
          await eventService.emit({
            type: businessEventType,
            schoolId: student.school_id,
            entityType: "student",
            entityId: student.id,
            userId: input.scanned_by,
            payload: {
              student_name: `${student.first_name} ${student.last_name}`,
              matricule: student.matricule,
              class_name: student.class_name,
              time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
              date: new Date().toLocaleDateString("fr-FR"),
              decision,
              reason: denialReason,
              authorized_person_id: input.authorized_person_id ?? null,
              lockdown_active: lockdownActive,
            },
          }, { dispatchImmediately: true });
        }
      }

      if (decision === "denied" && (input.event_type === "exit" || input.event_type === "exit_prepared")) {
        alert = await createAlert({
          school_id: student.school_id,
          rule_code: "EXIT_DENIED",
          source_module: "security",
          alert_type: "exit_denied",
          severity: "critical",
          title: "Tentative de sortie non autorisée",
          message: `${student.first_name} ${student.last_name} · ${student.matricule}`,
          entity_type: "student",
          entity_id: student.id,
          dedup_key: `${student.school_id}:EXIT_DENIED:student:${student.id}:${new Date().toISOString().slice(0, 10)}`,
          metadata: { event_id: event.id, reason: denialReason },
        });
      }

      if (input.event_type === "incident") {
        alert = await createAlert({
          school_id: student.school_id,
          rule_code: "SECURITY_INCIDENT",
          source_module: "security",
          alert_type: "incident",
          severity: "critical",
          title: "Incident de sécurité",
          message: `${student.first_name} ${student.last_name} · ${student.matricule}`,
          entity_type: "student",
          entity_id: student.id,
          dedup_key: `${student.school_id}:SECURITY_INCIDENT:student:${student.id}:${event.id}`,
          metadata: { event_id: event.id },
        });
      }

      return {
        decision,
        reason: denialReason ?? undefined,
        student: {
          id: student.id,
          matricule: student.matricule,
          first_name: student.first_name,
          last_name: student.last_name,
          class_name: student.class_name,
          photo_path: student.photo_path,
        },
        authorized_persons: guardians,
        event,
        alert,
      };
    },

    async setLockdown(active, profileId) {
      const { data: profile, error: profileError } = await client
        .from("profiles")
        .select("school_id")
        .eq("id", profileId)
        .single();
      if (profileError || !profile) throw new Error("Profile not found");
      const schoolId = profile.school_id as string;

      const { data, error } = await client
        .from("school_settings")
        .update({
          lockdown_active: active,
          lockdown_activated_at: active ? new Date().toISOString() : null,
          lockdown_activated_by: active ? profileId : null,
        })
        .eq("school_id", schoolId)
        .select("lockdown_active, lockdown_activated_at, lockdown_activated_by")
        .single();
      if (error || !data) throw new Error(`Failed to update lockdown: ${error?.message}`);

      if (eventService && active) {
        await eventService.emit({
          type: "LOCKDOWN_ACTIVATED",
          schoolId: schoolId,
          entityType: "school",
          entityId: schoolId,
          userId: profileId,
          payload: {
            activated_by_name: profileId,
            time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
          },
        }, { dispatchImmediately: true });
      }

      return {
        active: data.lockdown_active as boolean,
        activated_at: data.lockdown_activated_at as string | null,
        activated_by: data.lockdown_activated_by as string | null,
      };
    },

    async listEvents(options) {
      let query = client
        .from("security_events")
        .select("*", { count: "exact" })
        .order("occurred_at", { ascending: false })
        .range(options.offset, options.offset + options.limit - 1);
      if (options.eventType) {
        query = query.eq("event_type", options.eventType);
      }
      const { data, error, count } = await query;
      if (error) throw new Error(`Failed to list security events: ${error.message}`);
      return { data: data ?? [], count: count ?? 0 };
    },
  };
}
