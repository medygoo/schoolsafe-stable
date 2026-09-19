// SchoolSafe V2 — Phase G — Comptabilité / Trésorerie frontend uniquement.
(function (root) {
  "use strict";

  var activeTab = "dashboard";
  var sessionOverride = null;
  var journalFilters = { from: "", to: "", direction: "", currency: "", search: "" };
  var reportFilters = { from: "", to: "" };
  var CLOSING_DRAFT_STORAGE_KEY = "schoolsafe-v2-accounting-closing-draft";

  function readClosingDraft() {
    try {
      var parsed = JSON.parse(root.localStorage.getItem(CLOSING_DRAFT_STORAGE_KEY) || "null");
      return parsed && parsed.prepared ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function persistClosingDraft(draft) {
    try { root.localStorage.setItem(CLOSING_DRAFT_STORAGE_KEY, JSON.stringify(draft)); } catch (error) {}
  }

  var closingDraft = readClosingDraft();

  function escapeMarkup(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function user() {
    if (sessionOverride) return sessionOverride;
    if (root.SchoolSafeAppContext && typeof root.SchoolSafeAppContext.getCurrentUser === "function") {
      return root.SchoolSafeAppContext.getCurrentUser();
    }
    return { permissions: [], scopes: [] };
  }

  function allows(permission, scope) {
    return allowsFor(user(), permission, scope);
  }

  function allowsFor(subject, permission, scope) {
    var access = root.SchoolSafeAccess;
    return !!(access && typeof access.allowsScope === "function" && access.allowsScope(subject, permission, scope));
  }

  function canReadAccounting() {
    return allows("reports.financial.read", "school") || allows("finance.report.read", "school");
  }

  function canPrepareClosing() {
    return allows("finance.cash_register.close", "school");
  }

  function isLiveSession() {
    return !!(user() && (user().native === true || user().token));
  }

  function renderLiveUnavailable() {
    return '<section class="accounting-future" data-accounting-live-unavailable role="status"><span>SESSION LIVE</span><h3>DONNÉES INDISPONIBLES</h3><p>Les journaux, dépenses, positions, clôtures, rapprochements et statistiques réels exigent une projection serveur sûre.</p><span class="accounting-boundary-chip">BACKEND_LATER</span></section>';
  }

  function snapshot() {
    var finance = root.SchoolSafeFinanceModule;
    if (!finance || typeof finance.getAccountingSnapshot !== "function") {
      return { dayStatus: "Indisponible", transactions: [], expenses: [], studentFees: [] };
    }
    return finance.getAccountingSnapshot();
  }

  function renderDenied() {
    return '<section class="accounting-denied">' + root.ssState({
      type: "error",
      title: "Comptabilité / Trésorerie non autorisée",
      message: "reports.financial.read ou finance.report.read avec portée school est obligatoire.",
      details: "DENY explicite prioritaire · aucune donnée de trésorerie n’est révélée."
    }) + "</section>";
  }

  function metric(label, value, icon) {
    return '<article class="accounting-dashboard-metric"><span><i data-lucide="' + icon + '"></i></span><div><small>' + escapeMarkup(label) + '</small><b>' + escapeMarkup(value) + "</b></div></article>";
  }

  function shortcut(tab, label, icon) {
    return '<button type="button" class="accounting-dashboard-action" data-accounting-open="' + tab + '"><i data-lucide="' + icon + '"></i><span>' + escapeMarkup(label) + "</span></button>";
  }

  function renderDashboard() {
    var data = snapshot();
    var receipts = data.transactions.filter(function (item) { return item.status !== "Annulé"; }).length;
    var outputs = data.expenses.length;
    var metrics = [
      metric("Position de trésorerie", "Par devise", "landmark"),
      metric("Recettes visibles", String(receipts), "arrow-down-left"),
      metric("Sorties visibles", String(outputs), "arrow-up-right"),
      metric("Caisses", data.dayStatus, "wallet"),
      metric("Clôtures", canPrepareClosing() ? "Préparation locale" : "Lecture seule", "lock-keyhole"),
      metric("Écarts", "À contrôler", "scale"),
      metric("Anomalies", "Analyse frontend", "triangle-alert"),
      metric("Rapports", "Synthèses frontend", "file-chart-column")
    ].join("");
    var shortcuts = [
      shortcut("journal", "Journal", "notebook-tabs"),
      shortcut("treasury", "Trésorerie", "landmark"),
      shortcut("reconciliation", "Rapprochement", "list-checks"),
      shortcut("reports", "Rapports", "file-chart-column")
    ];
    if (canPrepareClosing()) shortcuts.splice(2, 0, shortcut("closing", "Clôture", "lock-keyhole"));
    return '<section class="accounting-dashboard" data-accounting-dashboard><header><div><span>Trésorerie frontend · démonstration</span><h3>Comptabilité / Trésorerie</h3><p>Projection en lecture seule des données Finance déjà visibles.</p></div><span class="accounting-boundary-chip">DÉMONSTRATION · BACKEND_LATER</span></header><aside class="accounting-boundary"><i data-lucide="shield-check"></i><p>Aucune écriture comptable officielle, aucun journal légal, aucun débit/crédit et aucune conversion de devise.</p></aside><div class="accounting-dashboard-grid">' + metrics + '</div><section class="accounting-shortcuts"><header><span>Raccourcis autorisés</span><h3>Accès selon permission et portée</h3></header><div>' + shortcuts.join("") + "</div></section></section>";
  }

  function amountLabel(amount, currency) {
    var value = Number(amount || 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
    return value + " " + (currency || "DEVISE MANQUANTE");
  }

  function frenchDateIso(value) {
    var source = String(value || "").toLowerCase();
    var match = source.match(/(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})/);
    if (!match) return "";
    var months = { janvier: 1, "février": 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, "août": 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, "décembre": 12, decembre: 12 };
    return match[3] + "-" + String(months[match[2]]).padStart(2, "0") + "-" + String(Number(match[1])).padStart(2, "0");
  }

  function journalRows() {
    var data = snapshot();
    var inputs = data.transactions.map(function (item) {
      return {
        id: item.id || item.receipt,
        date: item.date || item.day || "Date indisponible",
        isoDate: item.isoDate || frenchDateIso(item.date || item.day),
        reference: item.receipt || item.reference || item.id || "RÉFÉRENCE MANQUANTE",
        nature: "Recette",
        label: [item.student, item.fee].filter(Boolean).join(" · ") || "Paiement Finance",
        direction: "in",
        amount: Number(item.amount || 0),
        currency: item.currency || "",
        source: "Finance · paiement",
        status: item.status || "Statut indisponible",
        link: item.studentFeeId || item.student_fee_id || "Lien non disponible"
      };
    });
    var outputs = data.expenses.map(function (item, index) {
      return {
        id: item.id || item.reference || "expense-" + index,
        date: item.date || "Date indisponible",
        isoDate: item.isoDate || frenchDateIso(item.date),
        reference: item.reference || "RÉFÉRENCE MANQUANTE",
        nature: "Sortie",
        label: item.label || "Dépense Finance",
        direction: "out",
        amount: Number(item.amount || 0),
        currency: item.currency || "",
        source: "Finance · dépense visible",
        status: item.status || "Statut indisponible",
        link: item.justification || "Lien non disponible"
      };
    });
    return inputs.concat(outputs);
  }

  function visibleJournalRows(rows) {
    var search = String(journalFilters.search || "").toLowerCase();
    return rows.filter(function (row) {
      if (journalFilters.direction && row.direction !== journalFilters.direction) return false;
      if (journalFilters.currency && row.currency !== journalFilters.currency) return false;
      if (journalFilters.from && (!row.isoDate || row.isoDate < journalFilters.from)) return false;
      if (journalFilters.to && (!row.isoDate || row.isoDate > journalFilters.to)) return false;
      if (search && [row.reference, row.label, row.source, row.status, row.link].join(" ").toLowerCase().indexOf(search) < 0) return false;
      return true;
    });
  }

  function journalCurrencySummaries(rows) {
    var currencies = [];
    rows.forEach(function (row) {
      if (row.currency && currencies.indexOf(row.currency) < 0) currencies.push(row.currency);
    });
    return currencies.sort().map(function (currency) {
      var incoming = rows.filter(function (row) { return row.currency === currency && row.direction === "in"; }).reduce(function (sum, row) { return sum + row.amount; }, 0);
      var outgoing = rows.filter(function (row) { return row.currency === currency && row.direction === "out"; }).reduce(function (sum, row) { return sum + row.amount; }, 0);
      return '<article data-journal-currency-summary="' + escapeMarkup(currency) + '"><small>' + escapeMarkup(currency) + '</small><b>Entrées ' + amountLabel(incoming, currency) + '</b><span>Sorties ' + amountLabel(outgoing, currency) + "</span></article>";
    }).join("");
  }

  function renderJournal() {
    var rows = journalRows();
    var visibleRows = visibleJournalRows(rows);
    var currencies = [];
    rows.forEach(function (row) { if (row.currency && currencies.indexOf(row.currency) < 0) currencies.push(row.currency); });
    var currencyOptions = ['<option value="">Toutes les devises</option>'].concat(currencies.sort().map(function (currency) {
      return '<option value="' + escapeMarkup(currency) + '"' + (journalFilters.currency === currency ? " selected" : "") + ">" + escapeMarkup(currency) + "</option>";
    })).join("");
    var tableRows = visibleRows.map(function (row) {
      return '<tr data-journal-direction="' + row.direction + '"><td>' + escapeMarkup(row.date) + '</td><td><b>' + escapeMarkup(row.reference) + '</b></td><td>' + escapeMarkup(row.nature) + '</td><td>' + escapeMarkup(row.label) + '</td><td><span class="accounting-direction accounting-direction--' + row.direction + '">' + (row.direction === "in" ? "ENTRÉE" : "SORTIE") + '</span></td><td><b>' + escapeMarkup(amountLabel(row.amount, row.currency)) + '</b></td><td>' + escapeMarkup(row.source) + '</td><td>' + escapeMarkup(row.status) + '</td><td>' + escapeMarkup(row.link) + "</td></tr>";
    }).join("");
    if (!tableRows) tableRows = '<tr><td colspan="9"><div class="accounting-empty">Aucun mouvement visible avec ces filtres.</div></td></tr>';
    return '<section class="accounting-journal" data-accounting-journal><header><div><span>Journal de trésorerie</span><h3>Mouvements Finance visibles</h3><p>Entrées et sorties projetées sans écriture manuelle.</p></div><span class="accounting-boundary-chip">LECTURE SEULE · BACKEND_LATER</span></header><aside class="accounting-boundary"><i data-lucide="split"></i><p>CDF, USD et toute autre devise restent strictement séparés · AUCUNE CONVERSION · aucun total général multidevise.</p></aside><div class="accounting-journal-filters"><label>Du<input id="journalFrom" type="date" value="' + escapeMarkup(journalFilters.from) + '"></label><label>Au<input id="journalTo" type="date" value="' + escapeMarkup(journalFilters.to) + '"></label><label>Sens<select id="journalDirection"><option value="">Entrées et sorties</option><option value="in"' + (journalFilters.direction === "in" ? " selected" : "") + '>Entrées</option><option value="out"' + (journalFilters.direction === "out" ? " selected" : "") + '>Sorties</option></select></label><label>Devise<select id="journalCurrency">' + currencyOptions + '</select></label><label class="accounting-filter-search">Référence ou libellé<input id="journalSearch" type="search" value="' + escapeMarkup(journalFilters.search) + '" placeholder="Rechercher"></label></div><div class="accounting-currency-summaries">' + journalCurrencySummaries(rows) + '</div><div class="accounting-table-wrap" tabindex="0"><table class="accounting-table"><thead><tr><th>Date / heure</th><th>Référence</th><th>Nature</th><th>Libellé</th><th>Sens</th><th>Montant / devise</th><th>Source</th><th>Statut</th><th>Lien logique</th></tr></thead><tbody>' + tableRows + "</tbody></table></div></section>";
  }

  function bindJournalFilters() {
    var bindings = [
      ["journalFrom", "from", "change"],
      ["journalTo", "to", "change"],
      ["journalDirection", "direction", "change"],
      ["journalCurrency", "currency", "change"],
      ["journalSearch", "search", "input"]
    ];
    bindings.forEach(function (binding) {
      var control = document.getElementById(binding[0]);
      if (!control) return;
      control.addEventListener(binding[2], function () {
        journalFilters[binding[1]] = control.value;
        renderContent();
      });
    });
  }

  function renderExpenses() {
    var rows = snapshot().expenses.map(function (expense) {
      return '<tr><td><b>' + escapeMarkup(expense.reference || "RÉFÉRENCE MANQUANTE") + '</b></td><td>' + escapeMarkup(expense.date || "Date indisponible") + '</td><td>' + escapeMarkup(expense.label || "Libellé indisponible") + '</td><td><b>' + escapeMarkup(amountLabel(expense.amount, expense.currency || "")) + '</b></td><td>' + escapeMarkup(expense.status || "Statut indisponible") + '</td><td>' + escapeMarkup(expense.justification || "Justification non disponible") + "</td></tr>";
    }).join("");
    if (!rows) rows = '<tr><td colspan="6"><div class="accounting-empty">Aucune dépense Finance visible.</div></td></tr>';
    return '<section class="accounting-expenses" data-accounting-expenses><header><div><span>Registre des dépenses</span><h3>Dépenses Finance existantes</h3><p>Consultation uniquement des sorties déjà disponibles dans la source Finance.</p></div><span class="accounting-boundary-chip">LECTURE SEULE</span></header><div class="accounting-table-wrap" tabindex="0"><table class="accounting-table accounting-expense-table"><thead><tr><th>Référence</th><th>Date</th><th>Libellé</th><th>Montant / devise</th><th>Statut</th><th>Justification</th></tr></thead><tbody>' + rows + '</tbody></table></div><section class="accounting-expense-boundary"><header><div><span>Contrat futur visible</span><h3>Enregistrement officiel indisponible</h3><p>Ce formulaire documente les champs attendus sans créer de dépense locale ou officielle.</p></div><span class="accounting-boundary-chip">BACKEND_LATER</span></header><form id="expenseFutureForm"><label>Date<input id="expenseFutureDate" type="date"></label><label>Libellé<input id="expenseFutureLabel" type="text" maxlength="200" placeholder="Libellé futur"></label><label>Montant<input id="expenseFutureAmount" type="number" min="0" step="0.01"></label><label>Devise<select id="expenseFutureCurrency"><option value="CDF">CDF</option><option value="USD">USD</option></select></label><label>Catégorie future<input id="expenseFutureCategory" type="text" placeholder="FEATURE_LATER"></label><label>Référence<input id="expenseFutureReference" type="text"></label><label>Pièce future<input id="expenseFutureReceipt" type="text" placeholder="Référence de pièce"></label><button class="ss-button" id="expenseFutureSubmit" type="submit" disabled>Enregistrer la dépense</button></form><aside class="accounting-boundary accounting-boundary--warning"><i data-lucide="lock-keyhole"></i><p>PERMISSION D’ÉCRITURE REQUISE · BACKEND_LATER · aucune permission de lecture n’autorise une création.</p></aside></section></section>';
  }

  function renderTreasury() {
    var rows = journalRows();
    var currencies = [];
    rows.forEach(function (row) { if (row.currency && currencies.indexOf(row.currency) < 0) currencies.push(row.currency); });
    var cards = currencies.sort().map(function (currency) {
      var currencyRows = rows.filter(function (row) { return row.currency === currency; });
      var incoming = currencyRows.filter(function (row) { return row.direction === "in"; }).reduce(function (sum, row) { return sum + row.amount; }, 0);
      var outgoing = currencyRows.filter(function (row) { return row.direction === "out"; }).reduce(function (sum, row) { return sum + row.amount; }, 0);
      var net = incoming - outgoing;
      var localClosing = closingDraft && closingDraft.currency === currency ? closingDraft : null;
      return '<article class="accounting-treasury-card" data-treasury-currency="' + escapeMarkup(currency) + '"><header><span>' + escapeMarkup(currency) + '</span><b>MOUVEMENTS UNIQUEMENT</b></header><div class="accounting-opening-missing">SOLDE D’OUVERTURE NON DISPONIBLE · BACKEND_LATER</div><dl><div><dt>Entrées</dt><dd>Entrées ' + escapeMarkup(amountLabel(incoming, currency)) + '</dd></div><div><dt>Sorties</dt><dd>Sorties ' + escapeMarkup(amountLabel(outgoing, currency)) + '</dd></div><div><dt>Position théorique</dt><dd>Mouvements nets ' + escapeMarkup(amountLabel(net, currency)) + '</dd></div><div><dt>Comptage local</dt><dd>' + (localClosing ? escapeMarkup(amountLabel(localClosing.counted, currency)) : "Non préparé") + '</dd></div><div><dt>Écart</dt><dd>' + (localClosing ? escapeMarkup(amountLabel(localClosing.variance, currency)) : "Non calculable") + '</dd></div><div><dt>Statut</dt><dd>' + (localClosing ? escapeMarkup(localClosing.state) : "À contrôler") + "</dd></div></dl></article>";
    }).join("");
    if (!cards) cards = '<div class="accounting-empty">Aucune devise exploitable dans les mouvements visibles.</div>';
    var missingCurrency = rows.filter(function (row) { return !row.currency; }).length;
    return '<section class="accounting-treasury" data-accounting-treasury><header><div><span>Position de trésorerie</span><h3>Mouvements distincts par devise</h3><p>Les positions sont calculées sans somme ni conversion entre devises.</p></div><span class="accounting-boundary-chip">DÉMONSTRATION · BACKEND_LATER</span></header><aside class="accounting-boundary"><i data-lucide="split"></i><p>AUCUNE CONVERSION · aucun taux de change · aucun total général multidevise.</p></aside><div class="accounting-treasury-grid">' + cards + '</div>' + (missingCurrency ? '<aside class="accounting-missing-currency"><b>MOUVEMENTS SANS DEVISE EXCLUS</b><span>' + missingCurrency + ' mouvements à qualifier avant tout calcul.</span></aside>' : "") + "</section>";
  }

  function closingCurrencies() {
    var currencies = [];
    journalRows().forEach(function (row) { if (row.currency && currencies.indexOf(row.currency) < 0) currencies.push(row.currency); });
    if (!currencies.length) currencies.push("CDF");
    return currencies.sort();
  }

  function renderClosingSummary() {
    if (!closingDraft) return '<aside class="accounting-closing-state"><b>OUVERTE</b><span>Aucune préparation locale enregistrée.</span></aside>';
    return '<section class="accounting-closing-summary"><header><span>BROUILLON LOCAL</span><b>' + escapeMarkup(closingDraft.state) + '</b></header><dl><div><dt>Date</dt><dd>' + escapeMarkup(closingDraft.date) + '</dd></div><div><dt>Caisse / poste</dt><dd>' + escapeMarkup(closingDraft.till) + '</dd></div><div><dt>Devise</dt><dd>' + escapeMarkup(closingDraft.currency) + '</dd></div><div><dt>Attendu local</dt><dd>' + escapeMarkup(amountLabel(closingDraft.expected, closingDraft.currency)) + '</dd></div><div><dt>Compté</dt><dd>' + escapeMarkup(amountLabel(closingDraft.counted, closingDraft.currency)) + '</dd></div><div><dt>Écart</dt><dd>' + escapeMarkup(amountLabel(closingDraft.variance, closingDraft.currency)) + '</dd></div></dl><p>' + escapeMarkup(closingDraft.observation || "Aucune observation") + '</p><aside class="accounting-boundary accounting-boundary--warning"><i data-lucide="cloud-off"></i><p>CLÔTURE OFFICIELLE — BACKEND_LATER · ce brouillon ne ferme aucune caisse.</p></aside></section>';
  }

  function renderClosing() {
    if (!canPrepareClosing()) {
      return '<section class="accounting-denied">' + root.ssState({ type: "error", title: "Clôture non autorisée", message: "finance.cash_register.close avec portée school est obligatoire.", details: "DENY explicite prioritaire · aucune préparation locale disponible." }) + "</section>";
    }
    var selectedCurrency = closingDraft ? closingDraft.currency : closingCurrencies()[0];
    var currencyOptions = closingCurrencies().map(function (currency) { return '<option value="' + escapeMarkup(currency) + '"' + (currency === selectedCurrency ? " selected" : "") + ">" + escapeMarkup(currency) + "</option>"; }).join("");
    return '<section class="accounting-closing" data-accounting-closing><header><div><span>Préparation locale de clôture</span><h3>Comptage de caisse</h3><p>Préparez un constat frontend sans fermer officiellement la caisse.</p></div><span class="accounting-boundary-chip">BROUILLON LOCAL · BACKEND_LATER</span></header><div class="accounting-closing-steps"><span>OUVERTE</span><span>PRÉPARATION</span><span>ÉCART À CONTRÔLER</span><span>PRÊTE POUR CLÔTURE</span><span>CLÔTURE OFFICIELLE — BACKEND_LATER</span></div><form id="accountingClosingForm"><label>Date<input id="closingDate" type="date" required value="' + escapeMarkup(closingDraft ? closingDraft.date : "") + '"></label><label>Caisse / poste<input id="closingTill" type="text" required maxlength="120" value="' + escapeMarkup(closingDraft ? closingDraft.till : "") + '" placeholder="Caisse ou poste"></label><label>Devise<select id="closingCurrency" required>' + currencyOptions + '</select></label><label>Attendu local<input id="closingExpected" type="number" required step="0.01" value="' + escapeMarkup(closingDraft ? closingDraft.expected : "") + '"></label><label>Montant compté<input id="closingCounted" type="number" required step="0.01" value="' + escapeMarkup(closingDraft ? closingDraft.counted : "") + '"></label><label class="accounting-closing-observation">Observation<textarea id="closingObservation" rows="3" maxlength="500">' + escapeMarkup(closingDraft ? closingDraft.observation : "") + '</textarea></label><button class="ss-button" id="closingPrepare" type="submit">Préparer le constat local</button></form>' + renderClosingSummary() + "</section>";
  }

  function bindClosing() {
    var form = document.getElementById("accountingClosingForm");
    if (!form) return;
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!canPrepareClosing()) return;
      var expected = Number(document.getElementById("closingExpected").value || 0);
      var counted = Number(document.getElementById("closingCounted").value || 0);
      var variance = counted - expected;
      closingDraft = {
        prepared: true,
        date: document.getElementById("closingDate").value,
        till: document.getElementById("closingTill").value.trim(),
        currency: document.getElementById("closingCurrency").value,
        expected: expected,
        counted: counted,
        variance: variance,
        observation: document.getElementById("closingObservation").value.trim(),
        state: variance === 0 ? "PRÊTE POUR CLÔTURE" : "ÉCART À CONTRÔLER"
      };
      persistClosingDraft(closingDraft);
      renderContent();
    });
  }

  function reconciliationAnomalies() {
    var data = snapshot();
    var anomalies = [];
    var references = {};
    (data.transactions || []).forEach(function (transaction) {
      var reference = transaction.receipt || transaction.reference || "";
      if (!transaction.studentFeeId && !transaction.student_fee_id) {
        anomalies.push({ type: "Lien student_fee absent", reference: reference || transaction.id || "—", detail: "Le paiement visible ne porte aucun studentFeeId démontrable." });
      }
      if (!reference) {
        anomalies.push({ type: "Référence de transaction absente", reference: transaction.id || "—", detail: "Ni reçu ni référence visible pour cette transaction." });
      } else {
        references[reference] = (references[reference] || 0) + 1;
      }
      if (!transaction.currency) anomalies.push({ type: "Devise manquante", reference: reference || transaction.id || "—", detail: "Transaction exclue des calculs par devise." });
    });
    Object.keys(references).forEach(function (reference) {
      if (references[reference] > 1) anomalies.push({ type: "Référence dupliquée", reference: reference, detail: references[reference] + " transactions portent la même référence." });
    });
    (data.receipts || []).forEach(function (receipt) {
      var reference = receipt.reference || receipt.receipt || receipt.id || "";
      var transaction = (data.transactions || []).find(function (item) { return (item.receipt || item.reference || item.id) === reference; });
      if (!transaction) {
        anomalies.push({ type: "Reçu sans transaction", reference: reference || "—", detail: "Aucune transaction visible ne correspond à ce reçu." });
      } else if (Number(receipt.amount || 0) !== Number(transaction.amount || 0)) {
        anomalies.push({ type: "Montant incohérent", reference: reference || "—", detail: "Reçu " + amountLabel(receipt.amount, receipt.currency) + " · transaction " + amountLabel(transaction.amount, transaction.currency) + "." });
      }
    });
    (data.expenses || []).forEach(function (expense, index) {
      var reference = expense.reference || "Dépense #" + (index + 1);
      if (!expense.reference) anomalies.push({ type: "Dépense sans référence", reference: reference, detail: expense.label || "Dépense visible sans référence." });
      if (!expense.currency) anomalies.push({ type: "Devise manquante", reference: reference, detail: "Dépense exclue des calculs par devise." });
    });
    if (closingDraft && Number(closingDraft.variance || 0) !== 0) {
      anomalies.push({ type: "Écart de clôture", reference: closingDraft.till || "Caisse", detail: amountLabel(closingDraft.variance, closingDraft.currency) + " · brouillon local à revoir." });
    }
    return anomalies;
  }

  function renderReconciliation() {
    var anomalies = reconciliationAnomalies();
    var rows = anomalies.map(function (anomaly) {
      return '<tr data-reconciliation-anomaly><td><b>' + escapeMarkup(anomaly.type) + '</b></td><td>' + escapeMarkup(anomaly.reference) + '</td><td>' + escapeMarkup(anomaly.detail) + '</td><td><span class="accounting-review-only">Voir / expliquer</span></td></tr>';
    }).join("");
    if (!rows) rows = '<tr><td colspan="4"><div class="accounting-empty">Aucune anomalie démontrable dans les données visibles.</div></td></tr>';
    return '<section class="accounting-reconciliation" data-accounting-reconciliation><header><div><span>Rapprochement frontend</span><h3>Chaîne de contrôle visible</h3><p>Paiement → student_fee → reçu / référence → journal → caisse → écart / anomalie</p></div><span class="accounting-boundary-chip">LECTURE SEULE · BACKEND_LATER</span></header><div class="accounting-reconciliation-chain"><span>Paiement</span><i data-lucide="arrow-right"></i><span>student_fee</span><i data-lucide="arrow-right"></i><span>Reçu / référence</span><i data-lucide="arrow-right"></i><span>Journal</span><i data-lucide="arrow-right"></i><span>Caisse</span><i data-lucide="arrow-right"></i><span>Anomalie</span></div><aside class="accounting-boundary accounting-boundary--warning"><i data-lucide="shield-alert"></i><p>AUCUNE CORRECTION AUTOMATIQUE · aucune mutation de paiement, reçu, montant, devise, student_fee ou dépense.</p></aside><div class="accounting-reconciliation-summary"><b>' + anomalies.length + '</b><span>signaux démontrables à examiner</span></div><div class="accounting-table-wrap" tabindex="0"><table class="accounting-table accounting-reconciliation-table"><thead><tr><th>Anomalie</th><th>Référence</th><th>Explication</th><th>Action permise</th></tr></thead><tbody>' + rows + "</tbody></table></div></section>";
  }

  function reportRows() {
    return journalRows().filter(function (row) {
      if (reportFilters.from && (!row.isoDate || row.isoDate < reportFilters.from)) return false;
      if (reportFilters.to && (!row.isoDate || row.isoDate > reportFilters.to)) return false;
      return true;
    });
  }

  function renderReportCurrencies(rows) {
    var currencies = [];
    rows.forEach(function (row) { if (row.currency && currencies.indexOf(row.currency) < 0) currencies.push(row.currency); });
    return currencies.sort().map(function (currency) {
      var incoming = rows.filter(function (row) { return row.currency === currency && row.direction === "in"; }).reduce(function (sum, row) { return sum + row.amount; }, 0);
      var outgoing = rows.filter(function (row) { return row.currency === currency && row.direction === "out"; }).reduce(function (sum, row) { return sum + row.amount; }, 0);
      return '<article data-report-currency="' + escapeMarkup(currency) + '"><header><b>' + escapeMarkup(currency) + '</b><span>SYNTHÈSE DE TRÉSORERIE</span></header><dl><div><dt>Entrées</dt><dd>' + escapeMarkup(amountLabel(incoming, currency)) + '</dd></div><div><dt>Sorties</dt><dd>' + escapeMarkup(amountLabel(outgoing, currency)) + '</dd></div><div><dt>Mouvements nets</dt><dd>' + escapeMarkup(amountLabel(incoming - outgoing, currency)) + "</dd></div></dl></article>";
    }).join("");
  }

  function renderReports() {
    var rows = reportRows();
    var data = snapshot();
    var anomalies = reconciliationAnomalies();
    var incomingCount = rows.filter(function (row) { return row.direction === "in"; }).length;
    var outgoingCount = rows.filter(function (row) { return row.direction === "out"; }).length;
    var currencies = renderReportCurrencies(rows);
    if (!currencies) currencies = '<div class="accounting-empty">Aucun mouvement avec devise dans cette période.</div>';
    var closureState = closingDraft ? closingDraft.state : "OUVERTE · aucune préparation locale";
    var closureVariance = closingDraft ? amountLabel(closingDraft.variance, closingDraft.currency) : "Non calculé";
    return '<section class="accounting-reports" data-accounting-reports><header><div><span>RAPPORT FINANCIER FRONTEND</span><h3>SYNTHÈSE DE TRÉSORERIE</h3><p>Lecture de contrôle des mouvements Finance visibles, sans valeur légale.</p></div><span class="accounting-boundary-chip">BACKEND_LATER</span></header><aside class="accounting-boundary"><i data-lucide="split"></i><p>AUCUNE CONVERSION · chaque devise reste autonome · aucun total général multidevise.</p></aside><div class="accounting-report-filters"><label>Du<input id="reportFrom" type="date" value="' + escapeMarkup(reportFilters.from) + '"></label><label>Au<input id="reportTo" type="date" value="' + escapeMarkup(reportFilters.to) + '"></label></div><div class="accounting-report-overview"><article><small>Journal du jour</small><b>' + rows.length + ' mouvements visibles</b><span>Période frontend sélectionnée</span></article><article><small>Recettes / dépenses</small><b>' + incomingCount + ' recettes · ' + outgoingCount + ' dépenses</b><span>' + data.transactions.length + ' transactions · ' + data.expenses.length + ' sorties Finance</span></article><article><small>Trésorerie par période</small><b>' + (reportFilters.from || "Début visible") + ' → ' + (reportFilters.to || "Fin visible") + '</b><span>BACKEND_LATER pour une période officielle</span></article><article><small>Anomalies visibles</small><b>' + anomalies.length + ' signaux</b><span>Explications sans correction</span></article><article><small>Écarts de caisse</small><b>' + escapeMarkup(closureVariance) + '</b><span>Brouillon local uniquement</span></article><article><small>Statut de clôture</small><b>' + escapeMarkup(closureState) + '</b><span>Clôture officielle indisponible</span></article></div><section class="accounting-report-currencies"><header><span>Mouvements par devise</span><h3>Positions indépendantes</h3></header><div>' + currencies + '</div></section><aside class="accounting-report-legal-boundary"><b>FEATURE_LATER</b><p>Les états comptables officiels, obligations fiscales et exports de documents finaux ne font pas partie de cette surface.</p></aside></section>';
  }

  function bindReportFilters() {
    [["reportFrom", "from"], ["reportTo", "to"]].forEach(function (binding) {
      var input = document.getElementById(binding[0]);
      if (!input) return;
      input.addEventListener("change", function () {
        reportFilters[binding[1]] = input.value;
        renderContent();
      });
    });
  }

  function renderFutureSurface() {
    var labels = {
      journal: "Journal de trésorerie",
      expenses: "Registre des dépenses",
      treasury: "Position de trésorerie",
      closing: "Préparation de clôture",
      reconciliation: "Rapprochement",
      reports: "Rapports financiers frontend"
    };
    return '<section class="accounting-future"><h3>' + escapeMarkup(labels[activeTab] || "Trésorerie") + '</h3><p>Surface prévue dans la suite de la Phase G.</p><span class="accounting-boundary-chip">BACKEND_LATER</span></section>';
  }

  function bindNavigation() {
    document.querySelectorAll("#accountingTabs [data-accounting-tab]").forEach(function (button) {
      button.onclick = function () {
        activeTab = button.getAttribute("data-accounting-tab") || "dashboard";
        renderContent();
      };
    });
    document.querySelectorAll("[data-accounting-open]").forEach(function (button) {
      button.onclick = function () {
        activeTab = button.getAttribute("data-accounting-open") || "dashboard";
        renderContent();
      };
    });
  }

  function renderContent() {
    var content = document.getElementById("accountingContent");
    if (!content) return;
    var closeAllowed = canPrepareClosing();
    var readAllowed = canReadAccounting();
    var live = isLiveSession();
    document.querySelectorAll("#accountingTabs [data-accounting-tab]").forEach(function (button) {
      var tab = button.getAttribute("data-accounting-tab");
      button.hidden = live || (tab === "closing" ? !closeAllowed : !readAllowed);
      button.classList.toggle("active", tab === activeTab);
    });
    var surfaceAllowed = readAllowed || (activeTab === "closing" && closeAllowed);
    content.innerHTML = surfaceAllowed ? (live ? renderLiveUnavailable() : activeTab === "dashboard" ? renderDashboard() : activeTab === "journal" ? renderJournal() : activeTab === "expenses" ? renderExpenses() : activeTab === "treasury" ? renderTreasury() : activeTab === "closing" ? renderClosing() : activeTab === "reconciliation" ? renderReconciliation() : activeTab === "reports" ? renderReports() : renderFutureSurface()) : renderDenied();
    bindNavigation();
    if (activeTab === "journal") bindJournalFilters();
    if (activeTab === "closing") bindClosing();
    if (activeTab === "reports") bindReportFilters();
    if (typeof root.lucide !== "undefined" && root.lucide.createIcons) root.lucide.createIcons();
  }

  function render(containerId) {
    var module = document.getElementById(containerId || "accountingModule");
    if (!module) return;
    module.hidden = false;
    activeTab = canReadAccounting() ? "dashboard" : canPrepareClosing() ? "closing" : "dashboard";
    renderContent();
  }

  function open(tab) {
    activeTab = tab || (canReadAccounting() ? "dashboard" : canPrepareClosing() ? "closing" : "dashboard");
    renderContent();
  }

  function close() {
    var module = document.getElementById("accountingModule");
    if (module) module.hidden = true;
    if (root.SchoolSafeAppContext && typeof root.SchoolSafeAppContext.showDashboard === "function") root.SchoolSafeAppContext.showDashboard();
  }

  function setSession(session) {
    sessionOverride = session || null;
  }

  function normalizeText(value) {
    var text = String(value || "").toLowerCase();
    return typeof text.normalize === "function" ? text.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : text;
  }

  function jaspeRefusal(message) {
    return { allowed: false, refusal: true, message: "REFUS — " + message };
  }

  function jaspeCanRead(subject) {
    return allowsFor(subject, "reports.financial.read", "school") || allowsFor(subject, "finance.report.read", "school");
  }

  function jaspeCanClose(subject) {
    return allowsFor(subject, "finance.cash_register.close", "school");
  }

  function answerJaspe(query, context) {
    var subject = context && context.user ? context.user : user();
    var role = context && context.activeRole ? context.activeRole : subject && subject.role;
    var text = normalizeText(query);
    var unsafeFinanceIntent = /(cree|creer|enregistre|ajoute).*(depense|ecriture)|(depense|ecriture).*(cree|creer|enregistre|ajoute)|(modifi|change|supprim).*(paiement|transaction|montant|devise)|(paiement|transaction|montant|devise).*(modifi|change|supprim)|(fabriqu|cree|genere).*(recu)|(recu).*(fabriqu|cree|genere)/.test(text);
    var accountingIntent = /comptab|tresorer|journal|rapproch|anomal|mouvement|devise|ecart|clotur|depense|ecriture|debit|credit|solde d.ouverture|bilan|compte de resultat|grand livre|taux fx|conversion/.test(text) || (role === "accountant" && /rapport/.test(text)) || unsafeFinanceIntent;
    if (!accountingIntent) return null;
    if (!allowsFor(subject, "safe.assistant.use", "own")) return jaspeRefusal("safe.assistant.use avec portée own est obligatoire et tout DENY explicite reste prioritaire.");
    if (role === "parent") return jaspeRefusal("le Parent ne peut jamais consulter le journal global, la trésorerie globale ou la caisse.");
    if (role === "guard") return jaspeRefusal("le Gardien ne reçoit aucun détail de journal, montant, devise ou caisse.");

    if (/(cree|creer|enregistre|ajoute).*(depense|ecriture)|(depense|ecriture).*(cree|creer|enregistre|ajoute)/.test(text)) {
      return jaspeRefusal("aucune dépense ni écriture comptable ne peut être créée ; PERMISSION D’ÉCRITURE REQUISE · BACKEND_LATER.");
    }
    if (/(modifi|change|supprim).*(paiement|transaction|montant|devise)|(paiement|transaction|montant|devise).*(modifi|change|supprim)/.test(text)) {
      return jaspeRefusal("Jaspe ne modifie ni ne supprime paiement, transaction, montant ou devise.");
    }
    if (/(fabriqu|cree|genere).*(recu)|(recu).*(fabriqu|cree|genere)/.test(text)) {
      return jaspeRefusal("Jaspe ne fabrique jamais de reçu et ne peut expliquer qu’une référence existante visible.");
    }
    if (/taux fx|conversion|converti/.test(text)) return jaspeRefusal("aucun taux FX ni conversion de devise n’est appliqué.");
    if (/(clotur|ferme).*(officiel)|(officiel).*(clotur|ferme)/.test(text)) return jaspeRefusal("Jaspe ne clôture jamais officiellement une caisse ; CLÔTURE OFFICIELLE — BACKEND_LATER.");
    if (/(invente|cree|fixe).*(solde d.ouverture)/.test(text)) return jaspeRefusal("aucun solde d’ouverture ne peut être inventé ; BACKEND_LATER.");
    if (/bilan|compte de resultat|grand livre|debit|credit|syscohada|fiscal/.test(text)) return jaspeRefusal("aucun état légal, débit/crédit, référentiel fiscal ou comptabilité officielle n’est produit.");

    if (/clotur|observation.*caisse|caisse.*observation/.test(text)) {
      if (!jaspeCanClose(subject)) return jaspeRefusal("finance.cash_register.close avec portée school est requis pour préparer une observation de clôture.");
      return { allowed: true, refusal: false, action: "closing", message: "Jaspe ouvre la préparation d’observation en BROUILLON LOCAL · BACKEND_LATER. Aucune caisse n’est officiellement clôturée." };
    }
    if (!jaspeCanRead(subject)) return jaspeRefusal("reports.financial.read ou finance.report.read avec portée school est requis ; aucun détail global n’est révélé.");

    if (/anomal|rapproch/.test(text)) {
      return { allowed: true, refusal: false, action: "reconciliation", message: reconciliationAnomalies().length + " signaux visibles à expliquer · AUCUNE CORRECTION AUTOMATIQUE." };
    }
    if (/rapport/.test(text)) {
      return { allowed: true, refusal: false, action: "reports", message: "RAPPORT FINANCIER FRONTEND · SYNTHÈSE DE TRÉSORERIE visible, sans état légal ni document final." };
    }
    if (/tresorer|devise|ecart|caisse/.test(text)) {
      return { allowed: true, refusal: false, action: "treasury", message: "Trésorerie visible par devise · AUCUNE CONVERSION · solde d’ouverture non inventé · BACKEND_LATER." };
    }
    if (/depense/.test(text)) {
      return { allowed: true, refusal: false, action: "expenses", message: "Registre des dépenses existantes en LECTURE SEULE · toute création exige une permission d’écriture future." };
    }
    var rows = journalRows();
    var mentioned = rows.find(function (row) { return text.indexOf(normalizeText(row.reference)) >= 0; });
    if (/journal|mouvement/.test(text) || mentioned) {
      return { allowed: true, refusal: false, action: "journal", message: mentioned ? "Mouvement visible " + mentioned.reference + " · " + amountLabel(mentioned.amount, mentioned.currency) + " · " + mentioned.status + " · LECTURE SEULE." : "Journal de trésorerie visible en LECTURE SEULE, par devise et sans conversion." };
    }
    return { allowed: true, refusal: false, action: "dashboard", message: "Jaspe explique uniquement les surfaces Comptabilité / Trésorerie visibles sans mutation." };
  }

  root.SchoolSafeAccountingTreasury = {
    render: render,
    open: open,
    close: close,
    setSession: setSession,
    answerJaspe: answerJaspe,
    canReadAccounting: canReadAccounting,
    canPrepareClosing: canPrepareClosing,
    getReconciliationAnomalies: reconciliationAnomalies,
    getSnapshot: snapshot
  };
})(window);
