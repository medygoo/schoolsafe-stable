import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { NotificationService } from "../notifications/types.js";
import type {
  CreateAcademicYearPayload,
  InviteStaffPayload,
  ToggleCyclePayload,
  ToggleStaffActivePayload,
  UpdateAcademicYearPayload,
  UpdateSchoolSettingsPayload,
  UpdateStaffRolesPayload,
} from "./schema.js";

export interface SchoolSettings {
  identity: {
    name: string;
    name_en: string | null;
    legal_name: string | null;
    school_type: string | null;
    approval_code: string | null;
  };
  brand: {
    primary_color: string | null;
    accent_color: string | null;
    document_footer: string | null;
    logo_path: string | null;
  };
  contact: {
    country: string | null;
    province: string | null;
    city: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
    website_url: string | null;
    website_mode: string | null;
    public_news: string | null;
    public_gallery: string | null;
    public_honors: string | null;
  };
}

export interface StaffMember {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  auth_user_id: string | null;
  school_id: string;
  roles: Array<{ id: string; code: string; label: string }>;
}

export interface Role {
  id: string;
  code: string;
  label: string;
}

export interface Permission {
  id: string;
  code: string;
  description: string;
}

export interface SchoolService {
  getSettings(schoolId: string): Promise<SchoolSettings>;
  updateSettings(schoolId: string, payload: UpdateSchoolSettingsPayload): Promise<SchoolSettings>;
  listStaff(schoolId: string): Promise<StaffMember[]>;
  getStaffDetail(
    profileId: string,
    schoolId: string,
  ): Promise<StaffMember & { scopes: Array<{ scope_type: string; scope_id: string | null; label: string | null }> }>;
  inviteStaff(
    schoolId: string,
    actorProfileId: string,
    payload: InviteStaffPayload,
  ): Promise<{ profile_id: string; user_id: string }>;
  resendStaffInvite(profileId: string, schoolId: string): Promise<void>;
  updateStaffRoles(
    profileId: string,
    schoolId: string,
    actorProfileId: string,
    payload: UpdateStaffRolesPayload,
  ): Promise<void>;
  toggleStaffActive(
    profileId: string,
    schoolId: string,
    actorProfileId: string,
    payload: ToggleStaffActivePayload,
  ): Promise<void>;
  listRoles(): Promise<Role[]>;
  listPermissions(): Promise<Permission[]>;
  listAcademicYears(schoolId: string): Promise<Array<{ id: string; label: string; starts_on: string; ends_on: string; periods: string; is_active: boolean }>>;
  createAcademicYear(schoolId: string, payload: CreateAcademicYearPayload): Promise<{ id: string }>;
  updateAcademicYear(schoolId: string, yearId: string, payload: UpdateAcademicYearPayload): Promise<void>;
  activateAcademicYear(schoolId: string, yearId: string): Promise<void>;
  listCycles(schoolId: string): Promise<Array<{ cycle_key: string; cycle_name: string; is_active: boolean }>>;
  toggleCycle(schoolId: string, cycleKey: string, payload: ToggleCyclePayload): Promise<void>;
  saveLogoPath(schoolId: string, logoPath: string): Promise<void>;
  listStudentsByClass(
    schoolId: string,
    classId: string,
  ): Promise<
    Array<{
      id: string;
      matricule: string | null;
      first_name: string | null;
      last_name: string | null;
      photo_path: string | null;
    }>
  >;
}

function createServiceClient(supabaseUrl: string, serviceRoleKey: string): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function createSchoolService(
  supabaseUrl: string,
  serviceRoleKey: string | undefined,
  defaultPassword: string,
  notificationService?: NotificationService,
): SchoolService {
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for school service");
  }

  const serviceClient = createServiceClient(supabaseUrl, serviceRoleKey);

  return {
    async getSettings(schoolId: string): Promise<SchoolSettings> {
      const { data: school, error: schoolError } = await serviceClient
        .from("school")
        .select("name, name_en, legal_name, school_type, approval_code, primary_color, accent_color, document_footer, logo_path")
        .eq("id", schoolId)
        .single();

      if (schoolError || !school) {
        throw new Error(`Failed to load school: ${JSON.stringify(schoolError)}`);
      }

      const { data: contact, error: contactError } = await serviceClient
        .from("school_contacts")
        .select("country, province, city, address, email, phone, website_url, website_mode, public_news, public_gallery, public_honors")
        .eq("school_id", schoolId)
        .maybeSingle();

      if (contactError) {
        throw new Error(`Failed to load school contact: ${JSON.stringify(contactError)}`);
      }

      return {
        identity: {
          name: school.name,
          name_en: school.name_en ?? null,
          legal_name: school.legal_name ?? null,
          school_type: school.school_type ?? null,
          approval_code: school.approval_code ?? null,
        },
        brand: {
          primary_color: school.primary_color ?? null,
          accent_color: school.accent_color ?? null,
          document_footer: school.document_footer ?? null,
          logo_path: school.logo_path ?? null,
        },
        contact: {
          country: contact?.country ?? null,
          province: contact?.province ?? null,
          city: contact?.city ?? null,
          address: contact?.address ?? null,
          email: contact?.email ?? null,
          phone: contact?.phone ?? null,
          website_url: contact?.website_url ?? null,
          website_mode: contact?.website_mode ?? null,
          public_news: contact?.public_news ?? null,
          public_gallery: contact?.public_gallery ?? null,
          public_honors: contact?.public_honors ?? null,
        },
      };
    },

    async updateSettings(schoolId: string, payload: UpdateSchoolSettingsPayload): Promise<SchoolSettings> {
      const { data: schoolRow } = await serviceClient
        .from("school")
        .select("setup_completed_at")
        .eq("id", schoolId)
        .maybeSingle();
      let setupCompletedAt: string | null = schoolRow?.setup_completed_at ?? null;

      if (payload.identity) {
        const { error } = await serviceClient
          .from("school")
          .update({
            name: payload.identity.name,
            name_en: payload.identity.name_en,
            legal_name: payload.identity.legal_name,
            school_type: payload.identity.school_type,
            approval_code: payload.identity.approval_code,
          })
          .eq("id", schoolId);
        if (error) throw new Error(`Failed to update school identity: ${JSON.stringify(error)}`);
      }

      if (payload.brand) {
        const { error } = await serviceClient
          .from("school")
          .update({
            primary_color: payload.brand.primary_color,
            accent_color: payload.brand.accent_color,
            document_footer: payload.brand.document_footer,
            logo_path: payload.brand.logo_path,
          })
          .eq("id", schoolId);
        if (error) throw new Error(`Failed to update school brand: ${JSON.stringify(error)}`);
      }

      if (payload.contact) {
        const updatePayload: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(payload.contact)) {
          if (value !== undefined) updatePayload[key] = value === "" ? null : value;
        }
        const { error } = await serviceClient
          .from("school_contacts")
          .update(updatePayload)
          .eq("school_id", schoolId);
        if (error) throw new Error(`Failed to update school contact: ${JSON.stringify(error)}`);
      }

      if ((payload.identity || payload.brand || payload.contact) && setupCompletedAt === null) {
        const { error } = await serviceClient
          .from("school")
          .update({ setup_completed_at: new Date().toISOString() })
          .eq("id", schoolId);
        if (error) throw new Error(`Failed to set setup completed at: ${JSON.stringify(error)}`);
      }

      return this.getSettings(schoolId);
    },

    async listStaff(schoolId: string): Promise<StaffMember[]> {
      const { data: profiles, error } = await serviceClient
        .from("profiles")
        .select("id, first_name, last_name, display_name, phone, is_active, auth_user_id, school_id")
        .eq("school_id", schoolId)
        .order("display_name");

      if (error || !profiles) {
        throw new Error(`Failed to list staff: ${JSON.stringify(error)}`);
      }

      const profileIds = profiles.map((p) => p.id);

      const [{ data: profileRoles }, { data: roles }, { data: users }] = await Promise.all([
        serviceClient.from("profile_roles").select("profile_id, role_id").in("profile_id", profileIds),
        serviceClient.from("roles").select("id, code, label"),
        serviceClient.auth.admin.listUsers(),
      ]);

      const roleMap = new Map(roles?.map((r) => [r.id, r]) ?? []);
      const userEmails = new Map(users?.users.map((u) => [u.id, u.email]) ?? []);

      const rolesByProfile = new Map<string, Array<{ id: string; code: string; label: string }>>();
      for (const pr of profileRoles ?? []) {
        const role = roleMap.get(pr.role_id);
        if (!role) continue;
        if (!rolesByProfile.has(pr.profile_id)) rolesByProfile.set(pr.profile_id, []);
        rolesByProfile.get(pr.profile_id)!.push({ id: role.id, code: role.code, label: role.label });
      }

      return profiles.map((p) => ({
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        display_name: p.display_name,
        email: userEmails.get(p.auth_user_id) ?? "",
        phone: p.phone,
        is_active: p.is_active,
        auth_user_id: p.auth_user_id,
        school_id: p.school_id,
        roles: rolesByProfile.get(p.id) ?? [],
      }));
    },

    async getStaffDetail(
      profileId: string,
      schoolId: string,
    ): Promise<StaffMember & { scopes: Array<{ scope_type: string; scope_id: string | null; label: string | null }> }> {
      const { data: profile, error } = await serviceClient
        .from("profiles")
        .select("id, first_name, last_name, display_name, phone, is_active, auth_user_id, school_id")
        .eq("id", profileId)
        .single();
      if (error || !profile) throw new Error(`Failed to load staff detail: ${JSON.stringify(error)}`);
      if (profile.school_id !== schoolId) {
        throw new Error("Staff member does not belong to this school");
      }

      const [{ data: profileRoles }, { data: roles }, { data: users }, { data: scopes }] = await Promise.all([
        serviceClient.from("profile_roles").select("profile_id, role_id").eq("profile_id", profileId),
        serviceClient.from("roles").select("id, code, label"),
        serviceClient.auth.admin.listUsers(),
        serviceClient.from("scope_assignments").select("scope_type, scope_id, label").eq("profile_id", profileId),
      ]);

      const roleMap = new Map(roles?.map((r) => [r.id, r]) ?? []);
      const userEmails = new Map(users?.users.map((u) => [u.id, u.email]) ?? []);

      const memberRoles: Array<{ id: string; code: string; label: string }> = [];
      for (const pr of profileRoles ?? []) {
        const role = roleMap.get(pr.role_id);
        if (role) memberRoles.push({ id: role.id, code: role.code, label: role.label });
      }

      return {
        id: profile.id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        display_name: profile.display_name,
        email: userEmails.get(profile.auth_user_id) ?? "",
        phone: profile.phone,
        is_active: profile.is_active,
        auth_user_id: profile.auth_user_id,
        school_id: profile.school_id,
        roles: memberRoles,
        scopes: scopes ?? [],
      };
    },

    async resendStaffInvite(profileId: string, schoolId: string): Promise<void> {
      const detail = await this.getStaffDetail(profileId, schoolId);
      if (!detail.email) throw new Error("No email for staff member");
      if (!detail.auth_user_id) throw new Error("No auth user for staff member");

      const newPassword = randomUUID().replace(/-/g, "").slice(0, 12);
      const { error: updateError } = await serviceClient.auth.admin.updateUserById(detail.auth_user_id, {
        password: newPassword,
      });
      if (updateError) throw new Error(`Failed to reset password: ${JSON.stringify(updateError)}`);

      if (notificationService) {
        await notificationService.queue({
          schoolId: detail.school_id as string,
          userId: detail.auth_user_id,
          channel: "EMAIL",
          templateKey: "STAFF_INVITED",
          message: `Bienvenue sur SchoolSafe. Vos identifiants : email ${detail.email}, mot de passe temporaire ${newPassword}.`,
          recipientEmail: detail.email,
        });
      }
    },

    async inviteStaff(
      schoolId: string,
      actorProfileId: string,
      payload: InviteStaffPayload,
    ): Promise<{ profile_id: string; user_id: string }> {
      const displayName = `${payload.first_name} ${payload.last_name}`;

      const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
        email: payload.email,
        password: defaultPassword,
        email_confirm: true,
        user_metadata: { first_name: payload.first_name, last_name: payload.last_name },
      });

      if (authError || !authData.user) {
        throw new Error(`Failed to create user: ${JSON.stringify(authError)}`);
      }

      const { data: profile, error: profileError } = await serviceClient
        .from("profiles")
        .insert({
          auth_user_id: authData.user.id,
          school_id: schoolId,
          display_name: displayName,
          first_name: payload.first_name,
          last_name: payload.last_name,
          phone: payload.phone,
          is_active: true,
        })
        .select("id")
        .single();

      if (profileError || !profile) {
        throw new Error(`Failed to create profile: ${JSON.stringify(profileError)}`);
      }

      const roleRows = payload.role_ids.map((roleId) => ({
        profile_id: profile.id,
        role_id: roleId,
      }));

      const { error: rolesError } = await serviceClient.from("profile_roles").insert(roleRows);
      if (rolesError) {
        throw new Error(`Failed to assign roles: ${JSON.stringify(rolesError)}`);
      }

      const { error: auditError } = await serviceClient.from("audit_events").insert({
        school_id: schoolId,
        actor_profile_id: actorProfileId,
        event_type: "staff.invited",
        payload: { invited_profile_id: profile.id, role_ids: payload.role_ids },
      });
      if (auditError) {
        throw new Error(`Failed to record audit event: ${JSON.stringify(auditError)}`);
      }

      if (notificationService) {
        await notificationService.queue({
          schoolId,
          userId: authData.user.id,
          channel: "EMAIL",
          templateKey: "STAFF_INVITED",
          message: `Bienvenue sur SchoolSafe. Vos identifiants : email ${payload.email}, mot de passe temporaire ${defaultPassword}.`,
          recipientEmail: payload.email,
        });
      }

      return { profile_id: profile.id, user_id: authData.user.id };
    },

    async updateStaffRoles(
      profileId: string,
      schoolId: string,
      actorProfileId: string,
      payload: UpdateStaffRolesPayload,
    ): Promise<void> {
      const { error: deleteError } = await serviceClient
        .from("profile_roles")
        .delete()
        .eq("profile_id", profileId);
      if (deleteError) throw new Error(`Failed to clear roles: ${JSON.stringify(deleteError)}`);

      const roleRows = payload.role_ids.map((roleId) => ({
        profile_id: profileId,
        role_id: roleId,
      }));

      const { error: insertError } = await serviceClient.from("profile_roles").insert(roleRows);
      if (insertError) throw new Error(`Failed to update roles: ${JSON.stringify(insertError)}`);

      const { error: auditError } = await serviceClient.from("audit_events").insert({
        school_id: schoolId,
        actor_profile_id: actorProfileId,
        event_type: "staff.roles_changed",
        payload: { new_role_ids: payload.role_ids },
      });
      if (auditError) {
        throw new Error(`Failed to record audit event: ${JSON.stringify(auditError)}`);
      }
    },

    async toggleStaffActive(
      profileId: string,
      schoolId: string,
      actorProfileId: string,
      payload: ToggleStaffActivePayload,
    ): Promise<void> {
      const { error } = await serviceClient
        .from("profiles")
        .update({ is_active: payload.is_active })
        .eq("id", profileId);
      if (error) throw new Error(`Failed to toggle staff active state: ${JSON.stringify(error)}`);

      const { error: auditError } = await serviceClient.from("audit_events").insert({
        school_id: schoolId,
        actor_profile_id: actorProfileId,
        event_type: "staff.toggled",
        payload: { is_active: payload.is_active },
      });
      if (auditError) {
        throw new Error(`Failed to record audit event: ${JSON.stringify(auditError)}`);
      }
    },

    async listRoles(): Promise<Role[]> {
      const { data, error } = await serviceClient
        .from("roles")
        .select("id, code, label")
        .order("label");
      if (error || !data) throw new Error(`Failed to list roles: ${JSON.stringify(error)}`);
      return data;
    },

    async listPermissions(): Promise<Permission[]> {
      const { data, error } = await serviceClient
        .from("permissions")
        .select("id, code, description")
        .order("code");
      if (error || !data) throw new Error(`Failed to list permissions: ${JSON.stringify(error)}`);
      return data;
    },

    async listAcademicYears(schoolId: string) {
      const { data, error } = await serviceClient
        .from("academic_years")
        .select("id, label, starts_on, ends_on, periods, is_active")
        .eq("school_id", schoolId)
        .order("starts_on", { ascending: false });
      if (error || !data) throw new Error(`Failed to list academic years: ${JSON.stringify(error)}`);
      return data.map((y) => ({ ...y, starts_on: String(y.starts_on), ends_on: String(y.ends_on) }));
    },

    async createAcademicYear(schoolId: string, payload: CreateAcademicYearPayload) {
      const { data, error } = await serviceClient
        .from("academic_years")
        .insert({ school_id: schoolId, ...payload })
        .select("id")
        .single();
      if (error || !data) throw new Error(`Failed to create academic year: ${JSON.stringify(error)}`);
      return { id: data.id };
    },

    async updateAcademicYear(schoolId: string, yearId: string, payload: UpdateAcademicYearPayload) {
      const { error } = await serviceClient
        .from("academic_years")
        .update(payload)
        .eq("id", yearId)
        .eq("school_id", schoolId);
      if (error) throw new Error(`Failed to update academic year: ${JSON.stringify(error)}`);
    },

    async activateAcademicYear(schoolId: string, yearId: string) {
      const { error, count } = await serviceClient
        .from("academic_years")
        .update({ is_active: true }, { count: "exact" })
        .eq("id", yearId)
        .eq("school_id", schoolId);
      if (error) throw new Error(`Failed to activate academic year: ${JSON.stringify(error)}`);
      if (count === 0) {
        throw new Error("Academic year not found or does not belong to this school");
      }
      await serviceClient.rpc("deactivate_other_academic_years", {
        p_school_id: schoolId,
        p_active_year_id: yearId,
      });
    },

    async listCycles(schoolId: string) {
      const { data, error } = await serviceClient
        .from("school_cycles")
        .select("cycle_key, cycle_name, is_active")
        .eq("school_id", schoolId)
        .order("cycle_key");
      if (error || !data) throw new Error(`Failed to list cycles: ${JSON.stringify(error)}`);
      if (data.length === 0) {
        const defaults = [
          { school_id: schoolId, cycle_key: "nursery", cycle_name: "Maternelle", is_active: true },
          { school_id: schoolId, cycle_key: "primary", cycle_name: "Primaire", is_active: true },
          { school_id: schoolId, cycle_key: "secondary", cycle_name: "Secondaire", is_active: true },
        ];
        const { data: inserted, error: insertError } = await serviceClient
          .from("school_cycles")
          .insert(defaults)
          .select("cycle_key, cycle_name, is_active");
        if (insertError || !inserted) throw new Error(`Failed to seed cycles: ${JSON.stringify(insertError)}`);
        return inserted;
      }
      return data;
    },

    async toggleCycle(schoolId: string, cycleKey: string, payload: ToggleCyclePayload) {
      const { error } = await serviceClient
        .from("school_cycles")
        .update({ is_active: payload.is_active })
        .eq("school_id", schoolId)
        .eq("cycle_key", cycleKey);
      if (error) throw new Error(`Failed to toggle cycle: ${JSON.stringify(error)}`);
    },

    async saveLogoPath(schoolId: string, logoPath: string) {
      const { error } = await serviceClient.from("school").update({ logo_path: logoPath }).eq("id", schoolId);
      if (error) throw new Error(`Failed to save logo path: ${JSON.stringify(error)}`);
    },

    async listStudentsByClass(schoolId: string, classId: string) {
      const { data, error } = await serviceClient
        .from("students")
        .select("id, matricule, first_name, last_name, photo_path")
        .eq("school_id", schoolId)
        .eq("lifecycle_status", "active")
        .eq("class_id", classId)
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true });
      if (error) throw new Error(`Failed to list students: ${JSON.stringify(error)}`);
      return data ?? [];
    },
  };
}
