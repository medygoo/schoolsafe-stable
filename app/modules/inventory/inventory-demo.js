// SchoolSafe V2 — Phase I — Stock / Inventaire frontend de démonstration uniquement.
(function (root) {
  "use strict";

  var activeTab = "dashboard";
  var sessionOverride = null;
  var ITEM_DRAFTS_STORAGE_KEY = "schoolsafe-v2-inventory-item-drafts";
  var MOVEMENT_DRAFTS_STORAGE_KEY = "schoolsafe-v2-inventory-movement-drafts";
  var PURCHASE_DRAFTS_STORAGE_KEY = "schoolsafe-v2-inventory-purchase-drafts";
  var RECEIPT_DRAFTS_STORAGE_KEY = "schoolsafe-v2-inventory-receipt-drafts";
  var ITEMS = [
    { code: "ART-001", name: "Papier A4", category: "Fournitures administratives", unit: "rame", type: "CONSOMMABLE", status: "ACTIF", service: "Administration" },
    { code: "ART-002", name: "Craie blanche", category: "Fournitures pédagogiques", unit: "boîte", type: "CONSOMMABLE", status: "ACTIF", service: "Pédagogie" },
    { code: "ART-003", name: "Marqueurs effaçables", category: "Fournitures pédagogiques", unit: "lot", type: "CONSOMMABLE", status: "ACTIF", service: "Pédagogie" },
    { code: "ART-004", name: "Détergent multiusage", category: "Produits de nettoyage", unit: "litre", type: "CONSOMMABLE", status: "ACTIF", service: "Entretien" },
    { code: "ART-005", name: "Ordinateur portable démo", category: "Matériel informatique", unit: "pièce", type: "ÉQUIPEMENT", status: "À CONTRÔLER", service: "Administration" },
    { code: "ART-006", name: "Farine de maïs", category: "Ingrédients Cantine", unit: "sac", type: "CONSOMMABLE", status: "ACTIF", service: "Cantine" }
  ];
  var LEVELS = [
    { item: "ART-001", name: "Papier A4", location: "Magasin central", quantity: 28, unit: "rame", minimum: 10 },
    { item: "ART-001", name: "Papier A4", location: "Secrétariat", quantity: 4, unit: "rame", minimum: 6 },
    { item: "ART-002", name: "Craie blanche", location: "Dépôt pédagogique", quantity: 0, unit: "boîte", minimum: 8 },
    { item: "ART-003", name: "Marqueurs effaçables", location: "Salle des professeurs", quantity: 12, unit: "lot", minimum: 5 },
    { item: "ART-004", name: "Détergent multiusage", location: "Local entretien", quantity: 6, unit: "litre", minimum: 6 },
    { item: "ART-005", name: "Ordinateur portable démo", location: "Bureau informatique", quantity: 3, unit: "pièce", minimum: 1, control: true },
    { item: "ART-006", name: "Farine de maïs", location: "Réserve Cantine", quantity: 9, unit: "sac", minimum: 4 }
  ];
  var MOVEMENTS = [
    { reference: "MVT-DEM-001", type: "ENTRÉE", item: "ART-001 · Papier A4", quantity: 20, unit: "rame", source: "Fournisseur démo", destination: "Magasin central", service: "Administration", date: "2026-08-20", reason: "Réception fictive", status: "DÉMO" },
    { reference: "MVT-DEM-002", type: "SORTIE", item: "ART-006 · Farine de maïs", quantity: 2, unit: "sac", source: "Réserve Cantine", destination: "Service Cantine", service: "Cantine", date: "2026-08-21", reason: "Consommation Cantine fictive", status: "DÉMO" },
    { reference: "MVT-DEM-003", type: "TRANSFERT", item: "ART-001 · Papier A4", quantity: 4, unit: "rame", source: "Magasin central", destination: "Secrétariat", service: "Administration", date: "2026-08-22", reason: "Réassort fictif", status: "DÉMO" },
    { reference: "MVT-DEM-004", type: "AJUSTEMENT", item: "ART-004 · Détergent multiusage", quantity: 1, unit: "litre", source: "Local entretien", destination: "Local entretien · contrôle", service: "Entretien", date: "2026-08-23", reason: "Écart constaté, aucune correction officielle", status: "À CONTRÔLER" }
  ];
  var PURCHASE_REQUESTS = [
    { reference: "DA-DEM-001", service: "Pédagogie", item: "Craie blanche", quantity: 24, priority: "NORMALE", supplier: "Papeterie Démo", quote: "DEV-DEM-101", amount: "180 000", currency: "CDF", status: "DEMANDE EN REVUE — simulation" },
    { reference: "DA-DEM-002", service: "Cantine", item: "Farine de maïs", quantity: 10, priority: "HAUTE", supplier: "Marché Démo", quote: "DEV-DEM-102", amount: "240", currency: "USD", status: "COMMANDE SIMULÉE CMD-DEM-02" },
    { reference: "DA-DEM-003", service: "Entretien", item: "Détergent multiusage", quantity: 18, priority: "NORMALE", supplier: "Hygiène Démo", quote: "À rapprocher", amount: "—", currency: "CDF", status: "BESOIN IDENTIFIÉ" }
  ];
  var RECEIPTS = [
    { reference: "REC-DEM-001", order: "CMD-DEM-01", item: "Papier A4", ordered: 20, received: 20, status: "COMPLET", observation: "Comptage démo conforme", anomaly: "Aucune" },
    { reference: "REC-DEM-002", order: "CMD-DEM-02", item: "Farine de maïs", ordered: 10, received: 8, status: "PARTIEL", observation: "Deux sacs non présentés", anomaly: "Manquant à rapprocher" },
    { reference: "REC-DEM-003", order: "CMD-DEM-03", item: "Craie blanche", ordered: 12, received: 0, status: "MANQUANT", observation: "Aucune marchandise reçue", anomaly: "Livraison absente" },
    { reference: "REC-DEM-004", order: "CMD-DEM-04", item: "Marqueurs effaçables", ordered: 10, received: 12, status: "SURPLUS", observation: "Deux lots supplémentaires", anomaly: "Surplus à isoler" },
    { reference: "REC-DEM-005", order: "CMD-DEM-05", item: "Ordinateur portable démo", ordered: 3, received: 3, status: "ENDOMMAGÉ", observation: "Emballage endommagé", anomaly: "Contrôle matériel requis" },
    { reference: "REC-DEM-006", order: "CMD-DEM-06", item: "Détergent multiusage", ordered: 18, received: 18, status: "À CONTRÔLER", observation: "Référence à vérifier", anomaly: "Étiquette divergente" }
  ];
  var METRICS = [
    ["Articles", "12 références démo", "boxes"],
    ["Catégories", "5 familles", "tags"],
    ["Emplacements", "4 zones", "warehouse"],
    ["Alertes seuil", "3 à examiner", "triangle-alert"],
    ["Ruptures", "1 simulation", "package-x"],
    ["Mouvements récents", "8 opérations démo", "arrow-left-right"],
    ["Demandes d’achat", "3 brouillons", "clipboard-list"],
    ["Commandes", "2 simulations", "shopping-cart"],
    ["Réceptions", "2 contrôles", "package-check"],
    ["Anomalies", "1 à rapprocher", "badge-alert"]
  ];

  function escapeMarkup(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function user() {
    if (sessionOverride) return sessionOverride;
    if (root.SchoolSafeAppContext && typeof root.SchoolSafeAppContext.getCurrentUser === "function") return root.SchoolSafeAppContext.getCurrentUser();
    return { permissions: [], scopes: [] };
  }

  function isDemoMode(subject) { return !(subject && (subject.native === true || subject.token)); }

  function allowsFor(subject, permission, scope) {
    var access = root.SchoolSafeAccess;
    return !!(access && typeof access.allowsScope === "function" && access.allowsScope(subject, permission, scope));
  }

  function canReadAggregates(subject) {
    return allowsFor(subject || user(), "reports.operational.read", "school");
  }

  function readDraftList(key) {
    try {
      var parsed = JSON.parse(root.localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) { return []; }
  }

  function persistDraftList(key, drafts) {
    try { root.localStorage.setItem(key, JSON.stringify(drafts)); } catch (error) {}
  }

  var itemDrafts = readDraftList(ITEM_DRAFTS_STORAGE_KEY);
  var movementDrafts = readDraftList(MOVEMENT_DRAFTS_STORAGE_KEY);
  var purchaseDrafts = readDraftList(PURCHASE_DRAFTS_STORAGE_KEY);
  var receiptDrafts = readDraftList(RECEIPT_DRAFTS_STORAGE_KEY);

  function metric(item, live) {
    return '<article class="inventory-dashboard-metric"><span><i data-lucide="' + item[2] + '"></i></span><div><small>' + escapeMarkup(item[0]) + '</small><b>' + escapeMarkup(live ? "Agrégat disponible" : item[1]) + "</b></div></article>";
  }

  function renderDemoDashboard() {
    return '<section class="inventory-dashboard" data-inventory-dashboard><header><div><span>Stock / Inventaire / Achats internes</span><h3>Vue opérationnelle générique</h3><p>Données fictives destinées à valider les parcours frontend, sans écriture officielle.</p></div><span class="inventory-boundary-chip">DÉMONSTRATION · BACKEND_LATER</span></header><aside class="inventory-boundary"><i data-lucide="shield-check"></i><p>Moteur Stock unique · les besoins Cantine réutiliseront ce référentiel sans dupliquer le domaine.</p></aside><div class="inventory-dashboard-grid">' + METRICS.map(function (item) { return metric(item, false); }).join("") + "</div></section>";
  }

  function renderLiveAggregates() {
    return '<section class="inventory-dashboard inventory-live" data-inventory-live-aggregates><header><div><span>AGRÉGATS AUTORISÉS</span><h3>Lecture opérationnelle consolidée</h3><p>Aucun détail opérationnel, article, mouvement ou formulaire n’est exposé dans cette session.</p></div><span class="inventory-boundary-chip">LECTURE SEULE · school</span></header><div class="inventory-dashboard-grid">' + METRICS.map(function (item) { return metric(item, true); }).join("") + "</div></section>";
  }

  function renderDenied() {
    var state = typeof root.ssState === "function" ? root.ssState({ type: "error", title: "Stock non autorisé", message: "reports.operational.read avec portée school est obligatoire en session réelle.", details: "DENY explicite prioritaire · aucun détail Stock n’est révélé." }) : "<h3>Stock non autorisé</h3>";
    return '<section class="inventory-denied">' + state + "</section>";
  }

  function renderFuture(tab) {
    var labels = { catalog: "Catalogue articles", levels: "Niveaux et seuils", movements: "Mouvements", procurement: "Achats internes", receipts: "Réceptions et anomalies", reports: "Rapports Stock" };
    return '<section class="inventory-future"><span>FEATURE_LATER</span><h3>' + escapeMarkup(labels[tab] || "Stock") + '</h3><p>Ce parcours sera activé dans son lot Phase I dédié.</p><small>FRONTEND UNIQUEMENT · BACKEND_LATER</small></section>';
  }

  function renderItemRow(item, draft) {
    return '<tr data-inventory-item' + (draft ? '-draft' : '') + '><td><b>' + escapeMarkup(item.code) + '</b>' + (draft ? '<small>BROUILLON LOCAL · BACKEND_LATER</small>' : '<small>DONNÉE DÉMO</small>') + '</td><td>' + escapeMarkup(item.name) + '</td><td>' + escapeMarkup(item.category) + '</td><td>' + escapeMarkup(item.unit) + '</td><td>' + escapeMarkup(item.type) + '</td><td>' + escapeMarkup(item.status) + '</td><td>' + escapeMarkup(item.service || "Tous services") + '</td></tr>';
  }

  function renderCatalog() {
    var rows = ITEMS.map(function (item) { return renderItemRow(item, false); }).concat(itemDrafts.map(function (item) { return renderItemRow(item, true); })).join("");
    return '<section class="inventory-catalog" data-inventory-catalog><header><div><span>Catalogue générique</span><h3>Articles et catégories</h3><p>Les catégories et services restent libres : aucune enum métier fermée.</p></div><span class="inventory-boundary-chip">DÉMONSTRATION · BACKEND_LATER</span></header><div class="inventory-table-wrap"><table><thead><tr><th>Code article</th><th>Nom</th><th>Catégorie</th><th>Unité</th><th>Type</th><th>Statut</th><th>Service principal</th></tr></thead><tbody>' + rows + '</tbody></table></div><form class="inventory-form" data-inventory-item-form><header><div><span>Préparation locale</span><h4>Ajouter un article générique</h4></div><span class="inventory-boundary-chip">BROUILLON LOCAL</span></header><label>Code article<input name="code" required placeholder="ART-..."></label><label>Nom<input name="name" required></label><label>Catégorie libre<input name="category" required list="inventoryCategorySuggestions"></label><datalist id="inventoryCategorySuggestions"><option value="Fournitures administratives"><option value="Produits de nettoyage"><option value="Matériel informatique"><option value="Ingrédients Cantine"></datalist><label>Unité libre<input name="unit" required placeholder="pièce, kg, litre..."></label><label>Type<select name="type"><option>CONSOMMABLE</option><option>ÉQUIPEMENT</option></select></label><label>Statut<select name="status"><option>ACTIF</option><option>INACTIF</option><option>À CONTRÔLER</option></select></label><label>Service principal éventuel<input name="service" placeholder="Tous services"></label><button class="ss-button ss-button--primary" type="submit">Préparer l’article</button><p class="inventory-form-wide">Aucune création officielle · navigateur non source de vérité · BACKEND_LATER.</p></form></section>';
  }

  function levelState(level) {
    if (level.control) return "À CONTRÔLER";
    if (level.quantity === 0) return "RUPTURE";
    if (level.quantity <= level.minimum) return "BAS";
    return "NORMAL";
  }

  function renderLevels() {
    var rows = LEVELS.map(function (level) {
      var state = levelState(level);
      return '<tr data-level-item="' + escapeMarkup(level.item) + '"><td><b>' + escapeMarkup(level.item) + '</b><small>' + escapeMarkup(level.name) + '</small></td><td>' + escapeMarkup(level.location) + '</td><td data-level-quantity="' + Math.max(0, Number(level.quantity) || 0) + '">' + Math.max(0, Number(level.quantity) || 0) + '</td><td>' + escapeMarkup(level.unit) + '</td><td>' + Math.max(0, Number(level.minimum) || 0) + '</td><td><span class="inventory-level-state inventory-level-state--' + state.toLowerCase().replace(/[^a-z]+/g, "-") + '">' + state + '</span></td></tr>';
    }).join("");
    return '<section class="inventory-levels" data-inventory-levels><header><div><span>Inventaire théorique de démonstration</span><h3>Emplacements et seuils</h3><p>Un article peut exister dans plusieurs emplacements. Le navigateur n’est pas la source officielle du stock.</p></div><span class="inventory-boundary-chip">DÉMONSTRATION · BACKEND_LATER</span></header><aside class="inventory-boundary"><i data-lucide="shield-alert"></i><p>Quantités bornées à zéro · aucune correction silencieuse ni stock négatif automatique.</p></aside><div class="inventory-level-legend"><span>NORMAL</span><span>BAS</span><span>RUPTURE</span><span>À CONTRÔLER</span></div><div class="inventory-table-wrap"><table><thead><tr><th>Article</th><th>Emplacement</th><th>Quantité théorique</th><th>Unité</th><th>Seuil minimum</th><th>État</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>';
  }

  function itemByCode(code) { return ITEMS.find(function (item) { return item.code === code; }); }

  function renderMovementRow(movement, draft) {
    return '<tr data-inventory-movement' + (draft ? '-draft' : '') + '><td><b>' + escapeMarkup(movement.reference) + '</b>' + (draft ? '<small>BROUILLON LOCAL · APPEND-ONLY</small>' : '<small>DONNÉE DÉMO</small>') + '</td><td><span class="inventory-movement-type">' + escapeMarkup(movement.type) + '</span></td><td>' + escapeMarkup(movement.item) + '</td><td>' + escapeMarkup(movement.quantity) + ' ' + escapeMarkup(movement.unit) + '</td><td>' + escapeMarkup(movement.source) + '</td><td>' + escapeMarkup(movement.destination) + '</td><td>' + escapeMarkup(movement.service) + '</td><td>' + escapeMarkup(movement.date) + '</td><td>' + escapeMarkup(movement.reason) + '</td><td>' + escapeMarkup(movement.status) + '</td></tr>';
  }

  function renderMovements() {
    var rows = MOVEMENTS.map(function (movement) { return renderMovementRow(movement, false); }).concat(movementDrafts.map(function (movement) { return renderMovementRow(movement, true); })).join("");
    var options = ITEMS.map(function (item) { return '<option value="' + escapeMarkup(item.code) + '">' + escapeMarkup(item.code + " · " + item.name) + '</option>'; }).join("");
    return '<section class="inventory-movements" data-inventory-movements><header><div><span>Journal démo append-only</span><h3>Mouvements de stock préparés</h3><p>Aucune mutation officielle, correction silencieuse ou réutilisation du scanner Sécurité.</p></div><span class="inventory-boundary-chip">BROUILLONS LOCAUX · BACKEND_LATER</span></header><div class="inventory-movement-legend"><span>ENTRÉE</span><span>SORTIE</span><span>TRANSFERT</span><span>AJUSTEMENT</span></div><div class="inventory-table-wrap"><table><thead><tr><th>Référence</th><th>Type</th><th>Article</th><th>Quantité</th><th>Source</th><th>Destination</th><th>Service</th><th>Date</th><th>Motif</th><th>Statut</th></tr></thead><tbody>' + rows + '</tbody></table></div><form class="inventory-form" data-inventory-movement-form><header><div><span>Préparation locale</span><h4>Ajouter au journal sans modifier l’existant</h4></div><span class="inventory-boundary-chip">BROUILLON LOCAL</span></header><label>Type<select name="type"><option>ENTRÉE</option><option>SORTIE</option><option>TRANSFERT</option><option>AJUSTEMENT</option></select></label><label>Article<select name="item">' + options + '</select></label><label>Quantité<input name="quantity" type="number" min="0.01" step="0.01" required></label><label>Source<input name="source" required></label><label>Destination<input name="destination" required></label><label>Service<input name="service" required></label><label class="inventory-form-wide">Motif<input name="reason" required></label><p class="inventory-form-error inventory-form-wide" data-movement-error hidden></p><button class="ss-button ss-button--primary" type="submit">Préparer le mouvement</button><p class="inventory-form-wide">Aucun niveau officiel n’est recalculé · BACKEND_LATER.</p></form></section>';
  }

  function bindMovementEvents() {
    var form = document.querySelector("[data-inventory-movement-form]");
    if (!form || form.__inventoryBound) return;
    form.__inventoryBound = true;
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var data = new FormData(form);
      var type = String(data.get("type") || "");
      var source = String(data.get("source") || "").trim();
      var destination = String(data.get("destination") || "").trim();
      var error = form.querySelector("[data-movement-error]");
      if (type === "TRANSFERT" && source.toLowerCase() === destination.toLowerCase()) {
        error.hidden = false;
        error.textContent = "Les emplacements source et destination d’un transfert doivent être différents.";
        return;
      }
      var code = String(data.get("item") || "");
      var item = itemByCode(code) || ITEMS[0];
      movementDrafts = movementDrafts.concat([{
        reference: "MVT-BR-" + String(movementDrafts.length + 1).padStart(3, "0"), type: type,
        item: item.code + " · " + item.name, quantity: Math.max(0, Number(data.get("quantity")) || 0), unit: item.unit,
        source: source, destination: destination, service: String(data.get("service") || "").trim(),
        date: new Date().toISOString().slice(0, 10), reason: String(data.get("reason") || "").trim(), status: "BROUILLON LOCAL · BACKEND_LATER"
      }]);
      persistDraftList(MOVEMENT_DRAFTS_STORAGE_KEY, movementDrafts);
      renderContent();
    });
  }

  function renderPurchaseRow(request, draft) {
    return '<tr' + (draft ? ' data-purchase-request-draft' : '') + '><td><b>' + escapeMarkup(request.reference) + '</b>' + (draft ? '<small>BROUILLON LOCAL · BACKEND_LATER</small>' : '<small>DONNÉE DÉMO</small>') + '</td><td>' + escapeMarkup(request.service) + '</td><td>' + escapeMarkup(request.item) + '</td><td>' + escapeMarkup(request.quantity) + '</td><td>' + escapeMarkup(request.priority) + '</td><td>' + escapeMarkup(request.supplier || "À déterminer") + '</td><td>' + escapeMarkup(request.quote || "Non fourni") + '</td><td>' + escapeMarkup(request.amount || "—") + '</td><td>' + escapeMarkup(request.currency) + '</td><td>' + escapeMarkup(request.status) + '</td></tr>';
  }

  function renderProcurement() {
    var rows = PURCHASE_REQUESTS.map(function (request) { return renderPurchaseRow(request, false); }).concat(purchaseDrafts.map(function (request) { return renderPurchaseRow(request, true); })).join("");
    return '<section class="inventory-procurement" data-inventory-procurement><header><div><span>Achats internes de l’école</span><h3>Demandes, devis et commandes préparatoires</h3><p>Règle : besoin ≠ demande ≠ commande ≠ paiement.</p></div><span class="inventory-boundary-chip">DÉMONSTRATION · BACKEND_LATER</span></header><div class="inventory-workflow" aria-label="Workflow achats internes"><span>BESOIN</span><i data-lucide="arrow-right"></i><span>DEMANDE D’ACHAT</span><i data-lucide="arrow-right"></i><span>FOURNISSEUR / DEVIS</span><i data-lucide="arrow-right"></i><span>COMMANDE</span><i data-lucide="arrow-right"></i><span>RÉCEPTION</span></div><aside class="inventory-boundary"><i data-lucide="ban"></i><p>Aucun paiement fournisseur, aucune dépense comptable et aucune commande officielle depuis Stock. Une future approbation n’autoriserait pas l’achat.</p></aside><div class="inventory-table-wrap"><table><thead><tr><th>Référence</th><th>Service demandeur</th><th>Articles</th><th>Quantité</th><th>Priorité</th><th>Fournisseur démo</th><th>Référence devis</th><th>Montant indicatif</th><th>Devise</th><th>Statut</th></tr></thead><tbody>' + rows + '</tbody></table></div><form class="inventory-form" data-purchase-request-form><header><div><span>Préparation locale</span><h4>Préparer une demande d’achat</h4></div><span class="inventory-boundary-chip">DEMANDE UNIQUEMENT</span></header><label>Service demandeur<input name="service" required></label><label>Article / besoin<input name="item" required></label><label>Quantité<input name="quantity" type="number" min="0.01" step="0.01" required></label><label>Priorité<select name="priority"><option>NORMALE</option><option>HAUTE</option><option>URGENTE — à justifier</option></select></label><label>Fournisseur démo éventuel<input name="supplier"></label><label>Référence devis éventuelle<input name="quote"></label><label>Montant indicatif<input name="amount" type="number" min="0" step="0.01"></label><label>Devise<select name="currency"><option>CDF</option><option>USD</option></select></label><button class="ss-button ss-button--primary" type="submit">Préparer la demande</button><p class="inventory-form-wide">BROUILLON LOCAL · aucune commande, validation, dépense ou conversion automatique.</p></form></section>';
  }

  function bindProcurementEvents() {
    var form = document.querySelector("[data-purchase-request-form]");
    if (!form || form.__inventoryBound) return;
    form.__inventoryBound = true;
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var data = new FormData(form);
      purchaseDrafts = purchaseDrafts.concat([{
        reference: "DA-BR-" + String(purchaseDrafts.length + 1).padStart(3, "0"),
        service: String(data.get("service") || "").trim(), item: String(data.get("item") || "").trim(),
        quantity: Math.max(0, Number(data.get("quantity")) || 0), priority: String(data.get("priority") || "NORMALE"),
        supplier: String(data.get("supplier") || "").trim(), quote: String(data.get("quote") || "").trim(),
        amount: String(data.get("amount") || "—"), currency: String(data.get("currency") || "CDF"),
        status: "BROUILLON LOCAL · DEMANDE UNIQUEMENT"
      }]);
      persistDraftList(PURCHASE_DRAFTS_STORAGE_KEY, purchaseDrafts);
      renderContent();
    });
  }

  function renderReceiptRow(receipt, draft) {
    var difference = Number(receipt.received) - Number(receipt.ordered);
    return '<tr' + (draft ? ' data-inventory-receipt-draft' : '') + '><td><b>' + escapeMarkup(receipt.reference) + '</b>' + (draft ? '<small>BROUILLON LOCAL · BACKEND_LATER</small>' : '<small>DONNÉE DÉMO</small>') + '</td><td>' + escapeMarkup(receipt.order) + '</td><td>' + escapeMarkup(receipt.item) + '</td><td>' + escapeMarkup(receipt.ordered) + '</td><td>' + escapeMarkup(receipt.received) + '</td><td>' + (difference > 0 ? "+" : "") + escapeMarkup(difference) + '</td><td><span class="inventory-level-state">' + escapeMarkup(receipt.status) + '</span></td><td>' + escapeMarkup(receipt.observation) + '</td><td>' + escapeMarkup(receipt.anomaly) + '</td></tr>';
  }

  function renderReceipts() {
    var rows = RECEIPTS.map(function (receipt) { return renderReceiptRow(receipt, false); }).concat(receiptDrafts.map(function (receipt) { return renderReceiptRow(receipt, true); })).join("");
    return '<section class="inventory-receipts" data-inventory-receipts><header><div><span>COMMANDE → RÉCEPTION</span><h3>Rapprochement et anomalies</h3><p>Contrôle frontend de démonstration, sans réception officielle.</p></div><span class="inventory-boundary-chip">DÉMONSTRATION · BACKEND_LATER</span></header><div class="inventory-level-legend"><span>COMPLET</span><span>PARTIEL</span><span>MANQUANT</span><span>SURPLUS</span><span>ENDOMMAGÉ</span><span>À CONTRÔLER</span></div><aside class="inventory-boundary"><i data-lucide="unlink"></i><p>Aucune entrée Stock automatique · Aucune dépense Finance automatique · reçu financier ≠ réception de marchandises.</p></aside><div class="inventory-table-wrap"><table><thead><tr><th>Référence réception</th><th>COMMANDE</th><th>Article</th><th>Quantité commandée</th><th>Quantité reçue</th><th>Écart</th><th>Statut</th><th>Observation</th><th>Anomalie</th></tr></thead><tbody>' + rows + '</tbody></table></div><form class="inventory-form" data-inventory-receipt-form><header><div><span>Préparation locale</span><h4>Préparer un contrôle de RÉCEPTION</h4></div><span class="inventory-boundary-chip">BROUILLON LOCAL</span></header><label>Commande<input name="order" required></label><label>Article<input name="item" required></label><label>Quantité commandée<input name="ordered" type="number" min="0" step="0.01" required></label><label>Quantité reçue<input name="received" type="number" min="0" step="0.01" required></label><label>État physique<select name="condition"><option>CONFORME</option><option>ENDOMMAGÉ</option><option>À CONTRÔLER</option></select></label><label class="inventory-form-wide">Observation<textarea name="observation" rows="3" required></textarea></label><button class="ss-button ss-button--primary" type="submit">Préparer le rapprochement</button><p class="inventory-form-wide">Aucune entrée Stock, dépense Finance ou écriture comptable automatique.</p></form><section class="inventory-finance-link"><b>Lien futur contrôlé</b><span>Achat / Commande → Réception → référence / pièce / montant éventuel → Finance / Comptabilité</span><small>BACKEND_LATER · devises séparées · aucune conversion automatique.</small></section></section>';
  }

  function receiptState(ordered, received, condition) {
    if (condition === "ENDOMMAGÉ") return "ENDOMMAGÉ";
    if (condition === "À CONTRÔLER") return "À CONTRÔLER";
    if (received === 0) return "MANQUANT";
    if (received < ordered) return "PARTIEL";
    if (received > ordered) return "SURPLUS";
    return "COMPLET";
  }

  function bindReceiptEvents() {
    var form = document.querySelector("[data-inventory-receipt-form]");
    if (!form || form.__inventoryBound) return;
    form.__inventoryBound = true;
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var data = new FormData(form);
      var ordered = Math.max(0, Number(data.get("ordered")) || 0);
      var received = Math.max(0, Number(data.get("received")) || 0);
      var condition = String(data.get("condition") || "CONFORME");
      var status = receiptState(ordered, received, condition);
      receiptDrafts = receiptDrafts.concat([{
        reference: "REC-BR-" + String(receiptDrafts.length + 1).padStart(3, "0"), order: String(data.get("order") || "").trim(),
        item: String(data.get("item") || "").trim(), ordered: ordered, received: received, status: status,
        observation: String(data.get("observation") || "").trim(), anomaly: status === "COMPLET" ? "Aucune anomalie préparée" : status + " · À rapprocher"
      }]);
      persistDraftList(RECEIPT_DRAFTS_STORAGE_KEY, receiptDrafts);
      renderContent();
    });
  }

  function reportCard(label, value, note, icon) {
    return '<article class="inventory-report-card"><span><i data-lucide="' + icon + '"></i></span><div><small>' + escapeMarkup(label) + '</small><b>' + escapeMarkup(value) + '</b><p>' + escapeMarkup(note) + '</p></div></article>';
  }

  function renderReports(live) {
    var cards = [
      ["État du stock", live ? "Agrégat autorisé" : "7 positions démo", "Quantités théoriques consolidées", "warehouse"],
      ["Seuils", live ? "Agrégat autorisé" : "3 alertes", "Seuils minimum consolidés", "gauge"],
      ["Ruptures", live ? "Agrégat autorisé" : "1 simulation", "Aucune ligne article exposée", "package-x"],
      ["Mouvements", live ? "Agrégat autorisé" : "4 types", "ENTRÉE / SORTIE / TRANSFERT / AJUSTEMENT agrégés", "arrow-left-right"],
      ["Consommation par service", live ? "Agrégat autorisé" : "Administration · Pédagogie · Cantine · Entretien", "Cantine réutilise le moteur générique", "building-2"],
      ["Commandes", live ? "Agrégat autorisé" : "2 simulations", "Aucun fournisseur ni devis détaillé", "shopping-cart"],
      ["Réceptions", live ? "Agrégat autorisé" : "6 contrôles", "Rapprochements consolidés", "package-check"],
      ["Anomalies", live ? "Agrégat autorisé" : "5 signaux", "Partiel, surplus, dommage et contrôle", "triangle-alert"]
    ].map(function (item) { return reportCard(item[0], item[1], item[2], item[3]); }).join("");
    return '<section class="inventory-reports" data-inventory-reports' + (live ? ' data-live-aggregates' : '') + '><header><div><span>' + (live ? "AGRÉGATS AUTORISÉS" : "RAPPORTS DÉMO") + '</span><h3>Rapports opérationnels Stock</h3><p>' + (live ? "LECTURE SEULE · reports.operational.read + school" : "Synthèses frontend de démonstration") + '</p></div><span class="inventory-boundary-chip">' + (live ? "LIVE AGRÉGÉ" : "DÉMONSTRATION") + '</span></header><aside class="inventory-boundary"><i data-lucide="shield-check"></i><p>Aucun détail fournisseur, commercial ou devis · aucun article ou mouvement individuel en session live.</p></aside><div class="inventory-report-grid">' + cards + '</div><section class="inventory-currency-summary"><article><span>CDF</span><b>' + (live ? "Agrégat séparé" : "180 000 CDF indicatifs") + '</b></article><article><span>USD</span><b>' + (live ? "Agrégat séparé" : "240 USD indicatifs") + '</b></article><p>Aucune conversion automatique entre CDF et USD.</p></section><footer>Pas de PDF final : export documentaire prévu en Phase J.</footer></section>';
  }

  function bindCatalogEvents() {
    var form = document.querySelector("[data-inventory-item-form]");
    if (!form || form.__inventoryBound) return;
    form.__inventoryBound = true;
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var data = new FormData(form);
      itemDrafts = itemDrafts.concat([{
        code: String(data.get("code") || "").trim(), name: String(data.get("name") || "").trim(),
        category: String(data.get("category") || "").trim(), unit: String(data.get("unit") || "").trim(),
        type: String(data.get("type") || "CONSOMMABLE"), status: String(data.get("status") || "ACTIF"),
        service: String(data.get("service") || "").trim()
      }]);
      persistDraftList(ITEM_DRAFTS_STORAGE_KEY, itemDrafts);
      renderContent();
    });
  }

  function refreshTabs() {
    document.querySelectorAll("[data-inventory-tab]").forEach(function (button) {
      button.classList.toggle("active", button.getAttribute("data-inventory-tab") === activeTab);
    });
  }

  function renderContent() {
    var content = document.getElementById("inventoryContent");
    if (!content) return;
    var subject = user();
    if (activeTab === "catalog") content.innerHTML = isDemoMode(subject) ? renderCatalog() : renderDenied();
    else if (activeTab === "levels") content.innerHTML = isDemoMode(subject) ? renderLevels() : renderDenied();
    else if (activeTab === "movements") content.innerHTML = isDemoMode(subject) ? renderMovements() : renderDenied();
    else if (activeTab === "procurement") content.innerHTML = isDemoMode(subject) ? renderProcurement() : renderDenied();
    else if (activeTab === "receipts") content.innerHTML = isDemoMode(subject) ? renderReceipts() : renderDenied();
    else if (activeTab === "reports") content.innerHTML = isDemoMode(subject) ? renderReports(false) : (canReadAggregates(subject) ? renderReports(true) : renderDenied());
    else if (activeTab !== "dashboard") content.innerHTML = isDemoMode(subject) ? renderFuture(activeTab) : (canReadAggregates(subject) && activeTab === "reports" ? renderLiveAggregates() : renderDenied());
    else content.innerHTML = isDemoMode(subject) ? renderDemoDashboard() : (canReadAggregates(subject) ? renderLiveAggregates() : renderDenied());
    refreshTabs();
    if (activeTab === "catalog" && isDemoMode(subject)) bindCatalogEvents();
    if (activeTab === "movements" && isDemoMode(subject)) bindMovementEvents();
    if (activeTab === "procurement" && isDemoMode(subject)) bindProcurementEvents();
    if (activeTab === "receipts" && isDemoMode(subject)) bindReceiptEvents();
    if (root.lucide && typeof root.lucide.createIcons === "function") root.lucide.createIcons();
  }

  function bindEvents() {
    document.querySelectorAll("[data-inventory-tab]").forEach(function (button) {
      if (button.__inventoryBound) return;
      button.__inventoryBound = true;
      button.addEventListener("click", function () { open(button.getAttribute("data-inventory-tab")); });
    });
  }

  function render(containerId) {
    var module = document.getElementById(containerId || "inventoryModule");
    if (!module) return;
    module.hidden = false;
    activeTab = "dashboard";
    bindEvents();
    renderContent();
  }

  function open(tab) {
    activeTab = tab || "dashboard";
    renderContent();
  }

  function close() {
    var module = document.getElementById("inventoryModule");
    if (module) module.hidden = true;
    if (root.SchoolSafeAppContext && typeof root.SchoolSafeAppContext.showDashboard === "function") root.SchoolSafeAppContext.showDashboard();
  }

  function setSession(session) { sessionOverride = session || null; }

  function normalizeJaspeText(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function jaspeRefusal(message) {
    return { allowed: false, refusal: true, action: null, message: "REFUS — " + message };
  }

  function answerJaspe(query, context) {
    var text = normalizeJaspeText(query);
    var subject = context && context.user ? context.user : user();
    var inventoryIntent = /stock|inventair|article|quantite|seuil|rupture|mouvement|approvision|achat|fournisseur|devis\b|commande|reception|marchandise|anomalie/.test(text);
    if (!inventoryIntent) return null;
    if (!allowsFor(subject, "safe.assistant.use", "own")) return jaspeRefusal("safe.assistant.use avec portée own est obligatoire.");

    var forbidden = /(cree|creer|modifie|modifier|corrige|corriger).*(stock|quantite|mouvement|commande|depense)|(commande reel)|(choisis|choisir|valide|valider).*(fournisseur|devis|achat)|(receptionne|receptionner).*(officiel|commande)|(cree|creer).*(depense|ecriture)|(paie|payer).*(fournisseur)|(invente|inventer).*(mouvement)|(supprime|supprimer).*(historique)/.test(text);
    if (forbidden) return jaspeRefusal("Jaspe ne crée, modifie, commande, réceptionne, paie, invente ou supprime aucune donnée Stock officielle.");

    if (!isDemoMode(subject) && !canReadAggregates(subject)) return jaspeRefusal("reports.operational.read avec portée school est requis en live ; aucun détail Stock n’est disponible.");

    var action = /rapport|agregat/.test(text) ? "reports"
      : /reception|marchandise|anomalie|endommag/.test(text) ? "receipts"
      : /achat|fournisseur|devis\b|commande|approvision/.test(text) ? "procurement"
      : /mouvement|entree|sortie|transfert|ajustement/.test(text) ? "movements"
      : /seuil|rupture|emplacement|niveau|quantite/.test(text) ? "levels"
      : /article|catalog|categorie/.test(text) ? "catalog" : "dashboard";

    if (!isDemoMode(subject)) {
      return { allowed: true, refusal: false, action: "reports", message: "AGRÉGATS AUTORISÉS Stock · LECTURE SEULE · reports.operational.read + school. Aucun article, fournisseur, devis, mouvement ou achat détaillé n’est révélé." };
    }
    var explanations = {
      catalog: "Catalogue Stock démo : articles et catégories génériques, dont les ingrédients Cantine · DÉMONSTRATION · BACKEND_LATER.",
      levels: "Stock démo : seuils, états NORMAL/BAS/RUPTURE/À CONTRÔLER et quantités théoriques, jamais officielles.",
      movements: "Mouvements fictifs : ENTRÉE, SORTIE, TRANSFERT et AJUSTEMENT dans un journal append-only, sans mutation officielle.",
      procurement: "Workflow achat démo : besoin ≠ demande ≠ devis/fournisseur ≠ commande ≠ paiement. Aucun achat officiel.",
      receipts: "Réception démo : rapprochement commande/réception, écarts et anomalies, sans entrée Stock ni dépense automatique.",
      reports: "Rapports Stock démo : agrégats d’état, seuils, mouvements, consommation, commandes, réceptions et anomalies.",
      dashboard: "Stock / Inventaire / Achats internes : moteur frontend générique de démonstration · BACKEND_LATER."
    };
    return { allowed: true, refusal: false, action: action, message: explanations[action] || explanations.dashboard };
  }

  function getSnapshot() {
    return {
      items: ITEMS.concat(itemDrafts).map(function (item) { return Object.assign({}, item); }),
      levels: LEVELS.map(function (level) { return Object.assign({}, level); }),
      movements: MOVEMENTS.concat(movementDrafts).map(function (movement) { return Object.assign({}, movement); }),
      purchaseRequests: PURCHASE_REQUESTS.concat(purchaseDrafts).map(function (request) { return Object.assign({}, request); }),
      receipts: RECEIPTS.concat(receiptDrafts).map(function (receipt) { return Object.assign({}, receipt); })
    };
  }

  root.SchoolSafeInventoryDemo = {
    render: render,
    open: open,
    close: close,
    setSession: setSession,
    isDemoMode: isDemoMode,
    canReadAggregates: canReadAggregates,
    answerJaspe: answerJaspe,
    getSnapshot: getSnapshot
  };
})(window);
