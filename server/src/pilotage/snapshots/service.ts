import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SnapshotIndicator {
  indicator_code: string;
  value: number;
  unit: string;
  dimensions?: Record<string, unknown>;
}

export interface SnapshotService {
  capture(schoolId: string): Promise<SnapshotIndicator[]>;
  getTrend(schoolId: string, indicatorCode: string, days: number): Promise<{ snapshot_date: string; value: number }[]>;
}

function createServiceClient(supabaseUrl: string, serviceRoleKey: string): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function createSnapshotService(supabaseUrl: string, serviceRoleKey: string): SnapshotService {
  const client = createServiceClient(supabaseUrl, serviceRoleKey);

  return {
    async capture(schoolId) {
      const today = new Date().toISOString().slice(0, 10);

      const [
        { count: openAlerts },
        { count: todayEvents },
        { data: activeStudents },
        { count: pendingApprovals },
        { count: todayPayments },
      ] = await Promise.all([
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
          .from("approval_requests")
          .select("id", { count: "exact" })
          .eq("school_id", schoolId)
          .eq("status", "pending"),
        client
          .from("fee_payments")
          .select("id", { count: "exact" })
          .eq("school_id", schoolId)
          .gte("created_at", `${today}T00:00:00Z`)
          .lte("created_at", `${today}T23:59:59Z`),
      ]);

      const indicators: SnapshotIndicator[] = [
        { indicator_code: "open_alerts", value: openAlerts ?? 0, unit: "count" },
        { indicator_code: "today_events", value: todayEvents ?? 0, unit: "count" },
        { indicator_code: "active_students", value: activeStudents ?? 0, unit: "count" },
        { indicator_code: "pending_approvals", value: pendingApprovals ?? 0, unit: "count" },
        { indicator_code: "today_payments", value: todayPayments ?? 0, unit: "count" },
      ];

      const rows = indicators.map((i) => ({
        school_id: schoolId,
        snapshot_date: today,
        indicator_code: i.indicator_code,
        value: i.value,
        unit: i.unit,
        dimensions: i.dimensions ?? {},
      }));

      const { error } = await client.from("indicator_snapshots").upsert(rows, { onConflict: "school_id, snapshot_date, indicator_code, dimensions" });
      if (error) throw new Error(`Failed to save snapshots: ${error.message}`);

      return indicators;
    },

    async getTrend(schoolId, indicatorCode, days) {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await client
        .from("indicator_snapshots")
        .select("snapshot_date, value")
        .eq("school_id", schoolId)
        .eq("indicator_code", indicatorCode)
        .gte("snapshot_date", since)
        .order("snapshot_date", { ascending: true });
      if (error) throw new Error(`Failed to load trend: ${error.message}`);
      return (data ?? []).map((row) => ({ snapshot_date: String(row.snapshot_date), value: Number(row.value) }));
    },
  };
}
