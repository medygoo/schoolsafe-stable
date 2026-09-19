import { describe, it, expect, vi } from "vitest";
import { buildApp } from "../src/app.js";
import type { SecurityService } from "../src/security/service.js";
import type { AlertService } from "../src/pilotage/alerts/service.js";
import type { ApprovalService } from "../src/pilotage/approvals/service.js";
import type { DashboardService } from "../src/pilotage/dashboard/service.js";
import type { SnapshotService } from "../src/pilotage/snapshots/service.js";
import type { PedagogyService } from "../src/pedagogy/service.js";
import type { RankingsService } from "../src/pedagogy/rankings/service.js";
import type { SchoolService } from "../src/school/service.js";
import type { FinancePaymentService } from "../src/finance/payments/service.js";
import type { FinanceReportsService } from "../src/finance/reports/service.js";
import type { FeeControlService } from "../src/finance/control/service.js";
import type { CardService } from "../src/cards/service.js";
import type { PushSubscriptionService } from "../src/push/subscriptions.js";
import type { AccessService } from "../src/access/service.js";

const mockAccess: AccessService = {
  hasPermission: vi.fn().mockResolvedValue(true),
  hasScope: vi.fn().mockResolvedValue(true),
};

const mockResolve = async (token: string) =>
  token === "valid-token" ? { profileId: "profile-1", schoolId: "school-1" } : { profileId: null, schoolId: null };
const mockResolveProfileId = async (token: string) => (token === "valid-token" ? "profile-1" : null);

const mockSecurity: SecurityService = {
  createCard: vi.fn().mockResolvedValue({ card_number: "SS-TEST-001", signature: "sig" }),
  scan: vi.fn().mockResolvedValue({
    decision: "allowed",
    student: { id: "student-1", matricule: "MAT-001", first_name: "Jean", last_name: "Test", class_name: "3e", photo_path: null },
    authorized_persons: [],
    event: { id: "evt-1", event_type: "entry", decision: "allowed", occurred_at: new Date().toISOString() },
  }),
  setLockdown: vi.fn().mockResolvedValue({ active: false, activated_at: null, activated_by: null }),
  listEvents: vi.fn().mockResolvedValue({ data: [], count: 0 }),
};

const mockAlerts: AlertService = {
  list: vi.fn().mockResolvedValue({ data: [], count: 0 }),
  acknowledge: vi.fn().mockResolvedValue({ id: "alert-1", status: "acknowledged" }),
  resolve: vi.fn().mockResolvedValue({ id: "alert-1", status: "resolved" }),
  evaluateRules: vi.fn().mockResolvedValue([]),
};

const mockApprovals: ApprovalService = {
  list: vi.fn().mockResolvedValue({ data: [], count: 0 }),
  create: vi.fn().mockResolvedValue({ id: "approval-1", status: "pending" } as any),
  decide: vi.fn().mockResolvedValue({ id: "approval-1", status: "approved" } as any),
};

const mockDashboard: DashboardService = {
  load: vi.fn().mockResolvedValue({ school_id: "school-1", kpis: [] }),
};

const mockSnapshots: SnapshotService = {
  capture: vi.fn().mockResolvedValue([]),
  getTrend: vi.fn().mockResolvedValue([]),
};

const mockPedagogy: PedagogyService = {
  listClasses: vi.fn().mockResolvedValue([]),
  listSubjects: vi.fn().mockResolvedValue([]),
  createSubject: vi.fn().mockResolvedValue({}),
  listTeacherAssignments: vi.fn().mockResolvedValue([]),
  createTeacherAssignment: vi.fn().mockResolvedValue({}),
  deleteTeacherAssignment: vi.fn().mockResolvedValue(undefined),
  listAssignments: vi.fn().mockResolvedValue([]),
  createAssignment: vi.fn().mockResolvedValue({}),
  updateAssignment: vi.fn().mockResolvedValue({}),
  publishAssignment: vi.fn().mockResolvedValue({}),
  getAssignmentGrades: vi.fn().mockResolvedValue([]),
  saveGrades: vi.fn().mockResolvedValue([]),
  publishGrades: vi.fn().mockResolvedValue([]),
  listLessonPlans: vi.fn().mockResolvedValue([]),
  createLessonPlan: vi.fn().mockResolvedValue({}),
  updateLessonPlan: vi.fn().mockResolvedValue({}),
  deleteLessonPlan: vi.fn().mockResolvedValue(undefined),
  getParentChildren: vi.fn().mockResolvedValue([]),
  getStudentGradesForParent: vi.fn().mockResolvedValue({ student: {}, grades: [] }),
  computeStudentAverages: vi.fn().mockResolvedValue({ student: {}, averages: {} }),
} as PedagogyService;

const mockRankingsService: RankingsService = {
  listRankings: vi.fn().mockResolvedValue([]),
  getRanking: vi.fn().mockResolvedValue(null),
  computeMonthlyRanking: vi.fn().mockResolvedValue({} as any),
  publishRanking: vi.fn().mockResolvedValue({} as any),
  addStar: vi.fn().mockResolvedValue({} as any),
  removeStar: vi.fn().mockResolvedValue(undefined),
  listStars: vi.fn().mockResolvedValue([]),
  getParentChildrenClassIds: vi.fn().mockResolvedValue([]),
  getParentChildrenStudentIds: vi.fn().mockResolvedValue([]),
};

const mockSchool: SchoolService = {
  getSettings: vi.fn().mockResolvedValue({ identity: { name: "Test" }, brand: {}, contact: {} } as any),
  updateSettings: vi.fn().mockResolvedValue({ identity: { name: "Test" }, brand: {}, contact: {} } as any),
  listStaff: vi.fn().mockResolvedValue([]),
  getStaffDetail: vi.fn().mockResolvedValue({} as any),
  inviteStaff: vi.fn().mockResolvedValue({ profile_id: "p-1", user_id: "u-1" }),
  resendStaffInvite: vi.fn().mockResolvedValue(undefined),
  updateStaffRoles: vi.fn().mockResolvedValue(undefined),
  toggleStaffActive: vi.fn().mockResolvedValue(undefined),
  listRoles: vi.fn().mockResolvedValue([]),
  listPermissions: vi.fn().mockResolvedValue([]),
  listAcademicYears: vi.fn().mockResolvedValue([]),
  createAcademicYear: vi.fn().mockResolvedValue({ id: "y-1" }),
  updateAcademicYear: vi.fn().mockResolvedValue(undefined),
  activateAcademicYear: vi.fn().mockResolvedValue(undefined),
  listCycles: vi.fn().mockResolvedValue([]),
  toggleCycle: vi.fn().mockResolvedValue(undefined),
  saveLogoPath: vi.fn().mockResolvedValue(undefined),
  listStudentsByClass: vi.fn().mockResolvedValue([]),
};

const mockFinancePayments: FinancePaymentService = {
  recordPayment: vi.fn().mockResolvedValue({ payment: {}, updatedFee: {} }),
  cancelPayment: vi.fn().mockResolvedValue(undefined),
  getStudentFees: vi.fn().mockResolvedValue([]),
} as any;

const mockFinanceReports: FinanceReportsService = {
  getReceipt: vi.fn().mockResolvedValue({}),
  getDailyReport: vi.fn().mockResolvedValue({}),
  closeCashRegister: vi.fn().mockResolvedValue({}),
} as any;

const mockFeeControl: FeeControlService = {
  scanStudent: vi.fn().mockResolvedValue({}),
  getStudentFeeStatus: vi.fn().mockResolvedValue({}),
  listFeeStructures: vi.fn().mockResolvedValue([]),
} as any;

const mockCards: CardService = {
  requestPrint: vi.fn().mockResolvedValue({}),
} as any;

const mockPush: PushSubscriptionService = {
  saveSubscription: vi.fn().mockResolvedValue(undefined),
  getSubscriptions: vi.fn().mockResolvedValue([]),
  removeSubscription: vi.fn().mockResolvedValue(undefined),
};

function makeFullApp() {
  return buildApp({
    security: { service: mockSecurity, resolveProfileAndSchool: mockResolve, access: mockAccess },
    alerts: { service: mockAlerts, resolveProfileAndSchool: mockResolve, access: mockAccess },
    approvals: { service: mockApprovals, resolveProfileAndSchool: mockResolve, access: mockAccess },
    dashboard: { service: mockDashboard, resolveProfileAndSchool: mockResolve, access: mockAccess },
    snapshots: { service: mockSnapshots, resolveProfileAndSchool: mockResolve, access: mockAccess },
    pedagogy: { service: mockPedagogy, rankingsService: mockRankingsService, resolveProfileAndSchool: mockResolve, access: mockAccess },
    school: { service: mockSchool, resolveProfileAndSchool: mockResolve, access: mockAccess },
    financePayments: { service: mockFinancePayments, resolveProfileAndSchool: mockResolve, access: mockAccess },
    financeReports: { service: mockFinanceReports, resolveProfileAndSchool: mockResolve, access: mockAccess },
    feeControl: { service: mockFeeControl, resolveProfileAndSchool: mockResolve, access: mockAccess },
    cards: { service: mockCards, resolveProfileId: mockResolveProfileId, access: mockAccess },
    push: { subscriptionService: mockPush, resolveProfileId: mockResolveProfileId, access: mockAccess, vapidPublicKey: "test-key" },
  });
}

describe("Smoke test — all main modules respond", () => {
  it("returns 200 on all critical routes", async () => {
    const app = makeFullApp();
    const routes = [
      { method: "GET", url: "/pilotage/dashboard" },
      { method: "GET", url: "/pilotage/alerts?limit=10" },
      { method: "GET", url: "/pilotage/approvals?limit=10" },
      { method: "POST", url: "/pilotage/snapshots/capture" },
      { method: "GET", url: "/pedagogy/classes" },
      { method: "GET", url: "/pedagogy/assignments" },
      { method: "GET", url: "/school/settings" },
      { method: "GET", url: "/school/staff" },
      { method: "GET", url: "/finance/fee-structures" },
      { method: "GET", url: "/push/public-key" },
    ];

    for (const route of routes) {
      const res = await app.inject({
        method: route.method as any,
        url: route.url,
        headers: { authorization: "Bearer valid-token" },
      });
      expect(res.statusCode, `route ${route.method} ${route.url} should be reachable`).toBe(200);
    }

    await app.close();
  });
});
