import type { SupabaseClient } from "@supabase/supabase-js";

export interface AlertRuleContext {
  schoolId: string;
  studentId?: string;
  eventType: string;
  payload?: Record<string, unknown>;
}

export interface AlertRuleResult {
  created: boolean;
  alertId?: string;
  title?: string;
  severity?: string;
}

async function createAlert(
  client: SupabaseClient,
  params: {
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
  },
): Promise<{ id: string; severity: string; title: string } | undefined> {
  const { data: rule, error: ruleError } = await client
    .from("alert_rules")
    .select("id")
    .or(`school_id.eq.${params.school_id},school_id.is.null`)
    .eq("code", params.rule_code)
    .maybeSingle();
  if (ruleError) {
    console.error("[AlertRules] alert rule lookup failed", ruleError);
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
    if (error.code === "23505") return undefined;
    console.error("[AlertRules] alert insert failed", error);
    return undefined;
  }
  return data as { id: string; severity: string; title: string };
}

async function loadStudent(client: SupabaseClient, schoolId: string, studentId: string) {
  const { data, error } = await client
    .from("students")
    .select("id, matricule, first_name, last_name, class_id, classes(name)")
    .eq("id", studentId)
    .eq("school_id", schoolId)
    .eq("lifecycle_status", "active")
    .single();
  if (error || !data) return null;
  return data;
}

async function evaluateLateArrivalRule(client: SupabaseClient, context: AlertRuleContext): Promise<AlertRuleResult> {
  const { schoolId, studentId } = context;
  if (!studentId) return { created: false };

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await client
    .from("security_events")
    .select("id", { count: "exact" })
    .eq("school_id", schoolId)
    .eq("student_id", studentId)
    .eq("event_type", "entry")
    .eq("metadata->>late", "true")
    .gte("occurred_at", since);
  if (error || !count || count < 3) return { created: false };

  const student = await loadStudent(client, schoolId, studentId);
  if (!student) return { created: false };

  const today = new Date().toISOString().slice(0, 10);
  const alert = await createAlert(client, {
    school_id: schoolId,
    rule_code: "LATE_ARRIVALS",
    source_module: "attendance",
    alert_type: "late_arrivals",
    severity: "important",
    title: "Retards fréquents",
    message: `${student.first_name} ${student.last_name} · ${student.matricule} — ${count} retards en 7 jours`,
    entity_type: "student",
    entity_id: studentId,
    dedup_key: `${schoolId}:LATE_ARRIVALS:student:${studentId}:${today}`,
    metadata: { count, window_days: 7 },
  });

  return alert ? { created: true, alertId: alert.id, title: alert.title, severity: alert.severity } : { created: false };
}

async function evaluateFeeOverdueRule(client: SupabaseClient, context: AlertRuleContext): Promise<AlertRuleResult> {
  const { schoolId, studentId } = context;
  if (!studentId) return { created: false };

  const { data: fee, error } = await client
    .from("student_fees")
    .select("id, amount, amount_paid, remaining")
    .eq("school_id", schoolId)
    .eq("student_id", studentId)
    .gt("remaining", 0)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error || !fee) return { created: false };

  const student = await loadStudent(client, schoolId, studentId);
  if (!student) return { created: false };

  const today = new Date().toISOString().slice(0, 10);
  const alert = await createAlert(client, {
    school_id: schoolId,
    rule_code: "FEE_OVERDUE",
    source_module: "finance",
    alert_type: "fee_overdue",
    severity: "important",
    title: "Frais scolaires impayés",
    message: `${student.first_name} ${student.last_name} · ${student.matricule} — reste à payer ${fee.remaining}`,
    entity_type: "student",
    entity_id: studentId,
    dedup_key: `${schoolId}:FEE_OVERDUE:student:${studentId}:${today}`,
    metadata: { fee_id: fee.id, remaining: fee.remaining },
  });

  return alert ? { created: true, alertId: alert.id, title: alert.title, severity: alert.severity } : { created: false };
}

export async function evaluateAlertRules(client: SupabaseClient, context: AlertRuleContext): Promise<AlertRuleResult[]> {
  const results: AlertRuleResult[] = [];

  switch (context.eventType) {
    case "STUDENT_ENTERED":
      if (context.payload?.late === true) {
        results.push(await evaluateLateArrivalRule(client, context));
      }
      break;
    case "FEE_OVERDUE_CHECK":
      results.push(await evaluateFeeOverdueRule(client, context));
      break;
    case "PAYMENT_RECORDED":
      // A new payment may resolve a fee alert; handled separately if needed.
      break;
  }

  return results.filter((r): r is AlertRuleResult => !!r);
}
