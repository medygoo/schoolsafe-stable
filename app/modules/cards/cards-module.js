// SchoolSafe V2 — Module de production de cartes élèves dans le workspace.
// Pipeline complet : projection serveur unique → readiness → credential QR
// sécurisé (contrat Sécurité) → recto/verso PNG HD → ZIP téléchargeable.
// Aucune dépendance à SchoolSafe Control dans ce flux.
import { renderCardPreview, captureCardPng, ssClassType } from './card-renderer.js';

const state = {
  classes: [],
  students: [],
  projections: new Map(),
  selectedClass: null,
  selectedStudentIds: new Set(),
  currentYear: '',
  academicYearId: null,
  schoolInfo: null,
  lastGenerated: null,
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

async function loadClasses() {
  try {
    var res = await nativeApi('/pedagogy/classes');
    var classesData = (res && res.data) || [];

    // Design patrimonial des classes (couleurs, patrimoine) — le titulaire
    // réel vient de la projection carte, jamais de ce cache de design.
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

/**
 * Projection carte : UNE seule requête métier par élève (source de vérité
 * serveur). Retourne élève/école/classe/année/titulaire/Parent/autorisations.
 */
async function loadStudentProjection(studentId) {
  if (state.projections.has(studentId)) return state.projections.get(studentId);
  var res = await nativeApi('/cards/students/' + encodeURIComponent(studentId) + '/card-projection');
  var projection = res && res.data ? res.data : null;
  if (projection) {
    state.projections.set(studentId, projection);
  }
  return projection;
}

async function loadStudents(classId) {
  try {
    var res = await nativeApi('/students?class_id=' + encodeURIComponent(classId) + '&status=active');
    var studentsData = (res && res.data) || [];
    var rows = studentsData && studentsData.rows ? studentsData.rows : studentsData;
    state.students = (rows || []).map(function (s) {
      return {
        id: s.id,
        matricule: s.matricule,
        first_name: s.first_name,
        middle_name: s.middle_name || null,
        last_name: s.last_name,
        date_of_birth: s.date_of_birth || null,
        photo_path: s.photo_path || null,
        card_print_count: s.card_print_count || 0
      };
    });
    state.projections.clear();
    state.selectedStudentIds.clear();
    renderStudentList();
    $('cardsRenderBtn').disabled = state.students.length === 0;
    $('cardsRequestPrintBtn').disabled = true;
    var downloadBtn = $('cardsDownloadBtn');
    if (downloadBtn) downloadBtn.disabled = true;
    $('cardsPreview').innerHTML = window.ssState({ type: 'empty', title: 'Aucun aperçu', message: 'Sélectionnez un ou plusieurs élèves.', size: 'compact' });
  } catch (e) {
    setStatus({ type: 'error', title: 'Erreur de chargement', message: 'Erreur chargement élèves : ' + e.message, size: 'inline' });
  }
}

async function loadSchoolInfo() {
  // L'identité école affichée vient de la projection carte du premier élève
  // chargé (source de vérité app.schools + app.school_contacts). En attendant
  // une projection, aucun texte inventé n'est affiché.
  return null;
}

function projectionReadiness(projection) {
  if (!projection) return { ready: false, missing: ['projection'] };
  if (projection.readiness) return projection.readiness;
  return { ready: true, missing: [] };
}

function renderStudentList() {
  const list = $('cardsStudentList');
  list.innerHTML = '';
  if (state.students.length === 0) {
    list.innerHTML = window.ssState({ type: 'empty', title: 'Aucun élève', message: 'Aucun élève dans cette classe.', size: 'compact' });
    return;
  }
  state.students.forEach(s => {
    const projection = state.projections.get(s.id);
    const ready = projection ? projectionReadiness(projection).ready : (s.matricule && s.photo_path);
    const label = document.createElement('label');
    label.title = ready ? 'Prêt pour la carte' : 'Informations incomplètes';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = s.id;
    checkbox.checked = state.selectedStudentIds.has(s.id);
    checkbox.disabled = false;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.selectedStudentIds.add(s.id);
      else state.selectedStudentIds.delete(s.id);
      updateSelectionState();
    });
    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${s.last_name} ${s.first_name}`;
    const meta = document.createElement('span');
    meta.className = 'student-meta';
    meta.textContent = ready ? (s.card_print_count > 0 ? `v${s.card_print_count + 1}` : 'prêt') : 'incomplet';
    if (!ready) label.style.opacity = '0.6';
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
  $('cardsSelectAll').checked = count > 0 && count === state.students.length;
  setStatus(count === 0 ? { type: 'empty', title: 'Aucune sélection', message: 'Sélectionnez un ou plusieurs élèves.', size: 'inline' } : `${count} élève(s) sélectionné(s).`);
}

function adaptClassForRenderer(cls) {
  return {
    id: cls.id,
    name: cls.name,
    cycle: cls.cycle_key === 'nursery' ? 'maternelle' : cls.cycle_key === 'primary' ? 'primaire' : 'secondaire',
    option: cls.option || '',
    card_color: cls.card_color,
    card_color_soft: cls.card_color_soft,
    card_color_dark: cls.card_color_dark,
    card_pat: cls.card_pat,
    card_family: cls.card_family,
    card_variant: cls.card_variant,
    card_pat_style: cls.card_pat_style
  };
}

/**
 * Adapte la PROJECTION SERVEUR (source de vérité) pour le renderer.
 * Toutes les données affichées viennent de cette projection — jamais d'un
 * assemblage local d'hypothèses.
 */
function adaptProjectionForRenderer(projection) {
  const student = projection.student || {};
  const school = projection.school || {};
  const cls = projection.class || {};
  const teacher = projection.teacher || {};
  const year = projection.academic_year || {};
  const guardian = projection.primary_guardian || null;
  const authorized = Array.isArray(projection.authorized_persons) ? projection.authorized_persons : [];
  const fullName = [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(' ');
  return {
    id: student.id,
    name: fullName,
    mat: student.matricule,
    matricule: student.matricule,
    dob: student.date_of_birth,
    photo: student.photo_path,
    cid: cls.id,
    parent_name: guardian ? guardian.full_name : null,
    parent_phone: guardian ? guardian.phone : null,
    primary_guardian_type: guardian ? guardian.guardian_type : null,
    authorized_persons: authorized.map(function (person) {
      return {
        full_name: person.full_name,
        guardian_type: person.guardian_type || '',
        phone: person.phone || null
      };
    }),
    authorized_name: authorized.length ? authorized[0].full_name : null,
    authorized_phone: authorized.length ? authorized[0].phone : null
  };
}

/**
 * Construit les données de rendu depuis la projection. Utilisé quand la
 * projection n'a pas encore été chargée (aperçu avant sélection précise).
 */
async function resolveRenderData(student) {
  const projection = await loadStudentProjection(student.id);
  if (!projection) {
    throw new Error('Projection carte indisponible pour cet élève');
  }
  return projection;
}

async function renderPreviewForStudent(student) {
  if (!state.selectedClass || !student) return;
  const projection = await resolveRenderData(student);
  const readiness = projectionReadiness(projection);
  const cls = adaptClassForRenderer({
    id: projection.class.id || state.selectedClass.id,
    name: projection.class.name || state.selectedClass.name,
    cycle_key: projection.class.cycle_key || state.selectedClass.cycle_key,
    option: projection.class.option,
    card_color: projection.class.card_color || state.selectedClass.card_color,
    card_color_soft: projection.class.card_color_soft || state.selectedClass.card_color_soft,
    card_color_dark: projection.class.card_color_dark || state.selectedClass.card_color_dark,
    card_pat: projection.class.card_pat || state.selectedClass.card_pat,
    card_family: projection.class.card_family || state.selectedClass.card_family,
    card_variant: projection.class.card_variant || state.selectedClass.card_variant,
    card_pat_style: projection.class.card_pat_style || state.selectedClass.card_pat_style
  });
  const adapted = adaptProjectionForRenderer(projection);
  const patStyle = $('cardsPatStyle').value;
  // Titulaire réel : nom résolu serveur via app.classes.teacher_profile_id.
  const teacher = { id: projection.teacher.id, name: projection.teacher.name || '—' };
  const yearLabel = (projection.academic_year && projection.academic_year.label) || state.currentYear;
  const schoolInfo = {
    name: projection.school.name,
    name_en: projection.school.name_en,
    address: projection.school.address,
    phone: projection.school.phone,
    email: projection.school.email,
    motto: projection.school.motto,
    website: projection.school.website_url
  };
  const logo = projection.school.logo_path || '';
  // Credential QR sécurisé (contrat Sécurité) si une carte active existe déjà ;
  // sinon l'aperçu utilise un identifiant neutre et l'émission se fait au moment
  // de la génération du package (credential calculé côté serveur uniquement).
  const activeCard = projection.active_card || null;
  const qrPayload = activeCard
    ? `schoolsafe://card/${activeCard.card_number}/${activeCard.signature}`
    : null;
  const container = $('cardsPreview');
  const result = renderCardPreview(container, adapted, cls, teacher, yearLabel, schoolInfo, logo, patStyle, qrPayload);
  state.lastRendered = { studentId: student.id, type: result.type, qr: result.qr, projection, cls: state.selectedClass };

  const downloadBtn = $('cardsDownloadBtn');
  if (downloadBtn) downloadBtn.disabled = !readiness.ready;
  if (!readiness.ready) {
    setStatus({ type: 'warning', title: 'Dossier incomplet', message: 'CARD_NOT_READY — manquant : ' + readiness.missing.join(', '), size: 'inline' });
  } else {
    setStatus({ type: 'success', title: 'Aperçu prêt', message: `${student.first_name} ${student.last_name} — titulaire : ${teacher.name}.`, size: 'inline' });
  }
}

async function renderPreview() {
  if (!state.selectedClass) return;
  const selected = state.students.filter(s => state.selectedStudentIds.has(s.id));
  if (selected.length === 0) {
    setStatus({ type: 'error', title: 'Sélection requise', message: 'Sélectionnez au moins un élève.', size: 'inline' });
    return;
  }
  await renderPreviewForStudent(selected[0]);
}

async function generateCardPayload(student) {
  const projection = await resolveRenderData(student);
  const readiness = projectionReadiness(projection);
  if (!readiness.ready) {
    throw new Error('CARD_NOT_READY missing=[' + readiness.missing.join(',') + ']');
  }
  const renderData = state.lastRendered && state.lastRendered.studentId === student.id
    ? state.lastRendered
    : null;
  const cls = adaptClassForRenderer(state.selectedClass);
  const { type } = ssClassType(cls);
  const container = $('cardsPreview');
  const adapted = adaptProjectionForRenderer(projection);
  const teacher = { id: projection.teacher.id, name: projection.teacher.name || '—' };
  const yearLabel = (projection.academic_year && projection.academic_year.label) || state.currentYear;
  const schoolInfo = {
    name: projection.school.name,
    name_en: projection.school.name_en,
    address: projection.school.address,
    phone: projection.school.phone,
    email: projection.school.email,
    motto: projection.school.motto,
    website: projection.school.website_url
  };
  const qrPayload = projection.active_card
    ? `schoolsafe://card/${projection.active_card.card_number}/${projection.active_card.signature}`
    : null;
  renderCardPreview(container, adapted, cls, teacher, yearLabel, schoolInfo, projection.school.logo_path || '', $('cardsPatStyle').value, qrPayload);
  await new Promise(r => setTimeout(r, 80));
  const wrapSelector = type === 'badge' ? '.ss-badge-wrap' : '.ss-carte-wrap';
  const frontDataUrl = await captureCardPng(container, wrapSelector + ' .art:first-child');
  const backDataUrl = await captureCardPng(container, wrapSelector + ' .art:last-child');
  return {
    student_id: student.id,
    format: type,
    front_image_base64: frontDataUrl,
    back_image_base64: backDataUrl,
    academic_year_id: projection.academic_year ? projection.academic_year.id : state.academicYearId,
    metadata: {
      class_name: (projection.class && projection.class.name) || state.selectedClass.name,
      requested_at: new Date().toISOString()
    }
  };
}

/**
 * Génération du package individuel : le serveur vérifie le readiness,
 * émet/réutilise le credential QR signé et renvoie le ZIP
 * Carte_<MATRICULE>_<NOM>_<PRENOM>.zip (recto.png, verso.png, manifest.json).
 */
async function downloadSelectedCard() {
  const cardsApi = window.SchoolSafeCardsNativeAPI;
  if (!cardsApi) { setStatus({ type: 'error', title: 'Erreur', message: 'API cartes non disponible.', size: 'inline' }); return; }
  const selected = state.students.filter(s => state.selectedStudentIds.has(s.id));
  if (selected.length === 0) {
    setStatus({ type: 'error', title: 'Sélection requise', message: 'Sélectionnez au moins un élève.', size: 'inline' });
    return;
  }
  const student = selected[0];
  setStatus({ type: 'loading', title: 'Génération en cours', message: 'Préparation de la carte de ' + student.first_name + '…', size: 'inline' });
  try {
    const payload = await generateCardPayload(student);
    const blob = await cardsApi.downloadCardPackage(student.id, {
      recto_png_base64: payload.front_image_base64,
      verso_png_base64: payload.back_image_base64
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = cardsApi.lastPackageFilename || 'Carte.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    state.lastGenerated = { studentId: student.id, filename: cardsApi.lastPackageFilename };
    setStatus({ type: 'success', title: 'ZIP prêt', message: 'Carte ' + (cardsApi.lastPackageFilename || '') + ' générée — le téléchargement démarre. Si le navigateur le bloque, utilisez le bouton Télécharger la carte.', size: 'inline' });
  } catch (e) {
    var message = e && e.message ? e.message : String(e);
    if (/CARD_NOT_READY/.test(message)) {
      var missingPart = message.match(/missing=\[([^\]]*)\]/);
      setStatus({ type: 'warning', title: 'Carte refusée — dossier incomplet', message: 'CARD_NOT_READY : ' + (missingPart ? missingPart[1] : 'données manquantes') + '. Complétez le dossier élève puis régénérez.', size: 'inline' });
    } else {
      setStatus({ type: 'error', title: 'Erreur de génération', message: message, size: 'inline' });
    }
  }
}

async function requestPrintBatch() {
  const selected = state.students.filter(s => state.selectedStudentIds.has(s.id));
  if (selected.length === 0) {
    setStatus({ type: 'error', title: 'Sélection requise', message: 'Sélectionnez au moins un élève.', size: 'inline' });
    return;
  }

  setStatus({ type: 'loading', title: 'Génération en cours', message: `Génération de ${selected.length} carte(s)…`, size: 'inline' });
  const payloads = [];
  let notReady = [];
  for (let i = 0; i < selected.length; i++) {
    try {
      const payload = await generateCardPayload(selected[i]);
      payloads.push(payload);
      setStatus({ type: 'loading', title: 'Génération en cours', message: `Génération ${i + 1}/${selected.length}…`, size: 'inline' });
    } catch (e) {
      if (/CARD_NOT_READY/.test(e.message)) {
        notReady.push(selected[i].last_name + ' ' + selected[i].first_name);
      } else {
        setStatus({ type: 'error', title: 'Erreur de génération', message: `Erreur génération pour ${selected[i].first_name} ${selected[i].last_name} : ${e.message}`, size: 'inline' });
        return;
      }
    }
  }
  if (notReady.length) {
    setStatus({ type: 'warning', title: 'Élèves incomplets ignorés', message: 'CARD_NOT_READY : ' + notReady.join(', '), size: 'inline' });
    if (payloads.length === 0) return;
  }

  setStatus({ type: 'loading', title: 'Envoi en cours', message: 'Génération serveur…', size: 'inline' });
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
    setStatus({ type: 'success', title: 'Terminé', message: 'Génération terminée : ' + submittedCount + ' carte(s) générée(s), ' + failedCount + ' échec(s).' + (notReady.length ? ' Élèves incomplets ignorés : ' + notReady.join(', ') + '.' : ''), size: 'inline' });
    await loadStudents(state.selectedClass.id);
  } catch (e) {
    setStatus({ type: 'error', title: 'Erreur', message: 'Erreur d\'envoi : ' + e.message, size: 'inline' });
  }
}

/**
 * Ouvre le studio cartes et masque le dashboard. Les DEUX grilles
 * (#ecosystemGrid desktop et #ecosystemGridMobile) pointent vers ici.
 */
function openCardsStudio() {
  const studio = $('cardsStudio');
  if (!studio) return;
  studio.hidden = false;
  const grid = document.querySelector('.workspace-grid');
  const protectedEl = document.getElementById('cardsProtected');
  if (grid) grid.style.display = 'none';
  if (protectedEl) protectedEl.style.display = 'none';
  window.scrollTo({ top: 0 });
  loadClasses();
}

/** Ferme le studio et ramène au dashboard. */
function closeCardsStudio() {
  const studio = $('cardsStudio');
  if (!studio) return;
  studio.hidden = true;
  const grid = document.querySelector('.workspace-grid');
  const protectedEl = document.getElementById('cardsProtected');
  if (grid) grid.style.display = '';
  if (protectedEl) protectedEl.style.display = '';
}

export function initCardsModule(options) {
  if (options?.apiBase) state.apiBase = options.apiBase;
  if (window.schoolSafeBackendConfig) {
    state.apiBase = window.schoolSafeBackendConfig.api_base || state.apiBase;
  }
  if (document.body.dataset.cardsStudioBound === 'true') return;

  const studio = $('cardsStudio');
  const closeBtn = $('closeCardsStudio');
  const classSelect = $('cardsClassSelect');
  const renderBtn = $('cardsRenderBtn');
  const requestBtn = $('cardsRequestPrintBtn');
  const selectAll = $('cardsSelectAll');
  const downloadBtn = $('cardsDownloadBtn');

  if (!studio || !closeBtn || !classSelect || !renderBtn || !requestBtn || !selectAll) {
    console.warn('[cards-module] Éléments du studio non disponibles — init différée.');
    if (!window.__cardsInitObserver) {
      window.__cardsInitObserver = new MutationObserver(() => {
        if (document.getElementById('cardsStudio') && document.getElementById('cardsRequestPrintBtn')) {
          window.__cardsInitObserver.disconnect();
          window.__cardsInitObserver = null;
          initCardsModule(options);
        }
      });
      window.__cardsInitObserver.observe(document.body, { childList: true, subtree: true });
    }
    return;
  }

  // Accès studio : les boutons « Cartes élèves » des deux grilles écosystème.
  // Aucune dépendance à un #navCards inexistant ; les clics Cartes n'ouvrent
  // plus jamais le module Sécurité.
  document.querySelectorAll('#ecosystemGrid [data-ecosystem="cards"], #ecosystemGridMobile [data-ecosystem="cards"]').forEach((button) => {
    if (button.dataset.cardsBound === 'true') return;
    button.dataset.cardsBound = 'true';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openCardsStudio();
    });
  });

  closeBtn.addEventListener('click', closeCardsStudio);

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
    if (selectAll.checked) {
      state.students.forEach(s => state.selectedStudentIds.add(s.id));
    } else {
      state.selectedStudentIds.clear();
    }
    renderStudentList();
  });

  renderBtn.addEventListener('click', renderPreview);
  requestBtn.addEventListener('click', requestPrintBatch);
  if (downloadBtn) downloadBtn.addEventListener('click', downloadSelectedCard);
  if (buildBatchButton()) buildBatchButton().addEventListener('click', downloadClassBatch);

  // ————— Cycle de vie perte/vol (conservé ; aucune référence Control) —————
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
    const projection = await loadStudentProjection(student.id);
    const cardId = projection && projection.active_card ? projection.active_card.id : null;
    if (!cardId) { setStatus({ type: 'error', title: 'Aucune carte active', message: 'Cet élève n\'a pas de carte active à remplacer.', size: 'inline' }); return; }
    setStatus({ type: 'loading', title: 'Remplacement', message: 'Révocation et émission de la nouvelle carte…', size: 'inline' });
    try {
      const res = await cardsApi.replaceCard({ student_id: student.id, old_card_id: cardId, reason: reason.trim() });
      const d = res && res.data;
      state.projections.delete(student.id);
      setStatus({ type: 'success', title: 'Carte remplacée', message: `Nouvelle carte ${d && d.card_number} active ; ancienne révoquée.`, size: 'inline' });
    } catch (e) {
      setStatus({ type: 'error', title: 'Erreur remplacement', message: 'Erreur remplacement : ' + e.message, size: 'inline' });
    }
  });

  const reprintBtn = $('cardsReprintBtn');
  if (reprintBtn) reprintBtn.addEventListener('click', async () => {
    const cardsApi = requireCardsApi(); if (!cardsApi) return;
    const student = selectedSingleStudent();
    if (!student) { setStatus({ type: 'error', title: 'Sélection requise', message: 'Sélectionnez exactement un élève pour réimprimer sa carte.', size: 'inline' }); return; }
    const projection = await loadStudentProjection(student.id);
    const cardId = projection && projection.active_card ? projection.active_card.id : null;
    if (!cardId) { setStatus({ type: 'error', title: 'Aucune carte active', message: 'Cet élève n\'a pas de carte active à réimprimer.', size: 'inline' }); return; }
    const reason = window.prompt('Motif de la réimpression contrôlée (support détruit/récupéré) :');
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
    const student = selectedSingleStudent();
    if (!student) { setStatus({ type: 'error', title: 'Sélection requise', message: 'Sélectionnez exactement un élève pour confirmer la remise de sa carte.', size: 'inline' }); return; }
    const projection = await loadStudentProjection(student.id);
    const cardId = projection && projection.active_card ? projection.active_card.id : null;
    if (!cardId) { setStatus({ type: 'error', title: 'Aucune carte active', message: 'Cet élève n\'a pas de carte active à distribuer.', size: 'inline' }); return; }
    if (!window.confirm('Confirmer la remise physique de cette carte à l\'élève ?')) return;
    setStatus({ type: 'loading', title: 'Distribution', message: 'Enregistrement de la remise…', size: 'inline' });
    try {
      await cardsApi.markDistributed({ card_id: cardId });
      setStatus({ type: 'success', title: 'Distribution confirmée', message: 'Remise de la carte à l\'élève enregistrée.', size: 'inline' });
    } catch (e) {
      setStatus({ type: 'error', title: 'Erreur distribution', message: 'Erreur distribution : ' + e.message, size: 'inline' });
    }
  });

  document.body.dataset.cardsStudioBound = 'true';
}

/** Lot de classe : ZIP Cartes_<CLASSE>_<ANNEE>.zip via l'API native. */
async function downloadClassBatch() {
  const cardsApi = window.SchoolSafeCardsNativeAPI;
  if (!cardsApi) { setStatus({ type: 'error', title: 'Erreur', message: 'API cartes non disponible.', size: 'inline' }); return; }
  if (!state.selectedClass) {
    setStatus({ type: 'error', title: 'Classe requise', message: 'Sélectionnez une classe pour préparer le lot.', size: 'inline' });
    return;
  }
  setStatus({ type: 'loading', title: 'Lot en préparation', message: 'Regroupement des cartes en ZIP…', size: 'inline' });
  try {
    const res = await cardsApi.buildBatch({ status: 'submitted' });
    const d = res && res.data;
    if (!d) throw new Error('Réponse serveur invalide');
    setStatus({
      type: 'success',
      title: 'Lot ZIP prêt',
      message: `Lot ${d.batch_id} v${d.version} — ${d.card_count} carte(s), ZIP SHA-256 ${String(d.zip_sha256 || '').slice(0, 12)}…, disponible dans le stockage sécurisé de l'école.`,
      size: 'inline'
    });
  } catch (e) {
    setStatus({ type: 'error', title: 'Erreur de lot', message: 'Erreur préparation lot : ' + e.message, size: 'inline' });
  }
}

function buildBatchButton() { return $('cardsBuildBatchBtn'); }

window.SchoolSafeCards = {
  init: initCardsModule,
  open: openCardsStudio,
  close: closeCardsStudio
};
