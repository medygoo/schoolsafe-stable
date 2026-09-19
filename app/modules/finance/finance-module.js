// SchoolSafe V2 — Module Finance
// Extrait de app/app.js ; utilise les dépendances globales exposées sur window.

(function (root) {
  "use strict";

  // ---------------------------------------------------------------------------
  // Dépendances globales avec fallbacks défensifs
  // ---------------------------------------------------------------------------
  function deps() {
    return {
      money: typeof root.money === "function" ? root.money : function (n) { return Number(n || 0).toLocaleString("fr-FR") + " FC"; },
      certificationStatusClass: typeof root.certificationStatusClass === "function" ? root.certificationStatusClass : function (s) {
        if (s === "En ordre" || s === "Validé" || s === "done") return "success";
        if (s === "À régulariser" || s === "pending" || s === "En attente de synchronisation" || s === "Annulation demandée") return "warning";
        if (s === "Annulé") return "error";
        return "info";
      },
      notify: typeof root.notify === "function" ? root.notify : function () {},
      icons: typeof root.icons === "function" ? root.icons : function () {},
      currentDemoRole: root.currentDemoRole || "admin",
      queueOfflineOperation: typeof root.queueOfflineOperation === "function" ? root.queueOfflineOperation : function () { return Promise.resolve(null); },
      api: root.SchoolSafeFinanceAPI || null,
      i18n: root.SchoolSafeI18n || null,
      pdf: root.SchoolSafePdfUtils || null
    };
  }

  var financeRoleOverride = "";
  var financeSessionOverride = null;

  function currentRole() { return financeRoleOverride || deps().currentDemoRole; }
  function currentSession() { return financeSessionOverride || root.currentSession || null; }

  // ---------------------------------------------------------------------------
  // Helpers généraux
  // ---------------------------------------------------------------------------
  function todayIsoDate() {
    return new Date().toISOString().split("T")[0];
  }

  function formatIsoDateFr(isoString) {
    if (!isoString) return "—";
    var d = new Date(isoString);
    if (isNaN(d.getTime())) return String(isoString);
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  }

  function formatIsoDateTimeFr(isoString) {
    if (!isoString) return "—";
    var d = new Date(isoString);
    if (isNaN(d.getTime())) return String(isoString);
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) + " · " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }

  function modeLabel(mode) {
    if (!mode) return "—";
    var map = {
      cash: "Espèces",
      card: "Carte bancaire",
      check: "Chèque",
      bank_transfer: "Virement constaté",
      mobile_money: "Mobile money",
      other: "Autre moyen constaté",
      unknown: "—"
    };
    return map[mode] || mode;
  }

  function cycleLabel(cycleKey) {
    if (!cycleKey) return "—";
    var map = { nursery: "Maternelle", primary: "Primaire", secondary: "Secondaire", kindergarten: "Maternelle", all: "Tous les cycles" };
    return map[cycleKey] || cycleKey;
  }

  function escapeMarkup(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function initialsFromName(name) {
    return name.split(" ").map(function (part) { return part[0]; }).join("").toUpperCase().slice(0, 2);
  }

  function statusLabelFromFeeStatus(status) {
    if (status === "paid") return "En ordre";
    if (status === "partial") return "À régulariser";
    if (status === "exempted") return "Exempté";
    return "À régulariser";
  }

  function financialStatusDefinition(status) {
    var definitions = {
      pending: { label: "À payer", variant: "warning" },
      partial: { label: "Paiement partiel", variant: "warning" },
      paid: { label: "En règle", variant: "success" },
      exempted: { label: "Exempté", variant: "info" },
      anomaly: { label: "Anomalie à examiner", variant: "danger" }
    };
    return definitions[status] || { label: "Statut indisponible", variant: "neutral" };
  }

  function hasValidSessionToken() {
    try {
      var raw = root.sessionStorage.getItem("schoolsafe-v2-session");
      if (!raw) return false;
      var session = JSON.parse(raw);
      return !!(session && (session.native === true || session.token));
    } catch (e) { return false; }
  }

  // ---------------------------------------------------------------------------
  // Mode démo vs mode réel
  // ---------------------------------------------------------------------------
  function isDemoMode() {
    var session = currentSession();
    if (session && (session.native === true || session.token)) return false;
    if (root.schoolSafeDemoMode === true) return true;
    var host = String(root.location && root.location.hostname || "").toLowerCase();
    var isLocalhost = host === "localhost" || host === "127.0.0.1";
    return isLocalhost && !hasValidSessionToken();
  }

  function createDemoState() {
    return {
      activeTab: "overview",
      selectedStudent: 0,
      selectedFamilyStudent: 0,
      receiptSequence: 587,
      dayStatus: "Ouverte",
      loaded: false,
      loading: false,
      pendingStudents: [
        { id: "demo-s1", name: "Lucas Martin", initials: "LM", sex: "Garçon", className: "6e A", guardian: "Mme Sophie Martin", expected: 450000, paid: 350000, balance: 100000, status: "À régulariser", currency: "CDF" },
        { id: "demo-s3", name: "Ethan Leroy", initials: "EL", sex: "Garçon", className: "1re A", guardian: "M. Paul Leroy", expected: 450000, paid: 150000, balance: 300000, status: "À régulariser", currency: "CDF" }
      ],
      selectedPendingStudent: 0,
      reportClosure: null,
      feeTypes: [
        { id: "demo-1", name: "Frais scolaires", cycle: "Primaire", amount: 300000, currency: "CDF", frequency: "Trimestre", due: "30 septembre 2026", active: true },
        { id: "demo-2", name: "Frais scolaires", cycle: "Humanités", amount: 450000, currency: "CDF", frequency: "Trimestre", due: "30 septembre 2026", active: true },
        { id: "demo-3", name: "Inscription", cycle: "Tous les cycles", amount: 50000, currency: "CDF", frequency: "Une fois", due: "À l’inscription", active: true },
        { id: "demo-4", name: "Transport scolaire", cycle: "Service facultatif", amount: 100000, currency: "USD", frequency: "Mois", due: "Chaque 5 du mois", active: true },
        { id: "demo-5", name: "Frais de cantine", cycle: "Service facultatif", amount: 75000, currency: "CDF", frequency: "Mois", due: "Chaque 5 du mois", active: true },
        { id: "demo-6", name: "Rattrapage pédagogique", cycle: "Accompagnement ciblé", amount: 120000, currency: "CDF", frequency: "Programme", due: "Selon décision", active: true }
      ],
      feeAssignment: { feeStructureId: "", targetingMode: "cycle", classIds: [], studentIds: [], prepared: false },
      campaignDraft: { feeStructureId: "", label: "", startsAt: "", endsAt: "", description: "", prepared: false, preparedSummary: null },
      studentFeeMap: {},
      // Legacy conservé jusqu'au remplacement validé de la Caisse / FE-FIN-05.
      legacyStudentRecords: [
        { id: "demo-s1", name: "Lucas Martin", initials: "LM", sex: "Garçon", className: "6e A", guardian: "Mme Sophie Martin", expected: 450000, paid: 350000, balance: 100000, status: "À régulariser", currency: "CDF" },
        { id: "demo-s2", name: "Emma Martin", initials: "EM", sex: "Fille", className: "Maternelle 3", guardian: "Mme Sophie Martin", expected: 300000, paid: 300000, balance: 0, status: "En ordre", currency: "CDF" },
        { id: "demo-s3", name: "Ethan Leroy", initials: "EL", sex: "Garçon", className: "1re A", guardian: "M. Paul Leroy", expected: 450000, paid: 150000, balance: 300000, status: "À régulariser", currency: "CDF" },
        { id: "demo-s4", name: "Chloé Bernard", initials: "CB", sex: "Fille", className: "2e B", guardian: "Mme Julie Bernard", expected: 450000, paid: 450000, balance: 0, status: "En ordre", currency: "CDF" },
        { id: "demo-s5", name: "Aline Martin", initials: "AM", sex: "Fille", className: "4e Humanités A", guardian: "Mme Sophie Martin", expected: 600000, paid: 600000, balance: 0, status: "En ordre", currency: "CDF" }
      ],
      students: [
        { id: "demo-s1", name: "Lucas Martin", initials: "LM", sex: "Garçon", className: "6e A", guardian: "Mme Sophie Martin" },
        { id: "demo-s2", name: "Emma Martin", initials: "EM", sex: "Fille", className: "Maternelle 3", guardian: "Mme Sophie Martin" },
        { id: "demo-s3", name: "Ethan Leroy", initials: "EL", sex: "Garçon", className: "1re A", guardian: "M. Paul Leroy" },
        { id: "demo-s4", name: "Chloé Bernard", initials: "CB", sex: "Fille", className: "2e B", guardian: "Mme Julie Bernard" },
        { id: "demo-s5", name: "Aline Martin", initials: "AM", sex: "Fille", className: "4e Humanités A", guardian: "Mme Sophie Martin" },
        { id: "demo-student-no-fee", name: "Noah Ilunga", initials: "NI", sex: "Garçon", className: "5e A", guardian: "Mme Sarah Ilunga", lifecycle_status: "active" },
        { id: "demo-draft-student", name: "Amina Mbuyi", initials: "AM", sex: "Fille", className: "Classe planifiée", guardian: "Mme Sarah Mbuyi", lifecycle_status: "draft" }
      ],
      studentFees: [
        { id: "demo-sf-lucas-school", student_id: "demo-s1", fee_structure_id: "demo-2", amount_expected: 450000, amount_paid: 350000, amount_remaining: 100000, status: "partial" },
        { id: "demo-sf-lucas-transport", student_id: "demo-s1", fee_structure_id: "demo-4", amount_expected: 100000, amount_paid: 0, amount_remaining: 100000, status: "pending" },
        { id: "demo-sf-emma-school", student_id: "demo-s2", fee_structure_id: "demo-1", amount_expected: 300000, amount_paid: 300000, amount_remaining: 0, status: "paid" },
        { id: "demo-sf-ethan-school", student_id: "demo-s3", fee_structure_id: "demo-2", amount_expected: 450000, amount_paid: 150000, amount_remaining: 300000, status: "partial" },
        { id: "demo-sf-chloe-school", student_id: "demo-s4", fee_structure_id: "demo-2", amount_expected: 450000, amount_paid: 450000, amount_remaining: 0, status: "paid" },
        { id: "demo-sf-aline-school", student_id: "demo-s5", fee_structure_id: "demo-2", amount_expected: 600000, amount_paid: 0, amount_remaining: 0, status: "exempted" },
        { id: "demo-sf-noah-anomaly", student_id: "demo-student-no-fee", fee_structure_id: "demo-missing-fee", amount_expected: 0, amount_paid: 0, amount_remaining: 0, status: "anomaly" }
      ],
      studentFinancialProfiles: [],
      selectedFinancialStudentId: "demo-s1",
      exemptionDraft: { studentId: "demo-s1", studentFeeId: "demo-sf-lucas-transport", type: "total", prepared: false, preparedSummary: null },
      selectedCashStudentId: "demo-s1",
      selectedCashStudentFeeId: "demo-sf-lucas-school",
      paymentDraft: null,
      lastConfirmedPayment: null,
      cancellationDrafts: [],
      financialSearch: "",
      financialFeeFilter: "",
      financialStatusFilter: "",
      transactions: [
        { id: "demo-p1", receipt: "REC-2026-0587", date: "14 août 2026 · 10:20", day: "14 août 2026", student: "Ethan Leroy", className: "1re A", fee: "Frais scolaires", amount: 150000, currency: "CDF", mode: "Espèces", cashier: "Mme K", reference: "Première tranche", status: "Validé" },
        { id: "demo-p2", receipt: "REC-2026-0586", date: "14 août 2026 · 09:15", day: "14 août 2026", student: "Lucas Martin", className: "6e A", fee: "Frais scolaires", amount: 150000, currency: "CDF", mode: "Espèces", cashier: "Mme K", reference: "Deuxième tranche", status: "Validé", studentId: "demo-s1", studentFeeId: "demo-sf-lucas-school" },
        { id: "demo-p3", receipt: "REC-2026-0585", date: "13 août 2026 · 14:40", day: "13 août 2026", student: "Emma Martin", className: "Maternelle 3", fee: "Frais scolaires", amount: 300000, currency: "CDF", mode: "Virement constaté", cashier: "Mme K", reference: "Paiement complet", status: "Validé" },
        { id: "demo-p4", receipt: "REC-2026-0584", date: "12 août 2026 · 11:05", day: "12 août 2026", student: "Lucas Martin", className: "6e A", fee: "Frais scolaires", amount: 200000, currency: "CDF", mode: "Espèces", cashier: "Mme K", reference: "Première tranche", status: "Validé", studentId: "demo-s1", studentFeeId: "demo-sf-lucas-school" },
        { id: "demo-p5", receipt: "REC-2026-0583", date: "11 août 2026 · 08:55", day: "11 août 2026", student: "Chloé Bernard", className: "2e B", fee: "Frais scolaires", amount: 450000, currency: "CDF", mode: "Espèces", cashier: "Mme K", reference: "Paiement complet", status: "Validé" },
        { id: "demo-p6", receipt: "REC-2026-0582", date: "10 août 2026 · 13:10", day: "10 août 2026", student: "Aline Martin", className: "4e Humanités A", fee: "Frais scolaires", amount: 600000, currency: "CDF", mode: "Virement constaté", cashier: "Mme K", reference: "Paiement complet", status: "Validé" }
      ],
      expenses: [
        { reference: "DEP-2026-011", date: "14 août 2026", label: "Fournitures administratives", amount: 120000, status: "Validée" },
        { reference: "DEP-2026-012", date: "14 août 2026", label: "Entretien du groupe électrogène", amount: 75000, status: "À approuver" }
      ],
      dailyReport: null,
      reportDate: todayIsoDate(),
      error: null
    };
  }

  function createRealState() {
    return {
      activeTab: "overview",
      selectedStudent: 0,
      selectedFamilyStudent: 0,
      receiptSequence: 0,
      dayStatus: "Ouverte",
      loaded: false,
      loading: false,
      pendingStudents: [],
      selectedPendingStudent: 0,
      reportClosure: null,
      feeTypes: [],
      feeAssignment: { feeStructureId: "", targetingMode: "cycle", classIds: [], studentIds: [], prepared: false },
      campaignDraft: { feeStructureId: "", label: "", startsAt: "", endsAt: "", description: "", prepared: false, preparedSummary: null },
      studentFeeMap: {},
      students: [],
      studentFees: [],
      studentFinancialProfiles: [],
      selectedFinancialStudentId: "",
      exemptionDraft: { studentId: "", studentFeeId: "", type: "total", prepared: false, preparedSummary: null },
      selectedCashStudentId: "",
      selectedCashStudentFeeId: "",
      paymentDraft: null,
      lastConfirmedPayment: null,
      cancellationDrafts: [],
      financialSearch: "",
      financialFeeFilter: "",
      financialStatusFilter: "",
      transactions: [],
      expenses: [],
      dailyReport: null,
      reportDate: todayIsoDate(),
      error: null
    };
  }

  var financeState = isDemoMode() ? createDemoState() : createRealState();
  var FEE_TYPE_DRAFT_STORAGE_KEY = "schoolsafe-v2-finance-fee-type-drafts";
  var FEE_ASSIGNMENT_DRAFT_STORAGE_KEY = "schoolsafe-v2-finance-assignment-drafts";
  var FEE_EXEMPTION_DRAFT_STORAGE_KEY = "schoolsafe-v2-finance-exemption-drafts";
  var PAYMENT_CANCELLATION_DRAFT_STORAGE_KEY = "schoolsafe-v2-finance-payment-cancellation-drafts";
  var CANTEEN_LINK_DRAFT_STORAGE_KEY = "schoolsafe-v2-finance-canteen-link-drafts";
  var REMEDIATION_FINANCE_DRAFT_STORAGE_KEY = "schoolsafe-v2-finance-remediation-link-drafts";

  function readLocalDrafts(key) {
    try {
      var parsed = JSON.parse(root.localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function persistLocalDrafts(key, values) {
    try {
      root.localStorage.setItem(key, JSON.stringify(Array.isArray(values) ? values : []));
    } catch (error) {
      console.warn("[Finance] impossible de conserver le brouillon local", error);
    }
  }

  financeState.feeTypeDrafts = readLocalDrafts(FEE_TYPE_DRAFT_STORAGE_KEY);
  financeState.assignmentDrafts = readLocalDrafts(FEE_ASSIGNMENT_DRAFT_STORAGE_KEY);
  financeState.exemptionDrafts = readLocalDrafts(FEE_EXEMPTION_DRAFT_STORAGE_KEY);
  financeState.cancellationDrafts = readLocalDrafts(PAYMENT_CANCELLATION_DRAFT_STORAGE_KEY);
  financeState.canteenLinkDrafts = readLocalDrafts(CANTEEN_LINK_DRAFT_STORAGE_KEY);
  financeState.remediationFinanceDrafts = readLocalDrafts(REMEDIATION_FINANCE_DRAFT_STORAGE_KEY);
  financeState.remediationFinanceError = "";

  // ---------------------------------------------------------------------------
  // Mapping données backend
  // ---------------------------------------------------------------------------
  function mapFeeStructure(fee) {
    return {
      id: fee.id,
      name: fee.label || "Frais",
      cycle: cycleLabel(fee.cycle_key),
      cycle_key: fee.cycle_key || "",
      amount: Number(fee.amount || 0),
      currency: fee.currency || "CDF",
      due: fee.due_date ? formatIsoDateFr(fee.due_date) : "—",
      due_date: fee.due_date || null,
      active: fee.is_active !== false,
      academic_year_id: fee.academic_year_id || null
    };
  }

  function mapFinancialStudent(student) {
    student = student || {};
    var name = student.name || [student.first_name, student.last_name].filter(Boolean).join(" ") || "Élève";
    return {
      id: student.id || null,
      name: name,
      initials: student.initials || initialsFromName(name),
      sex: student.sex || (student.gender === "F" ? "Fille" : student.gender === "M" ? "Garçon" : "—"),
      className: student.className || student.class_name || "Classe indisponible",
      guardian: student.guardian || student.guardian_name || "—",
      matricule: student.matricule || "",
      lifecycleStatus: student.lifecycleStatus || student.lifecycle_status || "active"
    };
  }

  function feeCatalog() {
    var seen = {};
    return (financeState.feeTypes || []).concat(financeState.feeTypeDrafts || []).filter(function (fee) {
      if (!fee || !fee.id || seen[fee.id]) return false;
      seen[fee.id] = true;
      return true;
    });
  }

  function feeStructureById(feeStructureId) {
    return feeCatalog().find(function (fee) { return fee.id === feeStructureId; }) || null;
  }

  function mapStudentFeeForFinancialProfile(studentFee) {
    studentFee = studentFee || {};
    var feeStructureId = studentFee.fee_structure_id || null;
    var feeStructure = feeStructureById(feeStructureId);
    var status = ["pending", "partial", "paid", "exempted", "anomaly"].indexOf(studentFee.status) >= 0 ? studentFee.status : "anomaly";
    return {
      student_fee_id: studentFee.id || null,
      fee_structure_id: feeStructureId,
      student_id: studentFee.student_id || null,
      label: feeStructure ? feeStructure.name : "Type de frais indisponible",
      feeStructureAvailable: !!feeStructure,
      expected: Number(studentFee.amount_expected || 0),
      paid: Number(studentFee.amount_paid || 0),
      remaining: Number(studentFee.amount_remaining || 0),
      currency: feeStructure ? feeStructure.currency : null,
      due: feeStructure ? feeStructure.due : "Indisponible",
      due_date: feeStructure ? feeStructure.due_date : null,
      status: status
    };
  }

  function rebuildStudentFinancialProfiles() {
    var profilesByStudentId = {};
    var profileOrder = [];
    (financeState.students || []).forEach(function (student) {
      var mappedStudent = mapFinancialStudent(student);
      if (mappedStudent.lifecycleStatus !== "active") return;
      if (!mappedStudent.id || profilesByStudentId[mappedStudent.id]) return;
      profilesByStudentId[mappedStudent.id] = { student: mappedStudent, fees: [] };
      profileOrder.push(mappedStudent.id);
    });
    (financeState.studentFees || []).forEach(function (studentFee) {
      var studentId = studentFee.student_id || (studentFee.students && studentFee.students.id) || null;
      if (!studentId) return;
      if (!profilesByStudentId[studentId]) {
        var student = mapFinancialStudent(Object.assign({ id: studentId }, studentFee.students || {}));
        profilesByStudentId[studentId] = { student: student, fees: [] };
        profileOrder.push(studentId);
      }
      profilesByStudentId[studentId].fees.push(mapStudentFeeForFinancialProfile(studentFee));
    });
    financeState.studentFinancialProfiles = profileOrder.map(function (studentId) { return profilesByStudentId[studentId]; });
    if (!financeState.selectedFinancialStudentId || !profilesByStudentId[financeState.selectedFinancialStudentId]) {
      financeState.selectedFinancialStudentId = profileOrder[0] || "";
    }
  }

  function formatFinancialAmount(value, currency) {
    if (!currency) return "Indisponible";
    return Number(value || 0).toLocaleString("fr-FR") + " " + escapeMarkup(currency);
  }

  function hasUnsynchronizedFinancialOperation() {
    return (financeState.transactions || []).some(function (transaction) {
      return transaction && transaction.status === "En attente de synchronisation";
    });
  }

  function mapStudentFee(sf) {
    var student = sf.students || {};
    var name = [student.first_name, student.last_name].filter(Boolean).join(" ") || "Élève";
    return {
      id: sf.id,
      student_id: sf.student_id,
      name: name,
      initials: initialsFromName(name),
      sex: student.gender === "F" ? "Fille" : "Garçon",
      className: sf.class_name || student.class_name || "Classe",
      guardian: sf.guardian_name || student.guardian_name || "—",
      expected: Number(sf.amount_expected || 0),
      paid: Number(sf.amount_paid || 0),
      balance: Number(sf.amount_remaining || 0),
      status: statusLabelFromFeeStatus(sf.status),
      currency: sf.currency || "CDF"
    };
  }

  if (isDemoMode()) rebuildStudentFinancialProfiles();

  function mapDailyPayment(payment) {
    var student = payment.student || {};
    var name = [student.first_name, student.last_name].filter(Boolean).join(" ") || "Élève";
    return {
      id: payment.id,
      receipt: payment.id,
      date: formatIsoDateTimeFr(payment.received_at),
      day: formatIsoDateFr(payment.received_at),
      student: name,
      className: "",
      fee: payment.fee_label || "Frais",
      amount: Number(payment.amount || 0),
      mode: modeLabel(payment.mode),
      reference: payment.reference || "",
      status: "Validé",
      currency: payment.currency || "CDF"
    };
  }

  // ---------------------------------------------------------------------------
  // Autorisation (spécifique Finance)
  // ---------------------------------------------------------------------------
  function checkAuthorization(permission, options) {
    options = options || {};
    var role = currentRole();
    var session = currentSession();
    var allowed = false;
    if (session && Array.isArray(session.permissions)) {
      allowed = session.permissions.indexOf(permission) !== -1;
      if (!allowed && permission === "finance.receipts.view") {
        allowed = session.permissions.indexOf("finance.receipt.read") !== -1;
      }
    }
    if (!allowed) {
      if (permission === "finance.receipts.view") {
        allowed = role === "admin" || role === "finance" || role === "cashier" || role === "school_head";
        if (options.scope === "own_children" || role === "parent") {
          allowed = allowed || role === "parent";
        }
      } else if (permission === "finance.fee.manage") {
        allowed = role === "admin" || role === "finance";
      } else {
        allowed = role === "admin";
      }
    }
    return allowed;
  }

  /**
   * FE-FIN-02 : accès catalogue via ACCESS_LAW; aucun rôle ne décide seul.
   */
  function demoFinanceAccessUser(role) {
    var templates = {
      finance: [
        "finance.fee.read",
        "finance.fee.manage",
        "finance.receipt.read",
        "finance.report.read",
        "finance.cash_register.close",
        "finance.control.read",
        "finance.control.manage",
        "finance.status.read",
        "safe.assistant.use"
      ],
      cashier: [
        "finance.payment.record",
        "finance.receipt.read",
        "finance.status.read",
        "safe.assistant.use"
      ],
      canteen: ["canteen.manage"],
      school_head: ["finance.status.read", "finance.report.read", "safe.assistant.use"]
    };
    var permissions = templates[role] || [];
    return {
      role: role,
      permissions: permissions.slice(),
      scopes: permissions.map(function (permission) {
        return { permission: permission, type: permission === "safe.assistant.use" ? "own" : "school" };
      })
    };
  }

  function financeAccessUser() {
    var session = currentSession();
    if (session) return session;
    var appUser = root.SchoolSafeAppContext && typeof root.SchoolSafeAppContext.getCurrentUser === "function"
      ? root.SchoolSafeAppContext.getCurrentUser()
      : null;
    if (appUser && Array.isArray(appUser.permissions) && appUser.permissions.length) return appUser;
    // Les profils Finance et Caisse de démonstration reçoivent ici un modèle
    // explicite permission + portée. Les rôles ne sont jamais consultés par les
    // gardes ci-dessous : SchoolSafeAccess reste l’unique décisionnaire.
    return isDemoMode() ? demoFinanceAccessUser(currentRole()) : (appUser || { permissions: [], scopes: [] });
  }

  function canAccessFeeCatalog(permission) {
    var access = root.SchoolSafeAccess;
    var user = financeAccessUser();
    return !!(access && typeof access.canAccess === "function" && access.canAccess(user, permission));
  }
  function canAccessAnyFinance(permissionCodes) {
    var access = root.SchoolSafeAccess;
    return !!(access && typeof access.canAccessAny === "function" && access.canAccessAny(financeAccessUser(), permissionCodes));
  }
  function canReadFeeCatalog() { return canAccessFeeCatalog("finance.fee.read"); }
  function canManageFeeCatalog() { return canAccessFeeCatalog("finance.fee.manage"); }
  function canReadFinancialDetails() { return canReadFeeCatalog(); }
  function canReadFinancialStatus() { return canAccessFeeCatalog("finance.status.read"); }

  function canRecordPayment() {
    return canAccessFeeCatalog("finance.payment.record");
  }

  // FE-FIN-11A : la permission existante autorise uniquement l’accès à la
  // surface Caisse. Sa projection réelle (journal, état, clôture, historique)
  // reste BACKEND_LATER tant que son contrat serveur dédié n’existe pas.
  function canAccessCashRegister() {
    return canAccessFeeCatalog("finance.cash_register.close");
  }

  // FE-FIN-12A : Rapports est une surface autonome. Aucun rôle ou autre
  // permission Finance ne doit en déduire l'accès.
  function canReadFinanceReports() {
    return canAccessFeeCatalog("finance.report.read");
  }

  // FE-FIN-13A : Reçus est une surface autonome. La permission de paiement
  // n'implique jamais la consultation d'un registre de reçus.
  function canReadFinanceReceipts() {
    return canAccessFeeCatalog("finance.receipt.read");
  }

  function canCancelPayment() {
    return canAccessFeeCatalog("finance.payment.cancel");
  }

  // FE-FIN-06 : garde transitoire. La permission dédiée finance.exemption.manage
  // reste BACKEND_LATER ; aucune décision finale ne repose sur un rôle.
  function canPrepareExemption() {
    return canManageFeeCatalog();
  }

  // FE-FIN-07A : garde transitoire. Les permissions dédiées
  // finance.control.campaign.* restent BACKEND_LATER ; aucun rôle ne décide seul.
  function canManageControlCampaigns() {
    return canAccessFeeCatalog("finance.control.manage");
  }

  function canManageCanteenFinanceLink() {
    return canAccessFeeCatalog("canteen.manage");
  }

  function canPrepareRemediationFinance() {
    return canManageFeeCatalog();
  }

  function exemptionDraftState() {
    if (!financeState.exemptionDraft) {
      financeState.exemptionDraft = { studentId: "", studentFeeId: "", type: "total", prepared: false, preparedSummary: null };
    }
    return financeState.exemptionDraft;
  }

  function selectedExemptionProfile() {
    var draft = exemptionDraftState();
    var profiles = financeState.studentFinancialProfiles || [];
    if (!profiles.length) return null;
    var selected = profiles.find(function (profile) { return profile.student.id === draft.studentId; });
    if (selected) return selected;
    if (!draft.studentId) {
      draft.studentId = profiles[0].student.id;
      return profiles[0];
    }
    return null;
  }

  function selectedExemptionStudentFee(profile) {
    var draft = exemptionDraftState();
    if (!profile || !Array.isArray(profile.fees) || !profile.fees.length) return null;
    var selected = profile.fees.find(function (fee) { return fee.student_fee_id === draft.studentFeeId; });
    if (selected) return selected;
    if (!draft.studentFeeId) {
      draft.studentFeeId = profile.fees[0].student_fee_id;
      return profile.fees[0];
    }
    return null;
  }

  function exemptionAvailability(fee) {
    if (!fee) return { allowed: false, message: "Sélectionnez une obligation financière précise." };
    if (!fee.feeStructureAvailable || !fee.student_fee_id || !fee.label) return { allowed: false, message: "Le student_fee ou son type de frais est incomplet." };
    if (["CDF", "USD"].indexOf(fee.currency) === -1) return { allowed: false, message: "La devise de cette obligation est inconnue." };
    if (Number(fee.paid) > 0) return { allowed: false, message: "Paiement déjà enregistré : la politique rétroactive exige le backend." };
    if (fee.status === "exempted") return { allowed: false, message: "Cette obligation est déjà affichée comme exemptée ; son historique n’est pas encore connecté." };
    if (fee.status !== "pending") return { allowed: false, message: "Le statut financier n’est pas compatible avec une préparation d’exemption." };
    if (!Number.isFinite(Number(fee.remaining)) || Number(fee.remaining) <= 0) return { allowed: false, message: "Aucun montant restant disponible pour une exemption." };
    return { allowed: true, message: "" };
  }

  function selectedCashProfile() {
    var profiles = financeState.studentFinancialProfiles || [];
    if (!profiles.length) return null;
    var selected = profiles.find(function (profile) { return profile.student.id === financeState.selectedCashStudentId; });
    if (selected) return selected;
    if (!financeState.selectedCashStudentId) {
      financeState.selectedCashStudentId = profiles[0].student.id;
      return profiles[0];
    }
    return null;
  }

  function selectedCashStudentFee(profile) {
    if (!profile || !Array.isArray(profile.fees) || !profile.fees.length) return null;
    var selected = profile.fees.find(function (fee) { return fee.student_fee_id === financeState.selectedCashStudentFeeId; });
    if (selected) return selected;
    if (!financeState.selectedCashStudentFeeId) {
      financeState.selectedCashStudentFeeId = profile.fees[0].student_fee_id;
      return profile.fees[0];
    }
    return null;
  }

  function paymentAvailability(fee) {
    if (!fee) return { allowed: false, message: "Sélectionnez une obligation financière précise." };
    if (!fee.feeStructureAvailable || !fee.label || !fee.currency) return { allowed: false, message: "Le type de frais ou sa devise est indisponible." };
    if (["CDF", "USD"].indexOf(fee.currency) === -1) return { allowed: false, message: "La devise de cette obligation est inconnue." };
    if (fee.status === "paid") return { allowed: false, message: "Paiement normal indisponible : ce frais est déjà réglé." };
    if (fee.status === "exempted") return { allowed: false, message: "Paiement normal indisponible : ce frais est exempté." };
    if (["pending", "partial"].indexOf(fee.status) === -1) return { allowed: false, message: "Paiement normal indisponible : statut financier inconnu." };
    if (!Number.isFinite(Number(fee.remaining)) || Number(fee.remaining) <= 0) return { allowed: false, message: "Paiement normal indisponible : aucun montant restant à encaisser." };
    return { allowed: true, message: "" };
  }

  function paymentStepForCurrency(currency) {
    return currency === "USD" ? 0.01 : 1;
  }

  function hasValidPaymentPrecision(amount, currency) {
    var multiplier = currency === "USD" ? 100 : 1;
    return Math.abs(Number(amount) * multiplier - Math.round(Number(amount) * multiplier)) < 0.0000001;
  }

  function formatTransactionAmount(transaction) {
    return formatFinancialAmount(transaction && transaction.amount, transaction && transaction.currency);
  }

  function formatTransactionTotal(transactions) {
    var rows = Array.isArray(transactions) ? transactions : [];
    var currencies = Array.from(new Set(rows.map(function (transaction) { return transaction && transaction.currency; }).filter(Boolean)));
    if (currencies.length !== 1) return "Montants mixtes non cumulés";
    var amount = rows.reduce(function (sum, transaction) { return sum + Number(transaction.amount || 0); }, 0);
    return formatFinancialAmount(amount, currencies[0]);
  }

  function recordDemoPayment(profile, fee, amount, mode, reference, d) {
    var updatedStudentFee = financeState.studentFees.find(function (studentFee) { return studentFee.id === fee.student_fee_id; });
    if (!updatedStudentFee) {
      d.notify("Démonstration indisponible : l’obligation sélectionnée est introuvable.", "error");
      return;
    }
    var nextPaid = Number(updatedStudentFee.amount_paid || 0) + amount;
    var nextRemaining = Math.max(0, Number(updatedStudentFee.amount_expected || 0) - nextPaid);
    var updated = Object.assign({}, updatedStudentFee, {
      amount_paid: nextPaid,
      amount_remaining: nextRemaining,
      status: nextRemaining === 0 ? "paid" : "partial"
    });
    financeState.studentFees = financeState.studentFees.map(function (studentFee) {
      return studentFee.id === updated.id ? updated : studentFee;
    });
    rebuildStudentFinancialProfiles();
    var now = Date.now();
    var transaction = { id: "demo-payment-" + now, receipt: "DÉMO-REC-" + now, date: formatIsoDateTimeFr(new Date(now).toISOString()), day: formatIsoDateFr(new Date(now).toISOString()), student: profile.student.name, className: profile.student.className, fee: fee.label, amount: amount, mode: modeLabel(mode), cashier: "—", reference: reference, status: "Démonstration", currency: fee.currency, studentId: profile.student.id, studentFeeId: fee.student_fee_id, feeStructureId: fee.fee_structure_id, local: true, nonOfficial: true };
    financeState.transactions.unshift(transaction);
    financeState.lastConfirmedPayment = transaction;
    financeState.paymentDraft = null;
    d.notify("Paiement constaté dans la démonstration. Aucun reçu officiel n’a été créé.");
    renderFinanceModule();
  }

  /**
   * FE-FIN-03 — prépare uniquement une intention d'affectation dans la vue.
   * Aucune donnée n'est persistée ici : le backend devra créer les student_fees.
   */
  function feeAssignmentState() {
    if (!financeState.feeAssignment) {
      financeState.feeAssignment = { feeStructureId: "", targetingMode: "cycle", targetIds: [], prepared: false };
    }
    if (!Array.isArray(financeState.feeAssignment.targetIds)) financeState.feeAssignment.targetIds = [];
    return financeState.feeAssignment;
  }

  function deduplicateAssignmentIds(values) {
    var seen = {};
    return (Array.isArray(values) ? values : []).filter(function (value) {
      var key = String(value || "");
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function selectedFeeForAssignment() {
    var assignment = feeAssignmentState();
    var feeTypes = feeCatalog();
    if (!assignment.feeStructureId && feeTypes.length) assignment.feeStructureId = feeTypes[0].id;
    return feeTypes.find(function (fee) { return fee.id === assignment.feeStructureId; }) || null;
  }

  function assignmentAmountLabel(fee) {
    if (!fee) return "—";
    return Number(fee.amount || 0).toLocaleString("fr-FR") + " " + escapeMarkup(fee.currency || "CDF");
  }

  // FE-FIN-07A : intention de campagne en mémoire uniquement.
  // Ni createCampaign(), ni offline, ni stockage local ne sont utilisés.
  function campaignDraftState() {
    if (!financeState.campaignDraft) {
      financeState.campaignDraft = { feeStructureId: "", label: "", startsAt: "", endsAt: "", description: "", prepared: false, preparedSummary: null };
    }
    return financeState.campaignDraft;
  }

  function selectedFeeForCampaignDraft() {
    var draft = campaignDraftState();
    var feeTypes = feeCatalog();
    if (!draft.feeStructureId && feeTypes.length) draft.feeStructureId = feeTypes[0].id;
    return feeTypes.find(function (fee) { return fee.id === draft.feeStructureId; }) || null;
  }

  // ---------------------------------------------------------------------------
  // Chargement des données
  // ---------------------------------------------------------------------------
  async function loadDailyReport(date) {
    financeState.reportDate = date;
    // Le endpoint journalier actuel agrège potentiellement CDF et USD. Il est
    // conservé pour les flux legacy, mais ne peut pas alimenter Rapports.
    financeState.dailyReport = null;
  }

  function financeDataRequirements() {
    var tab = financeState.activeTab;
    var needsFeeStructures = (tab === "fees" && canReadFeeCatalog()) || ((tab === "assignments" || tab === "cash" || tab === "balances" || tab === "exemptions" || tab === "campaigns") && canReadFinancialDetails());
    var needsStudentFees = (tab === "cash" || tab === "balances" || tab === "exemptions") && canReadFinancialDetails();
    return { feeStructures: needsFeeStructures, studentFees: needsStudentFees };
  }

  async function loadFinanceData() {
    var requirements = financeDataRequirements();
    if (!requirements.feeStructures && !requirements.studentFees) return;
    if (financeState.loading) return;
    if ((!requirements.feeStructures || financeState.feeStructuresLoaded) && (!requirements.studentFees || financeState.studentFeesLoaded)) return;
    if (isDemoMode()) {
      financeState.loaded = true;
      financeState.feeStructuresLoaded = true;
      financeState.studentFeesLoaded = true;
      financeState.loading = false;
      return;
    }
    var api = deps().api;
    if (!api) {
      financeState.error = "Données indisponibles / connexion impossible";
      return;
    }
    financeState.loading = true;
    financeState.error = null;
    renderFinanceModule();
    try {
      var failed = false;
      var markFailedEmpty = function () { failed = true; return []; };
      var feeStructures = requirements.feeStructures && !financeState.feeStructuresLoaded ? await api.listFeeStructures().catch(markFailedEmpty) : null;
      var studentFees = requirements.studentFees && !financeState.studentFeesLoaded ? await api.listStudentFees({}).catch(markFailedEmpty) : null;
      var pendingFees = requirements.studentFees && !financeState.studentFeesLoaded ? await api.listStudentFees({ status: "pending" }).catch(markFailedEmpty) : null;
      var partialFees = requirements.studentFees && !financeState.studentFeesLoaded ? await api.listStudentFees({ status: "partial" }).catch(markFailedEmpty) : null;
      if (failed && !isDemoMode()) {
        financeState.error = "Données indisponibles / connexion impossible";
        return;
      }
      var pendingById = {};
      (pendingFees || []).concat(partialFees || []).forEach(function (sf) {
        pendingById[sf.id] = sf;
      });
      var pendingFeesMerged = Object.values(pendingById);
      if (Array.isArray(feeStructures)) {
        financeState.feeTypes = feeStructures.map(mapFeeStructure);
      }
      if (requirements.feeStructures && feeStructures) financeState.feeStructuresLoaded = true;
      if (studentFees) {
        financeState.studentFeeMap = {};
        financeState.studentFees = studentFees.slice();
        financeState.students = studentFees.reduce(function (students, sf, index) {
          financeState.studentFeeMap[index] = sf.id;
          var identity = mapFinancialStudent(Object.assign({ id: sf.student_id }, sf.students || {}));
          if (identity.id && !students.some(function (student) { return student.id === identity.id; })) students.push(identity);
          // La projection legacy reste strictement dédiée aux flux Caisse existants.
          return students;
        }, []);
        rebuildStudentFinancialProfiles();
        financeState.studentFeesLoaded = true;
      }
      if (pendingFeesMerged) {
        financeState.pendingStudents = pendingFeesMerged.map(mapStudentFee);
        if (financeState.selectedPendingStudent >= financeState.pendingStudents.length) {
          financeState.selectedPendingStudent = 0;
        }
      }
      financeState.loaded = !!(financeState.feeStructuresLoaded || financeState.studentFeesLoaded);
    } catch (e) {
      console.warn("[Finance] chargement backend échoué", e);
      if (!isDemoMode()) {
        financeState.error = "Données indisponibles / connexion impossible";
      }
    } finally {
      financeState.loading = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Onglets et autorisation des onglets
  // ---------------------------------------------------------------------------
  function financeTabForAction(actionName) {
    if (/liaison financière|frais de cantine|finance cantine/i.test(actionName)) return "canteen";
    if (/rattrapage|remédiation/i.test(actionName)) return "remediation-finance";
    if (/campagne/i.test(actionName)) return "campaigns";
    if (/exemption|exonération/i.test(actionName)) return "exemptions";
    if (/affectation des frais|affecter un frais/i.test(actionName)) return "assignments";
    if (/structure des frais|types de frais|contrôle des frais|échéance/i.test(actionName)) return "fees";
    if (/reçu/i.test(actionName)) return "receipts";
    if (/impayé|solde|en ordre|régulariser/i.test(actionName)) return "balances";
    if (/encaissement|enregistrer un paiement|rechercher un élève|vérifier un paiement/i.test(actionName)) return "cash";
    if (/caisse|journal de caisse|historique du jour|clôture|soumettre/i.test(actionName)) return "cash-register";
    if (/rapport|export|imprimer/i.test(actionName)) return "reports";
    if (/frais scolaires|paiement|échéances/i.test(actionName) && currentRole() === "parent") return "family";
    if (/financ|recette|dépense|statistique/i.test(actionName)) return "overview";
    return "";
  }

  function hasFinanceGeneralSurface(tabs) {
    return tabs.some(function (tab) { return ["overview", "campaigns", "family"].indexOf(tab) === -1; });
  }

  function financeTabsForRole() {
    // L'ancienne vue familiale ne possède pas encore de permission own_children
    // dédiée : elle demeure isolée comme comportement legacy jusqu'à son contrat.
    if (currentRole() === "parent") return ["family"];

    var tabs = [];
    if (canReadFeeCatalog() || canManageFeeCatalog()) tabs.push("fees");
    if (canManageFeeCatalog()) tabs.push("assignments");
    if (canRecordPayment()) tabs.push("cash");
    if (canReadFinanceReceipts()) tabs.push("receipts");
    if (canAccessCashRegister()) tabs.push("cash-register");
    if (canReadFinancialDetails() || canReadFinancialStatus()) tabs.push("balances");
    if (canPrepareExemption()) tabs.push("exemptions");
    if (canReadFinanceReports()) tabs.push("reports");
    if (canManageCanteenFinanceLink()) tabs.push("canteen");
    if (canPrepareRemediationFinance()) tabs.push("remediation-finance");
    // La gestion de campagnes legacy reste disponible uniquement pour un
    // utilisateur déjà autorisé dans Finance générale ; control.* seul ne crée
    // donc jamais une entrée Finance générale.
    if (canManageControlCampaigns() && hasFinanceGeneralSurface(tabs)) tabs.push("campaigns");
    // Aucun droit "overview" n'existe aujourd'hui. La surface peut être
    // explicitement demandée par les lecteurs financiers, mais elle n'est pas
    // le point d'entrée automatique et reste BACKEND_LATER en réel.
    if (canReadFeeCatalog() || canReadFinancialStatus() || canReadFinanceReports()) tabs.push("overview");
    return tabs;
  }

  // ---------------------------------------------------------------------------
  // Renderers
  // ---------------------------------------------------------------------------
  function financeTotals() {
    var expected = financeState.studentFees.reduce(function (sum, studentFee) { return sum + Number(studentFee.amount_expected || 0); }, 0);
    var paid = financeState.studentFees.reduce(function (sum, studentFee) { return sum + Number(studentFee.amount_paid || 0); }, 0);
    var balance = financeState.studentFees.reduce(function (sum, studentFee) { return sum + Number(studentFee.amount_remaining || 0); }, 0);
    var today = financeState.transactions.filter(function (transaction) { return transaction.status !== "Annulé"; });
    return {
      expected: expected,
      paid: paid,
      balance: balance,
      rate: expected ? Math.round(paid / expected * 100) : 0,
      today: today,
      todayTotal: today.reduce(function (sum, transaction) { return sum + transaction.amount; }, 0)
    };
  }

  function renderErrorBanner() {
    if (!financeState.error) return "";
    return window.ssState({
      type: "error",
      title: "Erreur",
      message: financeState.error,
      retry: { attrs: { id: "retryFinance" } }
    });
  }

  function renderFinanceOverview() {
    if (!isDemoMode()) {
      return '<section class="finance-overview"><header><div><span>Situation de l’école</span><h3>Vue d’ensemble</h3><p>Retrouvez les fonctions disponibles dans le menu Finance.</p></div>' + window.ssBadge({ variant: "warning", icon: "plug-zap", label: "Non connecté" }) + '</header>' + window.ssState({ type: "unavailable", title: "Vue d’ensemble non connectée", message: "La synthèse officielle des montants attendus, payés et restants n’est pas encore disponible.", details: "Les montants en CDF et en USD seront présentés séparément. Aucun montant de démonstration n’est affiché ici." }) + '</section>';
    }
    var activeFees = financeState.feeTypes.filter(function (fee) { return fee.active; }).length;
    var anomalies = financeState.studentFees.filter(function (fee) {
      return ["pending", "partial", "paid", "exempted"].indexOf(fee.status) === -1;
    }).length;
    var metrics = [
      { label: "Types de frais actifs", value: canReadFeeCatalog() ? String(activeFees) : "Non autorisés", icon: "settings", primary: true },
      { label: "Obligations élèves", value: canReadFeeCatalog() ? String(financeState.studentFees.length) : "Statut uniquement", icon: "list-checks", primary: true },
      { label: "Paiements enregistrés", value: canReadFinanceReceipts() || canRecordPayment() ? String(financeState.transactions.length) : "Non autorisés", icon: "hand-coins", primary: true },
      { label: "Alertes et anomalies", value: canReadFeeCatalog() || canReadFinancialStatus() ? String(anomalies) : "Non autorisées", icon: "triangle-alert", primary: true },
      { label: "Situation financière", value: canReadFinancialStatus() || canReadFeeCatalog() ? "Exemple de synthèse" : "Non autorisée", icon: "chart-pie" },
      { label: "Opérations récentes", value: canReadFinanceReceipts() ? "Exemples disponibles" : "Non autorisées", icon: "history" },
      { label: "Exemptions", value: canPrepareExemption() ? String(financeState.studentFees.filter(function (fee) { return fee.status === "exempted"; }).length) : "Non autorisées", icon: "shield-check" },
      { label: "Caisse", value: canAccessCashRegister() ? "Non connectée" : "Non autorisée", icon: "landmark" },
      { label: "Contrôles de frais", value: canAccessAnyFinance(["finance.control.read", "finance.control.manage", "finance.control.scan"]) ? "Espace dédié" : "Non autorisés", icon: "scan-line" },
      { label: "Rapports", value: canReadFinanceReports() ? "Exemples disponibles" : "Non autorisés", icon: "file-chart-column" }
    ];
    function metricMarkup(primary) {
      return metrics.filter(function (metric) { return !!metric.primary === primary; }).map(function (metric) {
        return '<article class="finance-dashboard-metric' + (primary && /^\d+$/.test(metric.value) ? ' finance-dashboard-metric--number' : '') + '"><span aria-hidden="true"><i data-lucide="' + metric.icon + '"></i></span><div><small>' + escapeMarkup(metric.label) + '</small><b>' + escapeMarkup(metric.value) + '</b></div></article>';
      }).join("");
    }
    var shortcuts = [];
    if (canReadFeeCatalog() || canManageFeeCatalog()) shortcuts.push({ tab: "fees", label: "Types de frais", icon: "settings" });
    if (canManageFeeCatalog()) shortcuts.push({ tab: "assignments", label: "Affectations", icon: "users-round" });
    if (canRecordPayment()) shortcuts.push({ tab: "cash", label: "Enregistrer un paiement", icon: "hand-coins" });
    if (canReadFinanceReceipts()) shortcuts.push({ tab: "receipts", label: "Reçus", icon: "receipt-text" });
    if (canAccessCashRegister()) shortcuts.push({ tab: "cash-register", label: "Caisse", icon: "landmark" });
    if (canReadFinanceReports()) shortcuts.push({ tab: "reports", label: "Rapports", icon: "file-chart-column" });
    var shortcutMarkup = shortcuts.map(function (shortcut) {
      return '<button type="button" class="finance-dashboard-action" data-finance-open="' + shortcut.tab + '"><i data-lucide="' + shortcut.icon + '"></i><span>' + escapeMarkup(shortcut.label) + '</span></button>';
    }).join("");
    return '<section class="finance-overview" data-finance-dashboard><header><div><span>Situation de l’école</span><h3>Vue d’ensemble Finance</h3><p>Suivez les frais, les opérations et les points à examiner.</p></div>' + window.ssBadge({ variant: "info", icon: "flask-conical", label: "DÉMONSTRATION" }) + '</header><aside class="finance-overview-note"><i data-lucide="info" aria-hidden="true"></i><p>Ces chiffres sont des exemples. Les montants en CDF et en USD restent séparés.</p></aside><div class="finance-dashboard-grid">' + metricMarkup(true) + '</div><section class="finance-dashboard-shortcuts"><header><h3>Accès rapide</h3><p>Les fonctions disponibles pour votre compte.</p></header><div>' + shortcutMarkup + '</div></section><section class="finance-dashboard-followup"><h3>Suivi financier</h3><div class="finance-dashboard-statuses">' + metricMarkup(false) + '</div></section></section>';
  }

  function renderFeeStructure() {
    var canRead = canReadFeeCatalog();
    var canManage = canManageFeeCatalog();
    var cycleOptions = [{ value: "nursery", label: "Maternelle" }, { value: "primary", label: "Primaire" }, { value: "secondary", label: "Secondaire" }];
    var currencyOptions = [{ value: "CDF", label: "CDF" }, { value: "USD", label: "USD" }];
    if (!canRead && !canManage) return window.ssState({ type: "error", title: "Accès non autorisé", message: "Vous ne disposez pas de la permission de consulter ou gérer le catalogue des frais." });

    var fees = feeCatalog();
    var rows = canRead ? fees.map(function (fee) {
      var amount = Number(fee.amount || 0).toLocaleString("fr-FR") + " " + escapeMarkup(fee.currency || "CDF");
      var origin = fee.local ? window.ssBadge({ label: "BROUILLON LOCAL", variant: "warning" }) : window.ssBadge({ label: isDemoMode() ? "DÉMONSTRATION" : (fee.active ? "Actif" : "Inactif"), variant: fee.active ? "success" : "warning" });
      return '<tr><td><b>' + escapeMarkup(fee.name) + '</b></td><td>' + escapeMarkup(fee.cycle) + '</td><td class="ss-table__cell--right finance-amount"><b>' + amount + '</b></td><td>' + escapeMarkup(fee.frequency || "Non définie") + '</td><td>' + escapeMarkup(fee.due) + '</td><td>' + origin + '</td></tr>';
    }).join("") : "";

    var form = canManage
      ? '<form class="finance-fee-form" id="financeFeeForm"><header><span><i data-lucide="circle-plus"></i></span><div><h3>Préparer un type de frais</h3><p>Le libellé et la fréquence sont libres. Aucun catalogue fermé n’est imposé.</p></div></header><div>' +
        window.ssField({ label: "Libellé", labelFor: "financeFeeLabel", required: true, inputHtml: window.ssInput({ type: "text", name: "label", id: "financeFeeLabel", required: true, maxlength: 200, placeholder: "Ex. Transport scolaire", autocomplete: "off" }) }) +
        window.ssField({ label: "Cycle concerné", labelFor: "financeFeeCycle", required: true, inputHtml: window.ssSelect({ name: "cycle_key", id: "financeFeeCycle", required: true, options: cycleOptions }) }) +
        window.ssField({ label: "Montant", labelFor: "financeFeeAmount", required: true, inputHtml: window.ssInput({ type: "number", name: "amount", id: "financeFeeAmount", required: true, min: 0, step: 1000, inputmode: "decimal", placeholder: "Montant" }) }) +
        window.ssField({ label: "Devise", labelFor: "financeFeeCurrency", required: true, inputHtml: window.ssSelect({ name: "currency", id: "financeFeeCurrency", required: true, value: "CDF", options: currencyOptions }) }) +
        window.ssField({ label: "Fréquence", labelFor: "financeFeeFrequency", required: true, inputHtml: window.ssInput({ type: "text", name: "frequency", id: "financeFeeFrequency", required: true, maxlength: 120, placeholder: "Ex. Une fois par activité", autocomplete: "off" }) }) +
        window.ssField({ label: "Échéance", labelFor: "financeFeeDueDate", help: "Facultative. Utilisez une date précise ; les règles récurrentes ne sont pas encore connectées.", className: "wide", inputHtml: window.ssInput({ type: "date", name: "due_date", id: "financeFeeDueDate" }) }) +
        '</div>' + window.ssButton({ label: "Préparer le brouillon", icon: "save", type: "submit" }) + '<p class="finance-backend-note">BROUILLON LOCAL · Conservé sur cet appareil, sans enregistrement officiel.</p></form>'
      : '<aside class="finance-readonly"><i data-lucide="eye"></i><p>Consultation uniquement. Votre compte ne permet pas de préparer un type de frais.</p></aside>';

    var catalogue = canRead ? window.ssTable({
      headers: ["Libellé", "Cycle concerné", { label: "Montant", align: "right" }, "Fréquence", "Échéance", "Statut"],
      wrapAttrs: { role: "region", "aria-label": "Catalogue des frais", tabindex: 0 },
      attrs: { "aria-label": "Types de frais" },
      rows: rows, empty: "Aucun type de frais configuré.", emptyTitle: "Catalogue des frais", responsive: true
    }) : window.ssState({
      type: "unavailable", title: "Lecture du catalogue non accordée",
      message: "Vous pouvez créer un type de frais, mais la permission finance.fee.read est nécessaire pour consulter le catalogue."
    });
    return '<div class="finance-two-column finance-catalog-layout"><section class="finance-panel"><header><div><span>TYPE DE FRAIS</span><h3>Catalogue des frais</h3><p>Montants par devise · CDF et USD séparés</p></div><b>' + (canRead ? fees.length : "—") + '</b></header>' + catalogue + '</section>' + form + '</div>';
  }

  function renderFeeAssignment() {
    var canManage = canManageFeeCatalog();
    var canRead = canReadFeeCatalog();
    var assignment = feeAssignmentState();
    assignment.targetIds = deduplicateAssignmentIds(assignment.targetIds);

    if (!canManage) {
      return window.ssState({
        type: "denied",
        title: "Affectation non autorisée",
        message: "La préparation frontend d’une affectation exige finance.fee.manage.",
        details: "Aucune affectation n’est créée depuis cette interface."
      });
    }

    if (!canRead) {
      return '<section class="finance-panel"><header><div><span>F2-FE · BACKEND_LATER</span><h3>Affecter un frais</h3></div>' + window.ssBadge({ variant: "warning", label: "Non connecté" }) + '</header>' + window.ssState({
        type: "unavailable",
        title: "Catalogue non disponible",
        message: "La sélection exige un fee_structure réel et la permission finance.fee.read.",
        details: "Aucun contournement de la lecture Finance n’est appliqué."
      }) + '</section>';
    }

    var feeTypes = feeCatalog();
    if (!feeTypes.length) {
      return '<section class="finance-panel"><header><div><span>F2-FE · BACKEND_LATER</span><h3>Affecter un frais</h3></div>' + window.ssBadge({ variant: "warning", label: "Non connecté" }) + '</header>' + window.ssState({
        type: "empty",
        title: "Aucun type de frais disponible",
        message: "Créez d’abord un type de frais dans le catalogue avant de préparer une affectation."
      }) + '</section>';
    }

    var fee = selectedFeeForAssignment();
    var targetingModes = [
      { value: "cycle", label: "Cycle" },
      { value: "class", label: "Classe" },
      { value: "students", label: "Élèves ciblés" }
    ];
    var feeOptions = feeTypes.map(function (item) {
      return { value: item.id, label: item.name + " · " + item.cycle };
    });
    var activeStudents = (financeState.students || []).map(mapFinancialStudent).filter(function (student) { return student.lifecycleStatus === "active"; });
    var classNames = activeStudents.map(function (student) { return student.className; }).filter(function (className, index, values) { return className && values.indexOf(className) === index; });
    var targetField = "";
    if (assignment.targetingMode === "class") {
      targetField = window.ssField({ label: "Classe active", labelFor: "financeAssignmentTargets", required: true, inputHtml: window.ssSelect({ name: "target_ids", id: "financeAssignmentTargets", required: true, value: assignment.targetIds[0] || classNames[0] || "", options: classNames.map(function (className) { return { value: className, label: className }; }) }) });
    } else if (assignment.targetingMode === "students") {
      targetField = window.ssField({ label: "Élèves actifs ciblés", labelFor: "financeAssignmentTargets", required: true, help: "Utilisez Ctrl/Cmd pour sélectionner plusieurs élèves.", inputHtml: '<select class="ss-select" name="target_ids" id="financeAssignmentTargets" multiple size="6" required>' + activeStudents.map(function (student) { return '<option value="' + escapeMarkup(student.id) + '"' + (assignment.targetIds.indexOf(student.id) >= 0 ? " selected" : "") + '>' + escapeMarkup(student.name) + '</option>'; }).join("") + '</select>' });
    } else {
      targetField = window.ssField({ label: "Cycle ciblé", inputHtml: window.ssInput({ type: "text", value: fee ? fee.cycle : "—", readonly: true }) });
    }
    var statusLegend = [
      ["paid", "En règle"],
      ["partial", "Paiement partiel"],
      ["pending", "À payer"],
      ["exempted", "Exempté"],
      ["anomaly", "Anomalie à examiner"]
    ].map(function (status) { return '<span data-obligation-status="' + status[0] + '">' + window.ssBadge({ label: status[0], variant: financialStatusDefinition(status[0]).variant }) + '<small>' + status[1] + '</small></span>'; }).join("");
    var draftRows = (financeState.assignmentDrafts || []).map(function (draft) {
      return '<article class="finance-assignment-draft" data-finance-assignment-draft><header><div><span>' + escapeMarkup(draft.feeName) + '</span><h4>' + escapeMarkup(draft.targetLabel) + '</h4></div>' + window.ssBadge({ label: "BROUILLON LOCAL", variant: "warning" }) + '</header><p>' + escapeMarkup(draft.populationLabel) + ' · ' + escapeMarkup(draft.amountLabel) + ' · ' + escapeMarkup(draft.frequency || "Fréquence non définie") + '</p><small>BACKEND_LATER · student_fee non créé</small></article>';
    }).join("");

    return '<section class="finance-assignment-workflow"><header class="finance-workflow-steps"><span>TYPE DE FRAIS</span><i data-lucide="arrow-right"></i><span>AFFECTATION</span><i data-lucide="arrow-right"></i><span>OBLIGATION ÉLÈVE</span></header><aside class="finance-audit-note"><i data-lucide="cloud-off"></i><p>Aucune obligation officielle n’est créée. La configuration reste un BROUILLON LOCAL · BACKEND_LATER.</p></aside><div class="finance-two-column"><section class="finance-panel"><header><div><span>F2-FE · BROUILLON LOCAL</span><h3>Préparer une affectation</h3><p>Cycle, classe ou élèves actifs ciblés.</p></div>' + window.ssBadge({ variant: "warning", icon: "plug-zap", label: "BACKEND_LATER" }) + '</header>' +
      '<form id="financeFeeAssignmentForm" class="finance-fee-form" novalidate><div class="ss-form-grid">' +
      window.ssField({ label: "Type de frais", labelFor: "financeAssignmentFee", required: true, inputHtml: window.ssSelect({ name: "fee_structure_id", id: "financeAssignmentFee", required: true, value: assignment.feeStructureId, options: feeOptions }) }) +
      window.ssField({ label: "Mode de ciblage", labelFor: "financeAssignmentTargetMode", required: true, inputHtml: window.ssSelect({ name: "targeting_mode", id: "financeAssignmentTargetMode", required: true, value: assignment.targetingMode, options: targetingModes }) }) +
      targetField + '</div><section class="finance-panel"><header><div><span>Type sélectionné</span><h3>' + escapeMarkup(fee ? fee.name : "—") + '</h3></div>' + window.ssBadge({ variant: fee && fee.active ? "success" : "warning", label: fee && fee.local ? "BROUILLON LOCAL" : "DÉMONSTRATION" }) + '</header><dl class="student-finance-facts"><div><dt>Montant attendu</dt><dd>' + assignmentAmountLabel(fee) + '</dd></div><div><dt>Devise</dt><dd>' + escapeMarkup(fee ? fee.currency : "—") + '</dd></div><div><dt>Fréquence</dt><dd>' + escapeMarkup(fee ? fee.frequency || "Non définie" : "—") + '</dd></div><div><dt>Échéance</dt><dd>' + escapeMarkup(fee ? fee.due : "—") + '</dd></div><div><dt>Statut</dt><dd>Préparation locale</dd></div></dl></section>' + window.ssButton({ label: "Préparer l’affectation", icon: "clipboard-check", type: "submit", disabled: !fee }) + '</form></section><aside class="finance-panel"><header><div><span>Obligations futures</span><h3>Statuts attendus</h3></div></header><div class="finance-obligation-statuses">' + statusLegend + '</div><p>Aucun statut n’est modifié par ce brouillon.</p></aside></div><section class="finance-assignment-drafts"><header><span>Préparations locales</span><h3>Affectations distinctes</h3></header>' + (draftRows || window.ssState({ type: "empty", title: "Aucune affectation préparée", message: "Préparez un brouillon sans créer de student_fee." })) + '</section></section>';
  }

  function renderCanteenFinanceLink() {
    if (!canManageCanteenFinanceLink()) {
      return window.ssState({ type: "denied", title: "Liaison financière Cantine non autorisée", message: "La permission existante canteen.manage avec portée school est requise. Aucun droit Finance n’est déduit." });
    }
    var canteenFees = feeCatalog().filter(function (fee) { return fee.active && /cantine/i.test(fee.name || ""); });
    var activeStudents = (financeState.students || []).map(mapFinancialStudent).filter(function (student) { return student.lifecycleStatus === "active"; });
    var options = canteenFees.map(function (fee) { return { value: fee.id, label: fee.name + " · " + formatFinancialAmount(fee.amount, fee.currency) + " · " + (fee.frequency || "Fréquence non définie") }; });
    var drafts = (financeState.canteenLinkDrafts || []).map(function (draft) {
      return '<article class="finance-canteen-draft" data-finance-canteen-draft><header><div><span>BROUILLON LOCAL</span><h4>' + escapeMarkup(draft.serviceLabel) + '</h4></div>' + window.ssBadge({ variant: "warning", label: "BACKEND_LATER" }) + '</header><p>' + escapeMarkup(draft.feeLabel) + ' · ' + escapeMarkup(draft.populationLabel) + '</p><small>Configuration de liaison uniquement · student_fee non créé</small></article>';
    }).join("");
    var form = canteenFees.length ? '<form id="financeCanteenLinkForm" class="finance-canteen-link-form"><div class="ss-form-grid">' +
      window.ssField({ label: "Service financier Cantine", labelFor: "financeCanteenService", required: true, inputHtml: window.ssInput({ id: "financeCanteenService", name: "service_label", required: true, maxlength: 120, placeholder: "Ex. Service cantine primaire" }) }) +
      window.ssField({ label: "Type de frais existant", labelFor: "financeCanteenFee", required: true, inputHtml: window.ssSelect({ id: "financeCanteenFee", name: "fee_structure_id", required: true, value: canteenFees[0].id, options: options }) }) +
      window.ssField({ label: "Population de liaison", labelFor: "financeCanteenTargeting", required: true, inputHtml: window.ssSelect({ id: "financeCanteenTargeting", name: "targeting_mode", required: true, value: "active_students", options: [{ value: "active_students", label: "Élèves actifs éligibles" }] }) }) +
      '</div>' + window.ssButton({ label: "Préparer la liaison", icon: "link-2", type: "submit" }) + '</form>' : window.ssState({ type: "empty", title: "Type de frais Cantine indisponible", message: "Finance doit d’abord définir un type de frais générique ; canteen.manage ne peut pas le créer." });
    return '<section class="finance-canteen-link" data-finance-canteen><header><div><span>F6-FE · Cantine financière uniquement</span><h3>Liaison du service Cantine</h3><p>canteen.manage prépare la liaison avec un type de frais existant, sans gérer le catalogue ni encaisser.</p></div>' + window.ssBadge({ variant: "info", label: "CONFIGURATION FRONTEND" }) + '</header><div class="finance-workflow-steps"><span>TYPE DE FRAIS</span><i data-lucide="arrow-right"></i><span>AFFECTATION</span><i data-lucide="arrow-right"></i><span>STUDENT_FEE</span></div><aside class="finance-audit-note"><i data-lucide="shield-check"></i><p>Seuls ' + activeStudents.length + ' élèves actifs sont comptés. Toute affectation et tout student_fee officiel restent BACKEND_LATER.</p></aside><div class="finance-two-column"><section class="finance-panel"><header><div><span>Configuration de liaison</span><h3>Préparation locale</h3></div></header>' + form + '</section><aside class="finance-panel"><header><div><span>Périmètre opérationnel</span><h3>FEATURE_LATER</h3></div></header><p>Repas, menus, stocks et présences ne font pas partie de la Phase F. Aucune action opérationnelle n’est exposée ici.</p><p>Le paiement reste sous finance.payment.record ; le type de frais reste sous finance.fee.manage.</p></aside></div><section class="finance-canteen-drafts"><header><span>Préparations distinctes</span><h3>Liaisons locales</h3></header>' + (drafts || window.ssState({ type: "empty", title: "Aucune liaison préparée", message: "La configuration n’entraîne aucune obligation financière." })) + '</section></section>';
  }

  function remediationFinanceProjection() {
    var pedagogy = root.SchoolSafeTeacherPedagogy;
    if (!pedagogy || typeof pedagogy.readRemediationDrafts !== "function") return [];
    var students = Array.isArray(pedagogy.STUDENTS) ? pedagogy.STUDENTS : [];
    var classes = Array.isArray(pedagogy.CLASSES) ? pedagogy.CLASSES : [];
    var subjects = Array.isArray(pedagogy.SUBJECTS) ? pedagogy.SUBJECTS : [];
    return pedagogy.readRemediationDrafts().map(function (draft) {
      var student = students.find(function (item) { return item.id === draft.studentId && item.lifecycleStatus === "active"; });
      var classItem = classes.find(function (item) { return item.id === draft.classId; });
      var subject = subjects.find(function (item) { return item.id === draft.subjectId; });
      if (!student || !classItem || !subject) return null;
      return { id: draft.id, studentId: student.id, studentName: student.name, classId: classItem.id, className: classItem.name, subjectId: subject.id, subjectName: subject.name, status: draft.status || "À ÉVALUER", local: draft.local === true };
    }).filter(Boolean);
  }

  function renderRemediationFinanceLink() {
    if (!canPrepareRemediationFinance()) {
      return window.ssState({ type: "denied", title: "Liaison financière Rattrapage non autorisée", message: "finance.fee.manage avec portée school est requis. Aucun droit n’est déduit de la Pédagogie." });
    }
    var remediationDrafts = remediationFinanceProjection();
    var feeTypes = feeCatalog().filter(function (fee) { return fee.active && /rattrapage|remédiation/i.test(fee.name || ""); });
    var remediationOptions = remediationDrafts.map(function (draft) { return { value: draft.id, label: draft.studentName + " · " + draft.className + " · " + draft.subjectName + " · " + draft.status }; });
    var feeOptions = feeTypes.map(function (fee) { return { value: fee.id, label: fee.name + " · " + formatFinancialAmount(fee.amount, fee.currency) }; });
    var form = remediationDrafts.length && feeTypes.length ? '<form id="financeRemediationLinkForm" class="finance-remediation-link-form"><div class="ss-form-grid">' +
      window.ssField({ label: "Brouillon D6 actif", labelFor: "financeRemediationDraft", required: true, inputHtml: window.ssSelect({ id: "financeRemediationDraft", name: "remediation_id", required: true, value: remediationDrafts[0].id, options: remediationOptions }) }) +
      window.ssField({ label: "Type de frais existant", labelFor: "financeRemediationFee", required: true, inputHtml: window.ssSelect({ id: "financeRemediationFee", name: "fee_structure_id", required: true, value: feeTypes[0].id, options: feeOptions }) }) +
      window.ssField({ label: "Part école (%)", labelFor: "financeRemediationSchoolShare", required: true, inputHtml: window.ssInput({ id: "financeRemediationSchoolShare", name: "school_share", type: "number", min: 0, max: 100, step: 0.01, required: true, placeholder: "À définir" }) }) +
      window.ssField({ label: "Autre part (%)", labelFor: "financeRemediationOtherShare", required: true, inputHtml: window.ssInput({ id: "financeRemediationOtherShare", name: "other_share", type: "number", min: 0, max: 100, step: 0.01, required: true, placeholder: "À définir" }) }) +
      window.ssField({ label: "Autre destination déclarée", labelFor: "financeRemediationOtherDestination", help: "Obligatoire si l’autre part est supérieure à zéro. Aucun bénéficiaire n’est inventé.", className: "wide", inputHtml: window.ssInput({ id: "financeRemediationOtherDestination", name: "other_destination", maxlength: 160, placeholder: "Nommer explicitement la destination" }) }) +
      '</div>' + window.ssButton({ label: "Préparer la liaison financière", icon: "split", type: "submit" }) + '</form>' : window.ssState({ type: "empty", title: "Rattrapage ou type de frais indisponible", message: "Un brouillon D6 actif et un type de frais Rattrapage existant sont nécessaires." });
    var error = financeState.remediationFinanceError ? '<aside class="finance-form-error" data-remediation-finance-error>' + escapeMarkup(financeState.remediationFinanceError) + '</aside>' : "";
    var prepared = (financeState.remediationFinanceDrafts || []).map(function (draft) {
      return '<article class="finance-remediation-draft" data-remediation-finance-draft><header><div><span>FRONTEND CONFIG</span><h4>' + escapeMarkup(draft.studentName + " · " + draft.className) + '</h4></div>' + window.ssBadge({ variant: "warning", label: "BACKEND_LATER" }) + '</header><p>' + escapeMarkup(draft.feeLabel + " · " + draft.subjectName + " · " + draft.remediationStatus) + '</p><dl class="student-finance-facts"><div><dt>Répartition école</dt><dd>Part école · ' + escapeMarkup(draft.schoolShare) + ' %</dd></div><div><dt>Destination déclarée</dt><dd>' + escapeMarkup(draft.otherDestination || "Autre destination non utilisée") + ' · ' + escapeMarkup(draft.otherShare) + ' %</dd></div><div><dt>Contrôle du total</dt><dd>Total · ' + escapeMarkup(draft.totalShare) + ' %</dd></div></dl><small>BROUILLON LOCAL · student_fee non créé · configuration sans écriture pédagogique</small></article>';
    }).join("");
    return '<section class="finance-remediation-link" data-remediation-finance><header><div><span>F7-FE · lecture D6</span><h3>Liaison financière du rattrapage</h3><p>La projection lit les brouillons pédagogiques actifs sans modifier leur contenu ni leur statut.</p></div>' + window.ssBadge({ variant: "info", label: "FRONTEND CONFIG" }) + '</header><aside class="finance-audit-note"><i data-lucide="shield-check"></i><p>La répartition est libre mais son total doit être exactement 100 %. Aucune part 40/60 ni aucun bénéficiaire ne sont imposés.</p></aside><div class="finance-two-column"><section class="finance-panel"><header><div><span>Configuration</span><h3>Préparer une affectation financière</h3></div></header>' + error + form + '</section><aside class="finance-panel"><header><div><span>Frontière D6</span><h3>Pédagogie intacte</h3></div></header><p>Seuls l’élève actif, la classe, la matière et le statut du brouillon sont projetés. Difficultés, objectifs et résultats restent dans D6.</p><p>BACKEND_LATER · aucune obligation et aucun paiement créés.</p></aside></div><section class="finance-remediation-drafts"><header><span>Préparations locales</span><h3>Affectations distinctes</h3></header>' + (prepared || window.ssState({ type: "empty", title: "Aucune liaison préparée", message: "Définissez explicitement une répartition totalisant 100 %." })) + '</section></section>';
  }

  function renderCash() {
    var d = deps();
    var canRecord = canRecordPayment();
    var isRealSession = !isDemoMode();
    if (!canRecord) {
      return window.ssState({
        type: "denied",
        title: "Encaissement non autorisé",
        message: "La permission finance.payment.record est requise pour enregistrer un paiement."
      });
    }
    if (isRealSession && !canReadFeeCatalog()) {
      return window.ssState({
        type: "unavailable",
        title: "Encaissement indisponible",
        message: "Connexion backend à finaliser : la projection minimale d’encaissement doit être fournie sous finance.payment.record.",
        details: "La Caisse ne contourne jamais finance.fee.read pour récupérer les obligations financières."
      });
    }

    var profiles = financeState.studentFinancialProfiles || [];
    if (!profiles.length) {
      return window.ssState({
        type: "empty",
        title: "Aucun élève disponible",
        message: "Aucune obligation financière n’est disponible pour l’encaissement."
      });
    }

    var profile = selectedCashProfile();
    if (!profile) {
      return window.ssState({
        type: "unavailable",
        title: "Élève indisponible",
        message: "La sélection actuelle ne correspond à aucun élève autorisé."
      });
    }
    var student = profile.student;
    var fee = selectedCashStudentFee(profile);
    var availability = paymentAvailability(fee);
    var studentOptions = profiles.map(function (item) {
      return { value: item.student.id, label: item.student.name + " · " + item.student.className };
    });
    var feeOptions = (profile.fees || []).map(function (item) {
      var status = financialStatusDefinition(item.status);
      return { value: item.student_fee_id, label: item.label + " · " + status.label + " · " + formatFinancialAmount(item.remaining, item.currency) };
    });
    var studentPanel = '<section class="finance-panel student-finance-panel"><header><div><span>Recherche du dossier</span><h3>Élève et obligations</h3></div>' + window.ssBadge({ variant: "neutral", label: profile.fees.length + " obligation(s)" }) + '</header>' +
      window.ssField({ label: "Élève", labelFor: "financeCashStudent", required: true, inputHtml: window.ssSelect({ id: "financeCashStudent", name: "student_id", value: student.id, options: studentOptions }) }) +
      '<article class="student-finance-card"><span class="student-avatar large">' + escapeMarkup(student.initials) + '</span><div><small>' + escapeMarkup(student.className + " · " + student.sex) + '</small><h3>' + escapeMarkup(student.name) + '</h3><p>' + escapeMarkup(student.guardian) + '</p></div></article>' +
      (profile.fees.length ? window.ssField({ label: "Obligation financière", labelFor: "financeCashStudentFee", required: true, inputHtml: window.ssSelect({ id: "financeCashStudentFee", name: "student_fee_id", value: fee ? fee.student_fee_id : financeState.selectedCashStudentFeeId, options: feeOptions }) }) : window.ssState({ type: "empty", title: "Aucune obligation financière affectée", message: "Cet élève ne possède aucun student_fee disponible." })) +
      '</section>';
    var feeSummary = fee ? '<section class="finance-panel"><header><div><span>Obligation sélectionnée</span><h3>' + escapeMarkup(fee.label) + '</h3></div>' + window.ssBadge({ variant: financialStatusDefinition(fee.status).variant, label: financialStatusDefinition(fee.status).label }) + '</header>' +
      window.ssTable({ headers: ["Type de frais", "Attendu", "Déjà payé", "Restant", "Devise"], rows: '<tr data-student-id="' + escapeMarkup(fee.student_id) + '" data-student-fee-id="' + escapeMarkup(fee.student_fee_id) + '" data-fee-structure-id="' + escapeMarkup(fee.fee_structure_id) + '"><td><b>' + escapeMarkup(fee.label) + '</b></td><td>' + formatFinancialAmount(fee.expected, fee.currency) + '</td><td>' + formatFinancialAmount(fee.paid, fee.currency) + '</td><td><b>' + formatFinancialAmount(fee.remaining, fee.currency) + '</b></td><td>' + escapeMarkup(fee.currency || "Indisponible") + '</td></tr>', responsive: true, compact: true }) + '</section>' : window.ssState({ type: "unavailable", title: "Obligation indisponible", message: "La sélection du student_fee doit être rétablie avant tout paiement." });
    var paymentForm = fee && availability.allowed && financeState.dayStatus === "Ouverte" ? '<form class="payment-form" id="paymentForm" data-student-id="' + escapeMarkup(student.id) + '" data-student-fee-id="' + escapeMarkup(fee.student_fee_id) + '" data-fee-structure-id="' + escapeMarkup(fee.fee_structure_id) + '" data-currency="' + escapeMarkup(fee.currency) + '"><header><span><i data-lucide="hand-coins"></i></span><div><h3>Paiement constaté</h3><p>La préparation sera rattachée uniquement à l’obligation sélectionnée. Aucun paiement en ligne n’est traité.</p></div></header><div>' +
      window.ssField({ label: "Montant reçu", labelFor: "financePaymentAmount", required: true, help: "Maximum : " + formatFinancialAmount(fee.remaining, fee.currency), inputHtml: window.ssInput({ type: "number", name: "amount", id: "financePaymentAmount", required: true, min: paymentStepForCurrency(fee.currency), max: fee.remaining, step: paymentStepForCurrency(fee.currency), inputmode: "decimal", placeholder: "Montant en " + fee.currency }) }) +
      window.ssField({ label: "Devise", labelFor: "financePaymentCurrency", inputHtml: window.ssInput({ type: "text", id: "financePaymentCurrency", value: fee.currency, readonly: true }) }) +
      window.ssField({ label: "Mode constaté", labelFor: "financePaymentMode", required: true, inputHtml: window.ssSelect({ name: "mode", id: "financePaymentMode", value: "cash", options: [{ value: "cash", label: "Espèces constatées" }, { value: "card", label: "Carte constatée" }, { value: "check", label: "Chèque constaté" }, { value: "bank_transfer", label: "Virement constaté" }, { value: "mobile_money", label: "Mobile money constaté" }, { value: "other", label: "Autre moyen constaté" }] }) }) +
      window.ssField({ label: "Référence ou observation", labelFor: "financePaymentReference", required: true, inputHtml: window.ssInput({ type: "text", name: "reference", id: "financePaymentReference", required: true, maxlength: 200, placeholder: "Ex. Deuxième tranche" }) }) +
      '</div>' + window.ssButton({ label: "Préparer la confirmation", icon: "badge-check", type: "submit" }) + '</form>' : window.ssState({ type: availability.allowed ? "unavailable" : "denied", title: availability.allowed ? "Encaissement indisponible" : "Paiement normal indisponible", message: financeState.dayStatus !== "Ouverte" ? "La journée de caisse ne permet plus de nouvel encaissement." : availability.message });
    var paymentDraft = financeState.paymentDraft;
    var paymentConfirmation = paymentDraft ? '<section class="finance-payment-confirmation" data-payment-confirmation><header><div><span>PAIEMENT CONSTATÉ</span><h3>Vérification avant confirmation</h3></div>' + window.ssBadge({ variant: "warning", label: isDemoMode() ? "DÉMONSTRATION" : "BACKEND_LATER" }) + '</header><dl class="student-finance-facts"><div><dt>Élève</dt><dd>' + escapeMarkup(paymentDraft.studentName) + '</dd></div><div><dt>student_fee exact</dt><dd>' + escapeMarkup(paymentDraft.studentFeeId) + '</dd></div><div><dt>Montant</dt><dd>' + formatFinancialAmount(paymentDraft.amount, paymentDraft.currency) + '</dd></div><div><dt>Mode</dt><dd>' + escapeMarkup(modeLabel(paymentDraft.mode)) + '</dd></div><div><dt>Référence</dt><dd>' + escapeMarkup(paymentDraft.reference) + '</dd></div></dl><p>Aucune obligation n’est modifiée avant cette confirmation locale.</p>' + (isDemoMode() ? window.ssButton({ label: "Confirmer le paiement constaté", icon: "circle-check", attrs: { "data-confirm-demo-payment": "true" } }) : window.ssState({ type: "unavailable", title: "Confirmation officielle — BACKEND_LATER", message: "Phase F ne déclenche aucune écriture serveur." })) + '</section>' : "";
    var receipt = financeState.lastConfirmedPayment;
    var receiptPreview = receipt ? '<section class="finance-receipt-preview" data-receipt-preview><header><div><span>APERÇU DE REÇU</span><h3>' + escapeMarkup(receipt.receipt) + '</h3></div>' + window.ssBadge({ variant: "info", label: "DÉMONSTRATION · NON OFFICIEL" }) + '</header><dl class="student-finance-facts"><div><dt>Élève</dt><dd>' + escapeMarkup(receipt.student) + '</dd></div><div><dt>student_fee exact</dt><dd>' + escapeMarkup(receipt.studentFeeId) + '</dd></div><div><dt>Frais</dt><dd>' + escapeMarkup(receipt.fee) + '</dd></div><div><dt>Montant constaté</dt><dd>' + formatFinancialAmount(receipt.amount, receipt.currency) + '</dd></div><div><dt>Mode</dt><dd>' + escapeMarkup(receipt.mode) + '</dd></div><div><dt>Référence</dt><dd>' + escapeMarkup(receipt.reference) + '</dd></div></dl><p>Cet aperçu local ne constitue ni un reçu officiel, ni un PDF, ni une preuve de paiement en ligne.</p></section>' : "";
    var demoActivity = isDemoMode() ? '<section class="finance-panel"><header><div><span>Encaissements · données fictives</span><h3>Activité de démonstration</h3></div><b>' + formatTransactionTotal(financeTotals().today) + '</b></header><aside class="finance-audit-note"><i data-lucide="flask-conical"></i><p>Cette activité est fictive et non officielle. Elle ne constitue ni un journal de caisse ni un registre de reçus.</p></aside>' + window.ssTable({ headers: ["Référence", "Élève", "Mode", "Montant", "Statut"], rows: financeTotals().today.map(function (transaction) { return '<tr><td><b>' + escapeMarkup(transaction.receipt) + '</b></td><td>' + escapeMarkup(transaction.student) + '</td><td>' + escapeMarkup(transaction.mode) + '</td><td><b>' + formatTransactionAmount(transaction) + '</b></td><td>' + window.ssBadge({ variant: d.certificationStatusClass(transaction.status), label: transaction.status }) + '</td></tr>'; }).join(""), empty: "Aucune opération fictive.", emptyTitle: "Encaissements de démonstration", responsive: true }) + '</section>' : "";
    return '<div class="cash-workspace"><section class="cashier-layout">' + studentPanel + paymentForm + '</section>' + paymentConfirmation + receiptPreview + demoActivity + feeSummary + '</div>';
  }

  function renderCashRegister() {
    if (!canAccessCashRegister()) {
      return window.ssState({
        type: "denied",
        title: "Accès Caisse non autorisé",
        message: "La consultation de cette surface exige une permission Caisse existante. Aucun accès n’est déduit d’un rôle ou de finance.payment.record."
      });
    }

    if (!isDemoMode()) {
      return '<section class="finance-panel"><header><div><span>Caisse</span><h3>Surface opérationnelle</h3><p>La connexion officielle reste volontairement indisponible.</p></div>' + window.ssBadge({ variant: "warning", icon: "plug-zap", label: "BACKEND_LATER" }) + '</header>' +
        window.ssState({
          type: "unavailable",
          title: "Caisse — BACKEND_LATER",
          message: "L’état courant, le journal autorisé, le rapprochement, la clôture et l’historique exigent une projection serveur dédiée.",
          details: "Cette projection devra appliquer la permission, le scope, la condition, la persistance et une séparation stricte par devise et moyen de paiement. Aucun rapport journalier, état local, PDF ou action offline n’est utilisé ici."
        }) + '</section>';
    }

    var demoRows = [
      ["CDF", "450 000 CDF", "125 000 CDF", "5"],
      ["USD", "80,00 USD", "45,00 USD", "3"]
    ].map(function (row) {
      return '<tr><td><b>' + row[0] + '</b></td><td>' + row[1] + '</td><td>' + row[2] + '</td><td>' + row[3] + '</td></tr>';
    }).join("");
    return '<section class="finance-panel cash-register-demo"><header><div><span>Caisse · projection fictive</span><h3>État opérationnel à venir</h3><p>Données d’illustration uniquement : aucune écriture, clôture ou synchronisation officielle n’est disponible.</p></div>' + window.ssBadge({ variant: "info", icon: "flask-conical", label: "DÉMO · Non officiel" }) + '</header>' +
      '<aside class="finance-audit-note"><i data-lucide="shield-check"></i><p>Les devises et les moyens sont présentés séparément. Aucun total CDF + USD et aucun tiroir physique ne sont déduits des autres moyens.</p></aside>' +
      window.ssTable({ headers: ["Devise", "Espèces", "Autres moyens", "Opérations fictives"], rows: demoRows, empty: "Aucune donnée de démonstration.", emptyTitle: "Caisse de démonstration", responsive: true }) +
      '<section class="finance-two-column"><section class="finance-panel"><header><div><span>Journal autorisé</span><h3>Projection future</h3></div></header>' + window.ssState({ type: "unavailable", title: "Journal réel — BACKEND_LATER", message: "Le journal réel exigera une projection serveur filtrée par scope et paginée." }) + '</section><section class="finance-panel"><header><div><span>Clôture et historique</span><h3>Contrat serveur requis</h3></div></header>' + window.ssState({ type: "unavailable", title: "Clôture réelle — BACKEND_LATER", message: "La clôture officielle doit être en ligne, idempotente et auditée ; l’historique dépendra du même contrat." }) + '</section></section></section>';
  }

  function renderReceipts() {
    if (!canReadFinanceReceipts()) {
      return window.ssState({
        type: "denied",
        title: "Accès Reçus non autorisé",
        message: "La consultation du registre exige finance.receipt.read. Aucun accès n’est déduit d’une autre permission Finance."
      });
    }
    if (!isDemoMode()) {
      return '<section class="finance-panel receipt-register"><header><div><span>Reçus</span><h3>Registre autorisé</h3><p>La consultation réelle attend une projection serveur dédiée.</p></div></header>' +
        window.ssState({
          type: "unavailable",
          title: "Registre des reçus — BACKEND_LATER",
          message: "La liste, la recherche et la consultation réelle exigent des filtres serveur, une permission appliquée et une pagination sûre.",
          details: "Le rapport journalier n’est pas utilisé comme registre de reçus. Aucun PDF, téléchargement ou impression n’est proposé depuis cette surface."
        }) +
      '</section>';
    }

    var rows = (financeState.transactions || []).map(function (receipt) {
      var statusVariant = receipt.status === "Annulé" ? "danger" : receipt.status === "Démonstration" ? "info" : "success";
      var cancellationAction = canCancelPayment() && receipt.status !== "Annulé" ? window.ssButton({ label: "Préparer l’annulation", variant: "secondary", icon: "circle-x", attrs: { "data-cancel-payment-id": receipt.id } }) : "";
      return '<tr><td><b>' + escapeMarkup(receipt.receipt) + '</b><small>' + escapeMarkup(receipt.date) + '</small></td><td><b>' + escapeMarkup(receipt.student) + '</b><small>' + escapeMarkup(receipt.className || "Classe indisponible") + '</small></td><td>' + escapeMarkup(receipt.fee) + '<small>student_fee : ' + escapeMarkup(receipt.studentFeeId || "DÉMO non lié") + '</small></td><td>' + escapeMarkup(receipt.mode) + '<small>' + escapeMarkup(receipt.reference || "Sans référence") + '</small></td><td><b>' + formatFinancialAmount(receipt.amount, receipt.currency) + '</b></td><td>' + window.ssBadge({ variant: statusVariant, label: receipt.status }) + cancellationAction + '</td></tr>';
    }).join("");
    var cancellationDrafts = (financeState.cancellationDrafts || []).map(function (draft) {
      return '<article class="finance-cancellation-draft" data-cancellation-draft><header><div><span>ANNULATION PRÉPARÉE</span><h4>' + escapeMarkup(draft.receipt) + '</h4></div>' + window.ssBadge({ variant: "warning", label: "BACKEND_LATER" }) + '</header><p>' + escapeMarkup(draft.reason) + '</p><small>Transaction ' + escapeMarkup(draft.paymentId) + ' · statut officiel inchangé</small></article>';
    }).join("");
    return '<section class="finance-panel receipt-register"><header><div><span>Reçus · démonstration</span><h3>Aperçus de reçus</h3><p>Ces aperçus sont fictifs, non officiels et ne déclenchent aucune génération PDF.</p></div>' + window.ssBadge({ variant: "info", icon: "flask-conical", label: "DÉMONSTRATION · NON OFFICIEL" }) + '</header><aside class="finance-audit-note"><i data-lucide="info"></i><p>Une annulation peut seulement être préparée localement avec finance.payment.cancel. Le paiement et son statut officiel restent intacts.</p></aside>' +
      window.ssTable({ headers: ['Référence', 'Élève', 'Frais', 'Paiement', 'Montant', 'Statut'], rows: rows, empty: 'Aucun reçu démo.', emptyTitle: 'Reçus', responsive: true }) +
      (cancellationDrafts ? '<section class="finance-cancellation-drafts"><header><span>Préparations locales</span><h3>Annulations distinctes</h3></header>' + cancellationDrafts + '</section>' : "") +
      '</section>';
  }

  function renderBalances() {
    if (!canReadFinancialDetails()) {
      if (canReadFinancialStatus()) {
        return window.ssState({
          type: "unavailable",
          title: "Vue statut non connectée",
          message: "La projection serveur sans montants exigée par finance.status.read n’existe pas encore.",
          details: "BACKEND_LATER — ne pas utiliser cette vue financière détaillée pour afficher seulement un statut."
        });
      }
      return window.ssState({
        type: "denied",
        title: "Situation financière non autorisée",
        message: "La consultation détaillée exige la permission finance.fee.read.",
        details: "finance.status.read disposera plus tard d’une projection serveur distincte, sans montant."
      });
    }

    if (hasUnsynchronizedFinancialOperation()) {
      return window.ssState({
        type: "unavailable",
        title: "Situation financière à actualiser",
        message: "Une opération locale attend sa synchronisation. Les soldes détaillés ne sont pas affichés avant confirmation serveur.",
        details: "Aucun montant ou statut local n’est déduit d’un paiement non confirmé."
      });
    }

    var profiles = financeState.studentFinancialProfiles || [];
    var search = String(financeState.financialSearch || "").trim().toLocaleLowerCase("fr-FR");
    var feeFilter = financeState.financialFeeFilter || "";
    var statusFilter = financeState.financialStatusFilter || "";
    var filteredProfiles = profiles.filter(function (profile) {
      var student = profile.student;
      var matchesSearch = !search || [student.name, student.className, student.matricule].join(" ").toLocaleLowerCase("fr-FR").indexOf(search) >= 0;
      var matchesFee = !feeFilter || profile.fees.some(function (fee) { return fee.fee_structure_id === feeFilter; });
      var matchesStatus = !statusFilter || profile.fees.some(function (fee) { return fee.status === statusFilter; });
      return matchesSearch && matchesFee && matchesStatus;
    });
    if (filteredProfiles.length && !filteredProfiles.some(function (profile) { return profile.student.id === financeState.selectedFinancialStudentId; })) {
      financeState.selectedFinancialStudentId = filteredProfiles[0].student.id;
    }
    var selectedProfile = filteredProfiles.find(function (profile) { return profile.student.id === financeState.selectedFinancialStudentId; }) || null;
    var feeOptions = [{ value: "", label: "Tous les types de frais" }].concat((financeState.feeTypes || []).map(function (fee) { return { value: fee.id, label: fee.name }; }));
    var statusOptions = [
      { value: "", label: "Tous les statuts" },
      { value: "pending", label: "À payer" },
      { value: "partial", label: "Paiement partiel" },
      { value: "paid", label: "En règle" },
      { value: "exempted", label: "Exempté" },
      { value: "anomaly", label: "Anomalie à examiner" }
    ];
    var studentOptions = filteredProfiles.map(function (profile) {
      var student = profile.student;
      return { value: student.id, label: student.name + " · " + student.className };
    });
    var filters = '<section class="finance-panel"><div class="ss-form-grid">' +
      window.ssField({ label: "Rechercher un élève", labelFor: "financeFinancialSearch", inputHtml: window.ssInput({ type: "search", id: "financeFinancialSearch", value: financeState.financialSearch, placeholder: "Nom, matricule ou classe", autocomplete: "off" }) }) +
      window.ssField({ label: "Type de frais", labelFor: "financeFinancialFeeFilter", inputHtml: window.ssSelect({ id: "financeFinancialFeeFilter", value: feeFilter, options: feeOptions }) }) +
      window.ssField({ label: "Statut", labelFor: "financeFinancialStatusFilter", inputHtml: window.ssSelect({ id: "financeFinancialStatusFilter", value: statusFilter, options: statusOptions }) }) +
      '</div></section>';

    if (!profiles.length) {
      return '<section class="balance-register">' + filters + window.ssState({ type: "empty", title: "Aucune obligation financière affectée", message: "Aucun student_fee n’a été retourné par la source Finance." }) + '</section>';
    }
    if (!selectedProfile) {
      return '<section class="balance-register">' + filters + window.ssState({ type: "empty", title: "Aucun élève ne correspond aux filtres", message: "Modifiez la recherche, le type de frais ou le statut." }) + '</section>';
    }

    var selectedStudent = selectedProfile.student;
    var visibleFees = selectedProfile.fees.filter(function (fee) {
      return (!feeFilter || fee.fee_structure_id === feeFilter) && (!statusFilter || fee.status === statusFilter);
    });
    var summary = selectedProfile.fees.reduce(function (result, fee) {
      result.total += 1;
      if (fee.status === "paid") result.paid += 1;
      if (fee.status === "exempted") result.exempted += 1;
      if (fee.status === "anomaly") result.anomalies += 1;
      if (fee.status === "pending" || fee.status === "partial") result.toRegularize += 1;
      result.expected += fee.expected;
      result.paidAmount += fee.paid;
      result.remaining += fee.remaining;
      return result;
    }, { total: 0, paid: 0, exempted: 0, anomalies: 0, toRegularize: 0, expected: 0, paidAmount: 0, remaining: 0 });
    var rows = visibleFees.map(function (fee) {
      var status = financialStatusDefinition(fee.status);
      var feeLabel = '<b>' + escapeMarkup(fee.label) + '</b>' + (fee.feeStructureAvailable ? "" : '<small>ID technique : ' + escapeMarkup(fee.fee_structure_id || "—") + "</small>");
      return '<tr data-student-id="' + escapeMarkup(fee.student_id) + '" data-student-fee-id="' + escapeMarkup(fee.student_fee_id) + '" data-fee-structure-id="' + escapeMarkup(fee.fee_structure_id) + '"><td>' + feeLabel + '</td><td>' + window.ssBadge({ variant: status.variant, label: status.label }) + '</td><td><b>' + formatFinancialAmount(fee.expected, fee.currency) + '</b></td><td>' + formatFinancialAmount(fee.paid, fee.currency) + '</td><td><b>' + formatFinancialAmount(fee.remaining, fee.currency) + '</b></td><td>' + escapeMarkup(fee.due) + '</td></tr>';
    }).join("");
    var studentSelect = window.ssField({ label: "Élève", labelFor: "financeFinancialStudent", inputHtml: window.ssSelect({ id: "financeFinancialStudent", value: selectedStudent.id, options: studentOptions }) });
    var identity = '<article class="student-finance-card"><span class="student-avatar large">' + escapeMarkup(selectedStudent.initials) + '</span><div><small>' + escapeMarkup(selectedStudent.className) + '</small><h3>' + escapeMarkup(selectedStudent.name) + '</h3><p>' + escapeMarkup(selectedStudent.guardian) + '</p></div></article>';
    var summaryMarkup = '<div class="balance-summary"><article><small>Frais</small><b>' + summary.total + '</b></article><article><small>En règle</small><b>' + summary.paid + '</b></article><article><small>À régulariser</small><b>' + summary.toRegularize + '</b></article><article><small>Exemptés</small><b>' + summary.exempted + '</b></article><article><small>Anomalies</small><b>' + summary.anomalies + '</b></article></div>';
    var hasUnknownCurrency = selectedProfile.fees.some(function (fee) { return !fee.currency; });
    var currencies = selectedProfile.fees.map(function (fee) { return fee.currency; }).filter(Boolean).filter(function (currency, index, values) { return values.indexOf(currency) === index; });
    var amountSummary = currencies.length === 1 && !hasUnknownCurrency
      ? '<dl class="student-finance-facts"><div><dt>Attendu cumulé</dt><dd>' + formatFinancialAmount(summary.expected, currencies[0]) + '</dd></div><div><dt>Payé cumulé</dt><dd>' + formatFinancialAmount(summary.paidAmount, currencies[0]) + '</dd></div><div><dt>Restant cumulé</dt><dd>' + formatFinancialAmount(summary.remaining, currencies[0]) + '</dd></div></dl>'
      : '<aside class="finance-audit-note"><i data-lucide="circle-alert"></i><p>Montants cumulés indisponibles : une devise ou une structure de frais manque, ou plusieurs devises sont utilisées. Consultez chaque ligne individuellement.</p></aside>';
    var feesTable = visibleFees.length ? window.ssTable({ headers: ["Type de frais", "Statut", "Attendu", "Payé", "Restant", "Échéance"], rows: rows, responsive: true }) : window.ssState({ type: "empty", title: "Aucune obligation financière affectée", message: "Aucun frais du profil ne correspond aux filtres actifs." });
    var linkedTransactions = (financeState.transactions || []).filter(function (transaction) {
      return transaction.studentId === selectedStudent.id || (!transaction.studentId && transaction.student === selectedStudent.name);
    });
    var transactionRows = linkedTransactions.map(function (transaction) {
      return '<tr><td><b>' + escapeMarkup(transaction.receipt || transaction.id) + '</b></td><td>' + escapeMarkup(transaction.fee || "Frais") + '</td><td>' + formatTransactionAmount(transaction) + '</td><td>' + escapeMarkup(transaction.mode || "—") + '</td><td>' + window.ssBadge({ label: transaction.status || "Démonstration", variant: transaction.status === "Annulé" ? "danger" : "success" }) + '</td></tr>';
    }).join("");
    var linkedExemptions = (financeState.exemptionDrafts || []).filter(function (draft) { return draft.studentId === selectedStudent.id; });
    var exemptionRows = linkedExemptions.map(function (draft) {
      return '<tr><td><b>' + escapeMarkup(draft.studentFeeId) + '</b></td><td>' + escapeMarkup(draft.type === "partial" ? "Partielle" : "Totale") + '</td><td>' + escapeMarkup(draft.reason) + '</td><td>' + window.ssBadge({ label: "BROUILLON LOCAL", variant: "warning" }) + '</td></tr>';
    }).join("");
    var linkedPanels = '<section class="finance-two-column"><section class="finance-panel"><header><div><span>Preuves de paiement</span><h3>Transactions liées</h3></div><b>' + linkedTransactions.length + '</b></header>' + window.ssTable({ headers: ["Reçu", "Type de frais", "Montant", "Mode", "Statut"], rows: transactionRows, empty: "Aucune transaction liée.", emptyTitle: "Transactions", responsive: true, compact: true }) + '</section><section class="finance-panel"><header><div><span>Documents disponibles</span><h3>Reçus disponibles</h3></div><b>' + linkedTransactions.filter(function (transaction) { return !!transaction.receipt; }).length + '</b></header>' + (linkedTransactions.length ? '<ul class="finance-receipt-links">' + linkedTransactions.filter(function (transaction) { return !!transaction.receipt; }).map(function (transaction) { return '<li><b>' + escapeMarkup(transaction.receipt) + '</b><span>' + escapeMarkup(transaction.date || "—") + '</span></li>'; }).join("") + '</ul>' : window.ssState({ type: "empty", title: "Aucun reçu", message: "Aucun reçu de démonstration n’est lié à cet élève." })) + '</section></section><section class="finance-panel"><header><div><span>Préparations locales</span><h3>Exemptions</h3></div><b>' + linkedExemptions.length + '</b></header>' + window.ssTable({ headers: ["student_fee", "Type", "Motif", "Statut"], rows: exemptionRows, empty: "Aucune exemption préparée.", emptyTitle: "Exemptions", responsive: true, compact: true }) + '</section>';

    return '<section class="balance-register" data-student-financial-situation><header><div><span>Situation financière</span><h3>Frais de l’élève</h3><p>Chaque ligne représente un student_fee distinct ; les montants proviennent des données Finance chargées.</p></div><b>' + filteredProfiles.length + ' élève(s)</b></header>' + filters + '<section class="finance-two-column"><aside class="finance-panel">' + studentSelect + identity + summaryMarkup + '</aside><section class="finance-panel"><header><div><span>Résumé de l’élève</span><h3>Obligations financières</h3></div></header>' + summaryMarkup + amountSummary + '</section></section><section class="finance-panel"><header><div><span>Détail individuel</span><h3>Frais applicables</h3><p>Les frais restent indépendants ; la synthèse ne remplace pas cette liste.</p></div></header>' + feesTable + '</section>' + linkedPanels + '</section>';
  }

  function renderExemptions() {
    if (!canPrepareExemption()) {
      return window.ssState({
        type: "denied",
        title: "Exemptions non autorisées",
        message: "La préparation d’une exemption nécessite temporairement finance.fee.manage.",
        details: "La permission cible finance.exemption.manage reste BACKEND_LATER."
      });
    }
    if (!canReadFinancialDetails()) {
      return window.ssState({
        type: "unavailable",
        title: "Exemptions indisponibles",
        message: "Connexion backend à finaliser : la projection student_fee autorisée est requise.",
        details: "La surface ne contourne jamais finance.fee.read pour obtenir des montants ou des élèves."
      });
    }

    var profiles = financeState.studentFinancialProfiles || [];
    if (!profiles.length) {
      return window.ssState({ type: "empty", title: "Aucune obligation financière", message: "Aucun student_fee n’est disponible pour préparer une exemption." });
    }

    var draft = exemptionDraftState();
    var profile = selectedExemptionProfile();
    if (!profile) {
      return window.ssState({ type: "unavailable", title: "Élève indisponible", message: "La sélection actuelle ne correspond à aucun élève autorisé." });
    }
    var fee = selectedExemptionStudentFee(profile);
    var availability = exemptionAvailability(fee);
    var student = profile.student;
    var studentOptions = profiles.map(function (item) {
      return { value: item.student.id, label: item.student.name + " · " + item.student.className };
    });
    var feeOptions = (profile.fees || []).map(function (item) {
      return { value: item.student_fee_id, label: item.label + " · " + financialStatusDefinition(item.status).label + " · " + formatFinancialAmount(item.remaining, item.currency) };
    });
    var studentPanel = '<section class="finance-panel student-finance-panel"><header><div><span>Préparation d’exemption</span><h3>Élève et obligation</h3></div>' + window.ssBadge({ variant: "neutral", label: profile.fees.length + " obligation(s)" }) + '</header>' +
      window.ssField({ label: "Élève", labelFor: "financeExemptionStudent", required: true, inputHtml: window.ssSelect({ id: "financeExemptionStudent", name: "student_id", value: student.id, options: studentOptions }) }) +
      '<article class="student-finance-card"><span class="student-avatar large">' + escapeMarkup(student.initials) + '</span><div><small>' + escapeMarkup(student.className + " · " + student.sex) + '</small><h3>' + escapeMarkup(student.name) + '</h3><p>' + escapeMarkup(student.guardian) + '</p></div></article>' +
      window.ssField({ label: "Obligation financière", labelFor: "financeExemptionStudentFee", required: true, inputHtml: window.ssSelect({ id: "financeExemptionStudentFee", name: "student_fee_id", value: fee ? fee.student_fee_id : draft.studentFeeId, options: feeOptions }) }) +
      '</section>';

    var feeSummary = fee ? '<section class="finance-panel"><header><div><span>Student_fee sélectionné</span><h3>' + escapeMarkup(fee.label) + '</h3></div>' + window.ssBadge({ variant: financialStatusDefinition(fee.status).variant, label: financialStatusDefinition(fee.status).label }) + '</header>' +
      window.ssTable({ headers: ["Type de frais", "Attendu", "Payé", "Restant", "Devise"], rows: '<tr data-student-id="' + escapeMarkup(fee.student_id) + '" data-student-fee-id="' + escapeMarkup(fee.student_fee_id) + '" data-fee-structure-id="' + escapeMarkup(fee.fee_structure_id) + '"><td><b>' + escapeMarkup(fee.label) + '</b></td><td>' + formatFinancialAmount(fee.expected, fee.currency) + '</td><td>' + formatFinancialAmount(fee.paid, fee.currency) + '</td><td><b>' + formatFinancialAmount(fee.remaining, fee.currency) + '</b></td><td>' + escapeMarkup(fee.currency) + '</td></tr>', responsive: true, compact: true }) +
      '</section>' : window.ssState({ type: "unavailable", title: "Obligation indisponible", message: "La sélection du student_fee doit être rétablie avant de préparer une exemption." });

    var preparation = draft.prepared ? window.ssState({
      type: "success",
      title: "Configuration prête — connexion backend requise",
      message: "Aucune exemption n’a été appliquée. La demande préparée reste non connectée.",
      details: "BACKEND_LATER : validation, persistance, audit et révocation doivent être effectués côté serveur."
    }) : "";
    var preparedDrafts = (financeState.exemptionDrafts || []).map(function (item) {
      var typeLabel = item.type === "partial" ? "Exemption partielle" : "Exemption totale";
      var amountLabel = item.type === "partial" ? formatFinancialAmount(item.amount, item.currency) : "Total du restant préparé";
      return '<article class="finance-exemption-draft" data-finance-exemption-draft><header><div><span>' + escapeMarkup(item.studentName) + '</span><h4>' + typeLabel + '</h4></div>' + window.ssBadge({ label: "BROUILLON LOCAL", variant: "warning" }) + '</header><p><b>' + escapeMarkup(item.feeLabel) + '</b> · ' + amountLabel + '</p><p>' + escapeMarkup(item.reason) + '</p><small>BACKEND_LATER · Aucune exemption appliquée · aucun paiement créé</small></article>';
    }).join("");
    var form = fee && availability.allowed ? '<form class="payment-form" id="financeExemptionForm" data-student-id="' + escapeMarkup(student.id) + '" data-student-fee-id="' + escapeMarkup(fee.student_fee_id) + '" data-fee-structure-id="' + escapeMarkup(fee.fee_structure_id) + '" data-currency="' + escapeMarkup(fee.currency) + '"><header><span><i data-lucide="shield-check"></i></span><div><h3>Préparer une demande</h3><p>Aucune exonération ni modification de montant ne sera enregistrée depuis cet écran.</p></div></header><div>' +
      window.ssField({ label: "Type d’exemption", labelFor: "financeExemptionType", required: true, inputHtml: window.ssSelect({ id: "financeExemptionType", name: "exemption_type", value: draft.type, options: [{ value: "total", label: "Totale" }, { value: "partial", label: "Partielle" }] }) }) +
      (draft.type === "partial" ? window.ssField({ label: "Montant exonéré", labelFor: "financeExemptionAmount", required: true, help: "Maximum : " + formatFinancialAmount(fee.remaining, fee.currency), inputHtml: window.ssInput({ type: "number", id: "financeExemptionAmount", name: "amount", required: true, min: paymentStepForCurrency(fee.currency), max: fee.remaining, step: paymentStepForCurrency(fee.currency), inputmode: "decimal", placeholder: "Montant en " + fee.currency }) }) : "") +
      window.ssField({ label: "Motif", labelFor: "financeExemptionReason", required: true, inputHtml: '<textarea id="financeExemptionReason" name="reason" rows="3" required maxlength="1000" placeholder="Expliquez le motif de la demande…"></textarea>' }) +
      '</div>' + window.ssButton({ label: "Préparer la demande", icon: "clipboard-check", type: "submit" }) + '</form>' : window.ssState({ type: availability.allowed ? "unavailable" : "unavailable", title: "Préparation indisponible", message: availability.message, details: "Aucune exemption réelle n’est appliquée." });

    return '<section class="balance-register"><header><div><span>Finance générale</span><h3>Exemptions</h3><p>Préparez une demande sur un student_fee précis. Cette surface est explicitement non connectée.</p></div>' + window.ssBadge({ variant: "warning", icon: "plug-zap", label: "BACKEND_LATER" }) + '</header><section class="finance-two-column">' + studentPanel + feeSummary + '</section><section class="finance-panel">' + preparation + form + '</section><section class="finance-exemption-drafts"><header><span>Aperçu avant application</span><h3>Exemptions préparées</h3></header>' + (preparedDrafts || window.ssState({ type: "empty", title: "Aucune exemption préparée", message: "Les demandes apparaîtront ici sans modifier l’obligation." })) + '</section></section>';
  }

  function renderControlCampaignManagement() {
    if (!canManageControlCampaigns()) {
      return window.ssState({
        type: "denied",
        title: "Gestion des campagnes non autorisée",
        message: "La préparation d’une campagne nécessite temporairement finance.control.manage.",
        details: "La permission cible finance.control.campaign.manage reste BACKEND_LATER."
      });
    }
    if (!canReadFeeCatalog()) {
      return window.ssState({
        type: "unavailable",
        title: "Catalogue des frais indisponible",
        message: "La préparation exige un fee_structure réel et la permission finance.fee.read.",
        details: "La surface ne contourne jamais la lecture Finance pour sélectionner un type de frais."
      });
    }
    if (!financeState.feeTypes.length) {
      return window.ssState({
        type: "empty",
        title: "Aucun type de frais disponible",
        message: "Créez ou chargez d’abord un type de frais avant de préparer une campagne."
      });
    }

    var draft = campaignDraftState();
    var fee = selectedFeeForCampaignDraft();
    var feeOptions = financeState.feeTypes.map(function (item) {
      return { value: item.id, label: item.name + " · " + item.cycle };
    });
    var statuses = [
      [window.ssBadge({ variant: "neutral", label: "Brouillon" }), "Préparation locale uniquement"],
      [window.ssBadge({ variant: "info", label: "Publiée" }), "Publication serveur requise"],
      [window.ssBadge({ variant: "warning", label: "Fermée" }), "Transition serveur requise"],
      [window.ssBadge({ variant: "neutral", label: "Archivée" }), "Transition serveur requise"]
    ].map(function (row) { return "<tr><td>" + row[0] + "</td><td>" + row[1] + "</td></tr>"; }).join("");
    var unavailableTargets = window.ssState({
      type: "unavailable",
      title: "Classes · BACKEND_LATER",
      message: "Projection Finance autorisée requise pour cibler une ou plusieurs classes.",
      details: "Élèves individuels · BACKEND_LATER — Contrôleurs · BACKEND_LATER"
    });
    var prepared = draft.prepared ? window.ssState({
      type: "success",
      title: "Configuration prête — connexion backend requise pour publier/activer",
      message: "Aucune campagne serveur n’a été créée. La préparation reste non connectée.",
      details: "BACKEND_LATER : cibles, assignees, publication, activation, audit et historique."
    }) : "";
    var summary = '<aside class="finance-panel"><header><div><span>Résumé avant action</span><h3>Campagne préparée</h3></div>' + window.ssBadge({ variant: "warning", icon: "plug-zap", label: "Non connectée" }) + '</header><dl class="student-finance-facts"><div><dt>Type de frais</dt><dd>' + escapeMarkup(fee ? fee.name : "—") + '</dd></div><div><dt>Cycle (filtre du catalogue)</dt><dd>' + escapeMarkup(fee ? fee.cycle : "—") + '</dd></div><div><dt>Période</dt><dd>' + escapeMarkup(draft.startsAt && draft.endsAt ? formatIsoDateFr(draft.startsAt) + " → " + formatIsoDateFr(draft.endsAt) : "À compléter") + '</dd></div><div><dt>Classes / élèves / contrôleurs</dt><dd>BACKEND_LATER</dd></div><div><dt>Statut à préparer</dt><dd>Brouillon uniquement</dd></div></dl></aside>';
    var form = '<form id="financeCampaignForm" class="finance-fee-form" novalidate><header><span><i data-lucide="calendar-plus"></i></span><div><h3>Préparer la campagne</h3><p>Une campagne ne devient jamais active depuis cette interface.</p></div></header><div class="ss-form-grid">' +
      window.ssField({ label: "Nom de campagne", labelFor: "financeCampaignName", required: true, inputHtml: window.ssInput({ type: "text", id: "financeCampaignName", name: "label", required: true, maxlength: 200, value: draft.label, placeholder: "Ex. Contrôle excursion septembre" }) }) +
      window.ssField({ label: "Type de frais", labelFor: "financeCampaignFee", required: true, inputHtml: window.ssSelect({ id: "financeCampaignFee", name: "fee_structure_id", required: true, value: fee ? fee.id : draft.feeStructureId, options: feeOptions }) }) +
      window.ssField({ label: "Début", labelFor: "financeCampaignStart", required: true, inputHtml: window.ssInput({ type: "date", id: "financeCampaignStart", name: "starts_at", required: true, value: draft.startsAt }) }) +
      window.ssField({ label: "Fin", labelFor: "financeCampaignEnd", required: true, inputHtml: window.ssInput({ type: "date", id: "financeCampaignEnd", name: "ends_at", required: true, value: draft.endsAt }) }) +
      window.ssField({ label: "Consigne opérationnelle", labelFor: "financeCampaignInstruction", required: true, className: "wide", inputHtml: '<textarea id="financeCampaignInstruction" name="description" rows="3" required maxlength="1000" placeholder="Décrivez la consigne appliquée au contrôle…">' + escapeMarkup(draft.description) + '</textarea>' }) +
      '</div>' + unavailableTargets + window.ssButton({ label: "Préparer la campagne", icon: "clipboard-check", type: "submit", disabled: !fee }) + '</form>';

    return '<section class="balance-register"><header><div><span>Finance générale · FE-FIN-07A</span><h3>Campagnes de contrôle</h3><p>Configurez une campagne sur un type de frais réel. La publication et l’activation restent BACKEND_LATER.</p></div>' + window.ssBadge({ variant: "warning", icon: "plug-zap", label: "BACKEND_LATER" }) + '</header><section class="finance-panel"><header><div><span>États cibles</span><h3>Cycle de vie de campagne</h3></div></header>' + window.ssTable({ headers: ["Statut", "Connexion actuelle"], rows: statuses, responsive: true, compact: true }) + '</section><section class="finance-two-column">' + form + summary + '</section>' + prepared + '</section>';
  }

  function renderReports() {
    if (!canReadFinanceReports()) {
      return window.ssState({
        type: "denied",
        title: "Rapports financiers non autorisés",
        message: "La consultation exige la permission finance.report.read. Aucun rapport n’est chargé sans cette permission."
      });
    }

    if (!isDemoMode()) {
      return '<section class="finance-panel finance-reports"><header><div><span>Rapports financiers</span><h3>Surface distincte</h3><p>Les rapports officiels ne sont pas encore connectés.</p></div>' + window.ssBadge({ variant: "warning", icon: "plug-zap", label: "BACKEND_LATER" }) + '</header>' +
        window.ssState({
          type: "unavailable",
          title: "Rapports financiers — BACKEND_LATER",
          message: "La projection serveur actuelle ne garantit pas une séparation sûre par devise : CDF et USD ne doivent jamais être additionnés.",
          details: "Le futur contrat devra fournir les périodes, agrégats par devise, moyens et types de frais, avec permission, scope, pagination et audit. Aucun rapport journalier legacy, total local ou export n’est utilisé ici."
        }) + '</section>';
    }

    var demoRows = [
      ["CDF", "450 000 CDF", "Espèces : 300 000 CDF · Virement : 150 000 CDF", "Scolarité · 300 000 CDF<br>Inscription · 150 000 CDF"],
      ["USD", "80,00 USD", "Espèces : 35,00 USD · Mobile money : 45,00 USD", "Transport · 80,00 USD"]
    ].map(function (row) {
      return '<tr><td><b>' + row[0] + '</b></td><td><b>' + row[1] + '</b></td><td>' + row[2] + '</td><td>' + row[3] + '</td></tr>';
    }).join("");
    return '<section class="finance-panel finance-reports"><header class="finance-report-head"><div><span>Rapports financiers · projection fictive</span><h3>Lecture par devise</h3><p>Cette démonstration visualise la future surface sans constituer un rapport officiel.</p></div>' + window.ssBadge({ variant: "info", icon: "flask-conical", label: "DÉMO · Non officiel" }) + '</header>' +
      '<aside class="finance-audit-note"><i data-lucide="shield-check"></i><p>Aucun total CDF + USD : chaque devise reste séparée. Aucun export, aucune clôture et aucune donnée serveur ne sont proposés.</p></aside>' +
      '<div class="ss-form-grid">' + window.ssField({ label: "Période fictive", labelFor: "financeReportDate", inputHtml: window.ssInput({ type: "date", id: "financeReportDate", value: financeState.reportDate }) }) + '</div>' +
      window.ssTable({ headers: ["Devise", "Total fictif", "Répartition par moyen", "Répartition par type de frais"], rows: demoRows, empty: "Aucune donnée de démonstration.", emptyTitle: "Rapports de démonstration", responsive: true }) +
      '<section class="finance-two-column"><section class="finance-panel"><header><div><span>Périodes</span><h3>Contrat à venir</h3></div></header>' + window.ssState({ type: "unavailable", title: "Mensuel et période — BACKEND_LATER", message: "La sélection réelle de période exige des agrégats serveur séparés par devise." }) + '</section><section class="finance-panel"><header><div><span>Exports</span><h3>Contrat à venir</h3></div></header>' + window.ssState({ type: "unavailable", title: "CSV, Excel et PDF — BACKEND_LATER", message: "Aucun export officiel n’est disponible avant le contrat de rapport canonique." }) + '</section></section></section>';
  }

  function currentGuardianName() {
    var session = currentSession();
    if (session && session.profile && session.profile.display_name) return session.profile.display_name;
    // Demo fallback when no real session is active.
    return "Mme Sophie Martin";
  }

  function renderFamilyFinance() {
    if (!isDemoMode()) {
      return '<div class="family-finance">' + window.ssState({
        type: "unavailable",
        title: "Situation familiale non connectée",
        message: "La projection own_children sécurisée n’est pas encore fournie par l’API Finance.",
        details: "BACKEND_LATER — aucun frais, montant ou reçu ne peut être déduit côté navigateur pour un parent."
      }) + '</div>';
    }
    var guardianName = currentGuardianName();
    var children = (financeState.studentFinancialProfiles || []).filter(function (profile) { return profile.student.guardian === guardianName; });
    if (financeState.selectedFamilyStudent >= children.length) financeState.selectedFamilyStudent = 0;
    var profile = children[financeState.selectedFamilyStudent];
    if (!profile) {
      return '<div class="family-finance">' + window.ssState({ type: "empty", title: "Aucun enfant rattaché", message: "Aucun enfant rattaché à votre profil.", size: "compact" }) + '</div>';
    }
    var student = profile.student;
    var options = children.map(function (item, index) { return '<option value="' + index + '"' + (index === financeState.selectedFamilyStudent ? " selected" : "") + '>' + escapeMarkup(item.student.name + " · " + item.student.className) + '</option>'; }).join("");
    var rows = profile.fees.map(function (fee) {
      var status = financialStatusDefinition(fee.status);
      return '<tr data-student-id="' + escapeMarkup(fee.student_id) + '" data-student-fee-id="' + escapeMarkup(fee.student_fee_id) + '"><td><b>' + escapeMarkup(fee.label) + '</b></td><td>' + window.ssBadge({ variant: status.variant, label: status.label }) + '</td><td>' + formatFinancialAmount(fee.expected, fee.currency) + '</td><td>' + formatFinancialAmount(fee.paid, fee.currency) + '</td><td>' + formatFinancialAmount(fee.remaining, fee.currency) + '</td></tr>';
    }).join("");
    return '<div class="family-finance"><header><div><span>Situation familiale · démonstration</span><h3>Frais de mes enfants</h3><p>Les reçus réels exigent la projection own_children sécurisée.</p></div>' + window.ssBadge({ variant: "warning", icon: "plug-zap", label: "Démonstration" }) + '</header><label class="family-student-picker">Enfant suivi<select id="familyFinanceStudent">' + options + '</select></label><section class="family-finance-summary"><div><span class="student-avatar large">' + escapeMarkup(student.initials) + '</span><div><small>' + escapeMarkup(student.className) + '</small><h3>' + escapeMarkup(student.name) + '</h3><p>' + profile.fees.length + ' obligation(s) financière(s)</p></div></div></section>' + window.ssTable({ headers: ["Type de frais", "Statut", "Attendu", "Payé", "Restant"], rows: rows, empty: "Aucune obligation financière affectée.", emptyTitle: "Situation financière", responsive: true }) + '</div>';
  }

  // ---------------------------------------------------------------------------
  // Rendu principal
  // ---------------------------------------------------------------------------
  function renderFinanceModule() {
    var d = deps();
    var moduleEl = document.getElementById("financeModule");
    var contentEl = document.getElementById("financeContent");
    var titleEl = document.getElementById("financeModuleTitle");
    var workspaceTitle = document.getElementById("workspaceTitle");
    if (!moduleEl || !contentEl) return;

    var allowedTabs = financeTabsForRole();
    if (!allowedTabs.length) {
      if (titleEl) titleEl.textContent = "Finance";
      if (workspaceTitle) workspaceTitle.textContent = "Finance";
      document.querySelectorAll("#financeTabs [data-finance-tab]").forEach(function (button) { button.hidden = true; button.classList.remove("active"); button.setAttribute("aria-pressed", "false"); });
      contentEl.innerHTML = window.ssState({
        type: "denied",
        title: "Finance générale non autorisée",
        message: "Aucune sous-fonction Finance générale n’est accordée à cette session.",
        details: "Les permissions finance.control.* ouvrent uniquement Contrôle des frais."
      });
      d.icons();
      return;
    }
    var titles = { overview: "Pilotage financier", fees: "Structure des frais", assignments: "Affectation des frais", exemptions: "Exemptions", campaigns: "Campagnes de contrôle", cash: "Encaissements", receipts: "Reçus", "cash-register": "Caisse", balances: "Soldes et régularité", reports: "Rapports financiers", family: "Situation familiale", canteen: "Liaison financière Cantine", "remediation-finance": "Rattrapage financier" };
    if (titleEl) titleEl.textContent = titles[financeState.activeTab] || "Finance";
    if (workspaceTitle) workspaceTitle.textContent = titles[financeState.activeTab] || "Finance";

    document.querySelectorAll("#financeTabs [data-finance-tab]").forEach(function (button) {
      var tab = button.getAttribute("data-finance-tab");
      button.hidden = allowedTabs.indexOf(tab) === -1;
      button.classList.toggle("active", tab === financeState.activeTab);
      button.setAttribute("aria-pressed", String(!button.hidden && tab === financeState.activeTab));
      if (button.hidden) button.classList.remove("active");
    });

    if (allowedTabs.indexOf(financeState.activeTab) === -1) {
      contentEl.innerHTML = window.ssState({ type: "denied", title: financeState.activeTab === "reports" ? "Rapports financiers non autorisés" : "Accès non autorisé", message: "Votre compte ne permet pas d’ouvrir cette fonction. Choisissez une fonction disponible dans le menu Finance." });
      d.icons();
      return;
    }

    var requirements = financeDataRequirements();
    var needsData = requirements.feeStructures || requirements.studentFees;
    if (financeState.loading && needsData) {
      contentEl.innerHTML = window.ssState({ type: "loading", title: "Chargement...", message: "Récupération des données financières…" });
      d.icons();
      return;
    }

    if (financeState.error && needsData) {
      contentEl.innerHTML = renderErrorBanner();
      bindFinanceEvents();
      d.icons();
      return;
    }

    var renderers = {
      overview: renderFinanceOverview,
      fees: renderFeeStructure,
      assignments: renderFeeAssignment,
      canteen: renderCanteenFinanceLink,
      "remediation-finance": renderRemediationFinanceLink,
      exemptions: renderExemptions,
      campaigns: renderControlCampaignManagement,
      cash: renderCash,
      receipts: renderReceipts,
      "cash-register": renderCashRegister,
      balances: renderBalances,
      reports: renderReports,
      family: renderFamilyFinance
    };
    contentEl.innerHTML = renderers[financeState.activeTab]();
    bindFinanceEvents();
    d.icons();
  }

  // ---------------------------------------------------------------------------
  // Événements
  // ---------------------------------------------------------------------------
  function bindFinanceEvents() {
    var d = deps();
    var retryBtn = document.getElementById("retryFinance");
    if (retryBtn) retryBtn.addEventListener("click", function () {
      financeState.error = null;
      financeState.loaded = false;
      loadFinanceData().then(function () { renderFinanceModule(); }).catch(function () { renderFinanceModule(); });
    });

    document.querySelectorAll("[data-finance-open]").forEach(function (button) {
      button.addEventListener("click", function () {
        var tab = button.getAttribute("data-finance-open");
        render("financeModule", { tab: tab });
        var activeButton = document.querySelector('#financeTabs [data-finance-tab="' + tab + '"]:not([hidden])');
        if (activeButton) activeButton.focus({ preventScroll: true });
      });
    });

    var studentSelect = document.getElementById("financeStudentSelect");
    if (studentSelect) studentSelect.addEventListener("change", function () { financeState.selectedPendingStudent = Number(this.value); renderFinanceModule(); });

    var cashStudentSelect = document.getElementById("financeCashStudent");
    if (cashStudentSelect) cashStudentSelect.addEventListener("change", function () {
      financeState.selectedCashStudentId = this.value;
      financeState.selectedCashStudentFeeId = "";
      renderFinanceModule();
    });
    var cashStudentFeeSelect = document.getElementById("financeCashStudentFee");
    if (cashStudentFeeSelect) cashStudentFeeSelect.addEventListener("change", function () {
      financeState.selectedCashStudentFeeId = this.value;
      renderFinanceModule();
    });

    var exemptionStudentSelect = document.getElementById("financeExemptionStudent");
    if (exemptionStudentSelect) exemptionStudentSelect.addEventListener("change", function () {
      var exemption = exemptionDraftState();
      exemption.studentId = this.value;
      exemption.studentFeeId = "";
      exemption.prepared = false;
      exemption.preparedSummary = null;
      renderFinanceModule();
    });
    var exemptionStudentFeeSelect = document.getElementById("financeExemptionStudentFee");
    if (exemptionStudentFeeSelect) exemptionStudentFeeSelect.addEventListener("change", function () {
      var exemption = exemptionDraftState();
      exemption.studentFeeId = this.value;
      exemption.prepared = false;
      exemption.preparedSummary = null;
      renderFinanceModule();
    });
    var exemptionTypeSelect = document.getElementById("financeExemptionType");
    if (exemptionTypeSelect) exemptionTypeSelect.addEventListener("change", function () {
      var exemption = exemptionDraftState();
      exemption.type = this.value === "partial" ? "partial" : "total";
      exemption.prepared = false;
      exemption.preparedSummary = null;
      renderFinanceModule();
    });
    var exemptionForm = document.getElementById("financeExemptionForm");
    if (exemptionForm) exemptionForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!canPrepareExemption()) { d.notify("Action non autorisée.", "error"); return; }
      var exemption = exemptionDraftState();
      var profile = selectedExemptionProfile();
      var fee = selectedExemptionStudentFee(profile);
      var availability = exemptionAvailability(fee);
      var data = new FormData(exemptionForm);
      var type = String(data.get("exemption_type") || "");
      var reason = String(data.get("reason") || "").trim();
      var amount = type === "partial" ? Number(data.get("amount")) : null;
      if (!availability.allowed || !profile || !fee || ["total", "partial"].indexOf(type) === -1 || !reason) {
        d.notify("Vérifiez l’obligation financière, le type et le motif de la demande.", "error");
        return;
      }
      if (type === "partial" && (!Number.isFinite(amount) || amount <= 0 || amount > Number(fee.remaining) || !hasValidPaymentPrecision(amount, fee.currency))) {
        d.notify("Le montant exonéré doit être supérieur à zéro et ne pas dépasser le restant de ce student_fee.", "error");
        return;
      }
      if (exemptionForm.getAttribute("data-student-id") !== profile.student.id || exemptionForm.getAttribute("data-student-fee-id") !== fee.student_fee_id || exemptionForm.getAttribute("data-currency") !== fee.currency) {
        d.notify("La sélection affichée ne correspond plus au student_fee actif.", "error");
        return;
      }
      exemption.type = type;
      exemption.prepared = true;
      exemption.preparedSummary = { student_fee_id: fee.student_fee_id, type: type, amount: amount, currency: fee.currency, reason: reason };
      financeState.exemptionDrafts.unshift({ id: "local-exemption-" + Date.now(), studentId: profile.student.id, studentName: profile.student.name, studentFeeId: fee.student_fee_id, feeStructureId: fee.fee_structure_id, feeLabel: fee.label, type: type, amount: amount, currency: fee.currency, reason: reason, status: "prepared", local: true, backendLater: true });
      persistLocalDrafts(FEE_EXEMPTION_DRAFT_STORAGE_KEY, financeState.exemptionDrafts);
      d.notify("Configuration prête. Aucune exemption n’a été appliquée : connexion backend requise.");
      renderFinanceModule();
    });

    var campaignFeeSelect = document.getElementById("financeCampaignFee");
    if (campaignFeeSelect) campaignFeeSelect.addEventListener("change", function () {
      var campaign = campaignDraftState();
      campaign.feeStructureId = this.value;
      campaign.prepared = false;
      campaign.preparedSummary = null;
      renderFinanceModule();
    });
    var campaignForm = document.getElementById("financeCampaignForm");
    if (campaignForm) campaignForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!canManageControlCampaigns()) { d.notify("Action non autorisée.", "error"); return; }
      var campaign = campaignDraftState();
      var data = new FormData(campaignForm);
      var label = String(data.get("label") || "").trim();
      var feeStructureId = String(data.get("fee_structure_id") || "");
      var startsAt = String(data.get("starts_at") || "");
      var endsAt = String(data.get("ends_at") || "");
      var description = String(data.get("description") || "").trim();
      var fee = (financeState.feeTypes || []).find(function (item) { return item.id === feeStructureId; }) || null;
      if (!label || !fee || !/^\d{4}-\d{2}-\d{2}$/.test(startsAt) || !/^\d{4}-\d{2}-\d{2}$/.test(endsAt) || startsAt >= endsAt || !description) {
        d.notify("Vérifiez le nom, le type de frais, la période et la consigne de la campagne.", "error");
        return;
      }
      campaign.feeStructureId = feeStructureId;
      campaign.label = label;
      campaign.startsAt = startsAt;
      campaign.endsAt = endsAt;
      campaign.description = description;
      campaign.prepared = true;
      campaign.preparedSummary = { fee_structure_id: feeStructureId, label: label, starts_at: startsAt, ends_at: endsAt, description: description, status: "draft" };
      d.notify("Configuration prête — connexion backend requise pour publier/activer.");
      renderFinanceModule();
    });

    var familySelect = document.getElementById("familyFinanceStudent");
    if (familySelect) familySelect.addEventListener("change", function () { financeState.selectedFamilyStudent = Number(this.value); renderFinanceModule(); });

    var financialStudentSelect = document.getElementById("financeFinancialStudent");
    if (financialStudentSelect) financialStudentSelect.addEventListener("change", function () {
      financeState.selectedFinancialStudentId = this.value;
      renderFinanceModule();
    });
    var financialSearchInput = document.getElementById("financeFinancialSearch");
    if (financialSearchInput) financialSearchInput.addEventListener("input", function () {
      financeState.financialSearch = this.value;
      renderFinanceModule();
    });
    var financialFeeFilter = document.getElementById("financeFinancialFeeFilter");
    if (financialFeeFilter) financialFeeFilter.addEventListener("change", function () {
      financeState.financialFeeFilter = this.value;
      renderFinanceModule();
    });
    var financialStatusFilter = document.getElementById("financeFinancialStatusFilter");
    if (financialStatusFilter) financialStatusFilter.addEventListener("change", function () {
      financeState.financialStatusFilter = this.value;
      renderFinanceModule();
    });

    var feeForm = document.getElementById("financeFeeForm");
    if (feeForm) feeForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!canManageFeeCatalog()) { d.notify("Action non autorisée.", "error"); return; }
      var data = new FormData(feeForm);
      var label = String(data.get("label") || "").trim();
      var cycleKey = String(data.get("cycle_key") || "");
      var amount = Number(data.get("amount"));
      var currency = String(data.get("currency") || "");
      var frequency = String(data.get("frequency") || "").trim();
      var dueDate = String(data.get("due_date") || "");
      var allowedCycles = ["nursery", "primary", "secondary"];
      var allowedCurrencies = ["CDF", "USD"];
      if (!label || !frequency || allowedCycles.indexOf(cycleKey) === -1 || !Number.isFinite(amount) || amount < 0 || allowedCurrencies.indexOf(currency) === -1 || (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate))) {
        d.notify("Vérifiez le libellé, le cycle, le montant, la devise, la fréquence et la date d’échéance.", "error");
        return;
      }
      financeState.feeTypeDrafts.unshift({ id: "local-fee-" + Date.now(), name: label, cycle: cycleLabel(cycleKey), cycle_key: cycleKey, amount: amount, currency: currency, frequency: frequency, due: dueDate ? formatIsoDateFr(dueDate) : "—", due_date: dueDate || null, active: true, local: true, backendLater: true });
      persistLocalDrafts(FEE_TYPE_DRAFT_STORAGE_KEY, financeState.feeTypeDrafts);
      d.notify("Type de frais préparé en BROUILLON LOCAL · BACKEND_LATER.");
      renderFinanceModule();
    });

    var assignmentForm = document.getElementById("financeFeeAssignmentForm");
    if (assignmentForm) {
      var assignment = feeAssignmentState();
      var assignmentFeeSelect = document.getElementById("financeAssignmentFee");
      var assignmentModeSelect = document.getElementById("financeAssignmentTargetMode");
      if (assignmentFeeSelect) assignmentFeeSelect.addEventListener("change", function () {
        assignment.feeStructureId = this.value;
        assignment.prepared = false;
        renderFinanceModule();
      });
      if (assignmentModeSelect) assignmentModeSelect.addEventListener("change", function () {
        assignment.targetingMode = this.value;
        assignment.targetIds = [];
        assignment.prepared = false;
        renderFinanceModule();
      });
      assignmentForm.addEventListener("submit", function (event) {
        event.preventDefault();
        if (!canManageFeeCatalog()) { d.notify("Action non autorisée.", "error"); return; }
        var selectedFee = selectedFeeForAssignment();
        var data = new FormData(assignmentForm);
        var targetingMode = String(data.get("targeting_mode") || "");
        var targetIds = targetingMode === "cycle" ? [selectedFee && selectedFee.cycle || ""] : data.getAll("target_ids").map(String);
        targetIds = deduplicateAssignmentIds(targetIds);
        if (!selectedFee || ["cycle", "class", "students"].indexOf(targetingMode) === -1 || !targetIds.length) {
          d.notify("Sélectionnez un type de frais et un mode de ciblage.", "error");
          return;
        }
        var activeStudents = (financeState.students || []).map(mapFinancialStudent).filter(function (student) { return student.lifecycleStatus === "active"; });
        var population = targetingMode === "cycle" ? activeStudents.length : targetingMode === "class" ? activeStudents.filter(function (student) { return student.className === targetIds[0]; }).length : activeStudents.filter(function (student) { return targetIds.indexOf(student.id) >= 0; }).length;
        var targetLabel = targetingMode === "cycle" ? "Cycle · " + targetIds[0] : targetingMode === "class" ? "Classe · " + targetIds[0] : targetIds.length + " élève(s) actif(s)";
        assignment.targetingMode = targetingMode;
        assignment.targetIds = targetIds;
        assignment.prepared = true;
        financeState.assignmentDrafts.unshift({ id: "local-assignment-" + Date.now(), feeStructureId: selectedFee.id, feeName: selectedFee.name, targetingMode: targetingMode, targetIds: targetIds, targetLabel: targetLabel, populationLabel: population + " élève(s) actif(s)", amountLabel: assignmentAmountLabel(selectedFee), frequency: selectedFee.frequency || "Non définie", status: "prepared", local: true, backendLater: true });
        persistLocalDrafts(FEE_ASSIGNMENT_DRAFT_STORAGE_KEY, financeState.assignmentDrafts);
        d.notify("Affectation préparée en BROUILLON LOCAL. Aucun student_fee n’a été créé.");
        renderFinanceModule();
      });
    }

    var canteenLinkForm = document.getElementById("financeCanteenLinkForm");
    if (canteenLinkForm) canteenLinkForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!canManageCanteenFinanceLink()) { d.notify("Action non autorisée.", "error"); return; }
      var data = new FormData(canteenLinkForm);
      var serviceLabel = String(data.get("service_label") || "").trim();
      var feeStructureId = String(data.get("fee_structure_id") || "");
      var targetingMode = String(data.get("targeting_mode") || "");
      var fee = feeCatalog().find(function (item) { return item.id === feeStructureId && item.active && /cantine/i.test(item.name || ""); });
      var activeStudents = (financeState.students || []).map(mapFinancialStudent).filter(function (student) { return student.lifecycleStatus === "active"; });
      if (!serviceLabel || !fee || targetingMode !== "active_students") { d.notify("Vérifiez le service, le type de frais Cantine et la population active.", "error"); return; }
      financeState.canteenLinkDrafts.unshift({ id: "local-canteen-link-" + Date.now(), serviceLabel: serviceLabel, feeStructureId: fee.id, feeLabel: fee.name, targetingMode: targetingMode, populationLabel: activeStudents.length + " élèves actifs éligibles", local: true, backendLater: true });
      persistLocalDrafts(CANTEEN_LINK_DRAFT_STORAGE_KEY, financeState.canteenLinkDrafts);
      d.notify("Liaison Cantine préparée en BROUILLON LOCAL · BACKEND_LATER.");
      renderFinanceModule();
    });

    var remediationLinkForm = document.getElementById("financeRemediationLinkForm");
    if (remediationLinkForm) remediationLinkForm.addEventListener("submit", function (event) {
      event.preventDefault();
      financeState.remediationFinanceError = "";
      if (!canPrepareRemediationFinance()) { d.notify("Action non autorisée.", "error"); return; }
      var data = new FormData(remediationLinkForm);
      var remediationId = String(data.get("remediation_id") || "");
      var feeStructureId = String(data.get("fee_structure_id") || "");
      var schoolShare = Number(data.get("school_share"));
      var otherShare = Number(data.get("other_share"));
      var otherDestination = String(data.get("other_destination") || "").trim();
      var remediation = remediationFinanceProjection().find(function (item) { return item.id === remediationId; });
      var fee = feeCatalog().find(function (item) { return item.id === feeStructureId && item.active && /rattrapage|remédiation/i.test(item.name || ""); });
      var total = schoolShare + otherShare;
      if (!remediation || !fee || !Number.isFinite(schoolShare) || !Number.isFinite(otherShare) || schoolShare < 0 || otherShare < 0 || schoolShare > 100 || otherShare > 100 || Math.abs(total - 100) > 0.000001) {
        financeState.remediationFinanceError = "La part école et l’autre part doivent totaliser exactement 100 %.";
        renderFinanceModule();
        return;
      }
      if (otherShare > 0 && !otherDestination) {
        financeState.remediationFinanceError = "Nommez explicitement l’autre destination avant de préparer la répartition à 100 %.";
        renderFinanceModule();
        return;
      }
      financeState.remediationFinanceDrafts.unshift({ id: "local-remediation-finance-" + Date.now(), remediationId: remediation.id, studentId: remediation.studentId, studentName: remediation.studentName, classId: remediation.classId, className: remediation.className, subjectId: remediation.subjectId, subjectName: remediation.subjectName, remediationStatus: remediation.status, feeStructureId: fee.id, feeLabel: fee.name, schoolShare: schoolShare, otherShare: otherShare, otherDestination: otherShare > 0 ? otherDestination : "", totalShare: total, local: true, backendLater: true });
      persistLocalDrafts(REMEDIATION_FINANCE_DRAFT_STORAGE_KEY, financeState.remediationFinanceDrafts);
      d.notify("Liaison financière du rattrapage préparée · FRONTEND CONFIG · BACKEND_LATER.");
      renderFinanceModule();
    });

    document.querySelectorAll("[data-toggle-fee]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (!checkAuthorization("finance.fee.manage")) {
          d.notify("Action non autorisée.", "error");
          return;
        }
        var index = Number(button.getAttribute("data-toggle-fee"));
        var fee = financeState.feeTypes[index];
        var updated = Object.assign({}, fee, { active: !fee.active });
        financeState.feeTypes = financeState.feeTypes.slice();
        financeState.feeTypes[index] = updated;
        d.queueOfflineOperation("finance", "Modification d’un type de frais · " + updated.name, { kind: "fee-type-status", name: updated.name, active: updated.active });
        renderFinanceModule();
      });
    });

    var paymentForm = document.getElementById("paymentForm");
    if (paymentForm) paymentForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!canRecordPayment()) { d.notify("Action non autorisée.", "error"); return; }
      var profile = selectedCashProfile();
      var fee = selectedCashStudentFee(profile);
      var availability = paymentAvailability(fee);
      if (!profile || !fee || fee.student_id !== profile.student.id || !availability.allowed) {
        d.notify((availability && availability.message) || "Sélectionnez une obligation financière valide.", "error");
        return;
      }
      var data = new FormData(paymentForm);
      var amount = Number(data.get("amount"));
      var mode = String(data.get("mode") || "");
      var reference = String(data.get("reference") || "").trim();
      if (!Number.isFinite(amount) || amount <= 0 || amount > Number(fee.remaining)) { d.notify("Le montant doit être positif et ne pas dépasser le restant de cette obligation.", "error"); return; }
      if (["CDF", "USD"].indexOf(fee.currency) === -1) { d.notify("La devise de cette obligation est indisponible.", "error"); return; }
      if (!hasValidPaymentPrecision(amount, fee.currency)) { d.notify("Le montant ne respecte pas la précision autorisée pour cette devise.", "error"); return; }
      if (paymentForm.getAttribute("data-student-fee-id") !== fee.student_fee_id || paymentForm.getAttribute("data-student-id") !== profile.student.id || paymentForm.getAttribute("data-currency") !== fee.currency) {
        d.notify("La sélection du paiement a changé. Vérifiez l’obligation financière avant de confirmer.", "error");
        return;
      }
      financeState.paymentDraft = {
        studentId: profile.student.id,
        studentName: profile.student.name,
        studentFeeId: fee.student_fee_id,
        feeStructureId: fee.fee_structure_id,
        feeLabel: fee.label,
        amount: amount,
        currency: fee.currency,
        mode: mode,
        reference: reference
      };
      d.notify(isDemoMode() ? "Paiement constaté prêt à confirmer dans la démonstration." : "Préparation locale conservée. Confirmation officielle : BACKEND_LATER.");
      renderFinanceModule();
    });

    var confirmDemoPayment = document.querySelector("[data-confirm-demo-payment]");
    if (confirmDemoPayment) confirmDemoPayment.addEventListener("click", function () {
      if (!canRecordPayment() || !isDemoMode()) { d.notify("Action non autorisée.", "error"); return; }
      var draft = financeState.paymentDraft;
      if (!draft) { d.notify("Aucun paiement constaté à confirmer.", "error"); return; }
      var profile = (financeState.studentFinancialProfiles || []).find(function (item) { return item.student.id === draft.studentId; });
      var fee = profile && (profile.fees || []).find(function (item) { return item.student_fee_id === draft.studentFeeId; });
      var availability = paymentAvailability(fee);
      if (!profile || !fee || fee.student_id !== profile.student.id || !availability.allowed || Number(draft.amount) > Number(fee.remaining) || fee.currency !== draft.currency) {
        d.notify("L’obligation a changé. Préparez de nouveau le paiement constaté.", "error");
        financeState.paymentDraft = null;
        renderFinanceModule();
        return;
      }
      recordDemoPayment(profile, fee, Number(draft.amount), draft.mode, draft.reference, d);
    });

    document.querySelectorAll("[data-cancel-payment-id]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (!canCancelPayment()) { d.notify("Action non autorisée.", "error"); return; }
        var paymentId = button.getAttribute("data-cancel-payment-id");
        var transaction = (financeState.transactions || []).find(function (item) { return item.id === paymentId; });
        if (!transaction) { d.notify("Paiement introuvable.", "error"); return; }
        var trigger = button;
        var modal = window.ssModal({
          title: "Préparer l’annulation",
          subtitle: "Le statut officiel du paiement restera inchangé.",
          content: '<form id="cancelPaymentForm"><label>Motif de l’annulation<textarea name="reason" rows="3" required placeholder="Précisez pourquoi cette annulation doit être préparée…"></textarea></label>' + window.ssButton({ label: "Préparer l’annulation", variant: "danger", type: "submit", icon: "circle-x" }) + '<p>BACKEND_LATER · aucune annulation serveur en Phase F</p></form>',
          size: "md",
          focusReturn: trigger,
          actions: [
            { label: "Fermer", variant: "secondary", onClick: function () { modal.close(); } }
          ]
        });

        var form = modal.content.querySelector("#cancelPaymentForm");
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          var reason = form.reason.value.trim();
          if (!reason) {
            modal.setError("Le motif est obligatoire.");
            return;
          }
          if (!canCancelPayment()) { modal.setError("Action non autorisée."); return; }
          financeState.cancellationDrafts.unshift({ id: "local-cancellation-" + Date.now(), paymentId: paymentId, receipt: transaction.receipt, reason: reason, status: "prepared", local: true, backendLater: true });
          persistLocalDrafts(PAYMENT_CANCELLATION_DRAFT_STORAGE_KEY, financeState.cancellationDrafts);
          modal.close();
          d.notify("Annulation préparée localement. Le paiement officiel reste inchangé.");
          renderFinanceModule();
        });
      });
    });

    var reportDateInput = document.getElementById("financeReportDate");
    if (reportDateInput) reportDateInput.addEventListener("change", function () {
      loadDailyReport(this.value).then(function () { renderFinanceModule(); });
    });

    var closeRegister = document.getElementById("closeCashRegister");
    if (closeRegister) closeRegister.addEventListener("click", function () {
      var api = d.api;
      if (!api) { d.notify("API finance non disponible."); return; }
      var report = financeState.dailyReport || { total_amount: 0 };
      var expectedInput = document.getElementById("closeExpectedAmount");
      var expectedAmount = expectedInput && expectedInput.value !== "" ? Number(expectedInput.value) : Number(report.total_amount || 0);
      api.closeCashRegister({ date: financeState.reportDate, expected_amount: expectedAmount, notes: "Clôture depuis le frontend" }).then(function (res) {
        financeState.reportClosure = res && res.closure ? res.closure : null;
        d.notify(res && res.alreadyClosed ? "La caisse était déjà clôturée pour cette date." : "Caisse clôturée pour le " + formatIsoDateFr(financeState.reportDate) + ".");
        renderFinanceModule();
      }).catch(function (err) {
        console.warn("[Finance] clôture échouée", err);
        d.notify("Clôture impossible : " + (err.message || "erreur"));
      });
    });

    var submitDay = document.getElementById("submitCashDay");
    if (submitDay) submitDay.addEventListener("click", function () {
      financeState.dayStatus = "Soumise";
      d.queueOfflineOperation("finance", "Soumission de la journée de caisse", { kind: "cash-day-submission" });
      d.notify("Journée soumise localement pour contrôle.");
      renderFinanceModule();
    });
  }

  function bindModuleTabs() {
    document.querySelectorAll("#financeTabs [data-finance-tab]").forEach(function (button) {
      if (button.dataset.financeBound) return;
      button.dataset.financeBound = "true";
      button.addEventListener("click", function () {
        render("financeModule", { tab: button.getAttribute("data-finance-tab") });
      });
    });
    var closeBtn = document.getElementById("closeFinanceModule");
    if (closeBtn && !closeBtn.dataset.financeBound) {
      closeBtn.dataset.financeBound = "true";
      closeBtn.addEventListener("click", function () { close(); });
    }
  }

  // ---------------------------------------------------------------------------
  // PDF
  // ---------------------------------------------------------------------------
  async function exportReceiptPdf(paymentId) {
    var d = deps();
    if (!paymentId) { d.notify("Reçu introuvable."); return; }
    if (!checkAuthorization("finance.receipts.view", { scope: "own_children" })) {
      d.notify("Accès non autorisé", "error");
      return;
    }
    try {
      var api = d.api;
      if (!api) { d.notify("API finance non disponible."); return; }
      var data = await api.getReceiptData(paymentId);
      if (!data) { d.notify("Reçu introuvable."); return; }
      var mod = await import("../document-engine/templates/receipt-template.js");
      var school = data.school || {};
      var identity = {
        name: school.name || "",
        nameEn: null,
        legalName: school.name || "",
        address: school.address || null,
        city: null,
        province: null,
        country: null,
        phone: school.phone || null,
        email: school.email || null,
        website: school.website || null,
        primaryColor: "#071a3d",
        accentColor: "#e9a515",
        logoUrl: school.logo_url || null,
        documentFooter: null,
        officialSealUrl: null,
        currency: school.currency || "USD",
        bankName: null,
        bankAccount: null,
        taxId: null,
        directorName: null,
        directorSignatureUrl: null,
        activeAcademicYear: school.activeAcademicYear || null,
        activeCycles: []
      };
      var p = data.payment || {};
      var s = data.student || {};
      var payment = {
        student: {
          firstName: s.first_name || "",
          lastName: s.last_name || "",
          matricule: s.matricule || "",
          className: s.class_name || ""
        },
        feeLabel: p.fee_label || "",
        period: "",
        amountExpected: Number(p.expected_amount || 0),
        amountPaid: Number(p.amount || 0),
        remaining: Number(p.remaining_amount || 0),
        currency: p.currency || identity.currency,
        paymentMode: modeLabel(p.mode),
        reference: p.reference || "",
        paidAt: p.received_at || data.generatedAt,
        cashierName: p.cashier_name || "",
        verificationCode: p.verification_code || data.receiptNumber || ""
      };
      var doc = await mod.renderReceipt(identity, payment, data.receiptNumber || "");
      var pdfUtils = d.pdf;
      var filename = "recu-" + (pdfUtils && pdfUtils.sanitizeFilename ? pdfUtils.sanitizeFilename(data.receiptNumber || "schoolsafe") : "schoolsafe") + ".pdf";
      doc.save(filename);
      d.notify("Reçu PDF téléchargé.");
    } catch (e) {
      console.error("[Finance] receipt generation failed", e);
      d.notify("Erreur lors de la génération du reçu : " + (e.message || "erreur inconnue"));
    }
  }

  async function exportCashReportPdf() {
    var d = deps();
    var pdf = d.pdf;
    if (!pdf || typeof pdf.pdfLibrary !== "function" || typeof pdf.pdfSchoolIdentity !== "function" || typeof pdf.loadPdfLogo !== "function" || typeof pdf.configurePdfLanguage !== "function" || typeof pdf.pdfHeader !== "function" || typeof pdf.pdfFooter !== "function" || typeof pdf.drawTableHeader !== "function") {
      d.notify("Les utilitaires PDF ne sont pas disponibles.");
      return;
    }
    var JsPdf = pdf.pdfLibrary();
    if (!JsPdf) { d.notify("Le générateur PDF n’est pas disponible."); return; }
    var identity = pdf.pdfSchoolIdentity();
    var logo = await pdf.loadPdfLogo();
    var doc = pdf.configurePdfLanguage(new JsPdf({ unit: "mm", format: "a4" }));
    var totals = financeTotals();
    var validatedExpenses = financeState.expenses.filter(function (expense) { return expense.status === "Validée"; });
    var expenseTotal = validatedExpenses.reduce(function (sum, expense) { return sum + expense.amount; }, 0);
    pdf.pdfHeader(doc, identity, logo, "Rapport de caisse", "Journée du " + formatIsoDateFr(financeState.reportDate) + " · Statut : " + financeState.dayStatus);
    var metricData = [["Encaissements", totals.todayTotal, 7, 100, 194], ["Dépenses validées", expenseTotal, 8, 122, 85], ["Net de la journée", totals.todayTotal - expenseTotal, 155, 100, 0]];
    metricData.forEach(function (metric, index) {
      var x = 14 + index * 62;
      doc.setFillColor(245, 248, 252);
      doc.roundedRect(x, 65, 58, 25, 2, 2, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(83, 96, 119);
      doc.text(metric[0], x + 5, 73);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(metric[2], metric[3], metric[4]);
      doc.text(d.money(metric[1]), x + 5, 84);
    });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(7, 48, 112);
    doc.text("Opérations enregistrées", 14, 104);
    var transactionColumns = [{ label: "Reçu", x: 16 }, { label: "Élève", x: 48 }, { label: "Mode", x: 102 }, { label: "Montant", x: 151 }, { label: "Statut", x: 177 }];
    var y = pdf.drawTableHeader(doc, transactionColumns, 109);
    totals.today.forEach(function (transaction) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(38, 50, 73);
      doc.text(transaction.receipt, 16, y + 4);
      doc.text(transaction.student, 48, y + 4);
      doc.text(transaction.mode, 102, y + 4);
      doc.text(d.money(transaction.amount), 151, y + 4);
      doc.text(transaction.status, 177, y + 4);
      doc.setDrawColor(230, 234, 241);
      doc.line(14, y + 8, 196, y + 8);
      y += 11;
    });
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(7, 48, 112);
    doc.text("Dépenses consignées", 14, y);
    var expenseColumns = [{ label: "Référence", x: 16 }, { label: "Libellé", x: 58 }, { label: "Montant", x: 145 }, { label: "Statut", x: 176 }];
    y = pdf.drawTableHeader(doc, expenseColumns, y + 5);
    financeState.expenses.forEach(function (expense) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(38, 50, 73);
      doc.text(expense.reference, 16, y + 4);
      doc.text(expense.label, 58, y + 4);
      doc.text(d.money(expense.amount), 145, y + 4);
      doc.text(expense.status, 176, y + 4);
      doc.setDrawColor(230, 234, 241);
      doc.line(14, y + 8, 196, y + 8);
      y += 11;
    });
    doc.setFillColor(244, 248, 253);
    doc.roundedRect(14, y + 7, 182, 24, 2, 2, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(55, 67, 88);
    doc.text(doc.splitTextToSize("Rapport préparé à partir des opérations consignées dans SchoolSafe. Les espèces et références externes doivent être rapprochées et contrôlées par l’école.", 166), 22, y + 17);
    pdf.pdfFooter(doc, identity);
    var filename = "rapport-caisse-" + financeState.reportDate + ".pdf";
    doc.save(filename);
    d.notify("Rapport de caisse PDF téléchargé avec le logo de l’école.");
  }

  // ---------------------------------------------------------------------------
  // F8-FE — Jaspe Finance borné par les permissions exactes de l'utilisateur
  // ---------------------------------------------------------------------------
  function normalizeFinanceText(value) {
    var text = String(value || "").toLowerCase();
    return typeof text.normalize === "function" ? text.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : text;
  }

  function financeJaspeRefusal(message) {
    return { allowed: false, refusal: true, message: "REFUS — " + message };
  }

  function financeJaspeAllows(user, permission, expectedScopes) {
    var access = root.SchoolSafeAccess;
    if (!access || typeof access.canAccess !== "function" || typeof access.scopeFor !== "function" || !access.canAccess(user, permission)) return false;
    var scope = access.scopeFor(user, permission);
    if (!scope) return false;
    return !Array.isArray(expectedScopes) || expectedScopes.indexOf(scope.type) >= 0;
  }

  function financeJaspeCanUse(user) {
    var access = root.SchoolSafeAccess;
    return !!(access && typeof access.allowsScope === "function" && access.allowsScope(user, "safe.assistant.use", "own"));
  }

  function financeJaspeHasAny(user, permissions) {
    return permissions.some(function (permission) { return financeJaspeAllows(user, permission); });
  }

  function financeJaspeStudentMention(text) {
    return (financeState.students || []).find(function (student) {
      var name = normalizeFinanceText(student.name || [student.first_name, student.last_name].filter(Boolean).join(" "));
      return name && text.indexOf(name) >= 0;
    }) || null;
  }

  function financeJaspeObligationMention(text) {
    var byId = (financeState.studentFees || []).find(function (fee) { return text.indexOf(normalizeFinanceText(fee.id)) >= 0; });
    if (byId) return byId;
    var student = financeJaspeStudentMention(text);
    if (!student) return null;
    return (financeState.studentFees || []).find(function (fee) { return fee.student_id === student.id; }) || null;
  }

  function financeJaspeObligationMessage(fee) {
    var profile = (financeState.studentFinancialProfiles || []).find(function (item) { return item.student.id === fee.student_id; });
    var student = profile ? profile.student : mapFinancialStudent((financeState.students || []).find(function (item) { return item.id === fee.student_id; }) || {});
    var mapped = mapStudentFeeForFinancialProfile(fee);
    var status = financialStatusDefinition(mapped.status);
    return "Obligation " + mapped.student_fee_id + " · " + student.name + " · " + mapped.label + " · " + status.label + " · attendu " + formatFinancialAmount(mapped.expected, mapped.currency) + " · payé " + formatFinancialAmount(mapped.paid, mapped.currency) + " · restant " + formatFinancialAmount(mapped.remaining, mapped.currency) + ". Consultation uniquement.";
  }

  function answerJaspe(query, context) {
    var user = context && context.user ? context.user : financeAccessUser();
    if (!user) return null;
    if (!financeJaspeCanUse(user)) return financeJaspeRefusal("safe.assistant.use avec portée own est obligatoire et tout DENY explicite reste prioritaire.");
    // INC-3 : sans aucune permission financière réelle, ce module ne répond pas
    // (parent, gardien ou tout autre profil — la permission décide, pas le rôle).
    if (!canAccessAnyFinance(["finance.fee.read", "finance.status.read", "finance.report.read", "finance.payment.record", "finance.receipt.read", "finance.control.read"])) return null;

    var text = normalizeFinanceText(query);
    if (!text) return { allowed: true, refusal: false, action: null, message: "Posez une question sur une situation financière visible ou demandez la préparation d’un brouillon autorisé." };

    var mentionedStudent = financeJaspeStudentMention(text);
    var asksFinancialOperation = /paiement|recu|frais|obligation|student_fee|exemption|caisse|finance/.test(text);
    if (mentionedStudent && (mentionedStudent.lifecycleStatus || mentionedStudent.lifecycle_status) === "draft" && asksFinancialOperation) {
      return financeJaspeRefusal("DOSSIER NON ACTIF — un élève draft ne reçoit aucune obligation, aucun paiement ni aucun reçu officiel.");
    }

    if (/(fabriqu|cree|gener).*(recu)|(recu).*(fabriqu|cree|gener)/.test(text)) {
      return financeJaspeRefusal("Jaspe ne fabrique jamais de reçu. Il explique uniquement un reçu existant visible.");
    }
    if (/(marque|passe|declare).*(paid|paye|en regle)|(modifi|change).*(montant|student_fee|obligation)|(supprim).*(transaction|paiement)/.test(text)) {
      return financeJaspeRefusal("Jaspe ne modifie aucun montant, student_fee, statut paid ou transaction.");
    }

    if (/annul/.test(text) && /paiement|transaction|recu/.test(text)) {
      if (!financeJaspeAllows(user, "finance.payment.cancel", ["school"])) return financeJaspeRefusal("finance.payment.cancel avec portée school est requis ; aucune annulation n’est disponible.");
      return { allowed: true, refusal: false, action: "receipts", message: "La demande d’annulation peut seulement être préparée en BROUILLON LOCAL · BACKEND_LATER. Jaspe ne supprime ni n’annule la transaction." };
    }

    if (/(prepare|demande|applique).*(exempt|exoner)|(exempt|exoner).*(prepare|demande|applique)/.test(text)) {
      if (!financeJaspeAllows(user, "finance.fee.manage", ["school"])) return financeJaspeRefusal("finance.fee.manage avec portée school est requis pour préparer une exemption frontend.");
      return { allowed: true, refusal: false, action: "exemptions", message: "Formulaire ouvert pour préparer une exemption en BROUILLON LOCAL · BACKEND_LATER. Aucun student_fee n’est modifié." };
    }

    if (/(prepare|saisi|enregistr|confirme|ajout|cree).*(paiement|encaissement)|(paiement|encaissement).*(prepare|saisi|enregistr|confirme|ajout|cree)/.test(text)) {
      if (!financeJaspeAllows(user, "finance.payment.record", ["school"])) return financeJaspeRefusal("finance.payment.record avec portée school est requis ; Jaspe ne peut préparer aucune saisie de paiement.");
      var paymentFee = financeJaspeObligationMention(text);
      return { allowed: true, refusal: false, action: "cash", message: "Formulaire ouvert pour préparer une saisie liée à " + (paymentFee ? "l’obligation " + paymentFee.id : "un student_fee exact à sélectionner") + " · BROUILLON LOCAL · finance.payment.record · aucune création silencieuse." };
    }

    if (/ouvre|accede|voir|montre/.test(text) && /caisse/.test(text)) {
      if (!financeJaspeAllows(user, "finance.cash_register.close", ["school"])) return financeJaspeRefusal("finance.cash_register.close avec portée school est requis ; un contrôleur ne peut jamais ouvrir la Caisse.");
      return { allowed: true, refusal: false, action: "cash-register", message: "Caisse visible selon finance.cash_register.close · consultation frontend bornée." };
    }

    if (/(prepare|affect).*(frais|obligation)|(frais|obligation).*(prepare|affect)/.test(text)) {
      if (!financeJaspeAllows(user, "finance.fee.manage", ["school"])) return financeJaspeRefusal("finance.fee.manage avec portée school est requis pour préparer une affectation.");
      return { allowed: true, refusal: false, action: "assignments", message: "Formulaire ouvert pour préparer une affectation en BROUILLON LOCAL · BACKEND_LATER. Aucun student_fee officiel n’est créé." };
    }

    if (/rapport/.test(text)) {
      if (!financeJaspeAllows(user, "finance.report.read", ["school"])) return financeJaspeRefusal("finance.report.read avec portée school est requis ; aucun rapport financier n’est visible.");
      return { allowed: true, refusal: false, action: "reports", message: "Jaspe peut aider à préparer le rapport visible sous finance.report.read, sans publier ni inventer de données." };
    }

    if (/recu/.test(text)) {
      if (!financeJaspeAllows(user, "finance.receipt.read", ["school"])) return financeJaspeRefusal("finance.receipt.read avec portée school est requis ; aucun reçu n’est visible.");
      var receipt = (financeState.transactions || []).find(function (transaction) { return text.indexOf(normalizeFinanceText(transaction.receipt || transaction.id)) >= 0; });
      return { allowed: true, refusal: false, action: "receipts", message: receipt ? "Reçu existant " + receipt.receipt + " · " + receipt.student + " · " + formatFinancialAmount(receipt.amount, receipt.currency) + " · aperçu visible, non fabriqué." : "Registre des reçus existants visible sous finance.receipt.read. Jaspe ne fabrique aucun reçu." };
    }

    if (/controle|campagne|scan/.test(text)) {
      var canExplainControl = financeJaspeAllows(user, "finance.control.read", ["school"]) || financeJaspeAllows(user, "finance.control.manage", ["school"]) || financeJaspeAllows(user, "finance.control.scan", ["assigned_classes"]);
      if (!canExplainControl) return financeJaspeRefusal("une permission finance.control.read/manage avec portée school ou finance.control.scan avec assigned_classes est requise.");
      return { allowed: true, refusal: false, action: "fee-control", message: "Contrôle des frais expliqué dans son domaine séparé : identité minimale, classe, résultat, consigne et statut uniquement. Aucune Caisse, transaction détaillée, reçu ni rapport." };
    }

    var mentionedFee = financeJaspeObligationMention(text);
    if (mentionedFee || /obligation|student_fee/.test(text)) {
      if (!financeJaspeAllows(user, "finance.fee.read", ["school"])) return financeJaspeRefusal("la projection school de finance.fee.read est requise pour retrouver cette obligation précise ; un scope plus étroit non projeté ne révèle aucune donnée.");
      if (!mentionedFee) return financeJaspeRefusal("aucun student_fee visible ne correspond à la demande.");
      return { allowed: true, refusal: false, action: "balances", message: financeJaspeObligationMessage(mentionedFee) };
    }

    var explainedStatus = ["partial", "pending", "exempted", "anomaly", "paid"].find(function (status) { return new RegExp("(^|[^a-z])" + status + "([^a-z]|$)").test(text); });
    if (explainedStatus || /statut|situation|solde/.test(text)) {
      if (!financeJaspeHasAny(user, ["finance.status.read", "finance.fee.read"])) return financeJaspeRefusal("finance.status.read ou finance.fee.read est requis pour expliquer une situation financière.");
      if (explainedStatus) {
        var definition = financialStatusDefinition(explainedStatus);
        return { allowed: true, refusal: false, action: "balances", message: explainedStatus + " signifie « " + definition.label + " ». Jaspe explique le statut visible sans le modifier." };
      }
      return { allowed: true, refusal: false, action: "balances", message: "Jaspe peut expliquer uniquement les situations visibles : paid, partial, pending, exempted et anomaly, sans changer leur état." };
    }

    if (!financeJaspeHasAny(user, ["finance.fee.read", "finance.fee.manage", "finance.payment.record", "finance.payment.cancel", "finance.receipt.read", "finance.report.read", "finance.cash_register.close", "finance.control.read", "finance.control.manage", "finance.control.scan", "finance.status.read"])) {
      return financeJaspeRefusal("aucune permission Finance ou Contrôle des frais n’est accordée à cette session.");
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // API publique
  // ---------------------------------------------------------------------------
  function render(containerId, options) {
    options = options || {};
    var moduleEl = document.getElementById(containerId || "financeModule");
    if (moduleEl) {
      moduleEl.hidden = false;
    } else {
      document.getElementById("financeModule").hidden = false;
    }
    document.querySelector(".workspace-grid").hidden = true;
    var cards = document.getElementById("cardsProtected");
    if (cards) cards.hidden = true;

    var requestedTab = options.tab || financeTabForAction(options.action || "");
    var allowedTabs = financeTabsForRole();
    if (!requestedTab) requestedTab = allowedTabs[0] || "";
    financeState.activeTab = requestedTab;

    bindModuleTabs();
    if (allowedTabs.indexOf(financeState.activeTab) === -1 || financeState.activeTab === "overview" || (financeState.activeTab === "family" && !isDemoMode()) || (financeState.activeTab === "receipts" && !isDemoMode()) || (financeState.activeTab === "cash-register" && !isDemoMode()) || (financeState.activeTab === "reports") || (financeState.activeTab === "balances" && !canReadFinancialDetails()) || (financeState.activeTab === "cash" && !isDemoMode() && canRecordPayment() && !canReadFeeCatalog()) || (financeState.activeTab === "exemptions" && !isDemoMode() && canPrepareExemption() && !canReadFinancialDetails()) || (financeState.activeTab === "fees" && !canReadFeeCatalog()) || (financeState.activeTab === "assignments" && !canReadFinancialDetails())) {
      // own_children et status-only n'ont pas de projection dédiée : ne jamais demander la liste globale des student_fees.
      renderFinanceModule();
    } else {
      loadFinanceData().then(function () { renderFinanceModule(); });
    }
    var content = document.querySelector(".workspace-content");
    if (content) content.scrollTo({ top: 0, behavior: "smooth" });
  }

  function close() {
    var moduleEl = document.getElementById("financeModule");
    if (moduleEl) moduleEl.hidden = true;
    var feeControl = document.getElementById("feeControlModule");
    if (feeControl) feeControl.hidden = true;
    if (root.SchoolSafeAppContext && typeof root.SchoolSafeAppContext.showDashboard === "function") {
      root.SchoolSafeAppContext.showDashboard();
    } else {
      var grid = document.querySelector(".workspace-grid");
      if (grid) grid.hidden = false;
    }
    var cards = document.getElementById("cardsProtected");
    if (cards) cards.hidden = currentRole() !== "admin" && currentRole() !== "admissions";
    var workspaceTitle = document.getElementById("workspaceTitle");
    if (workspaceTitle) workspaceTitle.textContent = "Tableau de bord";
  }

  function setRole(role) {
    financeRoleOverride = role || "";
  }

  function setSession(session) {
    financeSessionOverride = session || null;
  }

  function accountingSnapshot() {
    return {
      dayStatus: financeState.dayStatus || "Indisponible",
      transactions: (financeState.transactions || []).map(function (item) { return Object.assign({}, item); }),
      receipts: (financeState.receipts || []).map(function (item) { return Object.assign({}, item); }),
      expenses: (financeState.expenses || []).map(function (item) { return Object.assign({}, item); }),
      studentFees: (financeState.studentFees || []).map(function (item) { return Object.assign({}, item); })
    };
  }

  root.SchoolSafeFinanceModule = {
    render: render,
    close: close,
    setRole: setRole,
    setSession: setSession,
    getAccountingSnapshot: accountingSnapshot,
    answerJaspe: answerJaspe,
    _state: financeState,
    isDemoMode: isDemoMode
  };
})(window);
