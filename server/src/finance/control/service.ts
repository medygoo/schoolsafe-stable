import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateFeeStructureInput,
  CreateFeeControlCampaignInput,
  CreateFeeControlScanInput,
} from "./schema.js";

export interface FeeControlService {
  listFeeStructures(schoolId: string): Promise<unknown[]>;
  createFeeStructure(schoolId: string, profileId: string, input: CreateFeeStructureInput): Promise<unknown>;
  listStudentFees(schoolId: string, options: { studentId?: string; status?: string }): Promise<unknown[]>;
  listCampaigns(schoolId: string): Promise<unknown[]>;
  createCampaign(schoolId: string, profileId: string, input: CreateFeeControlCampaignInput): Promise<unknown>;
  createScan(schoolId: string, profileId: string, input: CreateFeeControlScanInput): Promise<unknown>;
}

function createServiceClient(supabaseUrl: string, serviceRoleKey: string): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

export function createFeeControlService(supabaseUrl: string, serviceRoleKey: string): FeeControlService {
  const client = createServiceClient(supabaseUrl, serviceRoleKey);

  return {
    async listFeeStructures(schoolId) {
      const { data, error } = await client
        .from("fee_structures")
        .select("*")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(`Failed to list fee structures: ${error.message}`);
      return data ?? [];
    },

    async createFeeStructure(schoolId, profileId, input) {
      const { data, error } = await client
        .from("fee_structures")
        .insert({
          school_id: schoolId,
          academic_year_id: input.academic_year_id ?? null,
          cycle_key: input.cycle_key,
          label: input.label,
          amount: input.amount,
          currency: input.currency,
          due_date: input.due_date ?? null,
          is_active: input.is_active,
        })
        .select("*")
        .single();
      if (error || !data) throw new Error(`Failed to create fee structure: ${error?.message}`);
      return data;
    },

    async listStudentFees(schoolId, options) {
      let query = client.from("student_fees").select("*, students!inner(id, matricule, first_name, last_name)").eq("school_id", schoolId);
      if (options.studentId) query = query.eq("student_id", options.studentId);
      if (options.status) query = query.eq("status", options.status);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw new Error(`Failed to list student fees: ${error.message}`);
      return data ?? [];
    },

    async listCampaigns(schoolId) {
      const { data, error } = await client
        .from("fee_control_campaigns")
        .select("*, fee_structures(label, amount, currency)")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(`Failed to list campaigns: ${error.message}`);
      return data ?? [];
    },

    async createCampaign(schoolId, profileId, input) {
      const { data: campaign, error } = await client
        .from("fee_control_campaigns")
        .insert({
          school_id: schoolId,
          fee_structure_id: input.fee_structure_id,
          label: input.label,
          description: input.description ?? null,
          classes: input.classes,
          starts_at: input.starts_at,
          ends_at: input.ends_at,
          status: "draft",
          created_by: profileId,
        })
        .select("*")
        .single();
      if (error || !campaign) throw new Error(`Failed to create campaign: ${error?.message}`);

      if (input.assignees.length > 0) {
        const { error: assignError } = await client.from("fee_control_assignees").insert(
          input.assignees.map((profileId) => ({ campaign_id: campaign.id, profile_id: profileId })),
        );
        if (assignError) throw new Error(`Failed to assign controllers: ${assignError.message}`);
      }

      return campaign;
    },

    async createScan(schoolId, profileId, input) {
      const { data: campaign, error: campaignError } = await client
        .from("fee_control_campaigns")
        .select("id, fee_structure_id, status")
        .eq("id", input.campaign_id)
        .eq("school_id", schoolId)
        .single();
      if (campaignError || !campaign) throw new Error(`Campaign not found: ${campaignError?.message}`);
      if (campaign.status !== "published") throw new Error("Campaign is not published");

      const { data: studentFee, error: feeError } = await client
        .from("student_fees")
        .select("id, status")
        .eq("student_id", input.student_id)
        .eq("fee_structure_id", campaign.fee_structure_id)
        .eq("school_id", schoolId)
        .maybeSingle();
      if (feeError) throw new Error(`Failed to lookup student fee: ${feeError.message}`);

      const studentFeeStatus = (studentFee?.status as string) ?? "pending";

      const { data: scan, error } = await client
        .from("fee_control_scans")
        .insert({
          school_id: schoolId,
          campaign_id: input.campaign_id,
          student_id: input.student_id,
          scanned_by: profileId,
          location_id: input.location_id ?? null,
          student_fee_status: studentFeeStatus,
          result: input.result,
          notes: input.notes ?? null,
        })
        .select("*")
        .single();
      if (error || !scan) throw new Error(`Failed to create scan: ${error?.message}`);

      return scan;
    },
  };
}
