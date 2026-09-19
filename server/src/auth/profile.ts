import { createUserContextClient } from "./supabase.js";

export async function resolveProfileId(
  supabaseUrl: string,
  anonKey: string,
  token: string
): Promise<string | null> {
  const client = createUserContextClient(supabaseUrl, anonKey, token);
  const { data, error } = await client
    .from("profiles")
    .select("id")
    .maybeSingle();
  if (error || !data) return null;
  return data.id as string;
}

export async function resolveProfileAndSchool(
  supabaseUrl: string,
  anonKey: string,
  token: string
): Promise<{ profileId: string | null; schoolId: string | null }> {
  const client = createUserContextClient(supabaseUrl, anonKey, token);
  const { data, error } = await client
    .from("profiles")
    .select("id, school_id")
    .maybeSingle();
  if (error || !data) return { profileId: null, schoolId: null };
  return { profileId: data.id as string, schoolId: data.school_id as string };
}
