// SchoolSafe — Native School Settings Service (PostgreSQL)
// Replaces Supabase-based school/service.ts for "Mon école" screen.
// All queries use withRequestContext; school_id comes from session only.
import type { PoolClient } from "pg";
import type { BusinessPool } from "../db/pool.js";
import { withRequestContext, type RequestContext } from "../db/context.js";

export interface SchoolSettings {
  identity: {
    name: string | null;
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
    public_news: boolean | null;
    public_gallery: boolean | null;
    public_honors: boolean | null;
  };
}

export interface UpdateSchoolSettingsPayload {
  identity?: {
    name?: string | null;
    name_en?: string | null;
    legal_name?: string | null;
    school_type?: string | null;
    approval_code?: string | null;
  };
  brand?: {
    primary_color?: string | null;
    accent_color?: string | null;
    document_footer?: string | null;
    logo_path?: string | null;
  };
  contact?: {
    country?: string | null;
    province?: string | null;
    city?: string | null;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
    website_url?: string | null;
    website_mode?: string | null;
    public_news?: boolean | null;
    public_gallery?: boolean | null;
    public_honors?: boolean | null;
  };
}

export interface SchoolNativeService {
  getSettings(context: RequestContext): Promise<SchoolSettings>;
  updateSettings(context: RequestContext, payload: UpdateSchoolSettingsPayload): Promise<SchoolSettings>;
}

export function createSchoolNativeService(businessPool: BusinessPool): SchoolNativeService {
  return {
    async getSettings(context: RequestContext): Promise<SchoolSettings> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        const schoolRes = await client.query(
          `select name, name_en, legal_name, school_type, approval_code,
                  primary_color, accent_color, document_footer, logo_path
           from app.schools
           where id = $1`,
          [context.schoolId],
        );
        if (schoolRes.rowCount === 0) {
          throw new Error("SCHOOL_NOT_FOUND");
        }
        const school = schoolRes.rows[0];

        const contactRes = await client.query(
          `select country, province, city, address, email, phone,
                  website_url, website_mode, public_news, public_gallery, public_honors
           from app.school_contacts
           where school_id = $1`,
          [context.schoolId],
        );
        const contact = contactRes.rows[0] ?? {};

        return {
          identity: {
            name: school.name ?? null,
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
            country: contact.country ?? null,
            province: contact.province ?? null,
            city: contact.city ?? null,
            address: contact.address ?? null,
            email: contact.email ?? null,
            phone: contact.phone ?? null,
            website_url: contact.website_url ?? null,
            website_mode: contact.website_mode ?? null,
            public_news: contact.public_news ?? null,
            public_gallery: contact.public_gallery ?? null,
            public_honors: contact.public_honors ?? null,
          },
        };
      });
    },

    async updateSettings(context: RequestContext, payload: UpdateSchoolSettingsPayload): Promise<SchoolSettings> {
      return withRequestContext(businessPool, context, async (client: PoolClient) => {
        // Update identity fields on app.schools
        if (payload.identity) {
          const sets: string[] = [];
          const vals: unknown[] = [];
          let idx = 1;
          for (const [key, value] of Object.entries(payload.identity)) {
            if (value !== undefined) {
              sets.push(`${key} = $${idx++}`);
              vals.push(value === "" ? null : value);
            }
          }
          if (sets.length > 0) {
            vals.push(context.schoolId);
            await client.query(
              `update app.schools set ${sets.join(", ")} where id = $${idx}`,
              vals,
            );
          }
        }

        // Update brand fields on app.schools
        if (payload.brand) {
          const sets: string[] = [];
          const vals: unknown[] = [];
          let idx = 1;
          for (const [key, value] of Object.entries(payload.brand)) {
            if (value !== undefined) {
              sets.push(`${key} = $${idx++}`);
              vals.push(value === "" ? null : value);
            }
          }
          if (sets.length > 0) {
            vals.push(context.schoolId);
            await client.query(
              `update app.schools set ${sets.join(", ")} where id = $${idx}`,
              vals,
            );
          }
        }

        // Upsert contact fields on app.school_contacts
        if (payload.contact) {
          const existingContact = await client.query(
            `select 1 from app.school_contacts where school_id = $1`,
            [context.schoolId],
          );

          const contactFields: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(payload.contact)) {
            if (value !== undefined) {
              contactFields[key] = value === "" ? null : value;
            }
          }

          if (existingContact.rowCount === 0 && Object.keys(contactFields).length > 0) {
            const cols = ["school_id", ...Object.keys(contactFields)];
            const placeholders = cols.map((_, i) => `$${i + 1}`);
            const vals: unknown[] = [context.schoolId, ...Object.values(contactFields)];
            await client.query(
              `insert into app.school_contacts (${cols.join(", ")}) values (${placeholders.join(", ")})`,
              vals,
            );
          } else if (Object.keys(contactFields).length > 0) {
            const sets: string[] = [];
            const vals: unknown[] = [];
            let idx = 1;
            for (const [key, value] of Object.entries(contactFields)) {
              sets.push(`${key} = $${idx++}`);
              vals.push(value);
            }
            vals.push(context.schoolId);
            await client.query(
              `update app.school_contacts set ${sets.join(", ")} where school_id = $${idx}`,
              vals,
            );
          }
        }

        // Set setup_completed_at if not already set and something was updated
        if (payload.identity || payload.brand || payload.contact) {
          await client.query(
            `update app.schools set setup_completed_at = coalesce(setup_completed_at, now()) where id = $1`,
            [context.schoolId],
          );
        }

        // Return refreshed settings within the same request context
        const schoolRes = await client.query(
          `select name, name_en, legal_name, school_type, approval_code,
                  primary_color, accent_color, document_footer, logo_path
           from app.schools where id = $1`,
          [context.schoolId],
        );
        const school = schoolRes.rows[0];
        const contactRes = await client.query(
          `select country, province, city, address, email, phone,
                  website_url, website_mode, public_news, public_gallery, public_honors
           from app.school_contacts where school_id = $1`,
          [context.schoolId],
        );
        const contact = contactRes.rows[0] ?? {};
        return {
          identity: {
            name: school.name ?? null,
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
            country: contact.country ?? null,
            province: contact.province ?? null,
            city: contact.city ?? null,
            address: contact.address ?? null,
            email: contact.email ?? null,
            phone: contact.phone ?? null,
            website_url: contact.website_url ?? null,
            website_mode: contact.website_mode ?? null,
            public_news: contact.public_news ?? null,
            public_gallery: contact.public_gallery ?? null,
            public_honors: contact.public_honors ?? null,
          },
        };
      });
    },
  };
}