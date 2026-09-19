/* Composition de postes natifs : autorité, version et persistance au serveur. */
(function (root) {
  'use strict';
  var openings = new WeakMap();
  // Display labels only; the server catalogue and Access Law remain authoritative.
  var MODULE_LABELS = { session: 'Système', school: 'École', staff: 'Personnel', roles: 'Rôles et accès', security: 'Sécurité et contrôle', pilotage: 'Pilotage', email: 'Communication', finance: 'Finance', pedagogy: 'Pédagogie', palmarques: 'Pédagogie', canteen: 'Vie scolaire', infirmary: 'Vie scolaire', communication: 'Communication', safe: 'JASPE', reports: 'Contrôle et rapports', sync: 'Système', file: 'Centre de documents', cards: 'Cartes et impression', notification: 'Communication' };
  var SCOPE_LABELS = { school: 'École entière', own: 'Soi-même', own_children: 'Enfants rattachés', none: 'Sans périmètre', assigned_classes: 'Classes affectées', assigned_subjects: 'Matières affectées', assigned_portal: 'Portail affecté', assigned_fee_classes: 'Classes des campagnes affectées' };
  function escape(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  async function open(container, roleId, lifecycle) {
    var opening = {}; openings.set(container, opening);
    container.textContent = 'Chargement du poste…';
    var data, pending = false;
    function current() { return openings.get(container) === opening && lifecycle.isCurrent() && container.isConnected; }
    function fail(error) {
      if (!current()) return;
      if (error.status === 401 || error.status === 403) { container.replaceChildren(); lifecycle.onDenied(error); return; }
      var box = container.querySelector('[data-role-editor-error]') || container;
      var message = document.createElement('p'); message.setAttribute('role', 'alert');
      message.textContent = error.status === 409 ? error.message : 'Enregistrement non confirmé. Relisez le poste avant de recommencer.';
      var button = document.createElement('button'); button.type = 'button'; button.className = 'ss-button'; button.textContent = 'Recharger le poste';
      button.onclick = function () { if (current()) open(container, roleId, lifecycle); };
      box.replaceChildren(message, button);
    }
    try {
      data = await root.SchoolSafeAccessNative.roleEditor(roleId);
      if (!current()) return;
      lifecycle.checkSchool(data);
      if (roleId && (!data.detail || data.detail.role.id !== roleId)) { var invalid = new Error('Poste modifié'); invalid.status = 401; throw invalid; }
    } catch (error) { fail(error); return; }
    var detail = data.detail, existing = new Map((detail ? detail.grants : []).map(function (g) { return [g.permission, g]; }));
    var editable = !detail || detail.editable;
    var rows = data.catalog.slice();
    existing.forEach(function (g, code) { if (!rows.some(function (p) { return p.code === code; })) rows.push({ code: code, label: code, scopes: [] }); });
    function scopeText(g) {
      return g.scopes.map(function (s) { return (SCOPE_LABELS[s.type] || s.type) + (s.target ? ' : ' + s.target : ''); }).join(', ') || 'Aucun périmètre';
    }
    container.innerHTML = '<section class="native-access-editor"><h3 tabindex="-1">' + (detail ? 'Poste : ' + escape(detail.role.label) : 'Créer un poste') + '</h3>' +
      '<p>Les permissions définissent les actions autorisées. Les périmètres limitent les données accessibles. JASPE respecte les mêmes limites.</p>' +
      '<details><summary>Comprendre le lien avec les services SchoolSafe</summary><p>SchoolSafe ID reste le socle permanent de l’identité. Les cartes Pass et StaffID, les personnes autorisées dans Guardian, les appareils Watch et Lab s’appuient sur cette identité et sur les droits des rubriques concernées.</p><p>Attribuer une permission n’active pas un abonnement ni un appareil. L’activation des services et l’impression centrale relèvent de SchoolSafe Control ; un poste d’école ne donne pas cette autorité.</p></details>' +
      (detail ? '<p data-role-impact><b>' + escape(detail.memberCount) + ' profil(s) avec attribution active</b> seront concernés par une modification de ce poste.</p><ul>' + detail.members.map(function (m) { return '<li>' + escape(m.display_name) + '</li>'; }).join('') + '</ul>' + (detail.memberCount > detail.members.length ? '<p>Les 100 premiers profils sont affichés ; tous les membres sont concernés.</p>' : '') : '') +
      (!editable ? '<p class="native-access-boundary">Ce poste est protégé ou dépasse votre autorité de délégation. Créez une copie depuis un modèle pour le personnaliser.</p>' : '') +
      '<form data-custom-role-form><fieldset' + (!editable ? ' disabled' : '') + '><div class="native-access-filters"><label>Nom du poste<input name="label" required minlength="2" maxlength="100" value="' + escape(detail ? detail.role.label : '') + '"></label>' +
      (detail ? '<label>État<select name="active"><option value="true"' + (detail.role.is_active ? ' selected' : '') + '>Actif</option><option value="false"' + (!detail.role.is_active ? ' selected' : '') + '>Désactivé</option></select></label>' : '<label>Point de départ<select name="template"><option value="">Poste vide</option>' + data.templates.map(function (t) { return '<option value="' + escape(t.id) + '">' + escape(t.label) + '</option>'; }).join('') + '</select></label>') + '</div>' +
      (detail ? '<p>Les périmètres, dates et conditions déjà enregistrés sont conservés. Les affectations de classes, matières et portails seront configurées dans l’étape dédiée.</p><div class="native-access-filters"><label>Filtrer les permissions<input type="search" data-composition-search></label></div><div class="native-access-composition">' + rows.map(function (p) {
        var g = existing.get(p.code);
        return '<section data-composition-row="' + escape(p.code) + '"><small>' + escape(MODULE_LABELS[p.code.split('.')[0]] || 'Autres fonctions') + '</small><label><input type="checkbox" data-permission-check' + (g && g.is_active ? ' checked' : '') + '> <b>' + escape(p.label) + '</b></label><code>' + escape(p.code) + '</code>' +
          '<label>Effet<select data-permission-effect><option value="allow">Autoriser</option><option value="deny"' + (g && g.effect === 'deny' ? ' selected' : '') + '>Refuser explicitement</option></select></label>' +
          (g ? '<p>Périmètre conservé : ' + escape(scopeText(g)) + (g.conditions.length ? '<br>Conditions : ' + escape(g.conditions.join(', ')) : '') + (g.ends_at ? '<br>Fin : ' + escape(g.ends_at) : '') + '</p>' :
            '<label>Périmètre<select data-permission-scope><option value="">Choisir…</option>' + p.scopes.map(function (s) { return '<option value="' + escape(s) + '">' + escape(SCOPE_LABELS[s] || s) + '</option>'; }).join('') + '</select></label>') + '</section>';
      }).join('') + '</div>' : '<p>Le poste sera créé sans attribution à une personne. Vous pourrez ensuite composer ses permissions et l’attribuer depuis la fiche utilisateur.</p>') +
      '<label>Motif<textarea name="reason" minlength="5" maxlength="500" required rows="2"></textarea></label>' +
      '<label class="native-access-confirm"><input type="checkbox" name="confirmed" required> Je confirme ' + (detail ? 'les changements pour tous les profils concernés.' : 'la création de ce poste.') + '</label>' +
      '<button type="submit" class="ss-button">' + (detail ? 'Enregistrer le poste' : 'Créer le poste') + '</button><p data-custom-role-status role="status"></p></fieldset></form><div data-role-editor-error></div></section>';
    container.querySelector('h3').focus({ preventScroll: true });
    var form = container.querySelector('form'), filter = container.querySelector('[data-composition-search]');
    if (filter) filter.oninput = function () {
      var q = filter.value.trim().toLocaleLowerCase('fr');
      container.querySelectorAll('[data-composition-row]').forEach(function (row) { row.hidden = !row.textContent.toLocaleLowerCase('fr').includes(q); });
    };
    form.onsubmit = async function (event) {
      event.preventDefault(); if (!current() || pending || !editable || !form.reportValidity()) return;
      var input = { label: form.elements.label.value.trim(), reason: form.elements.reason.value.trim(), confirmed: true, revision: data.revision };
      if (input.reason.length < 5 || input.label.length < 2) return;
      if (detail) {
        input.isActive = form.elements.active.value === 'true'; input.grants = [];
        var missing = null;
        container.querySelectorAll('[data-composition-row]').forEach(function (row) {
          if (!row.querySelector('[data-permission-check]').checked) return;
          var grant = { permission: row.dataset.compositionRow, effect: row.querySelector('[data-permission-effect]').value };
          var scope = row.querySelector('[data-permission-scope]');
          if (scope) { grant.scope = scope.value; if (!scope.value) missing = row; }
          input.grants.push(grant);
        });
        if (missing) {
          if (filter) { filter.value = ''; filter.oninput(); }
          missing.querySelector('[data-permission-scope]').focus(); form.querySelector('[data-custom-role-status]').textContent = 'Choisissez le périmètre de chaque nouvelle permission.'; return;
        }
      } else input.templateId = form.elements.template.value || null;
      pending = true; form.querySelector('fieldset').disabled = true;
      form.querySelector('[data-custom-role-status]').textContent = 'Enregistrement…';
      try {
        var result = detail ? await root.SchoolSafeAccessNative.saveRole(roleId, input) : await root.SchoolSafeAccessNative.createRole(input);
        if (!current()) return;
        lifecycle.checkSchool(result);
        if (!result.roleId || (roleId && result.roleId !== roleId)) { var mismatch = new Error('Poste modifié'); mismatch.status = 401; throw mismatch; }
        lifecycle.onSaved(result.roleId, !!(detail && detail.affectsCurrentProfile));
      } catch (error) { fail(error); }
    };
  }
  root.SchoolSafeRoleEditor = { open: open };
})(window);
