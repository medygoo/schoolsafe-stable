import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { registerBootstrapRoutes, type BootstrapRouteDependencies } from "./bootstrap/routes.js";
import { registerCardRoutes, type CardRouteDependencies } from "./cards/routes.js";
import { defaultReadinessProbe, type ReadinessProbe } from "./health/readiness.js";
import { SchoolSafeError, type ApiErrorBody } from "./http/errors.js";
import { newRequestId } from "./http/request-id.js";
import { registerSetupRoutes, type SetupRouteDependencies } from "./setup/routes.js";
import { registerSecurityRoutes, type SecurityRouteDependencies } from "./security/routes.js";
import { registerAlertRoutes, type AlertRouteDependencies } from "./pilotage/alerts/routes.js";
import { registerApprovalRoutes, type ApprovalRouteDependencies } from "./pilotage/approvals/routes.js";
import { registerDashboardRoutes, type DashboardRouteDependencies } from "./pilotage/dashboard/routes.js";
import { registerSnapshotRoutes, type SnapshotRouteDependencies } from "./pilotage/snapshots/routes.js";
import { registerEmailRoutes, type EmailRouteDependencies } from "./email/routes.js";
import { registerFeeControlRoutes, type FeeControlRouteDependencies } from "./finance/control/routes.js";
import { registerFinancePaymentsRoutes, type FinancePaymentsRouteDependencies } from "./finance/payments/routes.js";
import { registerFinanceReportsRoutes, type FinanceReportsRouteDependencies } from "./finance/reports/routes.js";
import { registerPedagogyRoutes, type PedagogyRouteDependencies } from "./pedagogy/routes.js";
import { registerSchoolRoutes, type SchoolRouteDependencies } from "./school/routes.js";
import { registerPushRoutes, type PushRouteDependencies } from "./push/routes.js";
import { requirePermission } from "./access/guard.js";
import type { AccessService } from "./access/service.js";
import { registerStudentRoutes, type StudentRouteDependencies } from "./students/routes.js";
import { registerAuthNativeRoutes, type AuthNativeRouteDependencies } from "./authnative/routes.js";
import { registerStudentsNativeRoutes, type StudentsNativeRouteDependencies } from "./studentsnative/routes.js";
import { registerTrialNativeRoutes, type TrialNativeRouteDependencies } from "./trialnative/routes.js";
import { registerSessionNativeRoutes, type SessionNativeRouteDependencies } from "./sessionnative/routes.js";
import { registerAccessNativeRoutes, type AccessNativeRouteDependencies } from "./accessnative/routes.js";
import { registerJaspeNativeRoutes, type JaspeNativeRouteDependencies } from "./jaspenative/routes.js";
import { registerLicenseNativeRoutes, type LicenseNativeRouteDependencies } from "./licensenative/routes.js";
import { registerFinanceNativeRoutes, type FinanceNativeRouteDependencies } from "./financenative/routes.js";
import { registerPedagogyNativeRoutes, type PedagogyNativeRouteDependencies } from "./pedagogynative/routes.js";
import { registerControlPrintNativeRoutes, type ControlPrintNativeRouteDependencies } from "./controlprintnative/routes.js";
import { registerCardsNativeRoutes, type CardsNativeRouteDependencies } from "./cardsnative/routes.js";
import { registerFamilyNativeRoutes, type FamilyNativeRouteDependencies } from "./familynative/routes.js";
import { registerDeviceHubRoutes, type DeviceHubRouteDependencies } from "./devicehub/routes.js";
import { registerDeviceHubMachineRoutes, type DeviceHubMachineRouteDependencies } from "./devicehub/machine-routes.js";
import { registerDocumentRoutes, type DocumentRouteDependencies } from "./documents/routes.js";
import { registerDashboardRoutes as registerLot5DashboardRoutes, type DashboardRouteDependencies as Lot5DashboardRouteDependencies } from "./dashboard/routes.js";

export type BuildAppOptions = {
  testRoutes?: boolean;
  readinessProbe?: ReadinessProbe;
  bootstrap?: BootstrapRouteDependencies;
  setup?: SetupRouteDependencies;
  cards?: CardRouteDependencies;
  security?: SecurityRouteDependencies;
  alerts?: AlertRouteDependencies;
  approvals?: ApprovalRouteDependencies;
  pilotageDashboard?: DashboardRouteDependencies;
  email?: EmailRouteDependencies;
  snapshots?: SnapshotRouteDependencies;
  feeControl?: FeeControlRouteDependencies;
  financePayments?: FinancePaymentsRouteDependencies;
  financeReports?: FinanceReportsRouteDependencies;
  pedagogy?: PedagogyRouteDependencies;
  school?: SchoolRouteDependencies;
  students?: StudentRouteDependencies;
  push?: PushRouteDependencies;
  access?: AccessService;
  authNative?: AuthNativeRouteDependencies;
  studentsNative?: StudentsNativeRouteDependencies;
  trialNative?: TrialNativeRouteDependencies;
  sessionNative?: SessionNativeRouteDependencies;
  accessNative?: AccessNativeRouteDependencies;
  jaspeNative?: JaspeNativeRouteDependencies;
  licenseNative?: LicenseNativeRouteDependencies;
  financeNative?: FinanceNativeRouteDependencies;
  pedagogyNative?: PedagogyNativeRouteDependencies;
  controlPrintNative?: ControlPrintNativeRouteDependencies;
  cardsNative?: CardsNativeRouteDependencies;
  familyNative?: FamilyNativeRouteDependencies;
  deviceHub?: DeviceHubRouteDependencies;
  deviceHubMachine?: DeviceHubMachineRouteDependencies;
  documents?: DocumentRouteDependencies;
  lot5Dashboard?: Lot5DashboardRouteDependencies;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const readinessProbe = options.readinessProbe ?? defaultReadinessProbe;

  app.register(cors, {
    origin: ["http://127.0.0.1:4175", "http://localhost:4175", "http://127.0.0.1:4176", "http://localhost:4176", "http://127.0.0.1:4290", "http://localhost:4290"],
    credentials: true,
  });
  app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024 } });

  app.setErrorHandler((error, _request, reply) => {
    const requestId = newRequestId();
    const known = error instanceof SchoolSafeError;
    const isValidation = error instanceof ZodError;
    const body: ApiErrorBody = known
      ? {
          code: error.code,
          message: error.publicMessage,
          request_id: requestId,
          retryable: error.retryable
        }
      : isValidation
        ? {
            code: "VALIDATION_INVALID",
            message: "Donnée invalide",
            request_id: requestId,
            retryable: false
          }
        : {
            code: "INTERNAL_ERROR",
            message: "Erreur interne",
            request_id: requestId,
            retryable: false
          };
    reply.status(known ? error.statusCode : isValidation ? 400 : 500).send(body);
  });

  app.get("/health", async () => ({ status: "ok" as const }));

  app.get("/ready", async () => {
    const result = await readinessProbe();
    if (!result.ready) {
      throw new SchoolSafeError(503, "DEPENDENCY_UNAVAILABLE", "Service temporairement indisponible", true);
    }
    return { status: "ready" as const };
  });

  if (options.bootstrap) {
    registerBootstrapRoutes(app, options.bootstrap);
  }

  if (options.authNative) {
    registerAuthNativeRoutes(app, options.authNative);
  }

  if (options.studentsNative) {
    registerStudentsNativeRoutes(app, options.studentsNative);
  }

  if (options.trialNative) {
    registerTrialNativeRoutes(app, options.trialNative);
  }

  if (options.sessionNative) {
    registerSessionNativeRoutes(app, options.sessionNative);
  }

  if (options.accessNative) {
    registerAccessNativeRoutes(app, options.accessNative);
  }

  if (options.jaspeNative) {
    registerJaspeNativeRoutes(app, options.jaspeNative);
  }

  if (options.licenseNative) {
    registerLicenseNativeRoutes(app, options.licenseNative);
  }

  if (options.financeNative) {
    registerFinanceNativeRoutes(app, options.financeNative);
  }

  if (options.pedagogyNative) {
    registerPedagogyNativeRoutes(app, options.pedagogyNative);
  }

  if (options.controlPrintNative) {
    registerControlPrintNativeRoutes(app, options.controlPrintNative);
  }

  if (options.cardsNative) {
    registerCardsNativeRoutes(app, options.cardsNative);
  }

  if (options.familyNative) {
    registerFamilyNativeRoutes(app, options.familyNative);
  }

  if (options.deviceHub) {
    registerDeviceHubRoutes(app, options.deviceHub);
  }

  if (options.deviceHubMachine) {
    registerDeviceHubMachineRoutes(app, options.deviceHubMachine);
  }

  if (options.setup) {
    registerSetupRoutes(app, options.setup);
  }

  if (options.cards) {
    registerCardRoutes(app, options.cards);
  }

  if (options.security) {
    registerSecurityRoutes(app, options.security);
  }

  if (options.alerts) {
    registerAlertRoutes(app, options.alerts);
  }

  if (options.approvals) {
    registerApprovalRoutes(app, options.approvals);
  }

  if (options.pilotageDashboard) {
    registerDashboardRoutes(app, options.pilotageDashboard);
  }

  if (options.snapshots) {
    registerSnapshotRoutes(app, options.snapshots);
  }

  if (options.email) {
    registerEmailRoutes(app, options.email);
  }

  if (options.feeControl) {
    registerFeeControlRoutes(app, options.feeControl);
  }

  if (options.financePayments) {
    registerFinancePaymentsRoutes(app, options.financePayments);
  }

  if (options.financeReports) {
    registerFinanceReportsRoutes(app, options.financeReports);
  }

  if (options.pedagogy) {
    registerPedagogyRoutes(app, options.pedagogy);
  }

  if (options.school) {
    registerSchoolRoutes(app, options.school);
  }

  if (options.students) {
    registerStudentRoutes(app, options.students);
  }

  if (options.push) {
    registerPushRoutes(app, options.push);
  }

  if (options.documents) {
    registerDocumentRoutes(app, options.documents);
  }

  if (options.lot5Dashboard) {
    registerLot5DashboardRoutes(app, options.lot5Dashboard);
  }

  if (options.testRoutes) {
    app.get("/__test/error", async () => {
      throw new SchoolSafeError(400, "VALIDATION_INVALID", "Donnée invalide", false);
    });

    if (options.access) {
      app.get(
        "/__test/protected",
        { preHandler: [requirePermission(options.access, "test.protected", { type: "school", id: "school-1" })] },
        async () => ({ status: "ok" as const }),
      );
    }
  }

  return app;
}
