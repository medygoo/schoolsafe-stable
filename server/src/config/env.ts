import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  SETUP_TOKEN: z.string().min(1).optional(),
  R2_ENDPOINT: z.string().url().optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET_CARDS: z.string().min(1).default("cards"),
  CONTROL_APP_URL: z.string().url().optional(),
  CONTROL_APP_INSTANCE_ID: z.string().min(1).optional(),
  CONTROL_APP_HMAC_SECRET: z.string().min(1).optional(),
  // Clé PUBLIQUE Ed25519 de SchoolSafe Control (jamais de secret partagé ici).
  CONTROL_LICENSE_PUBLIC_KEY: z.string().min(1).optional(),
  CARD_HMAC_SECRET: z.string().min(1).optional(),
  // Lot 3 : génération automatique du lot ZIP après soumission réussie.
  CARDS_AUTO_BATCH: z.coerce.boolean().default(false),
  ZOHO_MAIL_API_KEY: z.string().min(1).optional(),
  ZOHO_MAIL_SENDER_EMAIL: z.string().email().optional(),
  ZOHO_MAIL_SENDER_NAME: z.string().min(1).default("SchoolSafe"),
  ZOHO_MAIL_REGION: z.enum(["com", "eu", "in", "com.cn", "com.au"]).default("com"),
  BREVO_API_KEY: z.string().min(1).optional(),
  BREVO_SENDER_EMAIL: z.string().email().optional(),
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z.string().min(1).default("mailto:schoolsafe@example.com"),
  DEFAULT_STAFF_PASSWORD: z.string().min(8).default("SchoolSafe2026!"),
  // PostgreSQL direct (baseline VPS) — requis dès que le pool est utilisé.
  PGHOST: z.string().min(1).optional(),
  PGPORT: z.coerce.number().int().min(1).max(65535).default(5432),
  PGDATABASE: z.string().min(1).optional(),
  PGUSER: z.string().min(1).optional(),
  PGPASSWORD: z.string().min(1).optional(),
  // Credentials du rôle d'authentification dédié (api.auth_* uniquement).
  PGAUTH_USER: z.string().min(1).optional(),
  PGAUTH_PASSWORD: z.string().min(1).optional(),
  PG_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1000).default(15000),
  PG_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  // JASPE 2.5D — relais IA via le Worker Cloudflare. Jamais de clé ici :
  // le secret vit dans les secrets du Worker (wrangler secret), pas sur le VPS.
  JASPE_WORKER_URL: z.string().url().optional(),
  JASPE_CHAT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(12000),
  JASPE_RATE_PER_MINUTE: z.coerce.number().int().min(1).max(600).default(20),
});

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(input: NodeJS.ProcessEnv): AppEnv {
  return envSchema.parse(input);
}
