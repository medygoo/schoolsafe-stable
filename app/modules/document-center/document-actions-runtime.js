/* Lie le Centre de documents au contexte SchoolSafe réel, sans persistance sensible. */
(function (root) {
  "use strict";

  var activeMode = "unbound";
  var activeUser = null;
  var activeCatalogue = [];
  var lastError = null;

  function allConnectors() {
    return [
      root.SchoolSafeFinanceAccountingDocuments,
      root.SchoolSafeSchoolPedagogyDocuments,
      root.SchoolSafeOperationalDocuments,
    ].filter(Boolean);
  }

  function findConnector(descriptorId) {
    return allConnectors().find(function (connector) {
      return connector.list().some(function (item) { return item.id === descriptorId; });
    }) || null;
  }

  async function loadCanonicalPermissions() {
    var access = root.SchoolSafeAccess;
    if (!access || typeof access.loadPermissions !== "function") {
      throw new Error("Catalogue Access_Law indisponible");
    }
    var catalogue = await access.loadPermissions();
    if (!Array.isArray(catalogue) || catalogue.length === 0) {
      throw new Error("Catalogue Access_Law indisponible");
    }
    return catalogue.filter(function (item) {
      return item && typeof item.code === "string" && typeof item.scope === "string";
    });
  }

  function permissionExists(catalogue, permission) {
    return catalogue.some(function (item) { return item.code === permission; });
  }

  function userId(user) {
    return user && (user.userId || user.profileId || user.id || (user.profile && user.profile.id));
  }

  function recordId(value) {
    if (typeof value === "string") return value;
    return value && (value.id || value.studentId || value.student_id || value.classId || value.class_id || value.subjectId || value.subject_id || value.portalId || value.portal_id);
  }

  function safeId(value) {
    return String(value || "context").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "context";
  }

  function uniqueRecords(ids, records, mode) {
    var allowedIds = Array.isArray(ids) ? ids.map(String) : [];
    var result = [];
    (Array.isArray(records) ? records : []).forEach(function (record) {
      var id = recordId(record);
      if (!id || (allowedIds.length && allowedIds.indexOf(String(id)) < 0)) return;
      if (String(record.lifecycle_status || record.lifecycleStatus || record.status || "").toLowerCase() === "draft") return;
      if (!result.some(function (item) { return String(recordId(item)) === String(id); })) result.push(record);
    });
    allowedIds.forEach(function (id) {
      if (mode === "demo" && /draft/i.test(id)) return;
      if (!result.some(function (item) { return String(recordId(item)) === id; })) result.push(id);
    });
    return result;
  }

  function selectedRecords(user, selectedContext, kind, mode) {
    var idsKey = { child: "childIds", class: "assignedClassIds", subject: "assignedSubjectIds", portal: "assignedPortalIds" }[kind];
    var recordsKey = { child: "children", class: "classes", subject: "subjects", portal: "portals" }[kind];
    var ids = (user && user[idsKey]) || [];
    if (!Array.isArray(ids) || ids.length === 0) return [];
    var records = (selectedContext && selectedContext[recordsKey]) || (user && user[recordsKey]) || [];
    return uniqueRecords(ids, records, mode);
  }

  function activeStudentContext(user, selectedContext, mode) {
    var student = (selectedContext && selectedContext.student) || (user && user.selectedStudent) || null;
    var studentId = recordId(student) || (selectedContext && selectedContext.studentId) || (user && user.selectedStudentId);
    if (mode === "demo" && !studentId) {
      student = {
        id: "demo-active-student-1",
        first_name: "Amina",
        last_name: "Kabongo",
        matricule: "SS-DEMO-001",
        lifecycle_status: "active",
        class_id: "demo-class-1",
        enrollment: { planned_class_id: "demo-class-1", planned_class_name: "6e A", academic_year_label: "2026-2027" },
      };
      studentId = student.id;
    }
    if (!studentId) return null;
    if (student && String(student.lifecycle_status || student.lifecycleStatus || "active").toLowerCase() !== "active") return null;
    return { studentId: String(studentId), student: student || undefined };
  }

  function contextsForScope(scope, user, selectedContext, mode, blueprint) {
    if (!scope || !scope.type || !user) return [];
    if (blueprint.requiresActiveStudent) {
      if (scope.type !== "school" || !user.schoolId) return [];
      var activeStudent = activeStudentContext(user, selectedContext, mode);
      return activeStudent ? [Object.assign({ schoolId: user.schoolId }, activeStudent)] : [];
    }
    if (scope.type === "school") return user.schoolId ? [{ schoolId: user.schoolId }] : [];
    if (scope.type === "own") {
      var ownerId = userId(user);
      return ownerId ? [{ ownerId: ownerId, userId: ownerId, profileId: ownerId }] : [];
    }
    if (scope.type === "own_children") {
      return selectedRecords(user, selectedContext, "child", mode).map(function (child) {
        var childId = String(recordId(child));
        return { childId: childId, studentId: childId, child: typeof child === "object" ? child : undefined };
      });
    }
    if (scope.type === "assigned_classes") {
      var subjectIds = (user.assignedSubjectIds || []).map(String);
      var selectedSubjectId = String((selectedContext && selectedContext.subjectId) || subjectIds[0] || "");
      if (subjectIds.indexOf(selectedSubjectId) < 0) selectedSubjectId = "";
      return selectedRecords(user, selectedContext, "class", mode).map(function (schoolClass) {
        var context = { classId: String(recordId(schoolClass)), class: typeof schoolClass === "object" ? schoolClass : undefined };
        if (blueprint.includeAssignedSubject && selectedSubjectId) context.subjectId = selectedSubjectId;
        var selectedStudent = activeStudentContext(user, selectedContext, mode);
        if (blueprint.includeActiveStudent && selectedStudent && selectedStudent.student) {
          var studentClassId = selectedStudent.student.class_id || selectedStudent.student.classId ||
            (selectedStudent.student.enrollment && (selectedStudent.student.enrollment.class_id || selectedStudent.student.enrollment.planned_class_id));
          if (studentClassId && String(studentClassId) === context.classId) Object.assign(context, selectedStudent);
        }
        return context;
      });
    }
    if (scope.type === "assigned_subjects") {
      return selectedRecords(user, selectedContext, "subject", mode).map(function (subject) {
        return { subjectId: String(recordId(subject)), subject: typeof subject === "object" ? subject : undefined };
      });
    }
    if (scope.type === "assigned_portal") {
      return selectedRecords(user, selectedContext, "portal", mode).map(function (portal) {
        return { portalId: String(recordId(portal)), portal: typeof portal === "object" ? portal : undefined };
      });
    }
    return [];
  }

  function contextKey(context) {
    return context.childId || context.classId || context.subjectId || context.portalId || context.studentId || context.schoolId || context.ownerId;
  }

  function contextKindForScope(scopeType) {
    return {
      own: "owner",
      own_children: "child",
      assigned_classes: "class",
      assigned_subjects: "subject",
      assigned_portal: "portal",
      school: "school",
    }[scopeType] || null;
  }

  function buildDescriptors(blueprints, options) {
    var user = options.user;
    var mode = options.mode;
    var catalogue = options.catalogue;
    var access = root.SchoolSafeAccess;
    var selectedContext = options.selectedContext || {};
    var output = [];

    (Array.isArray(blueprints) ? blueprints : []).forEach(function (blueprint) {
      if (!permissionExists(catalogue, blueprint.permission)) return;
      if (typeof access.explicitDeny === "function" && access.explicitDeny(user, blueprint.permission)) return;
      if (typeof access.canAccess !== "function" || !access.canAccess(user, blueprint.permission)) return;
      if (typeof access.scopeFor !== "function") return;
      var scope = access.scopeFor(user, blueprint.permission);
      if (!scope || !scope.type) return;
      if (blueprint.contextKind && contextKindForScope(scope.type) !== blueprint.contextKind) return;
      contextsForScope(scope, user, selectedContext, mode, blueprint).forEach(function (context, index) {
        var item = Object.assign({}, blueprint, {
          id: index === 0 ? blueprint.id : blueprint.id + "--" + safeId(contextKey(context)),
          scope: scope.type,
          context: context,
          description: mode === "demo" ? "DÉMONSTRATION · " + blueprint.description : blueprint.description,
          officialBoundary: mode === "demo"
            ? "DÉMONSTRATION · " + (blueprint.officialBoundary || "APERÇU / BROUILLON frontend uniquement")
            : (blueprint.officialBoundary || "APERÇU / BROUILLON frontend uniquement"),
        });
        delete item.requiresActiveStudent;
        delete item.includeAssignedSubject;
        delete item.includeActiveStudent;
        delete item.contextKind;
        output.push(item);
      });
    });
    return output;
  }

  async function bindContext(options) {
    options = options || {};
    var mode = options.mode === "demo" ? "demo" : options.mode === "live" ? "live" : null;
    if (!mode || !options.user) {
      root.SchoolSafeDocumentCenter.clearRegistry();
      activeMode = "unbound";
      activeUser = null;
      activeCatalogue = [];
      lastError = "Contexte documentaire indisponible";
      throw new Error(lastError);
    }

    try {
      var catalogue = await loadCanonicalPermissions();
      root.SchoolSafeDocumentCenter.clearRegistry();
      activeMode = mode;
      activeUser = options.user;
      activeCatalogue = catalogue.slice();
      lastError = null;
      allConnectors().forEach(function (connector) {
        connector.register({
          user: options.user,
          mode: mode,
          catalogue: catalogue,
          selectedContext: options.selectedContext || {},
          buildDescriptors: function (blueprints) {
            return buildDescriptors(blueprints, {
              user: options.user,
              mode: mode,
              catalogue: catalogue,
              selectedContext: options.selectedContext || {},
            });
          },
        });
      });
      return root.SchoolSafeDocumentCenter.listRegistered();
    } catch (error) {
      root.SchoolSafeDocumentCenter.clearRegistry();
      activeMode = "unbound";
      activeUser = null;
      activeCatalogue = [];
      lastError = error && error.message ? error.message : "Contexte documentaire indisponible";
      throw error;
    }
  }

  function explicitDemoIdentity() {
    return {
      name: "DÉMONSTRATION — École SchoolSafe",
      legalName: null,
      address: null,
      city: null,
      province: null,
      country: null,
      phone: null,
      email: null,
      website: null,
      primaryColor: "#071a3d",
      accentColor: "#e9a515",
      logoUrl: null,
      documentFooter: "DÉMONSTRATION · APERÇU FRONTEND · BACKEND_LATER",
      currency: "CDF",
      activeAcademicYear: null,
      activeCycles: [],
    };
  }

  function runtimeSchoolIdentityProvider(engine) {
    return {
      load: async function () {
        if (activeMode === "demo") return explicitDemoIdentity();
        if (activeMode !== "live" || !activeUser || !root.SchoolSafeSchoolAPI || typeof root.SchoolSafeSchoolAPI.getSettings !== "function") {
          throw new Error("Identité école indisponible");
        }
        var identity;
        try {
          identity = await engine.createSchoolIdentityProvider(root.SchoolSafeSchoolAPI).load();
        } catch (error) {
          throw new Error("Identité école indisponible");
        }
        if (!identity || !String(identity.name || "").trim()) throw new Error("Identité école indisponible");
        return identity;
      },
    };
  }

  async function initialize() {
    if (!root.SchoolSafeDocumentCenter) throw new Error("Document Center unavailable");
    var engine = await import("../document-engine/index.js");
    var actionsModule = await import("../document-engine/document-actions.js");
    var actions = actionsModule.createUniversalDocumentActions({
      documentCenter: root.SchoolSafeDocumentCenter,
      access: root.SchoolSafeAccess,
      permissionsLoader: loadCanonicalPermissions,
      templateResolver: async function (descriptorId) {
        var connector = findConnector(descriptorId);
        if (!connector) throw new Error("Document connector unavailable: " + descriptorId);
        return connector.getTemplate(descriptorId);
      },
      specialHandler: async function (payload) {
        return root.SchoolSafeSchoolPedagogyDocuments.openCardPreparation(payload.descriptor, payload.user, activeMode);
      },
      schoolIdentityProvider: runtimeSchoolIdentityProvider(engine),
      schoolSafeIdentityProvider: engine.createSchoolSafeIdentityProvider({ noCache: false }),
    });

    root.SchoolSafeDocumentActions = actions;
    root.SchoolSafeDocumentCenter.setActionHandler(function (event) {
      actions.executeById({ descriptorId: event.descriptor.id, action: event.action, user: event.user }).then(function (result) {
        if (!result.ok && root.console && typeof root.console.warn === "function") {
          root.console.warn("[SchoolSafe][Documents] Action refusée:", result.error);
        }
      });
    });
    return actions;
  }

  root.SchoolSafeDocumentRuntime = {
    bindContext: bindContext,
    getState: function () {
      return { mode: activeMode, catalogueSize: activeCatalogue.length, error: lastError };
    },
  };
  root.SchoolSafeDocumentActionsReady = initialize();
}(window));
