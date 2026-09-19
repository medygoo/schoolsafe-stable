// SchoolSafe V2 — Module de production de cartes élèves dans le workspace
import { renderCardPreview, captureCardPng, ssClassType } from './card-renderer.js';

const state = {
  classes: [],
  students: [],
  guardians: new Map(),
  selectedClass: null,
  selectedStudentIds: new Set(),
  currentYear: new Date().getFullYear() + '-' + (new Date().getFullYear() + 1),
  academicYearId: null,
  schoolInfo: null,
  apiBase: window.schoolSafeApiBase || window.SCHOOLSAFE_API_BASE || 'http://127.0.0.1:8787'
};

function $(id) { return document.getElementById(id); }

function setStatus(msg, type = 'ok') {
  const el = $('cardsStatus');
  if (!el) return;
  if (msg && typeof msg === 'object') {
    el.innerHTML = window.ssState(msg);
    el.style.color = '';
  } else {
    el.textContent = msg;
    el.style.color = type === 'error' ? '#c22f2f' : type === 'warning' ? '#b8860b' : '#08825a';
  }
}

function nativeApi(path, opts) {
  var options = opts || {};
  var url = state.apiBase + '/native' + path;
  var fetchOpts = {
    method: options.method || 'GET',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    credentials: 'include',
  };
  if (options.body) fetchOpts.body = JSON.stringify(options.body);
  return fetch(url, fetchOpts).then(function (res) {
    if (!res.ok) return res.json().then(function (d) { throw new Error(d && d.message ? d.message : 'Erreur ' + res.status); });
    return res.json();
  });
}

function getToken() {
  try {
    const session = JSON.parse(sessionStorage.getItem('schoolsafe-v2-session') || 'null');
    return session?.token || null;
  } catch { return null; }
}

function getSupabaseClient() {
  if (!window.SchoolSafeSupabaseSDK?.createClient) return null;
  const config = window.schoolSafeBackendConfig;
  if (!config?.supabase_url || !config?.supabase_anon_key) return null;
  return window.SchoolSafeSupabaseSDK.createClient(config.supabase_url, config.supabase_anon_key, {
    auth: { autoRefreshToken: true, persistSession: false }
  });
}

async function loadClasses() {
  try {
    var res = await nativeApi('/pedagogy/classes');
    var classesData = (res && res.data) || [];

    // Récupérer les configs de design
    var configRes = await nativeApi('/cards/class-card-config');
    var configMap = {};
    if (configRes && configRes.data) {
      configRes.data.forEach(function (c) { configMap[c.id] = c; });
    }

    state.classes = classesData.map(function (c) {
      var cfg = configMap[c.id] || {};
      return {
        id: c.id,
        name: c.name,
        cycle_key: c.cycle_key,
        option: c.option,
        teacher_id: cfg.teacher_id,
        card_color: cfg.card_color,
        card_color_soft: cfg.card_color_soft,
        card_color_dark: cfg.card_color_dark,
        card_pat: cfg.card_pat,
        card_family: cfg.card_family,
        card_variant: cfg.card_variant,
        card_pat_style: cfg.card_pat_style
      };
    });

    var select = $('cardsClassSelect');
    select.innerHTML = '<option value="">Choisir une classe</option>';
    state.classes.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      select.appendChild(opt);
    });
  } catch (e) {
    setStatus({ type: 'error', title: 'Erreur de chargement', message: 'Erreur chargement classes : ' + e.message, size: 'inline' });
  }
}

async function loadStudents(classId) {
  try {
    var res = await nativeApi('/students?class_id=' + encodeURIComponent(classId) + '&status=active');
    var studentsData = (res && res.data) || [];
    state.students = studentsData.map(function (s) {
      return {
        id: s.id,
        matricule: s.matricule,
        first_name: s.first_name,
        middle_name: s.middle_name,
        last_name: s.last_name,
        date_of_birth: s.date_of_birth,
        photo_path: s.photo_path,
        card_print_count: s.card_print_count || 0,
        students_guardians: s.students_guardians || []
      };
    });
    state.selectedStudentIds.clear();
    buildGuardianMap();
    renderStudentList();
    $('cardsRenderBtn').disabled = state.students.length === 0;
    $('cardsRequestPrintBtn').disabled = true;
    $('cardsPreview').innerHTML = window.ssState({ type: 'empty', title: 'Aucun aperçu', message: 'Sélectionnez un ou plusieurs élèves.', size: 'compact' });
  } catch (e) {
    setStatus({ type: 'error', title: 'Erreur de chargement', message: 'Erreur chargement élèves : ' + e.message, size: 'inline' });
  }
}

function buildGuardianMap() {
  state.guardians.clear();
  state.students.forEach(function (s) {
    var guards = s.students_guardians || [];
    if (guards.length > 0) {
      state.guardians.set(s.id, guards);
    }
  });
}

async function loadSchoolInfo() {
  try {
    var res = await fetch(state.apiBase + '/school/info', { credentials: 'include', headers: { 'Accept': 'application/json' } });
    if (!res.ok) return;
    var data = await res.json();
    var info = data && data.data ? data.data : data;
    if (info) {
      state.schoolInfo = {
        name: info.name,
        name_en: info.name_en,
        address: info.address,
        phone: info.phone,
        email: info.email,
        motto: info.motto,
        website: info.website
      };
      window.SCHOOL_LOGO = info.logo_path || '';
    }
  } catch (e) {
    // Silencieux — l'info école n'est pas critique
  }
}

function isCardInfoComplete(s) {
  if (!s.matricule || !s.first_name || !s.last_name || !s.date_of_birth || !s.photo_path) return false;
  const guards = state.guardians.get(s.id) || [];
  if (guards.length === 0) return false;
  return true;
}

function renderStudentList() {
  const list = $('cardsStudentList');
  list.innerHTML = '';
  if (state.students.length === 0) {
    list.innerHTML = window.ssState({ type: 'empty', title: 'Aucun élève', message: 'Aucun élève dans cette classe.', size: 'compact' });
    return;
  }
  state.students.forEach(s => {
    const complete = isCardInfoComplete(s);
    const label = document.createElement('label');
    label.title = complete ? 'Informations complètes' : 'Informations incomplètes';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = s.id;
    checkbox.checked = state.selectedStudentIds.has(s.id);
    checkbox.disabled = !complete;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.selectedStudentIds.add(s.id);
      else state.selectedStudentIds.delete(s.id);
      updateSelectionState();
    });
    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${s.last_name} ${s.first_name}`;
    const meta = document.createElement('span');
    meta.className = 'student-meta';
    meta.textContent = complete ? (s.card_print_count > 0 ? `v${s.card_print_count + 1}` : 'prêt') : 'incomplet';
    if (!complete) label.style.opacity = '0.6';
    label.appendChild(checkbox);
    label.appendChild(nameSpan);
    label.appendChild(meta);
    list.appendChild(label);
  });
  updateSelectionState();
}

function updateSelectionState() {
  const count = state.selectedStudentIds.size;
  const btn = $('cardsRequestPrintBtn');
  const renderBtn = $('cardsRenderBtn');
  btn.disabled = count === 0;
  renderBtn.disabled = count === 0;
  $('cardsSelectAll').checked = count > 0 && count === state.students.filter(s => isCardInfoComplete(s)).length;
  setStatus(count === 0 ? { type: 'empty', title: 'Aucune sélection', message: 'Sélectionnez un ou plusieurs élèves.', size: 'inline' } : `${count} élève(s) sélectionné(s).`);
}

function adaptClassForRenderer(cls) {
  return {
    id: cls.id,
    name: cls.name,
    cycle: cls.cycle_key === 'nursery' ? 'maternelle' : cls.cycle_key === 'primary' ? 'primaire' : 'secondaire',
    option: cls.option || '',
    teacher_id: cls.teacher_id,
    card_color: cls.card_color,
    card_color_soft: cls.card_color_soft,
    card_color_dark: cls.card_color_dark,
    card_pat: cls.card_pat,
    card_family: cls.card_family,
    card_variant: cls.card_variant,
    card_pat_style: cls.card_pat_style
  };
}

function adaptStudentForRenderer(s, cls) {
  const guards = state.guardians.get(s.id) || [];
  const primary = guards.find(g => g.is_primary) || guards[0];
  const authorized = guards.find(g => g.is_authorized_pickup && g.full_name !== primary?.full_name) || primary;
  return {
    id: s.id,
    name: `${s.first_name} ${s.middle_name ? s.middle_name + ' ' : ''}${s.last_name}`.trim(),
    mat: s.matricule,
    matricule: s.matricule,
    dob: s.date_of_birth,
    photo: s.photo_path,
    cid: cls.id,
    parent_name: primary?.full_name || null,
    parent_phone: primary?.phone || null,
    authorized_name: authorized?.full_name || null,
    authorized_phone: authorized?.phone || null
  };
}

async function renderPreviewForStudent(student) {
  if (!state.selectedClass || !student) return;
  const cls = adaptClassForRenderer(state.selectedClass);
  const adapted = adaptStudentForRenderer(student, state.selectedClass);
  const patStyle = $('cardsPatStyle').value;
  const teacher = { id: state.selectedClass.teacher_id, name: '—' };
  const container = $('cardsPreview');
  renderCardPreview(container, adapted, cls, teacher, state.currentYear, state.schoolInfo, state.schoolInfo?.logo_path, patStyle);
}

async function renderPreview() {
  if (!state.selectedClass) return;
  const selected = state.students.filter(s => state.selectedStudentIds.has(s.id));
  if (selected.length === 0) {
    setStatus({ type: 'error', title: 'Sélection requise', message: 'Sélectionnez au moins un élève.', size: 'inline' });
    return;
  }
  await renderPreviewForStudent(selected[0]);
  setStatus({ type: 'success', title: 'Aperçu prêt', message: `Aperçu de ${selected[0].first_name} ${selected[0].last_name}. ${selected.length > 1 ? `+ ${selected.length - 1} autre(s) sélectionné(s).` : ''}`, size: 'inline' });
}

async function generateCardPayload(student) {
  const cls = adaptClassForRenderer(state.selectedClass);
  const { type } = ssClassType(cls);
  const container = $('cardsPreview');
  const adapted = adaptStudentForRenderer(student, state.selectedClass);
  renderCardPreview(container, adapted, cls, { id: state.selectedClass.teacher_id, name: '—' }, state.currentYear, state.schoolInfo, state.schoolInfo?.logo_path, $('cardsPatStyle').value);
  await new Promise(r => setTimeout(r, 80));
  const wrapSelector = type === 'badge' ? '.ss-badge-wrap' : '.ss-carte-wrap';
  const frontDataUrl = await captureCardPng(container, wrapSelector + ' .art:first-child');
  const backDataUrl = await captureCardPng(container, wrapSelector + ' .art:last-child');
  return {
    student_id: student.id,
    format: type,
    front_image_base64: frontDataUrl,
    back_image_base64: backDataUrl,
    academic_year_id: state.academicYearId,
    metadata: {
      class_name: state.selectedClass.name,
      requested_at: new Date().toISOString()
    }
  };
}

async function requestPrintBatch() {
  const token = getToken();
  if (!token) {
    setStatus({ type: 'error', title: 'Connexion requise', message: 'Vous devez être connecté.', size: 'inline' });
    return;
  }
  const selected = state.students.filter(s => state.selectedStudentIds.has(s.id));
  if (selected.length === 0) {
    setStatus({ type: 'error', title: 'Sélection requise', message: 'Sélectionnez au moins un élève.', size: 'inline' });
    return;
  }

  setStatus({ type: 'loading', title: 'Génération en cours', message: `Génération de ${selected.length} carte(s)…`, size: 'inline' });
  const payloads = [];
  for (let i = 0; i < selected.length; i++) {
    try {
      const payload = await generateCardPayload(selected[i]);
      payloads.push(payload);
      setStatus({ type: 'loading', title: 'Génération en cours', message: `Génération ${i + 1}/${selected.length}…`, size: 'inline' });
    } catch (e) {
      setStatus({ type: 'error', title: 'Erreur de génération', message: `Erreur génération pour ${selected[i].first_name} ${selected[i].last_name} : ${e.message}`, size: 'inline' });
      return;
    }
  }

  setStatus({ type: 'loading', title: 'Envoi en cours', message: 'Envoi au VPS…', size: 'inline' });
  try {
    var submittedCount = 0;
    var failedCount = 0;
    for (var j = 0; j < payloads.length; j++) {
      try {
        var cardsApi = window.SchoolSafeCardsNativeAPI;
        if (!cardsApi) throw new Error('API cartes non disponible');
        var res = await cardsApi.submitPrintRequest(payloads[j]);
        if (res && res.data && res.data.status === 'submitted') submittedCount++;
        else failedCount++;
      } catch (e) {
        failedCount++;
        console.error('[cards] Erreur envoi ' + payloads[j].student_id + ': ' + e.message);
      }
      setStatus({ type: 'loading', title: 'Envoi en cours', message: 'Envoi ' + (j + 1) + '/' + payloads.length + '…', size: 'inline' });
    }
    setStatus({ type: 'success', title: 'Envoi terminé', message: 'Envoi terminé : ' + submittedCount + ' soumis, ' + failedCount + ' échec.', size: 'inline' });
    await loadStudents(state.selectedClass.id);
  } catch (e) {
    setStatus({ type: 'error', title: 'Erreur d\'envoi', message: 'Erreur envoi : ' + e.message, size: 'inline' });
  }
}

export function initCardsModule(options) {
  if (options?.apiBase) state.apiBase = options.apiBase;
  if (window.schoolSafeBackendConfig) {
    state.apiBase = window.schoolSafeBackendConfig.api_base || state.apiBase;
  }
  if (document.getElementById('navCards')?._cardsBound) return;

  const navCards = $('navCards');
  const studio = $('cardsStudio');
  const closeBtn = $('closeCardsStudio');
  const classSelect = $('cardsClassSelect');
  const renderBtn = $('cardsRenderBtn');
  const requestBtn = $('cardsRequestPrintBtn');
  const buildBatchBtn = $('cardsBuildBatchBtn');
  const selectAll = $('cardsSelectAll');

  if (!navCards || !studio || !closeBtn || !classSelect || !renderBtn || !requestBtn || !selectAll) {
    console.warn('[cards-module] Éléments du studio non disponibles — init différée.');
    // Correction : les éléments du studio n'existent qu'après connexion.
    // Observateur borné qui relance l'init UNE fois quand ils apparaissent,
    // au lieu d'abandonner silencieusement (le studio ne s'ouvrait jamais).
    if (!window.__cardsInitObserver) {
      window.__cardsInitObserver = new MutationObserver(() => {
        if (document.getElementById('navCards') && document.getElementById('cardsStudio') && document.getElementById('cardsRequestPrintBtn')) {
          window.__cardsInitObserver.disconnect();
          window.__cardsInitObserver = null;
          initCardsModule(options);
        }
      });
      window.__cardsInitObserver.observe(document.body, { childList: true, subtree: true });
    }
    return;
  }

  navCards.addEventListener('click', () => {
    studio.hidden = false;
    const grid = document.querySelector('.workspace-grid');
    const protectedEl = document.getElementById('cardsProtected');
    if (grid) grid.style.display = 'none';
    if (protectedEl) protectedEl.style.display = 'none';
    loadClasses();
    loadSchoolInfo();
  });

  closeBtn.addEventListener('click', () => {
    studio.hidden = true;
    const grid = document.querySelector('.workspace-grid');
    const protectedEl = document.getElementById('cardsProtected');
    if (grid) grid.style.display = '';
    if (protectedEl) protectedEl.style.display = '';
  });

  classSelect.addEventListener('change', async (e) => {
    const classId = e.target.value;
    state.selectedClass = state.classes.find(c => c.id === classId) || null;
    state.selectedStudentIds.clear();
    renderBtn.disabled = true;
    requestBtn.disabled = true;
    $('cardsPreview').innerHTML = window.ssState({ type: 'empty', title: 'Aucun aperçu', message: 'Sélectionnez un ou plusieurs élèves.', size: 'compact' });
    if (state.selectedClass) {
      await loadStudents(classId);
    } else {
      $('cardsStudentList').innerHTML = window.ssState({ type: 'empty', title: 'Aucune classe', message: 'Sélectionnez une classe.', size: 'compact' });
      selectAll.checked = false;
    }
  });

  selectAll.addEventListener('change', () => {
    const completeStudents = state.students.filter(s => isCardInfoComplete(s));
    if (selectAll.checked) {
      completeStudents.forEach(s => state.selectedStudentIds.add(s.id));
    } else {
      state.selectedStudentIds.clear();
    }
    renderStudentList();
  });

  renderBtn.addEventListener('click', renderPreview);
  requestBtn.addEventListener('click', requestPrintBatch);
  if (buildBatchBtn) buildBatchBtn.addEventListener('click', async () => {
    const cardsApi = window.SchoolSafeCardsNativeAPI;
    if (!cardsApi) { setStatus({ type: 'error', title: 'Erreur', message: 'API cartes non disponible.', size: 'inline' }); return; }
    setStatus({ type: 'loading', title: 'Lot en préparation', message: 'Regroupement des cartes en ZIP…', size: 'inline' });
    try {
      const res = await cardsApi.buildBatch({ status: 'submitted' });
      const d = res && res.data;
      if (!d) throw new Error('Réponse serveur invalide');
      setStatus({
        type: 'success',
        title: 'Lot ZIP prêt',
        message: `Lot ${d.batch_id} v${d.version} — ${d.card_count} carte(s), ZIP SHA-256 ${String(d.zip_sha256 || '').slice(0, 12)}…, valable pour Control.`,
        size: 'inline'
      });
    } catch (e) {
      setStatus({ type: 'error', title: 'Erreur de lot', message: 'Erreur préparation lot : ' + e.message, size: 'inline' });
    }
  });
  // ————— Lot 2 : cycle de vie perte/vol —————
  function selectedSingleStudent() {
    const ids = Array.from(state.selectedStudentIds);
    if (ids.length !== 1) return null;
    return state.students.find(s => s.id === ids[0]) || null;
  }

  function requireCardsApi() {
    const cardsApi = window.SchoolSafeCardsNativeAPI;
    if (!cardsApi) setStatus({ type: 'error', title: 'Erreur', message: 'API cartes non disponible.', size: 'inline' });
    return cardsApi || null;
  }

  const lossReportBtn = $('cardsLossReportBtn');
  if (lossReportBtn) lossReportBtn.addEventListener('click', async () => {
    const cardsApi = requireCardsApi(); if (!cardsApi) return;
    const student = selectedSingleStudent();
    if (!student) { setStatus({ type: 'error', title: 'Sélection requise', message: 'Sélectionnez exactement un élève pour signaler une perte/vol.', size: 'inline' }); return; }
    const reason = window.prompt('Motif du signalement (perte ou vol) :');
    if (!reason || reason.trim().length < 3) return;
    setStatus({ type: 'loading', title: 'Signalement', message: 'Suspension de la carte…', size: 'inline' });
    try {
      const res = await cardsApi.lossReport({ student_id: student.id, reason: reason.trim() });
      const d = res && res.data;
      setStatus({ type: 'success', title: 'Carte suspendue', message: `Carte ${d && d.card_number} passée en statut ${d && d.status} — l'ancien QR est refusé dès maintenant.`, size: 'inline' });
    } catch (e) {
      setStatus({ type: 'error', title: 'Erreur signalement', message: 'Erreur signalement : ' + e.message, size: 'inline' });
    }
  });

  const replaceBtn = $('cardsReplaceBtn');
  if (replaceBtn) replaceBtn.addEventListener('click', async () => {
    const cardsApi = requireCardsApi(); if (!cardsApi) return;
    const student = selectedSingleStudent();
    if (!student) { setStatus({ type: 'error', title: 'Sélection requise', message: 'Sélectionnez exactement un élève pour remplacer sa carte.', size: 'inline' }); return; }
    const reason = window.prompt('Motif du remplacement :');
    if (!reason || reason.trim().length < 3) return;
    const cardId = window.prompt('Identifiant de la carte à remplacer (card_id) :');
    if (!cardId) return;
    setStatus({ type: 'loading', title: 'Remplacement', message: 'Révocation et émission de la nouvelle carte…', size: 'inline' });
    try {
      const res = await cardsApi.replaceCard({ student_id: student.id, old_card_id: cardId, reason: reason.trim() });
      const d = res && res.data;
      setStatus({ type: 'success', title: 'Carte remplacée', message: `Nouvelle carte ${d && d.card_number} active ; ancienne révoquée.`, size: 'inline' });
    } catch (e) {
      setStatus({ type: 'error', title: 'Erreur remplacement', message: 'Erreur remplacement : ' + e.message, size: 'inline' });
    }
  });

  const reprintBtn = $('cardsReprintBtn');
  if (reprintBtn) reprintBtn.addEventListener('click', async () => {
    const cardsApi = requireCardsApi(); if (!cardsApi) return;
    const cardId = window.prompt('Identifiant de la carte à réimprimer (card_id) — support détruit/récupéré requis :');
    if (!cardId) return;
    const reason = window.prompt('Motif de la réimpression contrôlée :');
    if (!reason || reason.trim().length < 3) return;
    setStatus({ type: 'loading', title: 'Réimpression', message: 'Autorisation de réimpression…', size: 'inline' });
    try {
      const res = await cardsApi.reprintAuthorize({ card_id: cardId, reason: reason.trim() });
      const d = res && res.data;
      setStatus({ type: 'success', title: 'Réimpression autorisée', message: `Carte ${d && d.card_number} — même credential, réimpression tracée.`, size: 'inline' });
    } catch (e) {
      setStatus({ type: 'error', title: 'Erreur réimpression', message: 'Erreur réimpression : ' + e.message, size: 'inline' });
    }
  });

  const distributeBtn = $('cardsDistributeBtn');
  if (distributeBtn) distributeBtn.addEventListener('click', async () => {
    const cardsApi = requireCardsApi(); if (!cardsApi) return;
    const cardId = window.prompt('Identifiant de la carte distribuée à l\'élève (card_id) :');
    if (!cardId) return;
    if (!window.confirm('Confirmer la remise physique de cette carte à l\'élève ?')) return;
    setStatus({ type: 'loading', title: 'Distribution', message: 'Enregistrement de la remise…', size: 'inline' });
    try {
      await cardsApi.markDistributed({ card_id: cardId });
      setStatus({ type: 'success', title: 'Distribution confirmée', message: 'Remise de la carte à l\'élève enregistrée.', size: 'inline' });
    } catch (e) {
      setStatus({ type: 'error', title: 'Erreur distribution', message: 'Erreur distribution : ' + e.message, size: 'inline' });
    }
  });

  navCards._cardsBound = true;
}

window.SchoolSafeCards = { init: initCardsModule };
