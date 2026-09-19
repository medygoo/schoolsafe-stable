// SchoolSafe V2 — Moteur de rendu des cartes élèves
// Adapté du moteur historique. Le nom d'origine ne doit pas apparaître.

import {
  CARD_FAMILIES,
  CARD_FAMILY_VARIANTS,
  CARD_PALETTE,
  ALL_PATRIMOINS
} from './assets/card-data.js';

const _ssCARDS = {
  FAMS: CARD_FAMILIES,
  FVARS: CARD_FAMILY_VARIANTS,
  CCOLS: CARD_PALETTE,
  PATS: ALL_PATRIMOINS.map(p => ({ v: p.value, n: p.name }))
};

const SS_LOGO_SRC = '/schoolsafe-logo.png';
const ssLogoBadge = `<img src="${SS_LOGO_SRC}" alt="SchoolSafe" style="height:18px;width:auto;object-fit:contain;filter:brightness(0) invert(1)">`;
const ssLogoCarte = `<img src="${SS_LOGO_SRC}" alt="SchoolSafe" style="height:16px;width:auto;object-fit:contain;filter:brightness(0) invert(1)">`;

export function esc(s) {
  const d = document.createElement('div');
  d.textContent = (s == null ? '' : String(s));
  return d.innerHTML;
}

export function ssClassType(cl) {
  if (!cl) return { type: 'badge', colorIdx: 3, col: null };
  const cycle = cl.cycle || '', name = (cl.name || '').toLowerCase();
  let type = 'badge', colorIdx = 3;
  if (cycle === 'maternelle') {
    let ci = 2;
    if (name.includes('petite')) ci = 0;
    else if (name.includes('moyenne')) ci = 1;
    type = 'badge'; colorIdx = ci;
  } else if (cycle === 'humanites' || cycle === 'secondaire') {
    type = 'carte'; colorIdx = 9;
  } else {
    if (/\b5[eè°]/.test(name) || name.startsWith('5')) { type = 'carte'; colorIdx = 7; }
    else if (/\b6[eè°]/.test(name) || name.startsWith('6')) { type = 'carte'; colorIdx = 8; }
    else if (/\b1[eè°]/.test(name) || name.startsWith('1')) { type = 'badge'; colorIdx = 3; }
    else if (/\b2[eè°]/.test(name) || name.startsWith('2')) { type = 'badge'; colorIdx = 4; }
    else if (/\b3[eè°]/.test(name) || name.startsWith('3')) { type = 'badge'; colorIdx = 5; }
    else if (/\b4[eè°]/.test(name) || name.startsWith('4')) { type = 'badge'; colorIdx = 6; }
  }
  const col = cl.card_color
    ? { cc: cl.card_color, soft: cl.card_color_soft || '#e5e8eb', dark: cl.card_color_dark || '#1c242c' }
    : null;
  return { type, colorIdx, col };
}

export function ssGetPat(which, cardFamily, colorIdx) {
  const { PATS, FAMS } = _ssCARDS;
  const fIdx = Math.max(0, FAMS.findIndex(f => f.id === (cardFamily || 'A')));
  const cIdx = colorIdx || 3;
  return PATS[(fIdx * 13 + cIdx * 7 + (which === 'carte' ? 31 : 0)) % PATS.length];
}

export function ssGetClassPat(cl, which) {
  if (cl && cl.card_pat && cl.card_pat !== 'auto') {
    const found = (_ssCARDS.PATS || []).find(p => p.v === cl.card_pat);
    if (found) return found;
  }
  const { type, colorIdx, col } = ssClassType(cl);
  return ssGetPat(which, cl?.card_family, colorIdx);
}

export function ssPatEl(p, size, center) {
  const px = p.v.startsWith('min-') ? 'PIERRE PRÉCIEUSE · ' : '';
  return `<div class="pat${center ? ' center' : ''}"><img style="width:${size}px;height:${size}px" src="modules/cards/assets/patrimoine/${esc(p.v)}.png" alt="${esc(p.n)}" onerror="this.style.visibility='hidden'"><span class="nm2">${esc((px + p.n).toUpperCase())}</span></div>`;
}

export function ssVeil(p, show) {
  if (!show) return '';
  const sl = p.v;
  const pos = sl.startsWith('min-') ? 'center' : 'center 12%';
  const sz = sl.startsWith('min-') ? 'cover' : '160%';
  return `<div class="patveil active" style="background-image:url('modules/cards/assets/patrimoine/${esc(sl)}.png');background-position:${pos};background-size:${sz}"></div>`;
}

export function ssGenQR(elId, data, size) {
  const el = document.getElementById(elId);
  if (!el || typeof window.QRCode !== 'function') return;
  el.innerHTML = '';
  try {
    new window.QRCode(el, { text: data, width: size || 76, height: size || 76, colorDark: '#17203a', colorLight: '#ffffff' });
  } catch (e) {}
}

export function ssBuildBadge(s, cl, teacher, year, patB, patStyle, schoolInfo, logo) {
  const showFond = patStyle === 'fond' || patStyle === 'both';
  const showVig = patStyle === 'vignette' || patStyle === 'both';
  const sc = schoolInfo || {}, logoSrc = logo || '';
  const snm = sc.name || "NOM DE L'ÉCOLE", clNm = cl ? cl.name : '—';
  const dob = s.dob ? s.dob.split('-').reverse().join('/') : '—';
  const tchr = teacher ? teacher.name : '—';
  const addr = sc.address || '', phone = sc.phone || '—', email = sc.email || '—', site = sc.website || sc.site || '';
  const parNm = s.parent_name || s.nom_papa || s.nom_maman || '—';
  const parPh = s.parent_phone || '—';
  const apNm = s.authorized_name || '—', apPh = s.authorized_phone || '—';
  const mat = s.mat || s.matricule || s.id || '000';
  const pts = (s.name || '').trim().split(/\s+/);
  const n1 = pts[0] || '—', n2 = pts[1] || '', n3 = pts.slice(2).join(' ') || '';
  const sz = snm.length > 32 ? '11px' : snm.length > 22 ? '13px' : '15.5px';
  const logoH = logoSrc
    ? `<div class="logo-slot" style="border:none;background:transparent;padding:0"><img src="${logoSrc}" alt=""></div>`
    : '<div class="logo-slot"><span style="font-size:15px">🏫</span><span>LOGO<br>ÉCOLE</span></div>';
  const slg = sc.motto || sc.slogan || (logoSrc ? '' : (sc.name_en || sc.sub || ''));
  const px = patB.v.startsWith('min-') ? 'PIERRE PRÉCIEUSE · ' : '';
  const vigEl = showVig ? ssPatEl(patB, 52, true) : '';
  const nmEl = `<div class="pat center" style="margin:0"><span class="nm2">${esc((px + patB.n).toUpperCase())}</span></div>`;
  const bottomEl = showVig ? vigEl : (showFond ? nmEl : '');
  const rectoOverlay = bottomEl ? `<div style="position:absolute;bottom:58px;left:50%;transform:translateX(-50%);z-index:10;pointer-events:none">${bottomEl}</div>` : '';

  const recto = `<div class="art badge" id="ss-br">
  <div class="head">
    <div class="arc"><i></i><i></i><i></i><i></i><i></i></div>
    <div class="head-row">${logoH}<div class="school"><div class="rdc">Rép. Démocratique du Congo</div><div class="nm" style="font-size:${sz}">${esc(snm)}</div>${slg ? `<div class="slg">${esc(slg)}</div>` : ''}</div><div class="flag"></div></div>
    <div class="rolebar">BADGE ÉLÈVE</div>
  </div>
  <div class="bodyz">
    ${showFond ? ssVeil(patB, true) : ''}
    <div class="brow">
      <div class="pcol">
        <div class="photo-wrap">
          <div class="photo">${s.photo ? `<img src="${esc(s.photo)}" alt="">` : '<div class="ph"><svg viewBox="0 0 100 100"><circle cx="50" cy="36" r="17" fill="#a9b6d3"/><path d="M18 88c4-20 17-30 32-30s28 10 32 30z" fill="#a9b6d3"/></svg></div>'}</div>
        </div>
        <div class="qr-side" id="ss-qr-br"></div>
        <b class="scan">SCAN ENTRÉE / SORTIE</b>
      </div>
      <div class="fcol">
        <div class="frw"><div class="ic" style="background:#d5f2f5;color:#0f7f8f">👤</div><div style="flex:1;min-width:0"><div class="k">Nom</div><div class="v">${esc(n1)}</div></div></div>
        <div class="frw"><div class="ic" style="background:#ffe8d9;color:#e8590c">👤</div><div style="flex:1;min-width:0"><div class="k">Post-nom</div><div class="v">${esc(n2 || '—')}</div></div></div>
        <div class="frw"><div class="ic" style="background:#ece5fb;color:#7b5cd6">👤</div><div style="flex:1;min-width:0"><div class="k">Prénom</div><div class="v">${esc(n3 || '—')}</div></div></div>
        <div class="frw"><div class="ic" style="background:#dbe7fb;color:#1446aa">🎫</div><div style="flex:1;min-width:0"><div class="k">Matricule</div><div class="v">${esc(mat)}</div></div></div>
        <div class="frw"><div class="ic" style="background:#fdf3d1;color:#b8860b">🏫</div><div style="flex:1;min-width:0"><div class="k">Classe</div><div class="v">${esc(clNm)}</div></div></div>
        <div class="frw"><div class="ic" style="background:#fce4f1;color:#d63384">🎂</div><div style="flex:1;min-width:0"><div class="k">Date de naissance</div><div class="v">${esc(dob)}</div></div></div>
        <div class="frw"><div class="ic" style="background:#d7f3e7;color:#08825a">📚</div><div style="flex:1;min-width:0"><div class="k">Année scolaire</div><div class="v">${esc(year)}</div></div></div>
        <div class="frw"><div class="ic" style="background:#ffe9f1;color:#d6336c">🍎</div><div style="flex:1;min-width:0"><div class="k">Enseignant(e)</div><div class="v">${esc(tchr)}</div></div></div>
      </div>
    </div>
    <span class="deco" style="top:4px;right:8px;font-size:20px;transform:rotate(10deg)">A</span>
    <span class="deco" style="top:30px;right:26px;font-size:13px;transform:rotate(-14deg)">b</span>
    <span class="deco" style="bottom:46px;left:8px;font-size:17px;transform:rotate(8deg)">c</span>
    <div class="foot" style="position:absolute;bottom:0;left:-18px;right:-18px;z-index:20"><div style="height:22px;display:flex;align-items:center;padding:0 4px">${ssLogoBadge}</div><div><div class="t1">Sécurisé par SchoolSafe</div><div class="t2">un enfant protégé, un parent informé</div></div><span style="margin-left:auto;background:rgba(255,255,255,.18);border:1.5px solid rgba(255,255,255,.3);border-radius:999px;padding:3px 10px;font-family:'Baloo 2',cursive;font-size:10px;font-weight:900;letter-spacing:.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px">${esc(clNm)}</span></div>
  </div>
  ${rectoOverlay}
</div>`;

  const verso = `<div class="art badge verso" id="ss-bv">
  <div class="head" style="padding-bottom:16px">
    <div class="arc"><i></i><i></i><i></i><i></i><i></i></div>
    <div class="head-row">${logoH}<div class="school"><div class="rdc">République Démocratique du Congo</div><div class="nm" style="font-size:${sz}">${esc(snm)}</div></div><div class="flag"></div></div>
  </div>
  <div class="bodyz">
    ${showFond ? ssVeil(patB, true) : ''}
    <div class="qr-big" id="ss-qr-bv"></div>
    <div class="qr-cap">Scan entrée / sortie · Matricule <b>${esc(mat)}</b></div>
    <div class="rows">
      <div class="rw"><div class="ic" style="background:#d5f2f5;color:#0f7f8f">👨‍👩‍👧</div><div class="grow"><div class="k">Parent / Tuteur</div><div class="v">${esc(parNm)}</div></div><div style="flex:none"><div class="k">Téléphone</div><div class="v">${esc(parPh)}</div></div></div>
      <div class="rw"><div class="ic" style="background:#ece5fb;color:#7b5cd6">🛡️</div><div class="grow"><div class="k">Personne autorisée</div><div class="v">${esc(apNm)}</div></div><div style="flex:none"><div class="k">Téléphone</div><div class="v">${esc(apPh)}</div></div></div>
      <div class="rw ecole"><div class="ic" style="background:#dbe7fb;color:#1446aa">🏫</div><div class="grow">
        <div class="k">Contacter l'école</div>
        ${addr ? `<div class="v">${esc(addr)}</div>` : ''}
        <div class="v">${esc(phone)}</div>
        ${email && email !== '—' ? `<div class="v">${esc(email)}</div>` : ''}
        ${site ? `<div class="v">${esc(site)}</div>` : ''}
        <div class="v" style="color:#0b6e4f;font-weight:900">schoolsafe1@gmail.com</div>
      </div></div>
    </div>
    <div class="sec-note"><b>🛡️</b> En cas de perte, contactez la direction de l'école.</div>
    <div class="sign-row"><div class="sg"><div class="line"></div><b>SIGNATURE</b></div><div class="stamp">SCEAU<br>DE<br>L'ÉCOLE</div><div class="sg"><div class="line"></div><b>DIRECTEUR(TRICE)</b></div></div>
    <div class="foot" style="margin:auto -18px -8px"><div style="height:22px;display:flex;align-items:center;padding:0 4px">${ssLogoBadge}</div><div><div class="t1">Sécurisé par SchoolSafe</div><div class="t2">un enfant protégé, un parent informé</div></div></div>
  </div>
</div>`;
  return { recto, verso, qr: 'schoolsafe://student/' + mat };
}

export function ssBuildCarte(s, cl, teacher, year, patC, patStyle, schoolInfo, logo) {
  const showFond = patStyle === 'fond' || patStyle === 'both';
  const showVig = patStyle === 'vignette' || patStyle === 'both';
  const sc = schoolInfo || {}, logoSrc = logo || '';
  const snm = sc.name || "NOM DE L'ÉCOLE", clNm = cl ? cl.name : '—';
  const addr = sc.address || "Adresse de l'école", phone = sc.phone || '—', email = sc.email || '—', site = sc.website || sc.site || '';
  const dob = s.dob ? s.dob.split('-').reverse().join('/') : '—', tchr = teacher ? teacher.name : '—', opt = cl ? cl.option || '' : '';
  const mat = s.mat || s.matricule || s.id || '000';
  const parNm = s.parent_name || s.nom_papa || s.nom_maman || '—';
  const parPh = s.parent_phone || '—';
  const apNm = s.authorized_name || '—', apPh = s.authorized_phone || '—';
  const pts = (s.name || '').trim().split(/\s+/);
  const dispNm = pts.slice(0, 2).join(' '), fn = pts.slice(2).join(' ') || '';
  const sz = snm.length > 32 ? '11px' : snm.length > 22 ? '13px' : '17px';
  const logoH = logoSrc
    ? `<div class="logo-slot" style="border:none;background:transparent;padding:0"><img src="${logoSrc}" alt=""></div>`
    : '<div class="logo-slot"><span style="font-size:15px">🏫</span><span>LOGO<br>ÉCOLE</span></div>';
  const slg = sc.motto || sc.slogan || (logoSrc ? '' : (sc.name_en || sc.sub || ''));
  const px = patC.v.startsWith('min-') ? 'PIERRE PRÉCIEUSE · ' : '';
  const nmEl = `<div class="pat" style="margin-top:auto;padding:2px 0"><span class="nm2">${esc((px + patC.n).toUpperCase())}</span></div>`;

  const recto = `<div class="art carte" id="ss-cr">
  <div class="head"><div class="arc"><i></i><i></i><i></i><i></i><i></i></div>${logoH}<div class="school"><div class="rdc">République Démocratique du Congo</div><div class="nm" style="font-size:${sz}">${esc(snm)}</div>${slg ? `<div class="slg">${esc(slg)}</div>` : ''}${site ? `<div class="slg" style="font-weight:800">${esc(site)}</div>` : ''}</div><div class="flag"></div></div>
  <div class="titlebar"><span class="tb-type">CARTE D'ÉLÈVE</span><span class="tb-cls">${esc(clNm)}</span></div>
  <div class="bodyz">
    ${showFond ? ssVeil(patC, true) : ''}
    <div class="photo-col">
      <div class="photo">${s.photo ? `<img src="${esc(s.photo)}" alt="">` : '<div class="ph"><svg viewBox="0 0 100 100"><circle cx="50" cy="36" r="17" fill="#a9b6d3"/><path d="M18 88c4-20 17-30 32-30s28 10 32 30z" fill="#a9b6d3"/></svg></div>'}</div>
    </div>
    <div class="info">
      <div class="sname"><div class="n1">${esc(dispNm)}</div>${fn ? `<div class="n2">${esc(fn)}</div>` : ''}</div>
      <div class="grid">
        <div class="cell"><div class="k">Matricule</div><div class="v">${esc(mat)}</div></div>
        <div class="cell"><div class="k">Né(e) le</div><div class="v">${esc(dob)}</div></div>
        ${opt ? `<div class="cell"><div class="k">Option</div><div class="v">${esc(opt)}</div></div>` : '<div class="cell"></div>'}
        <div class="cell"><div class="k">Année scolaire</div><div class="v">${esc(year)}</div></div>
        <div class="cell"><div class="k">Titulaire</div><div class="v">${esc(tchr)}</div></div>
        <div class="cell"><div class="k">N° Direction</div><div class="v">${esc(phone)}</div></div>
      </div>
      ${showVig ? ssPatEl(patC, 38, false) : (showFond ? nmEl : '')}
    </div>
    <div class="qr-col"><div class="qr-box" id="ss-qr-cr"></div><b>SCAN ENTRÉE / SORTIE</b></div>
  </div>
  <div class="foot"><div style="height:20px;display:flex;align-items:center;padding:0 4px">${ssLogoCarte}</div><div><div class="t1">SchoolSafe</div><div class="t2">un enfant protégé, un parent informé</div></div><div class="val">VALIDE ${esc(year)}</div></div>
</div>`;

  const verso = `<div class="art carte verso" id="ss-cv">
  <div class="head" style="padding:10px 18px">${logoSrc ? `<div class="logo-slot" style="width:36px;height:36px;border:none;background:transparent;padding:0"><img src="${logoSrc}" alt=""></div>` : '<div class="logo-slot" style="width:36px;height:36px;font-size:11px"><span>LOGO</span></div>'}<div class="school"><div class="rdc">En cas de perte, merci de restituer à :</div><div class="nm" style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(snm)}${addr ? ' — ' + esc(addr) : ''}</div></div><div class="flag"></div></div>
  <div class="bodyz">
    ${showFond ? ssVeil(patC, true) : ''}
    <div class="vleft">
      <div class="mini-rows">
        <div class="mrw"><div class="ic">👨‍👩‍👧</div><div style="flex:1"><div class="k">Parent / Tuteur</div><div class="v">${esc(parNm)}</div></div><div><div class="k">Tél</div><div class="v">${esc(parPh)}</div></div></div>
        <div class="mrw"><div class="ic">🛡️</div><div style="flex:1"><div class="k">Personne autorisée</div><div class="v">${esc(apNm)}</div></div><div><div class="k">Tél</div><div class="v">${esc(apPh)}</div></div></div>
        <div class="mrw ecole"><div class="ic">🏫</div><div style="flex:1;min-width:0">
          <div class="k">Contacter l'école</div>
          <div class="v">${esc(phone)}</div>
          ${email && email !== '—' ? `<div class="v">${esc(email)}</div>` : ''}
          ${site ? `<div class="v">${esc(site)}</div>` : ''}
          <div class="v" style="color:#0b6e4f;font-weight:900">schoolsafe1@gmail.com</div>
        </div><div style="flex:none"><div class="k">Année</div><div class="v">${esc(year)}</div></div></div>
      </div>
      <div class="sec-note" style="margin-top:auto"><b>🛡️</b> Accès contrôlé par scan SchoolSafe.</div>
    </div>
    <div class="vright">
      <div class="qr-box" style="width:110px;height:110px" id="ss-qr-cv"></div>
      <b style="font-size:7.5px;color:#5d6784;letter-spacing:.8px;font-weight:900">VÉRIFICATION SCHOOLSAFE</b>
      <div class="stamp">SCEAU<br>DE<br>L'ÉCOLE</div>
    </div>
  </div>
  <div class="foot"><div style="height:20px;display:flex;align-items:center;padding:0 4px">${ssLogoCarte}</div><div><div class="t1">SchoolSafe</div><div class="t2">${site ? esc(site) : 'www.schoolsafe.cd'}</div></div><div class="val">N° ${esc(mat)}</div></div>
</div>`;
  return { recto, verso, qr: 'schoolsafe://student/' + mat };
}

export function renderCardPreview(container, student, classData, teacher, year, schoolInfo, logo, patStyle = 'both') {
  const { type, colorIdx, col } = ssClassType(classData);
  const palette = col || _ssCARDS.CCOLS[colorIdx] || _ssCARDS.CCOLS[3];
  container.setAttribute('data-fam', classData?.card_family || 'A');
  container.style.setProperty('--ss-cc', palette.cc);
  container.style.setProperty('--ss-cc-soft', palette.soft);
  container.style.setProperty('--ss-cc-dark', palette.dark);

  let recto, verso, qr;
  if (type === 'badge') {
    const patB = ssGetClassPat(classData, 'badge');
    ({ recto, verso, qr } = ssBuildBadge(student, classData, teacher, year, patB, patStyle, schoolInfo, logo));
    container.innerHTML = `<div class="ss-badge-wrap">${recto}</div><div class="ss-badge-wrap">${verso}</div>`;
    setTimeout(() => { ssGenQR('ss-qr-br', qr, 76); ssGenQR('ss-qr-bv', qr, 76); }, 40);
  } else {
    const patC = ssGetClassPat(classData, 'carte');
    ({ recto, verso, qr } = ssBuildCarte(student, classData, teacher, year, patC, patStyle, schoolInfo, logo));
    container.innerHTML = `<div class="ss-carte-wrap">${recto}</div><div class="ss-carte-wrap">${verso}</div>`;
    setTimeout(() => { ssGenQR('ss-qr-cr', qr, 76); ssGenQR('ss-qr-cv', qr, 92); }, 40);
  }
  return { type };
}

export async function captureCardPng(container, selector) {
  const target = container.querySelector(selector);
  if (!target) throw new Error('Aucune carte à capturer');
  if (typeof window.html2canvas !== 'function') throw new Error('html2canvas non chargé');
  const canvas = await window.html2canvas(target, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff' });
  return canvas.toDataURL('image/png');
}
