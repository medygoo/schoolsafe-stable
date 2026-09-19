import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface DashboardService {
  load(schoolId: string): Promise<unknown>;
}

function createServiceClient(supabaseUrl: string, serviceRoleKey: string): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

export function createDashboardService(supabaseUrl: string, serviceRoleKey: string): DashboardService {
  const client = createServiceClient(supabaseUrl, serviceRoleKey);

  return {
    async load(schoolId: string) {
      const now = new Date().toISOString();
      const today = new Date().toISOString().slice(0, 10);

      const [
        { count: criticalAlerts, data: latestAlerts },
        { count: openAlerts },
        { count: todayEvents },
        { data: activeStudents },
        { data: schoolSettings },
      ] = await Promise.all([
        client
          .from("alerts")
          .select("id, severity, title, status, detected_at", { count: "exact" })
          .eq("school_id", schoolId)
          .eq("severity", "critical")
          .order("detected_at", { ascending: false })
          .limit(5),
        client
          .from("alerts")
          .select("id", { count: "exact" })
          .eq("school_id", schoolId)
          .in("status", ["open", "acknowledged"]),
        client
          .from("security_events")
          .select("id", { count: "exact" })
          .eq("school_id", schoolId)
          .gte("occurred_at", `${today}T00:00:00Z`)
          .lte("occurred_at", `${today}T23:59:59Z`),
        client.rpc("count_operational_students", { p_school_id: schoolId }),
        client
          .from("school_settings")
          .select("lockdown_active")
          .eq("school_id", schoolId)
          .single(),
      ]);

      return {
        as_of: now,
        school_id: schoolId,
        date: today,
        freshness: {
          security: now,
          attendance: now,
          finance: now,
          pedagogy: now,
        },
        kpis: [
          { code: "critical_alerts", value: criticalAlerts ?? 0, unit: "count", drilldown: { route: "/pilotage/alerts", params: { severity: "critical" } } },
          { code: "open_alerts", value: openAlerts ?? 0, unit: "count", drilldown: { route: "/pilotage/alerts", params: { status: "open" } } },
          { code: "today_events", value: todayEvents ?? 0, unit: "count", drilldown: { route: "/security/events", params: {} } },
          { code: "active_students", value: activeStudents ?? 0, unit: "count", drilldown: { route: "/school/students", params: {} } },
        ],
        actions: {
          critical_alerts: criticalAlerts ?? 0,
          pending_approvals: 0,
        },
        latest_alerts: latestAlerts ?? [],
        lockdown_active: schoolSettings?.lockdown_active ?? false,
      };
    },
  };
}
