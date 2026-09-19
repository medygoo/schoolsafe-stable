(function () {
  "use strict";

  var DB_NAME = "schoolsafe-v2-offline";
  var DB_VERSION = 1;
  var OPERATION_STORE = "operations";
  var AUDIT_STORE = "audit";
  var priorities = { scan: 10, message: 20, assignment: 30, attendance: 40, pedagogy: 50, finance: 60, administration: 70 };
  var labels = { scan: "Securite et scans", message: "Messages urgents", assignment: "Devoirs et pieces jointes", attendance: "Presences et services", pedagogy: "Notes et pedagogie", finance: "Finances et rapports", administration: "Administration" };
  // INC-4 : finance / administration (rôles, permissions, licence) ne sont
  // JAMAIS mis en file hors-ligne — validation serveur obligatoire.
  var OFFLINE_BLOCKED = { finance: true, administration: true };
  var currentSchoolId = null;
  var dbPromise = null;
  var syncing = false;
  var demoAdapter = null;
  // Futur connecteur serveur réel — structurellement séparé du connecteur
  // démo : une opération demo-local ne peut jamais l'atteindre.
  var serverAdapter = null;

  function uid(prefix) {
    if (window.crypto && window.crypto.randomUUID) return prefix + "-" + window.crypto.randomUUID();
    return prefix + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function openDatabase() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(OPERATION_STORE)) {
          var operations = db.createObjectStore(OPERATION_STORE, { keyPath: "id" });
          operations.createIndex("status", "status", { unique: false });
          operations.createIndex("priority", "priority", { unique: false });
        }
        if (!db.objectStoreNames.contains(AUDIT_STORE)) {
          var audit = db.createObjectStore(AUDIT_STORE, { keyPath: "id" });
          audit.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
    return dbPromise;
  }

  function withStore(name, mode, callback) {
    return openDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        var transaction = db.transaction(name, mode);
        var store = transaction.objectStore(name);
        var result;
        try { result = callback(store); } catch (error) { reject(error); return; }
        transaction.oncomplete = function () { resolve(result); };
        transaction.onerror = function () { reject(transaction.error); };
        transaction.onabort = function () { reject(transaction.error); };
      });
    });
  }

  function getAll(name) {
    return openDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        var request = db.transaction(name, "readonly").objectStore(name).getAll();
        request.onsuccess = function () { resolve(request.result || []); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function stateFrom(operations) {
    var pending = operations.filter(function (item) { return item.status === "pending" || item.status === "syncing"; });
    var conflicts = operations.filter(function (item) { return item.status === "conflict" || item.status === "failed"; });
    return {
      online: navigator.onLine,
      syncing: syncing,
      pending: pending.length,
      conflicts: conflicts.length,
      operations: operations.sort(function (a, b) { return a.priority - b.priority || a.createdAt.localeCompare(b.createdAt); }),
      lastSyncAt: window.localStorage.getItem("schoolsafe-v2-last-sync") || "",
      mode: demoAdapter ? "demo-local" : "server-required"
    };
  }

  function publishState() {
    return getAll(OPERATION_STORE).then(function (operations) {
      var state = stateFrom(operations);
      window.dispatchEvent(new CustomEvent("schoolsafe:sync-state", { detail: state }));
      return state;
    });
  }

  function audit(action, details) {
    var entry = {
      id: uid("audit"),
      action: action,
      details: details || {},
      role: details && details.role ? details.role : "unknown",
      createdAt: new Date().toISOString(),
      device: navigator.userAgent.slice(0, 180)
    };
    return withStore(AUDIT_STORE, "readwrite", function (store) { store.add(entry); }).then(function () { return entry; });
  }

  function requestBackgroundSync() {
    if (!("serviceWorker" in navigator)) return Promise.resolve();
    return navigator.serviceWorker.ready.then(function (registration) {
      if (registration.sync && registration.sync.register) return registration.sync.register("schoolsafe-sync");
    }).catch(function () {});
  }

  function enqueue(input) {
    var type = priorities[input.type] ? input.type : "administration";
    // INC-4 : opération sensible hors-ligne = refusée, message explicite.
    if (OFFLINE_BLOCKED[type] && !navigator.onLine) {
      var blockedError = new Error(labels[type] + " : opération sensible — une connexion validée par le serveur est requise. Rien n'a été mis en file.");
      return audit("operation-blocked-offline", { type: type, role: input.role }).then(function () { throw blockedError; });
    }
    // FAIL-CLOSED : aucune opération sans contexte école actif ne peut exister.
    if (!currentSchoolId) {
      var contextError = new Error("Aucun contexte école actif : opération refusée, rien n'a été mis en file.");
      return audit("operation-refused-no-school", { type: type, role: input.role }).then(function () { throw contextError; });
    }
    // FAIL-CLOSED : le frontend ne choisit jamais son tenant — un schoolId
    // fourni qui contredit le contexte actif = refus IMMÉDIAT.
    if (input.schoolId && input.schoolId !== currentSchoolId) {
      var mismatchError = new Error("Le contexte école fourni ne correspond pas au contexte actif : refus immédiat.");
      return audit("operation-refused-school-mismatch", {
        type: type, role: input.role, fourni: input.schoolId, actif: currentSchoolId,
      }).then(function () { throw mismatchError; });
    }
    var schoolId = currentSchoolId;
    var operation = {
      id: input.id || uid("op"),
      type: type,
      label: input.label || labels[type],
      payload: input.payload || {},
      role: input.role || "unknown",
      schoolId: schoolId,
      priority: priorities[type],
      status: "pending",
      attempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: ""
    };
    return withStore(OPERATION_STORE, "readwrite", function (store) { store.add(operation); })
      .then(function () { return audit("operation-created", { operationId: operation.id, type: operation.type, label: operation.label, role: operation.role }); })
      .then(function () {
        publishState();
        requestBackgroundSync();
        if (navigator.onLine) window.setTimeout(syncNow, 0);
        return operation;
      });
  }

  function updateOperation(operation) {
    operation.updatedAt = new Date().toISOString();
    return withStore(OPERATION_STORE, "readwrite", function (store) { store.put(operation); });
  }

  function processOperation(operation) {
    operation.status = "syncing";
    operation.attempts += 1;
    return updateOperation(operation).then(function () {
      // INC-4 : routage strict des connecteurs — une opération demo-local ne
      // rejoint JAMAIS le connecteur serveur réel, structurellement.
      var isDemo = operation.schoolId === "demo-local";
      var adapter = isDemo ? demoAdapter : serverAdapter;
      if (!adapter) {
        throw new Error(isDemo
          ? "Le connecteur démo local n'est pas configuré."
          : "Le connecteur serveur n'est pas encore autorise ni configure.");
      }
      return adapter(operation);
    }).then(function (result) {
      operation.status = "demo-synced";
      operation.confirmedAt = new Date().toISOString();
      operation.confirmation = result || { mode: "demo-local" };
      operation.error = "";
      return updateOperation(operation).then(function () {
        return audit("operation-confirmed-locally", { operationId: operation.id, type: operation.type, role: operation.role });
      }).then(function () {
        window.dispatchEvent(new CustomEvent("schoolsafe:operation-synced", { detail: operation }));
      });
    }).catch(function (error) {
      operation.status = demoAdapter ? "failed" : "pending";
      operation.error = error && error.message ? error.message : "Synchronisation impossible";
      return updateOperation(operation);
    });
  }

  // INC-4 renforcé : toute opération sans contexte école strictement égal au
  // contexte courant est mise en quarantaine — JAMAIS synchronisée.
  function quarantineInvalid(operations) {
    var invalid = operations.filter(function (op) {
      return (op.status === "pending" || op.status === "failed")
        && (!op.schoolId || !currentSchoolId || op.schoolId !== currentSchoolId);
    });
    return invalid.reduce(function (chain, op) {
      return chain.then(function () {
        op.status = "quarantined";
        op.error = "Contexte école absent ou différent : jamais synchronisée.";
        op.updatedAt = new Date().toISOString();
        return withStore(OPERATION_STORE, "readwrite", function (store) { store.put(op); })
          .then(function () { return audit("operation-quarantined", { operationId: op.id, type: op.type, role: op.role }); });
      });
    }, Promise.resolve());
  }

  function syncNow() {
    if (syncing || !navigator.onLine) return publishState();
    // FAIL-CLOSED : sans contexte école actif, aucune opération n'est traitée.
    if (!currentSchoolId) return publishState();
    syncing = true;
    return publishState().then(function () { return getAll(OPERATION_STORE); }).then(function (operations) {
      return quarantineInvalid(operations).then(function () {
        var pending = operations.filter(function (item) {
          return (item.status === "pending" || item.status === "failed")
            && item.schoolId === currentSchoolId;
        }).sort(function (a, b) {
          return a.priority - b.priority || a.createdAt.localeCompare(b.createdAt);
        });
        return pending.reduce(function (chain, operation) {
          return chain.then(function () { return processOperation(operation); });
        }, Promise.resolve());
      });
    }).finally(function () {
      syncing = false;
      window.localStorage.setItem("schoolsafe-v2-last-sync", new Date().toISOString());
      publishState();
    });
  }

  // INC-4 : changement d'école → l'ancien état hors-ligne est invalidé.
  // Les opérations d'une AUTRE école sont purgées (jamais mélangées).
  function setSchoolContext(schoolId) {
    if (schoolId === currentSchoolId) return Promise.resolve();
    var previous = currentSchoolId;
    currentSchoolId = schoolId || null;
    if (!previous) return publishState();
    return getAll(OPERATION_STORE).then(function (operations) {
      var stale = operations.filter(function (op) { return op.schoolId && op.schoolId !== currentSchoolId; });
      return stale.reduce(function (chain, op) {
        return chain.then(function () {
          return withStore(OPERATION_STORE, "readwrite", function (store) { store.delete(op.id); });
        });
      }, Promise.resolve()).then(function () {
        return audit("school-context-switched", { from: previous, to: currentSchoolId, purged: stale.length, role: "system" });
      });
    }).then(publishState);
  }

  function recentAudit() {
    return getAll(AUDIT_STORE).then(function (items) {
      return items.sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); }).slice(0, 20);
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return Promise.resolve(null);
    return navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(function () { return null; });
  }

  function init(options) {
    options = options || {};
    demoAdapter = options.demoAdapter || null;
    window.addEventListener("online", function () { publishState(); syncNow(); });
    window.addEventListener("offline", publishState);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", function (event) {
        if (event.data && event.data.type === "SCHOOLSAFE_SYNC_REQUEST") syncNow();
      });
    }
    return Promise.all([openDatabase(), registerServiceWorker()]).then(function () { return publishState(); });
  }

  window.SchoolSafeSync = {
    init: init,
    enqueue: enqueue,
    syncNow: syncNow,
    state: publishState,
    audit: audit,
    recentAudit: recentAudit,
    priorities: priorities,
    labels: labels,
    setSchoolContext: setSchoolContext,
    offlineBlocked: OFFLINE_BLOCKED,
    registerServerAdapter: function (adapter) { serverAdapter = adapter; }
  };
})();
