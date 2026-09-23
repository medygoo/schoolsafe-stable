import {createBrevoEmailService} from "./email/service.js";
import {createRecoveryDelivery} from "./authnative/recovery-delivery.js";
import {createMachineContextResolver} from "./devicehub/machine-context.js";
import { buildApp } from "./app.js";
import type { AppEnv } from "./config/env.js";
import type { VerifiedPools } from "./db/startpools.js";
import { createPgAuthDatabase } from "./db/auth-adapter.js";
import { createAuthNativeService } from "./authnative/service.js";
import { createStudentsNativeService } from "./studentsnative/service.js";
import { createTrialNativeService } from "./trialnative/service.js";
import { createSessionNativeService } from "./sessionnative/service.js";
import { createAccessNativeService } from "./accessnative/service.js";
import { createJaspeNativeService } from "./jaspenative/service.js";
import { createLicenseNativeService } from "./licensenative/service.js";
import { createControlLicenseClient } from "./licensenative/control-client.js";
import { registerLicenseGate } from "./licensenative/gate.js";
import { createSetupNativeService } from "./setup/service.js";
import { createFinanceNativeService } from "./financenative/service.js";
import { createPedagogyNativeService } from "./pedagogynative/service.js";
import { createControlPrintNativeService } from "./controlprintnative/service.js";
import { createCardsNativeService } from "./cardsnative/service.js";
import { createCardsBatchService } from "./cardsnative/batches.js";
import { createFamilyNativeService } from "./familynative/service.js";
import { createFamilyImportService } from "./familynative/import.js";
import { createDeviceHubService } from "./devicehub/service.js";

/** Assemble uniquement les services qui utilisent les sessions et pools du VPS. */
export function buildNativeApp(env: AppEnv, pools: VerifiedPools) {
  const recovery = env.BREVO_API_KEY && env.BREVO_SENDER_EMAIL && env.AUTH_RECOVERY_URL
    ? createRecoveryDelivery(createBrevoEmailService({apiKey: env.BREVO_API_KEY, senderEmail: env.BREVO_SENDER_EMAIL}), env.AUTH_RECOVERY_URL) : undefined;
  const authService = createAuthNativeService({ db: createPgAuthDatabase(pools.authPool), emailDelivery: recovery });
  const controlConfig = env.CONTROL_APP_URL && env.CONTROL_APP_INSTANCE_ID && env.CONTROL_APP_HMAC_SECRET
    ? { url: env.CONTROL_APP_URL, instanceId: env.CONTROL_APP_INSTANCE_ID, hmacSecret: env.CONTROL_APP_HMAC_SECRET }
    : undefined;
  const licenseService = env.CONTROL_LICENSE_PUBLIC_KEY
    ? createLicenseNativeService(
        pools.businessPool,
        controlConfig ? createControlLicenseClient(controlConfig) : undefined,
        env.CONTROL_LICENSE_PUBLIC_KEY,
      )
    : undefined;
  const app = buildApp({
    readinessProbe: async () => {
      try {
        await Promise.all([pools.authPool.query("select 1"), pools.businessPool.query("select 1")]);
        return { ready: true };
      } catch {
        return { ready: false, dependency: "postgresql" };
      }
    },
    authNative: { service: authService, cookieSecure: env.NODE_ENV === "production" },
    studentsNative: { authService, service: createStudentsNativeService(pools.businessPool) },
    trialNative: { authService, service: createTrialNativeService(pools.businessPool) },
    sessionNative: { authService, service: createSessionNativeService(pools.businessPool) },
    accessNative: { authService, service: createAccessNativeService(pools.businessPool) },
    jaspeNative: { authService, businessPool: pools.businessPool, service: createJaspeNativeService({
      workerUrl: env.JASPE_WORKER_URL,
      timeoutMs: env.JASPE_CHAT_TIMEOUT_MS,
      ratePerMinute: env.JASPE_RATE_PER_MINUTE,
    }) },
    licenseNative: licenseService ? { authService, service: licenseService } : undefined,
    setup: { service: createSetupNativeService(pools.authPool, pools.businessPool, env.SETUP_TOKEN) },
    financeNative: { authService, service: createFinanceNativeService(pools.businessPool) },
    pedagogyNative: { authService, service: createPedagogyNativeService(pools.businessPool) },
    controlPrintNative: {
      authService,
      businessPool: pools.businessPool,
      controlConfig,
      service: createControlPrintNativeService(pools.businessPool, controlConfig),
    },
    cardsNative: {
      authService,
      service: createCardsNativeService(pools.businessPool, env.R2_ENDPOINT ? {
        endpoint: env.R2_ENDPOINT,
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
        bucket: env.R2_BUCKET_CARDS ?? "cards",
      } : undefined, controlConfig),
      batchService: createCardsBatchService(pools.businessPool, env.R2_ENDPOINT ? {
        endpoint: env.R2_ENDPOINT,
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
        bucket: env.R2_BUCKET_CARDS ?? "cards",
      } : undefined, controlConfig),
      autoBatchEnabled: env.CARDS_AUTO_BATCH === true,
    },
    familyNative: {
      authService,
      service: createFamilyNativeService(pools.businessPool),
      importService: createFamilyImportService(pools.businessPool),
    },
    deviceHub: {
      authService,
      service: createDeviceHubService(pools.businessPool, controlConfig),
    },
    deviceHubMachine: controlConfig ? {
      service: createDeviceHubService(pools.businessPool, controlConfig),
      hmacSecret: controlConfig.hmacSecret,
      expectedInstanceId: controlConfig.instanceId,
      // École résolue côté serveur uniquement — jamais depuis la requête.
      resolveContext: createMachineContextResolver(pools.businessPool),
    } : undefined,
  });
  registerLicenseGate(app, {authService, licenseService});
  app.addHook("onClose", async () => {
    await Promise.allSettled([pools.authPool.end(), pools.businessPool.end()]);
  });
  return app;
}
