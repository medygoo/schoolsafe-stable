/* Consultation du bootstrap natif. Les décisions métier restent côté serveur. */
(function (root) {
  "use strict";

  var DOMAINS = {
    school: "École · SchoolSafe ID", staff: "Personnel · StaffID", roles: "Rôles et accès",
    security: "Sécurité · Pass / Guardian", finance: "Finance", pedagogy: "Pédagogie",
    palmarques: "Pédagogie · Palmarès", pilotage: "Pilotage", reports: "Contrôle et rapports",
    cards: "Cartes · SchoolSafe Control", safe: "JASPE", session: "Session · SchoolSafe ID",
    email: "Communication", notification: "Communication", canteen: "Cantine", infirmary: "Infirmerie"
  };
  var SCOPES = {
    school: "École", own: "Soi-même", own_children: "Enfants rattachés",
    assigned_classes: "Classes affectées", assigned_subjects: "Matières affectées",
    assigned_portal: "Portail affecté", device_managed: "Appareils gérés", none: "Sans périmètre"
  };
  function escape(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }
  function permissionScopes(user, code) {
    var access = root.SchoolSafeAccess;
    var exceptions = (user.permissionExceptions || []).filter(function (item) {
      return item.permission === code && item.effect === "allow";
    });
    var scopes = access.normalizeScopes(user.scopes).filter(function (scope) { return scope.permission === code; });
    exceptions.forEach(function (item) { scopes = scopes.concat(access.normalizeScopes(item.scopes).filter(function (scope) { return scope.permission === code; })); });
    return scopes.filter(function (scope, index, all) {
      return all.findIndex(function (other) { return other.type === scope.type && other.target === scope.target; }) === index;
    });
  }
  function renderAccount(container, user, catalog, refresh) {
    var access = root.SchoolSafeAccess;
    var codes = new Set(catalog.map(function (permission) { return permission.code; }));
    // Un droit inconnu du catalogue ne disparaît pas silencieusement de la lecture.
    var permissions = catalog.slice();
    (user.permissions || []).concat(user.deniedPermissions || [], (user.permissionExceptions || []).map(function (item) { return item.permission; })).forEach(function (code) {
      if (!codes.has(code)) { permissions.push({ code: code, label: "Permission hors catalogue local" }); codes.add(code); }
    });
    var rows = permissions.map(function (permission) {
      var denied = access.explicitDeny(user, permission.code);
      var granted = access.canAccess(user, permission.code);
      var scopes = permissionScopes(user, permission.code);
      var domain = permission.code.split(".")[0];
      var state = denied ? "denied" : granted ? "granted" : "absent";
      return { code: permission.code, label: permission.label, domain: DOMAINS[domain] || domain,
        state: state, status: denied ? "Refus explicite" : granted ? "Attribuée" : "Non attribuée",
        scopes: denied || !granted ? "—" : scopes.map(function (scope) {
          return (SCOPES[scope.type] || scope.type) + (scope.target ? " · " + scope.target : "");
        }).join(" / ") || "Aucun périmètre transmis" };
    });
    container.innerHTML = '<div class="native-access-summary"><div><span>Compte connecté · lecture serveur</span><h3>' +
      escape(user.profile.display_name) + '</h3><p>' + escape(user.school && user.school.name) + '</p><p>Rôles : ' +
      (user.roles || []).map(escape).join(", ") + '</p></div><button type="button" id="refreshNativeAccess" class="ss-button ss-button--secondary">Actualiser les droits</button></div>' +
      '<p>Les rôles regroupent les permissions. Chaque permission possède un périmètre ; un refus explicite reste prioritaire. Le serveur vérifie aussi les conditions propres à chaque action.</p>' +
      '<p class="native-access-boundary">Consultez un utilisateur de l’école pour attribuer ou retirer ses rôles. Chaque changement est contrôlé et journalisé par le serveur.</p>' +
      '<div class="native-access-filters"><label>Rechercher un droit ou un module<input id="accessPermissionSearch" type="search" autocomplete="off"></label>' +
      '<label>État<select id="accessPermissionState"><option value="all">Tous les droits</option><option value="granted">Attribués</option><option value="denied">Refus explicites</option><option value="absent">Non attribués</option></select></label></div>' +
      '<p id="accessPermissionCount" role="status"></p><div class="native-access-table"><table><caption>Permissions du compte dans l’école courante</caption><thead><tr><th>Module / service</th><th>Permission</th><th>État</th><th>Périmètres transmis</th></tr></thead><tbody id="nativeAccessRows"></tbody></table></div>';
    function filterRows() {
      var query = container.querySelector("#accessPermissionSearch").value.trim().toLocaleLowerCase("fr");
      var state = container.querySelector("#accessPermissionState").value;
      var visible = rows.filter(function (row) {
        return (state === "all" || row.state === state) && (!query || [row.code, row.label, row.domain, row.scopes].join(" ").toLocaleLowerCase("fr").includes(query));
      });
      container.querySelector("#accessPermissionCount").textContent = visible.length + " permission(s) affichée(s)";
      container.querySelector("#nativeAccessRows").innerHTML = visible.length ? visible.map(function (row) {
        return '<tr data-access-permission="' + escape(row.code) + '"><td data-label="Module">' + escape(row.domain) + '</td><td data-label="Permission"><b>' + escape(row.label) + '</b><code>' + escape(row.code) + '</code></td><td data-label="État"><span class="native-access-state" data-state="' + row.state + '">' + row.status + '</span></td><td data-label="Périmètres">' + escape(row.scopes) + '</td></tr>';
      }).join("") : '<tr><td colspan="4">Aucun droit ne correspond à ces filtres.</td></tr>';
    }
    container.querySelector("#refreshNativeAccess").addEventListener("click", refresh);
    container.querySelector("#accessPermissionSearch").addEventListener("input", filterRows);
    container.querySelector("#accessPermissionState").addEventListener("change", filterRows);
    filterRows();
  }
  function validity(item) {
    if (!item || !item.is_active) return "Désactivé";
    if (Date.parse(item.starts_at) > Date.now()) return "À venir";
    if (item.ends_at && Date.parse(item.ends_at) < Date.now()) return "Expiré";
    return "En cours";
  }
  function profileStatus(profile) {
    return profile.is_active ? ({ active: "Actif", pending_activation: "À activer", suspended: "Suspendu", closed: "Fermé" }[profile.account_status] || profile.account_status) : "Désactivé";
  }
  function renderDetail(container, detail, catalog) {
    var labels = new Map(catalog.map(function (p) { return [p.code, p.label]; }));
    var roles = new Map(detail.roles.map(function (r) { return [r.id, r]; }));
    var lines = detail.grants.map(function (grant) {
      var role = roles.get(grant.role_id);
      return { grant: grant, origin: role ? role.label : grant.role_id,
        state: !role || !role.is_active ? "Rôle désactivé" : validity(role.assignment) !== "En cours" ? "Attribution : " + validity(role.assignment) : validity(grant),
        conditions: grant.conditions.filter(function (c) { return c.is_active; }).map(function (c) { return c.code; }) };
    }).concat(detail.exceptions.map(function (exception) {
      return { grant: exception, origin: "Exception individuelle", state: validity(exception), conditions: exception.condition_code ? [exception.condition_code] : [] };
    }));
    container.innerHTML = '<h3 tabindex="-1">' + escape(detail.profile.display_name) + '</h3><p>' + escape(profileStatus(detail.profile)) + '</p>' +
      '<p class="native-access-boundary">Attributions enregistrées. Les dates, périmètres, conditions et refus déterminent l’accès à chaque action ; cette liste ne simule pas une connexion à ce compte.</p>' +
      '<h4>Rôles attribués</h4><ul>' + (detail.roles.map(function (role) {
        return '<li>' + escape(role.label) + ' · ' + escape(role.code) + ' — ' + (role.is_active ? escape(validity(role.assignment)) : 'Rôle désactivé') + '</li>';
      }).join("") || '<li>Aucun rôle attribué.</li>') + '</ul>' +
      '<div class="native-access-table"><table><caption>Permissions provenant des rôles et exceptions</caption><thead><tr><th>Permission</th><th>Origine / état</th><th>Effet enregistré</th><th>Périmètres / conditions</th></tr></thead><tbody>' +
      (lines.map(function (line) {
        var g = line.grant;
        var scopeText = g.scopes.map(function (s) { return (SCOPES[s.type] || s.type) + (s.target ? " · " + s.target : "") + " (" + validity(s) + ")"; }).join(" / ");
        return '<tr data-access-assignment="' + escape(g.id) + '"><td data-label="Permission"><b>' + escape(labels.get(g.permission) || g.permission) + '</b><code>' + escape(g.permission) + '</code>' + (g.permission_active ? '' : 'Permission désactivée') +
          '</td><td data-label="Origine / état">' + escape(line.origin) + '<br>' + escape(line.state) + '</td><td data-label="Effet"><span class="native-access-state" data-state="' + (g.effect === 'deny' ? 'denied' : 'granted') + '">' + (g.effect === 'deny' ? 'Refus' : 'Autorisation') +
          '</span></td><td data-label="Périmètres / conditions">' + escape(scopeText || 'Aucun périmètre') + '<br>' + escape(line.conditions.length ? 'Conditions : ' + line.conditions.join(', ') : 'Aucune condition enregistrée') + '</td></tr>';
      }).join("") || '<tr><td colspan="4">Aucune permission enregistrée.</td></tr>') + '</tbody></table></div>';
    container.querySelector('h3').focus({ preventScroll: true });
  }
  function render(container, user, catalog, refresh, lifecycle) {
    lifecycle = lifecycle || { isCurrent: function () { return container.isConnected; }, onDenied: refresh };
    container.innerHTML = '<nav class="native-access-tabs" aria-label="Consultation des accès"><button type="button" class="ss-button" data-access-view="account" aria-pressed="true">Mon compte</button><button type="button" class="ss-button" data-access-view="profiles" aria-pressed="false">Utilisateurs de l’école</button><button type="button" class="ss-button" data-access-view="roles" aria-pressed="false">Rôles de l’école</button></nav><div data-access-panel></div>';
    var panel = container.querySelector('[data-access-panel]');
    var revision = 0, detailRevision = 0;
    function current(ticket) { return ticket === revision && container.contains(panel) && lifecycle.isCurrent(); }
    function checkSchool(data) {
      if (!data || data.schoolId !== user.schoolId) { var error = new Error('Contexte modifié'); error.status = 401; throw error; }
    }
    function fail(error, box, retry, ticket) {
      if (!current(ticket)) return;
      box.replaceChildren();
      if (error.status === 401 || error.status === 403) { container.replaceChildren(); lifecycle.onDenied(error); return; }
      var alert = document.createElement('p'); alert.setAttribute('role', 'alert');
      alert.textContent = error.status === 404 ? 'Profil introuvable dans cette école.' : 'Lecture indisponible. Réessayez lorsque le serveur est accessible.';
      var button = document.createElement('button'); button.type = 'button'; button.className = 'ss-button'; button.textContent = 'Réessayer'; button.addEventListener('click', retry);
      box.append(alert, button);
    }
    function showDirectory(kind, selectedRole) {
      var ticket = ++revision, query = '', offset = 0, pageRevision = 0;
      panel.innerHTML = '<form class="native-access-filters" data-access-search><label>Rechercher ' + (kind === 'profiles' ? 'un utilisateur' : 'un rôle') + '<input type="search" maxlength="100" autocomplete="off" name="query"></label><button type="submit" class="ss-button">Rechercher</button></form><div data-access-list aria-live="polite"></div><section data-access-detail aria-label="Attributions de la personne"></section>';
      var list = panel.querySelector('[data-access-list]'), detail = panel.querySelector('[data-access-detail]');
      if (kind === 'roles') {
        var create = document.createElement('button'); create.type = 'button'; create.className = 'ss-button'; create.dataset.createRole = ''; create.textContent = 'Créer un poste';
        create.onclick = function () { editRole(null); }; panel.prepend(create);
      }
      function editRole(roleId) {
        var request = ++detailRevision;
        root.SchoolSafeRoleEditor.open(detail, roleId, {
          isCurrent: function () { return current(ticket) && request === detailRevision; },
          checkSchool: checkSchool, onDenied: lifecycle.onDenied,
          onSaved: function (id, affectsCurrentProfile) { if (affectsCurrentProfile) refresh(); else showDirectory('roles', id); }
        });
      }
      async function load() {
        var request = ++pageRevision; ++detailRevision;
        list.textContent = 'Chargement…'; detail.replaceChildren();
        try {
          var data = await root.SchoolSafeAccessNative[kind](query, offset);
          if (!current(ticket) || request !== pageRevision) return;
          checkSchool(data);
          list.innerHTML = '<p role="status">' + escape(data.total) + (kind === 'profiles' ? ' utilisateur(s)' : ' rôle(s)') + '</p><ul class="native-access-people">' +
            (data.rows.map(function (item) {
              return kind === 'profiles' ? '<li><button class="ss-button" type="button" data-access-profile="' + escape(item.id) + '"><b>' + escape(item.display_name) + '</b><span>' + escape(profileStatus(item)) + '</span></button></li>' :
                '<li><button class="ss-button" type="button" data-access-role="' + escape(item.id) + '"><b>' + escape(item.label) + '</b><span>' + (/^custom_/.test(item.code) ? 'Poste personnalisé' : escape(item.code)) + '</span><span>' + (item.is_active ? 'Actif' : 'Désactivé') + '</span></button></li>';
            }).join('') || '<li>Aucun résultat dans cette école.</li>') + '</ul><div class="native-access-pagination"><button type="button" class="ss-button" data-page="previous"' + (offset === 0 ? ' disabled' : '') + '>Précédent</button><span>Page ' + (Math.floor(offset / 25) + 1) + '</span><button type="button" class="ss-button" data-page="next"' + (offset + data.rows.length >= data.total || !data.rows.length ? ' disabled' : '') + '>Suivant</button></div>';
          list.querySelector('[data-page="previous"]').addEventListener('click', function () { offset = Math.max(0, offset - 25); load(); });
          list.querySelector('[data-page="next"]').addEventListener('click', function () { offset += 25; load(); });
          list.querySelectorAll('[data-access-profile]').forEach(function (button) {
            button.addEventListener('click', function () { inspect(button.dataset.accessProfile); });
          });
          list.querySelectorAll('[data-access-role]').forEach(function (button) { button.onclick = function () { editRole(button.dataset.accessRole); }; });
          if (selectedRole) { var nextRole = selectedRole; selectedRole = null; editRole(nextRole); }
        } catch (error) { if (request === pageRevision) fail(error, list, load, ticket); }
      }
      async function inspect(id) {
        var request = ++detailRevision;
        detail.textContent = 'Chargement des attributions…';
        try {
          var data = await root.SchoolSafeAccessNative.profile(id);
          if (!current(ticket) || request !== detailRevision) return;
          checkSchool(data);
          if (!data.profile || data.profile.id !== id) { var changed = new Error('Profil modifié'); changed.status = 401; throw changed; }
          renderDetail(detail, data, catalog);
          if (typeof data.revision === 'string') editRoles(id, data, request);
        } catch (error) { if (request === detailRevision) fail(error, detail, function () { inspect(id); }, ticket); }
      }
      function editRoles(id, profile, request) {
        var box = document.createElement('section'); box.className = 'native-access-editor';
        detail.prepend(box);
        var selectedRevision = 0, roleOffset = 0, roleQuery = '', changePending = false;
        function alive() { return current(ticket) && request === detailRevision && detail.contains(box); }
        box.innerHTML = '<h4>Modifier les rôles de ' + escape(profile.profile.display_name) + '</h4>' +
          '<p>Les droits de JASPE suivent aussi ces attributions. Les refus et restrictions restent prioritaires.</p>' +
          '<div data-role-current>' + profile.roles.filter(function (r) { return r.assignment.is_active; }).map(function (r) {
            return '<button type="button" class="ss-button ss-button--secondary" data-role-revoke="' + escape(r.id) + '">Retirer ' + escape(r.label) + '</button>';
          }).join('') + '</div><form data-role-search class="native-access-filters"><label>Rechercher un rôle à attribuer<input name="roleQuery" type="search" maxlength="100"></label><button type="submit" class="ss-button">Rechercher</button></form><div data-role-options></div><div data-role-confirm aria-live="polite"></div>';
        var options = box.querySelector('[data-role-options]'), confirm = box.querySelector('[data-role-confirm]');
        function failure(error) {
          if (!alive()) return;
          if (error.status === 401 || error.status === 403) { fail(error, box, function () { inspect(id); }, ticket); return; }
          // Keep the submitted target, role and reason visible if the result is
          // uncertain. A fresh read is required before any new submission.
          if (!confirm.querySelector('[data-role-change]')) confirm.replaceChildren();
          var message = document.createElement('p'); message.setAttribute('role', 'alert');
          message.textContent = error.status === 409 ? error.message : 'Modification non confirmée. Rechargez les attributions pour vérifier leur état avant de réessayer.';
          var retry = document.createElement('button'); retry.className = 'ss-button'; retry.type = 'button'; retry.textContent = 'Recharger les attributions';
          retry.onclick = function () { inspect(id); }; confirm.append(message, retry);
        }
        async function choose(roleId, action) {
          var choice = ++selectedRevision;
          confirm.textContent = 'Lecture du rôle…';
          try {
            var roleData = await root.SchoolSafeAccessNative.role(roleId);
            if (!alive() || choice !== selectedRevision) return;
            checkSchool(roleData);
            if (!roleData.role || roleData.role.id !== roleId || roleData.revision !== profile.revision) {
              var stale = new Error('Les accès ont changé. Rechargez les attributions avant de confirmer.'); stale.status = 409; throw stale;
            }
            if (!roleData.role.delegatable) {
              confirm.textContent = 'Ce rôle dépasse votre autorité de délégation ou est désactivé. La modification est indisponible.'; return;
            }
            var verb = action === 'assign' ? 'Attribuer' : 'Retirer';
            confirm.innerHTML = '<form data-role-change><h4>' + verb + ' « ' + escape(roleData.role.label) + ' » à ' + escape(profile.profile.display_name) + '</h4>' +
              '<p>' + (action === 'assign' ? 'Attribution immédiate, sans date de fin.' : 'Cette attribution sera désactivée. Les autres rôles et exceptions restent applicables.') + '</p>' +
              '<details open><summary>Permissions du rôle</summary><ul>' + (roleData.grants.map(function (g) {
                return '<li>' + escape(g.permission) + ' · ' + (g.effect === 'deny' ? 'Refus' : 'Autorisation') + ' · ' + escape(validity(g)) + ' · ' +
                  escape(g.scopes.map(function (s) { return (SCOPES[s.type] || s.type) + (s.target ? ' : ' + s.target : '') + ' (' + validity(s) + ')'; }).join(', ')) +
                  (g.conditions.length ? ' · Conditions : ' + escape(g.conditions.join(', ')) : '') + '</li>';
              }).join('') || '<li>Aucune permission dans ce rôle.</li>') + '</ul></details>' +
              '<label>Motif du changement<textarea name="reason" required minlength="5" maxlength="500" rows="2"></textarea></label>' +
              '<label class="native-access-confirm"><input type="checkbox" name="confirmed" required> Je confirme ce changement pour ' + escape(profile.profile.display_name) + '.</label>' +
              '<button type="submit" class="ss-button">Confirmer le changement</button> <button type="button" class="ss-button ss-button--secondary" data-role-cancel>Annuler</button><p data-role-result role="status"></p></form>';
            confirm.querySelector('[data-role-cancel]').onclick = function () { ++selectedRevision; confirm.replaceChildren(); };
            confirm.querySelector('form').onsubmit = async function (event) {
              event.preventDefault();
              if (!alive() || choice !== selectedRevision || changePending) return;
              var form = event.currentTarget;
              if (!form.reportValidity()) return;
              var reason = form.elements.reason.value.trim();
              if (reason.length < 5) { form.elements.reason.focus(); return; }
              // Freeze every local editor control so a delayed result cannot be
              // confused with another choice. Navigation invalidates this view.
              changePending = true;
              box.querySelectorAll('button,input,textarea').forEach(function (el) { el.disabled = true; });
              form.querySelector('[data-role-result]').textContent = 'Enregistrement…';
              try {
                var result = await root.SchoolSafeAccessNative.changeRole(id, { roleId: roleId, action: action, revision: profile.revision, reason: reason, confirmed: true });
                if (!alive() || choice !== selectedRevision) return;
                checkSchool(result);
                if (result.profileId !== id || result.roleId !== roleId) { var changed = new Error('Contexte modifié'); changed.status = 401; throw changed; }
                // Refresh the real session after self-change, including loss of
                // roles.manage; never keep the old UI rights as authority.
                if (id === (user.profileId || user.profile.id)) { refresh(); return; }
                await inspect(id);
              } catch (error) { failure(error); }
            };
          } catch (error) { if (choice === selectedRevision) failure(error); }
        }
        async function loadRoles() {
          var choice = ++selectedRevision;
          confirm.replaceChildren(); options.textContent = 'Chargement des rôles…';
          try {
            var data = await root.SchoolSafeAccessNative.roles(roleQuery, roleOffset);
            if (!alive() || choice !== selectedRevision) return;
            checkSchool(data);
            options.innerHTML = '<ul class="native-access-people">' + (data.rows.map(function (r) {
              var assigned = profile.roles.some(function (pr) { return pr.id === r.id && validity(pr.assignment) === 'En cours' && !pr.assignment.ends_at; });
              return '<li><button type="button" class="ss-button" data-role-assign="' + escape(r.id) + '"' + (!r.delegatable || assigned ? ' disabled' : '') + '>' + escape(r.label) + (assigned ? ' · Déjà attribué' : !r.delegatable ? ' · Non délégable' : ' · Attribuer') + '</button></li>';
            }).join('') || '<li>Aucun rôle trouvé.</li>') + '</ul><div class="native-access-pagination"><button type="button" class="ss-button" data-role-prev' + (!roleOffset ? ' disabled' : '') + '>Précédent</button><button type="button" class="ss-button" data-role-next' + (roleOffset + data.rows.length >= data.total ? ' disabled' : '') + '>Suivant</button></div>';
            options.querySelector('[data-role-prev]').onclick = function () { roleOffset = Math.max(0, roleOffset - 25); loadRoles(); };
            options.querySelector('[data-role-next]').onclick = function () { roleOffset += 25; loadRoles(); };
            options.querySelectorAll('[data-role-assign]').forEach(function (el) { el.onclick = function () { choose(el.dataset.roleAssign, 'assign'); }; });
          } catch (error) { if (choice === selectedRevision) failure(error); }
        }
        box.querySelectorAll('[data-role-revoke]').forEach(function (el) { el.onclick = function () { choose(el.dataset.roleRevoke, 'revoke'); }; });
        box.querySelector('[data-role-search]').onsubmit = function (event) {
          event.preventDefault(); roleQuery = event.currentTarget.elements.roleQuery.value.trim(); roleOffset = 0; loadRoles();
        };
        loadRoles();
      }
      panel.querySelector('form').addEventListener('submit', function (event) {
        event.preventDefault(); query = panel.querySelector('input').value.trim(); offset = 0; load();
      });
      load();
    }
    container.querySelectorAll('[data-access-view]').forEach(function (button) {
      button.addEventListener('click', function () {
        container.querySelectorAll('[data-access-view]').forEach(function (other) { other.setAttribute('aria-pressed', String(other === button)); });
        if (button.dataset.accessView === 'account') { ++revision; ++detailRevision; renderAccount(panel, user, catalog, refresh); }
        else showDirectory(button.dataset.accessView);
      });
    });
    renderAccount(panel, user, catalog, refresh);
  }
  root.SchoolSafeNativeAccessConsole = { render: render };
})(window);
