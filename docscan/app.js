/**
 * DocScan — Final
 * 3 step responsive: mobile-first + desktop sidebar
 * Layout engine: colonne centrate, misure corrette
 */
'use strict';

/* ══════════════════════════ STATE ══════════════════════════ */
// Stores the last export fn so the retry button on the success screen can re-trigger it
let _lastExportFn = null;

const S = {
  step: 0,
  pageFormat:   'A4',
  orientation:  'portrait',
  exportFormat: 'pdf',
  dpi:          150,
  fileName:     'scansione-documenti',
  docs: [],
  layout: null,
  _uid: 1,
  cam: { stream:null, facing:'environment', docId:null, side:null, rawCanvas:null },
};

/* ══════════════════════════ UTILS ══════════════════════════ */
function uid()          { return `d${S._uid++}_${Date.now()}`; }
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function mmToPx(mm, dpi){ return (mm / 25.4) * dpi; }
function $(id)          { return document.getElementById(id); }

function toast(msg, type = 'info', ms = 2600) {
  const c  = $('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${{success:'✓',error:'✕',warning:'⚠',info:'ℹ'}[type]||'ℹ'}</span><span>${msg}</span>`;
  c.appendChild(el);
  setTimeout(() => { el.style.animation = 'toastOut 220ms forwards'; setTimeout(() => el.remove(), 230); }, ms);
}

/* ══════════════════════════ NAVIGATION ══════════════════════ */
function gotoStep(n, validate = true) {
  if (n < 0 || n > 2) return;
  if (validate && n > S.step) {
    const err = validateStep(S.step);
    if (err) { toast(err, 'warning'); return; }
  }
  // If leaving step 2, hide the success screen
  if (S.step === 2 && n !== 2) hideExportSuccess();
  S.step = n;
  if (n === 2) { computeLayout(); renderPreview(); }
  document.querySelectorAll('.panel').forEach((p, i) => p.classList.toggle('active', i === n));
  $('app-main').scrollTop = 0;
  syncStepNav();
  syncBottomNav();
  save();
}

function validateStep(s) {
  if (s === 0) return null;
  if (s === 1) {
    if (!S.docs.length) return 'Aggiungi almeno un documento.';
    const missing = captureItems().filter(it => !getImg(it.docId, it.side));
    if (missing.length) return `${missing.length} acquisizione/i mancante/i.`;
  }
  return null;
}

function syncStepNav() {
  // Mobile pills
  document.querySelectorAll('.step-pill').forEach(el => {
    const i = +el.dataset.step;
    el.classList.toggle('active', i === S.step);
    el.classList.toggle('done',   i <  S.step);
  });
  // Desktop sidebar
  document.querySelectorAll('.snav-item').forEach(el => {
    const i = +el.dataset.step;
    el.classList.toggle('active', i === S.step);
    el.classList.toggle('done',   i <  S.step);
  });
}

function syncBottomNav() {
  const back      = $('btn-back');
  const fwd       = $('btn-fwd');
  const expNav    = $('btn-export-nav');
  const expNavLbl = $('btn-export-nav-lbl');
  if (!back || !fwd) return;
  back.disabled = S.step === 0;
  if (S.step === 2) {
    fwd.style.display    = 'none';
    if (expNav) {
      expNav.style.display = '';
      if (expNavLbl) expNavLbl.textContent = `Scarica ${S.exportFormat.toUpperCase()}`;
    }
  } else {
    fwd.style.display = '';
    fwd.textContent   = S.step === 1 ? 'Anteprima →' : 'Avanti →';
    if (expNav) expNav.style.display = 'none';
  }
}

/* ══════════════════ STEP 0 — FORMATO ══════════════════════ */
function initStep0() {
  const grid = $('fmt-grid');
  grid.innerHTML = '';
  for (const [id, f] of Object.entries(CONFIG.PAGE_FORMATS)) {
    const icons = {A4:'📄',A5:'📃',A3:'📋',Letter:'🗒️',Legal:'📜'};
    const tile  = document.createElement('div');
    tile.className = 'fmt-tile' + (id === S.pageFormat ? ' sel' : '');
    tile.dataset.id = id;
    const asp = f.width / f.height;
    const mW = 26, mH = 34;
    const iw = asp > mW/mH ? mW : Math.round(mH * asp);
    const ih = asp > mW/mH ? Math.round(mW / asp) : mH;
    tile.innerHTML = `
      <div class="fmt-icon" style="width:${iw}px;height:${ih}px"></div>
      <div class="fmt-name">${f.name}</div>
      <div class="fmt-size">${Math.round(f.width)}×${Math.round(f.height)}</div>`;
    tile.addEventListener('click', () => {
      S.pageFormat = id;
      grid.querySelectorAll('.fmt-tile').forEach(t => t.classList.toggle('sel', t === tile));
      save();
    });
    grid.appendChild(tile);
  }

  // Orientation
  $('orient-row').querySelectorAll('.orient-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.v === S.orientation);
    btn.addEventListener('click', () => {
      S.orientation = btn.dataset.v;
      $('orient-row').querySelectorAll('.orient-btn').forEach(b => b.classList.toggle('active', b === btn));
      save();
    });
  });
}

function restoreStep0() {
  document.querySelectorAll('#fmt-grid .fmt-tile').forEach(t =>
    t.classList.toggle('sel', t.dataset.id === S.pageFormat));
  document.querySelectorAll('#orient-row .orient-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.v === S.orientation));
}

/* ══════════════════ STEP 1 — DOCUMENTI ══════════════════════ */
function initStep1() {
  // The picker HTML is now static in index.html — just bind the interactions.
  _bindDocPicker();
  renderDocList();
  renderAcqSummary();
}

function _bindDocPicker() {
  // Card: Documento a tessera → show sub-picker
  const cardTessera    = $('dp-card-tessera');
  const cardCartacea   = $('dp-card-cartacea');
  const subTessera     = $('dp-subpicker-tessera');
  const backTessera    = $('dp-back-tessera');

  if (!cardTessera) return; // already bound or DOM not ready

  // Show tessera sub-picker
  cardTessera.addEventListener('click', () => {
    cardTessera.style.display    = 'none';
    cardCartacea.style.display   = 'none';
    subTessera.style.display     = '';
  });

  // Back button
  backTessera.addEventListener('click', () => {
    subTessera.style.display   = 'none';
    cardTessera.style.display  = '';
    cardCartacea.style.display = '';
  });

  // Sub-items for tessera
  subTessera.querySelectorAll('.doc-sub-item').forEach(item => {
    item.addEventListener('click', () => {
      const type = item.dataset.type;
      const d    = CONFIG.DOCUMENT_TYPES[type];
      if (!d) return;
      S.docs.push({ id:uid(), type, sides:d.defaultSides, images:{front:null,back:null} });
      // Reset picker view
      subTessera.style.display   = 'none';
      cardTessera.style.display  = '';
      cardCartacea.style.display = '';
      renderDocList(); renderAcqSummary(); save();
      toast(`${d.shortName} aggiunto`, 'success', 1400);
    });
  });

  // Card: Carta d'identità cartacea → direct add
  cardCartacea.addEventListener('click', () => {
    const type = 'ci_cartacea';
    const d    = CONFIG.DOCUMENT_TYPES[type];
    S.docs.push({ id:uid(), type, sides:d.defaultSides, images:{front:null,back:null} });
    renderDocList(); renderAcqSummary(); save();
    toast(`${d.shortName} aggiunta`, 'success', 1400);
  });
}

/* ── Doc list ────────────────────────────────────────────── */
function renderDocList() {
  const list  = $('doc-scan-list');
  const empty = $('empty-docs');
  list.innerHTML = '';
  if (!S.docs.length) { empty.style.display=''; return; }
  empty.style.display = 'none';

  S.docs.forEach(doc => {
    const cfg    = CONFIG.DOCUMENT_TYPES[doc.type];
    const items  = captureItemsForDoc(doc);
    const allOk  = items.every(it => getImg(it.docId, it.side));
    const block  = document.createElement('div');
    block.className = 'doc-block' + (allOk ? ' complete' : '');
    block.dataset.id = doc.id;

    block.innerHTML = `
      <div class="doc-block-hdr">
        <div class="doc-block-icon">${cfg.icon}</div>
        <div class="doc-block-info">
          <div class="doc-block-name">${cfg.name}</div>
          <div class="doc-block-sub">${cfg.desc}</div>
        </div>
        <button class="doc-block-rm" data-rm="${doc.id}">✕</button>
      </div>`;

    // Sides toggle
    if (cfg.hasBack) {
      const tog = document.createElement('div');
      tog.className = 'sides-toggle';
      const fOn = doc.sides==='front'||doc.sides==='both';
      const bOn = doc.sides==='back' ||doc.sides==='both';
      tog.innerHTML = `
        <button class="sides-tog-btn${fOn?' on':''}" data-doc="${doc.id}" data-s="front">
          <span class="tog-check">${fOn?'✓':''}</span>
          <span>Fronte</span>
        </button>
        <button class="sides-tog-btn${bOn?' on':''}" data-doc="${doc.id}" data-s="back">
          <span class="tog-check">${bOn?'✓':''}</span>
          <span>Retro</span>
        </button>`;
      tog.querySelectorAll('.sides-tog-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const d = S.docs.find(x => x.id === btn.dataset.doc); if(!d) return;
          const s = btn.dataset.s;
          if (d.sides==='both') d.sides = s==='front' ? 'back' : 'front';
          else if (d.sides===s) d.sides = 'both';
          else                  d.sides = 'both';
          save(); renderDocList(); renderAcqSummary();
        });
      });
      block.appendChild(tog);
    }

    // Capture slots
    const slots = document.createElement('div');
    slots.className = `capture-slots cols-${items.length===1?'1':'2'}`;
    items.forEach(item => {
      const img  = getImg(item.docId, item.side);
      const slot = document.createElement('div');
      slot.className = 'cap-slot' + (img ? ' has-img' : '');
      if (img) {
        slot.innerHTML = `
          <img class="cap-slot-img" src="${img}" alt="">
          <div class="cap-slot-lbl">${item.side==='front'?'Fronte':'Retro'}</div>
          <div class="cap-slot-check">✓</div>
          <div class="cap-slot-redo">↩ rifare</div>`;
      } else {
        slot.innerHTML = `<div class="cap-slot-cam">📷</div><div class="cap-slot-lbl">${item.side==='front'?'Fronte':'Retro'}</div>`;
      }
      slot.addEventListener('click', () => SourcePicker.show(item.docId, item.side));
      slots.appendChild(slot);
    });
    block.appendChild(slots);
    list.appendChild(block);
  });

  list.querySelectorAll('[data-rm]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      S.docs = S.docs.filter(d => d.id !== btn.dataset.rm);
      save(); renderDocList(); renderAcqSummary();
    });
  });
}

/* ── Acquisition summary (desktop right panel) ───────────── */
function renderAcqSummary() {
  const grid = $('acq-grid');
  if (!grid) return;
  grid.innerHTML = '';
  if (!S.docs.length) {
    grid.innerHTML = '<div style="font-size:12px;color:var(--t3);text-align:center;padding:12px 0">Nessun documento</div>';
    return;
  }
  captureItems().forEach(item => {
    const img  = getImg(item.docId, item.side);
    const cfg  = CONFIG.DOCUMENT_TYPES[item.cfg.id];
    const el   = document.createElement('div');
    el.className = 'acq-item';
    el.innerHTML = img
      ? `<img class="acq-item-thumb" src="${img}" alt="">
         <div class="acq-item-info">
           <div class="acq-item-name">${cfg.shortName}</div>
           <div class="acq-item-side">${item.side==='front'?'Fronte':'Retro'}</div>
         </div>
         <div class="acq-item-status done"></div>`
      : `<div class="acq-item-thumb empty">📷</div>
         <div class="acq-item-info">
           <div class="acq-item-name">${cfg.shortName}</div>
           <div class="acq-item-side">${item.side==='front'?'Fronte':'Retro'}</div>
         </div>
         <div class="acq-item-status"></div>`;
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => SourcePicker.show(item.docId, item.side));
    grid.appendChild(el);
  });
}

/* ── Helpers ─────────────────────────────────────────────── */
function captureItemsForDoc(doc) {
  const sides = doc.sides==='both' ? ['front','back'] : [doc.sides];
  return sides.map(side => ({ docId:doc.id, side, cfg:CONFIG.DOCUMENT_TYPES[doc.type] }));
}

/* ── Source picker (before camera opens) ─────────────────── */
const SourcePicker = {
  _docId: null,
  _side:  null,

  // Detect if we're on a touch device (mobile/tablet) where the native
  // file picker already offers camera+library — no need for the custom sheet.
  _isMobile() {
    return ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  },

  show(docId, side) {
    this._docId = docId;
    this._side  = side;

    // On mobile: skip the sheet, open camera directly via WebRTC
    // (iOS/Android native camera sheet comes from the browser when getUserMedia is called)
    // We still show the sheet but only on desktop
    if (this._isMobile()) {
      // On mobile use the native file input which already shows "Photo Library / Take Photo"
      S.cam.docId = docId;
      S.cam.side  = side;
      openGallery();
      return;
    }

    const doc = S.docs.find(d => d.id === docId);
    const cfg = doc ? CONFIG.DOCUMENT_TYPES[doc.type] : null;
    if (cfg) {
      $('ss-doc-name').textContent = cfg.name;
      $('ss-side-name').textContent = side === 'front' ? 'Fronte' : 'Retro';
    }
    $('source-backdrop').classList.add('open');
    const sheet = $('source-sheet');
    sheet.classList.remove('out');
    sheet.classList.add('open');
  },

  dismiss() {
    const sheet = $('source-sheet');
    sheet.classList.add('out');
    sheet.addEventListener('animationend', () => {
      sheet.classList.remove('open','out');
    }, { once: true });
    $('source-backdrop').classList.remove('open');
  },
};

function captureItems() {
  return S.docs.flatMap(doc => captureItemsForDoc(doc));
}
function getImg(docId, side) { return S.docs.find(d=>d.id===docId)?.images[side]||null; }
function setImg(docId, side, url) {
  const d = S.docs.find(x => x.id===docId);
  if (d) { d.images[side]=url; save(); }
}

/* ══════════════════════════ CAMERA ══════════════════════════ */

// Camera count detection
S.cam.count = 1; // default, updated async
async function detectCameraCount() {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const cams  = devs.filter(d => d.kind === 'videoinput');
    S.cam.count = cams.length;
    // Show/hide flip button
    const flipBtn = $('btn-flip');
    if (flipBtn) {
      if (cams.length <= 1) flipBtn.classList.add('hidden');
      else                  flipBtn.classList.remove('hidden');
    }
  } catch {}
}

async function openCamera(docId, side) {
  const doc = S.docs.find(d => d.id === docId); if (!doc) return;
  S.cam.docId = docId; S.cam.side = side; S.cam.rawCanvas = null;
  const cfg = CONFIG.DOCUMENT_TYPES[doc.type];
  $('cam-doc-name').textContent = cfg.name;
  $('cam-chip').textContent     = side === 'front' ? 'FRONTE' : 'RETRO';

  // Open camera card
  $('cam-backdrop').classList.add('open');
  const card = $('cam-card');
  card.classList.remove('out');
  card.classList.add('open');

  // Reset thumb state
  $('cam-thumb').style.display = 'none';
  $('btn-gallery').style.display = '';

  await detectCameraCount();
  await startStream();
}

async function startStream() {
  stopStream();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: S.cam.facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    S.cam.stream = stream;
    $('cam-video').srcObject = stream;
    await $('cam-video').play();
  } catch(err) {
    toast(`Fotocamera: ${err.message}`, 'error', 4000);
    closeCam();
  }
}

function stopStream() {
  $('cam-video').srcObject = null;
  if (S.cam.stream) { S.cam.stream.getTracks().forEach(t => t.stop()); S.cam.stream = null; }
}

function closeCam() {
  stopStream();
  const card = $('cam-card');
  card.classList.add('out');
  card.addEventListener('animationend', () => card.classList.remove('open','out'), { once: true });
  $('cam-backdrop').classList.remove('open');
  // Note: S.cam.docId and S.cam.side are intentionally NOT reset here,
  // so capturePhoto() can pass them to CropEditor after closeCam().
  // They are reset only after crop confirm or explicit cancel.
}

function capturePhoto() {
  const v = $('cam-video');
  if (!v || !v.videoWidth) { toast('Fotocamera non pronta', 'warning'); return; }
  // Save docId/side BEFORE closeCam() which resets S.cam
  const savedDocId = S.cam.docId;
  const savedSide  = S.cam.side;
  const c = document.createElement('canvas');
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  S.cam.rawCanvas = c;
  // Close cam card
  closeCam();
  // Restore docId/side for crop editor
  S.cam.docId = savedDocId;
  S.cam.side  = savedSide;
  setTimeout(() => CropEditor.open(c), 60);
}

async function flipCamera() {
  S.cam.facing = S.cam.facing === 'environment' ? 'user' : 'environment';
  // Spin animation
  const btn = $('btn-flip');
  btn.classList.add('spinning');
  setTimeout(() => btn.classList.remove('spinning'), 450);
  await startStream();
}

function openGallery() {
  // iOS Safari only allows programmatic .click() on file inputs if:
  // 1. It happens synchronously within a user gesture handler
  // 2. The input is "fresh" (not previously used and value-cleared)
  // Solution: remove old input and create a brand new one each time.
  const old = $('gallery-input');
  if (old) old.remove();

  const inp = document.createElement('input');
  inp.type    = 'file';
  inp.id      = 'gallery-input';
  inp.accept  = 'image/*';
  inp.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none';
  document.body.appendChild(inp);

  inp.addEventListener('change', e => {
    if (e.target.files?.[0]) handleGalleryFile(e.target.files[0]);
  }, { once: true });

  // Must call .click() synchronously here (still within the user gesture stack)
  inp.click();
}

function handleGalleryFile(file) {
  if (!file?.type.startsWith('image/')) return;
  // If camera is open, close it first
  if ($('cam-card').classList.contains('open')) closeCam();
  const r = new FileReader();
  r.onload = e => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      S.cam.rawCanvas = c;
      setTimeout(() => CropEditor.open(c), 60);
    };
    img.src = e.target.result;
  };
  r.readAsDataURL(file);
}

/* ══════════════════════ CROP EDITOR ══════════════════════ */
const CropEditor = {
  src:null, corners:[], drag:-1, scale:1, cvs:null, ctx:null,
  _rotation: 0,      // 0, 90, 180, 270
  _bgRemove: false,

  open(src) {
    this.src = src;
    this._rotation = 0;
    this._bgRemove = false;
    this.cvs = $('crop-cvs');
    this.ctx = this.cvs.getContext('2d');
    // Reset tool buttons
    const bgBtn = $('btn-crop-bgremove');
    if (bgBtn) bgBtn.classList.remove('active');
    // Open crop card
    $('crop-backdrop').classList.add('open');
    const card = $('crop-card');
    card.classList.remove('out');
    card.classList.add('open');
    requestAnimationFrame(() => this._resize());
  },

  _close() {
    const card = $('crop-card');
    card.classList.add('out');
    card.addEventListener('animationend', () => card.classList.remove('open','out'), { once: true });
    $('crop-backdrop').classList.remove('open');
  },

  // Returns a canvas with the current rotation applied to this.src
  _rotatedSrc() {
    const r = this._rotation;
    if (r === 0) return this.src;
    const sw = this.src.width, sh = this.src.height;
    const c = document.createElement('canvas');
    if (r === 90 || r === 270) { c.width = sh; c.height = sw; }
    else { c.width = sw; c.height = sh; }
    const ctx = c.getContext('2d');
    ctx.save();
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(r * Math.PI / 180);
    ctx.drawImage(this.src, -sw / 2, -sh / 2);
    ctx.restore();
    return c;
  },

  rotate() {
    this._rotation = (this._rotation + 90) % 360;
    this._resize();
  },

  toggleBgRemove() {
    this._bgRemove = !this._bgRemove;
    const btn = $('btn-crop-bgremove');
    if (btn) btn.classList.toggle('active', this._bgRemove);
  },

  _resize() {
    const rotSrc = this._rotatedSrc();
    const stage  = $('crop-stage');
    // Use the actual pixel dimensions of the stage container
    const ww = stage.clientWidth  || window.innerWidth;
    const wh = stage.clientHeight || (window.innerHeight - 180);
    const srcW = rotSrc.width, srcH = rotSrc.height;
    const asp  = srcW / srcH;
    const stageAsp = ww / wh;
    let dw, dh;
    if (asp > stageAsp) {
      // Image is wider than stage → fit width
      dw = ww;
      dh = Math.floor(ww / asp);
    } else {
      // Image is taller than stage → fit height
      dh = wh;
      dw = Math.floor(wh * asp);
    }
    this.cvs.width  = dw;
    this.cvs.height = dh;
    this.scale = dw / srcW;
    const p = 0.07;
    this.corners = [
      { x: dw * p,       y: dh * p       },
      { x: dw * (1 - p), y: dh * p       },
      { x: dw * (1 - p), y: dh * (1 - p) },
      { x: dw * p,       y: dh * (1 - p) },
    ];
    this.draw();
  },

  draw() {
    const rotSrc = this._rotatedSrc();
    const ctx = this.ctx, W = this.cvs.width, H = this.cvs.height, c = this.corners;
    ctx.clearRect(0, 0, W, H);

    // 1. Draw full image
    ctx.drawImage(rotSrc, 0, 0, W, H);

    // 2. Darken ONLY the area OUTSIDE the selection.
    //    Strategy: clip to the inverse region using even-odd fill rule.
    //    Path = full canvas rect + selection polygon → even-odd fills only the "outside".
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);           // outer boundary (winding: clockwise)
    ctx.moveTo(c[0].x, c[0].y);     // inner polygon (winding: also clockwise → even-odd cancels it)
    ctx.lineTo(c[1].x, c[1].y);
    ctx.lineTo(c[2].x, c[2].y);
    ctx.lineTo(c[3].x, c[3].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill('evenodd');             // fills everything EXCEPT the polygon interior
    ctx.restore();

    // 3. Border around selection — white/light so it's visible on any background
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth   = 2;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur  = 4;
    ctx.beginPath();
    ctx.moveTo(c[0].x, c[0].y); ctx.lineTo(c[1].x, c[1].y);
    ctx.lineTo(c[2].x, c[2].y); ctx.lineTo(c[3].x, c[3].y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // 4. Corner handles — white circle with subtle fill, no heavy glow
    const R = Math.max(18, Math.min(W, H) * 0.045);
    c.forEach(pt => {
      // Outer touch-target circle (very subtle)
      ctx.save();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, R, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
      ctx.restore();

      // Inner filled dot — white
      ctx.save();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, R * 0.38, 0, Math.PI * 2);
      ctx.fillStyle   = 'rgba(255,255,255,0.95)';
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur  = 6;
      ctx.fill();
      ctx.restore();

      // Crosshair — dark so it reads on the white dot
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth   = 1.5;
      ctx.lineCap     = 'round';
      const cr = R * 0.22;
      ctx.beginPath();
      ctx.moveTo(pt.x - cr, pt.y); ctx.lineTo(pt.x + cr, pt.y);
      ctx.moveTo(pt.x, pt.y - cr); ctx.lineTo(pt.x, pt.y + cr);
      ctx.stroke();
      ctx.restore();
    });
  },

  _pt(e) {
    const r=this.cvs.getBoundingClientRect();
    const cx=e.touches?e.touches[0].clientX:e.clientX, cy=e.touches?e.touches[0].clientY:e.clientY;
    return{x:(cx-r.left)*(this.cvs.width/r.width), y:(cy-r.top)*(this.cvs.height/r.height)};
  },

  _near(pt) {
    const hitR=Math.max(60,Math.min(this.cvs.width,this.cvs.height)*.12);
    let best=-1,bd=hitR*hitR;
    this.corners.forEach((c,i)=>{const d=(c.x-pt.x)**2+(c.y-pt.y)**2;if(d<bd){bd=d;best=i;}});
    return best;
  },

  down(e){
    e.preventDefault();
    this.drag = this._near(this._pt(e));
    if (this.drag >= 0) this._showMag(e);
  },
  move(e){
    e.preventDefault();
    if(this.drag<0) return;
    const pt=this._pt(e);
    this.corners[this.drag]={x:clamp(pt.x,0,this.cvs.width),y:clamp(pt.y,0,this.cvs.height)};
    this.draw();
    this._showMag(e);
  },
  up(e){
    e.preventDefault();
    this.drag=-1;
    this._hideMag();
  },

  /* ── Magnifier ─────────────────────────────────────────── */
  _magTimer: null,

  _showMag(e) {
    const mag    = $('crop-magnifier');
    const magCvs = $('mag-cvs');
    if (!mag || !magCvs || this.drag < 0) return;

    const MAG_SIZE   = 120;   // px — matches CSS
    const MAG_ZOOM   = 3.5;   // zoom factor
    const MAG_RADIUS = MAG_SIZE / 2;

    const corner = this.corners[this.drag];
    const stage  = $('crop-stage');
    const sr     = stage.getBoundingClientRect();

    const sx = e.touches ? e.touches[0].clientX : e.clientX;
    const sy = e.touches ? e.touches[0].clientY : e.clientY;

    // Position: above finger, flip below if near top edge
    const OFFSET = 28;
    let lx = sx - sr.left - MAG_RADIUS;
    let ly = sy - sr.top  - MAG_SIZE - OFFSET;
    if (ly < 6) ly = sy - sr.top + OFFSET;
    lx = Math.max(6, Math.min(sr.width - MAG_SIZE - 6, lx));

    mag.style.left = `${lx}px`;
    mag.style.top  = `${ly}px`;
    mag.style.width  = `${MAG_SIZE}px`;
    mag.style.height = `${MAG_SIZE}px`;

    // Draw from the ORIGINAL (rotated) source image — not the darkened canvas
    // This gives a bright, clear zoomed view
    const rotSrc  = this._rotatedSrc();
    const srcScale = this.cvs.width / rotSrc.width; // canvas-to-source scale

    // Corner position in source image coordinates
    const cornSrcX = corner.x / srcScale;
    const cornSrcY = corner.y / srcScale;

    // Source region in original image: half = MAG_RADIUS / (MAG_ZOOM * srcScale)
    const srcHalf = MAG_RADIUS / (MAG_ZOOM * srcScale);
    const srcX = cornSrcX - srcHalf;
    const srcY = cornSrcY - srcHalf;
    const srcW = MAG_SIZE  / (MAG_ZOOM * srcScale);

    magCvs.width  = MAG_SIZE;
    magCvs.height = MAG_SIZE;
    const mctx = magCvs.getContext('2d');

    // Dark fallback background
    mctx.fillStyle = '#111';
    mctx.fillRect(0, 0, MAG_SIZE, MAG_SIZE);

    // Draw the original image — bright and unmodified
    mctx.drawImage(
      rotSrc,
      srcX, srcY, srcW, srcW,
      0, 0, MAG_SIZE, MAG_SIZE
    );

    // Draw the crop polygon lines inside the lens.
    // Map each corner from canvas coords → source image coords → lens canvas coords.
    // lens_coord = (corner_in_src - top-left_of_src_region) / srcW * MAG_SIZE
    const lensScale = MAG_SIZE / srcW; // how many lens-px per source-px
    const corners = this.corners;

    mctx.save();
    mctx.strokeStyle = 'rgba(255,255,255,0.75)';
    mctx.lineWidth   = 1.5;
    mctx.setLineDash([]);
    mctx.shadowColor = 'rgba(0,0,0,0.5)';
    mctx.shadowBlur  = 2;
    mctx.beginPath();
    corners.forEach((pt, i) => {
      // Convert canvas coords → source image coords
      const ptSrcX = pt.x / srcScale;
      const ptSrcY = pt.y / srcScale;
      // Convert source coords → lens canvas coords
      const lx2 = (ptSrcX - srcX) * lensScale;
      const ly2 = (ptSrcY - srcY) * lensScale;
      if (i === 0) mctx.moveTo(lx2, ly2);
      else         mctx.lineTo(lx2, ly2);
    });
    mctx.closePath();
    mctx.stroke();
    mctx.restore();

    // Draw active corner handle in the lens (white dot, no shadow overloading)
    const activePt   = corners[this.drag];
    const activeLx   = (activePt.x / srcScale - srcX) * lensScale;
    const activeLy   = (activePt.y / srcScale - srcY) * lensScale;
    mctx.save();
    mctx.beginPath();
    mctx.arc(activeLx, activeLy, 5, 0, Math.PI * 2);
    mctx.fillStyle = 'rgba(255,255,255,0.92)';
    mctx.shadowColor = 'rgba(0,0,0,0.4)';
    mctx.shadowBlur  = 4;
    mctx.fill();
    mctx.restore();

    // Minimal center crosshair — very thin, just to confirm position
    const cx = MAG_RADIUS, cy = MAG_RADIUS;
    mctx.save();
    mctx.globalAlpha = 0.3;
    mctx.strokeStyle = '#ffffff';
    mctx.lineWidth   = 1;
    mctx.lineCap     = 'round';
    mctx.beginPath();
    mctx.moveTo(cx - 10, cy); mctx.lineTo(cx + 10, cy);
    mctx.moveTo(cx, cy - 10); mctx.lineTo(cx, cy + 10);
    mctx.stroke();
    mctx.restore();

    mag.classList.add('visible');
  },

  _hideMag() {
    const mag = $('crop-magnifier');
    if (mag) mag.classList.remove('visible');
  },

  confirm() {
    const rotSrc = this._rotatedSrc();
    const src4 = this.corners.map(p => ({ x:p.x/this.scale, y:p.y/this.scale }));
    const doc  = S.docs.find(d => d.id === S.cam.docId);
    let outW, outH;
    if (doc) {
      const cfg = CONFIG.DOCUMENT_TYPES[doc.type];
      outW = Math.round(mmToPx(cfg.width, S.dpi));
      outH = Math.round(mmToPx(cfg.height, S.dpi));
    } else {
      outW = Math.round(Math.max(Math.hypot(src4[1].x-src4[0].x,src4[1].y-src4[0].y),Math.hypot(src4[2].x-src4[3].x,src4[2].y-src4[3].y)));
      outH = Math.round(Math.max(Math.hypot(src4[3].x-src4[0].x,src4[3].y-src4[0].y),Math.hypot(src4[2].x-src4[1].x,src4[2].y-src4[1].y)));
    }
    let warped = PerspWarp.warp(rotSrc, src4, outW, outH);
    // Background removal (pure CSS/canvas: replace near-white/uniform edges with transparent on PNG)
    if (this._bgRemove) {
      warped = BgRemover.remove(warped);
    }
    const enhanced = Enhancer.enhance(warped);
    // Use PNG if bg removal was requested (to preserve transparency), else JPEG
    const mime = this._bgRemove ? 'image/png' : 'image/jpeg';
    const quality = this._bgRemove ? undefined : 0.93;
    const url = quality !== undefined ? enhanced.toDataURL(mime, quality) : enhanced.toDataURL(mime);
    setImg(S.cam.docId, S.cam.side, url);
    S.cam.docId = null; S.cam.side = null; S.cam.rawCanvas = null;
    this._close();
    renderDocList(); renderAcqSummary();
    toast('Immagine salvata ✓', 'success', 1500);
  },

  retry() {
    const docId = S.cam.docId, side = S.cam.side;
    this._close();
    if (docId && side) setTimeout(() => SourcePicker.show(docId, side), 200);
  },
};

/* ══════════════════ PERSPECTIVE WARP ══════════════════════ */
const PerspWarp={
  warp(src,c,dW,dH){
    const dst4=[{x:0,y:0},{x:dW,y:0},{x:dW,y:dH},{x:0,y:dH}];
    const H=this._dlt(c,dst4),Hi=H?this._inv3(H):null;
    const fb=()=>{const d=document.createElement('canvas');d.width=dW;d.height=dH;d.getContext('2d').drawImage(src,0,0,dW,dH);return d;};
    if(!Hi)return fb();
    const sw=src.width,sh=src.height,sd=src.getContext('2d').getImageData(0,0,sw,sh).data;
    const dc=document.createElement('canvas');dc.width=dW;dc.height=dH;
    const dctx=dc.getContext('2d'),di=dctx.createImageData(dW,dH),dd=di.data;
    for(let dy=0;dy<dH;dy++)for(let dx=0;dx<dW;dx++){
      const w_=Hi[6]*dx+Hi[7]*dy+Hi[8];if(Math.abs(w_)<1e-10)continue;
      const sx=(Hi[0]*dx+Hi[1]*dy+Hi[2])/w_,sy=(Hi[3]*dx+Hi[4]*dy+Hi[5])/w_;
      if(sx<0||sx>=sw-1||sy<0||sy>=sh-1)continue;
      const x0=sx|0,y0=sy|0,fx=sx-x0,fy=sy-y0;
      const w00=(1-fx)*(1-fy),w10=fx*(1-fy),w01=(1-fx)*fy,w11=fx*fy;
      const i00=(y0*sw+x0)*4,i10=(y0*sw+x0+1)*4,i01=((y0+1)*sw+x0)*4,i11=((y0+1)*sw+x0+1)*4,oi=(dy*dW+dx)*4;
      dd[oi]  =w00*sd[i00]  +w10*sd[i10]  +w01*sd[i01]  +w11*sd[i11];
      dd[oi+1]=w00*sd[i00+1]+w10*sd[i10+1]+w01*sd[i01+1]+w11*sd[i11+1];
      dd[oi+2]=w00*sd[i00+2]+w10*sd[i10+2]+w01*sd[i01+2]+w11*sd[i11+2];
      dd[oi+3]=255;
    }
    dctx.putImageData(di,0,0);return dc;
  },
  _dlt(src,dst){
    const A=[],b=[];
    for(let i=0;i<4;i++){const{x:sx,y:sy}=src[i],{x:dx,y:dy}=dst[i];
      A.push([sx,sy,1,0,0,0,-dx*sx,-dx*sy]);b.push(dx);
      A.push([0,0,0,sx,sy,1,-dy*sx,-dy*sy]);b.push(dy);}
    const h=this._gauss(A,b);return h?[...h,1]:null;
  },
  _gauss(A,b){
    const n=A.length,M=A.map((r,i)=>[...r,b[i]]);
    for(let c=0;c<n;c++){
      let mx=c;for(let r=c+1;r<n;r++)if(Math.abs(M[r][c])>Math.abs(M[mx][c]))mx=r;
      [M[c],M[mx]]=[M[mx],M[c]];if(Math.abs(M[c][c])<1e-10)return null;
      for(let r=c+1;r<n;r++){const f=M[r][c]/M[c][c];for(let k=c;k<=n;k++)M[r][k]-=f*M[c][k];}
    }
    const x=new Array(n).fill(0);
    for(let i=n-1;i>=0;i--){x[i]=M[i][n];for(let j=i+1;j<n;j++)x[i]-=M[i][j]*x[j];x[i]/=M[i][i];}
    return x;
  },
  _inv3(m){
    const[a,b,c,d,e,f,g,h,k]=m,det=a*(e*k-f*h)-b*(d*k-f*g)+c*(d*h-e*g);
    if(Math.abs(det)<1e-10)return null;const v=1/det;
    return[(e*k-f*h)*v,(c*h-b*k)*v,(b*f-c*e)*v,(f*g-d*k)*v,(a*k-c*g)*v,(c*d-a*f)*v,(d*h-e*g)*v,(b*g-a*h)*v,(a*e-b*d)*v];
  },
};

/* ══════════════════ BACKGROUND REMOVER ══════════════════════
   Simple flood-fill from corners to remove uniform background.
   Works well for ID cards shot on desk/white background.
══════════════════════════════════════════════════════════════ */
const BgRemover = {
  remove(src) {
    const w = src.width, h = src.height;
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d');
    ctx.drawImage(src, 0, 0);
    const id = ctx.getImageData(0, 0, w, h);
    const d = id.data;

    // Sample background color from the 4 corners (average)
    const samples = [[0,0],[w-1,0],[0,h-1],[w-1,h-1]];
    let sr=0,sg=0,sb=0;
    samples.forEach(([x,y]) => {
      const i=(y*w+x)*4;
      sr+=d[i]; sg+=d[i+1]; sb+=d[i+2];
    });
    sr=Math.round(sr/4); sg=Math.round(sg/4); sb=Math.round(sb/4);

    // Tolerance for color matching
    const tol = 38;
    function similar(i) {
      return Math.abs(d[i]-sr)<tol && Math.abs(d[i+1]-sg)<tol && Math.abs(d[i+2]-sb)<tol;
    }

    // BFS flood-fill from all 4 corners simultaneously
    const visited = new Uint8Array(w * h);
    const queue = [];
    samples.forEach(([x,y]) => {
      const idx = y*w+x;
      if (!visited[idx]) { visited[idx]=1; queue.push(idx); }
    });

    let qi = 0;
    while (qi < queue.length) {
      const idx = queue[qi++];
      const x = idx % w, y = (idx / w) | 0;
      const pi = idx * 4;
      if (!similar(pi)) continue;
      d[pi+3] = 0; // make transparent
      const neighbors = [];
      if (x>0)   neighbors.push(idx-1);
      if (x<w-1) neighbors.push(idx+1);
      if (y>0)   neighbors.push(idx-w);
      if (y<h-1) neighbors.push(idx+w);
      neighbors.forEach(n => { if (!visited[n]) { visited[n]=1; queue.push(n); } });
    }

    ctx.putImageData(id, 0, 0);
    return out;
  },
};
const Enhancer={
  enhance(src){
    const w=src.width,h=src.height,d=document.createElement('canvas');d.width=w;d.height=h;
    const ctx=d.getContext('2d');ctx.drawImage(src,0,0);const P=CONFIG.PROCESSING;
    let id=ctx.getImageData(0,0,w,h);
    if(P.whiteBalance)id=this._wb(id);
    id=this._cb(id,P.contrast,P.brightness);id=this._sat(id,P.saturation);
    ctx.putImageData(id,0,0);
    if(P.sharpenStrength>0)ctx.putImageData(this._sh(ctx,w,h,P.sharpenStrength),0,0);
    return d;
  },
  _wb(id){const d=id.data,n=d.length/4;let r=0,g=0,b=0;for(let i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2];}r/=n;g/=n;b/=n;const avg=(r+g+b)/3,sr=avg/Math.max(r,1),sg=avg/Math.max(g,1),sb=avg/Math.max(b,1);for(let i=0;i<d.length;i+=4){d[i]=clamp(d[i]*sr,0,255);d[i+1]=clamp(d[i+1]*sg,0,255);d[i+2]=clamp(d[i+2]*sb,0,255);}return id;},
  _cb(id,ct,br){const d=id.data;for(let i=0;i<d.length;i+=4){d[i]=clamp(d[i]*ct+br,0,255);d[i+1]=clamp(d[i+1]*ct+br,0,255);d[i+2]=clamp(d[i+2]*ct+br,0,255);}return id;},
  _sat(id,s){const d=id.data;for(let i=0;i<d.length;i+=4){const g=.299*d[i]+.587*d[i+1]+.114*d[i+2];d[i]=clamp(g+s*(d[i]-g),0,255);d[i+1]=clamp(g+s*(d[i+1]-g),0,255);d[i+2]=clamp(g+s*(d[i+2]-g),0,255);}return id;},
  _sh(ctx,w,h,str){const b=document.createElement('canvas');b.width=w;b.height=h;const bx=b.getContext('2d');bx.filter='blur(1px)';bx.drawImage(ctx.canvas,0,0);bx.filter='none';const o=ctx.getImageData(0,0,w,h),bl=bx.getImageData(0,0,w,h),res=ctx.getImageData(0,0,w,h);const od=o.data,bd=bl.data,rd=res.data;for(let i=0;i<rd.length;i+=4){rd[i]=clamp(od[i]+str*(od[i]-bd[i]),0,255);rd[i+1]=clamp(od[i+1]+str*(od[i+1]-bd[i+1]),0,255);rd[i+2]=clamp(od[i+2]+str*(od[i+2]-bd[i+2]),0,255);}return res;},
};

/* ═════════════════════ LAYOUT ENGINE ═══════════════════════
   Colonne centrate H+V.
   Verificato: 2 doc × (fronte+retro) su A4 = 1 pagina.
   A4 area utile: 210-20=190mm × 297-20=277mm
   2 col: 85.6+6+85.6=177.2mm ≤ 190mm ✓
   Col height: 54+6+54=114mm ≤ 277mm ✓
════════════════════════════════════════════════════════════ */
function computeLayout() {
  const fmt  = CONFIG.PAGE_FORMATS[S.pageFormat];
  const land = S.orientation==='landscape';
  const pW   = land ? fmt.height : fmt.width;
  const pH   = land ? fmt.width  : fmt.height;
  const mg   = CONFIG.PAGE_MARGIN_MM;   // 10mm
  const sp   = CONFIG.DOC_SPACING_MM;   // 6mm
  const aW   = pW - 2*mg;
  const aH   = pH - 2*mg;

  if (!S.docs.length) { S.layout=[]; return; }

  // Build columns
  const columns = S.docs.map(doc => {
    const cfg   = CONFIG.DOCUMENT_TYPES[doc.type];
    const sides = doc.sides==='both' ? ['front','back'] : [doc.sides];
    return sides.map(side => ({
      docId:doc.id, side,
      wMm:cfg.width, hMm:cfg.height,
      image:doc.images[side],
      label:`${cfg.shortName} — ${side==='front'?'Fronte':'Retro'}`,
    }));
  });

  const colDims = columns.map(slots=>({
    w: Math.max(...slots.map(s=>s.wMm)),
    h: slots.reduce((a,s,i)=>a+s.hMm+(i>0?sp:0),0),
  }));

  // Greedy row grouping
  const pageGroups=[];
  let grp=[], grpW=0, grpH=0;
  columns.forEach((_,ci)=>{
    const cw=colDims[ci].w, ch=colDims[ci].h;
    const need = grp.length===0 ? cw : grpW+sp+cw;
    if(need>aW && grp.length>0){
      pageGroups.push({cols:grp,maxH:grpH}); grp=[ci];grpW=cw;grpH=ch;
    }else{
      grp.push(ci); grpW=need; grpH=Math.max(grpH,ch);
    }
  });
  if(grp.length) pageGroups.push({cols:grp,maxH:grpH});

  S.layout = pageGroups.map(({cols,maxH})=>{
    const gridW=cols.reduce((a,ci,i)=>a+colDims[ci].w+(i>0?sp:0),0);
    const gridH=Math.min(maxH,aH);
    const startX=mg+(aW-gridW)/2;
    const startY=mg+(aH-gridH)/2;
    const items=[];
    let cx=startX;
    cols.forEach(ci=>{
      const col=columns[ci], cw=colDims[ci].w, ch=colDims[ci].h;
      let cy=startY+(gridH-ch)/2;
      col.forEach(slot=>{ items.push({...slot, xMm:cx+(cw-slot.wMm)/2, yMm:cy}); cy+=slot.hMm+sp; });
      cx+=cw+sp;
    });
    return{wMm:pW, hMm:pH, items};
  });
}

/* ═══════════════════════ PREVIEW ════════════════════════════ */
function renderPreview() {
  const wrap=$('preview-wrap');
  wrap.innerHTML='';
  if(!S.layout?.length){
    wrap.innerHTML='<div style="padding:24px 0;text-align:center;color:var(--t3);font-size:13px">Nessun documento</div>';
    return;
  }
  S.layout.forEach((page,idx)=>{
    if(S.layout.length>1){
      const ll=document.createElement('div');
      ll.className='preview-pg-lbl';
      ll.textContent=`Pagina ${idx+1} di ${S.layout.length}`;
      wrap.appendChild(ll);
    }
    const maxW=Math.min(280,(wrap.clientWidth||300)-4);
    const scale=maxW/page.wMm;
    const pgEl=document.createElement('div');
    pgEl.className='preview-pg';
    pgEl.style.cssText=`width:${maxW}px;height:${Math.round(page.hMm*scale)}px;`;
    const mgPx=CONFIG.PAGE_MARGIN_MM*scale;
    const mb=document.createElement('div');
    mb.className='prev-margin';
    mb.style.cssText=`inset:${mgPx}px;`;
    pgEl.appendChild(mb);
    page.items.forEach(item=>{
      const slot=document.createElement('div');
      slot.className='prev-slot'+(item.image?'':' prev-slot-empty');
      slot.style.cssText=`left:${item.xMm*scale}px;top:${item.yMm*scale}px;width:${item.wMm*scale}px;height:${item.hMm*scale}px;`;
      if(item.image){const img=document.createElement('img');img.src=item.image;slot.appendChild(img);}
      else slot.textContent='—';
      const ll=document.createElement('div');ll.className='prev-slot-lbl';ll.textContent=item.label;slot.appendChild(ll);
      pgEl.appendChild(slot);
    });
    wrap.appendChild(pgEl);
  });
}

/* ═══════════════════════ EXPORT ═════════════════════════════ */
function _isMobileShare() {
  return ('ontouchstart' in window || navigator.maxTouchPoints > 0) && !!navigator.share;
}

async function doExport() {
  if(!S.layout?.length){toast('Nessun documento','warning');return;}
  const btnMain = $('btn-export');
  const btnNav  = $('btn-export-nav');
  if (btnMain) btnMain.disabled = true;
  if (btnNav)  btnNav.disabled  = true;
  const name = ($('export-name').value||'scansione').trim();
  const fmt  = S.exportFormat;

  // Build retry fn immediately (before async ops)
  const savedName = name;
  const savedFmt  = fmt;

  try {
    if (_isMobileShare()) {
      // On iOS: trigger share sheet. Show success right away since we can't
      // know when/if the user actually saves the file — that's the OS's job.
      // exportShare may throw AbortError if user cancels — we handle that below.
      await exportShare(name);
      // Only reach here if share succeeded (not cancelled)
      _lastExportFn = () => exportShare(savedName);
      showExportSuccess(name, fmt);
    } else {
      // Desktop: start download, then show success screen
      if (fmt === 'pdf') await exportPDF(name);
      else               await exportImg(name, fmt);
      _lastExportFn = async () => {
        if (savedFmt === 'pdf') await exportPDF(savedName);
        else                    await exportImg(savedName, savedFmt);
      };
      showExportSuccess(name, fmt);
    }
  } catch(err) {
    if (err?.name === 'AbortError' || err?.message?.includes('cancel')) {
      // User dismissed the share sheet — don't show success, just re-enable buttons
    } else {
      console.error(err);
      toast(`Errore: ${err.message}`, 'error', 5000);
    }
  } finally {
    if (btnMain) btnMain.disabled = false;
    if (btnNav)  btnNav.disabled  = false;
  }
}

function showExportSuccess(name, fmt) {
  const ext = fmt === 'pdf' ? '.pdf' : fmt === 'png' ? '.png' : '.jpg';
  const fname = san(name) + ext;

  const sfn = $('success-filename');
  if (sfn) sfn.textContent = fname;

  // Hide the export UI underneath
  const ui = $('export-ui');
  if (ui) { ui.style.visibility = 'hidden'; ui.style.pointerEvents = 'none'; }

  // Hide mobile header bar and bottom nav export button
  const header = document.querySelector('.app-header');
  const nav    = $('btn-export-nav');
  if (header) header.style.display = 'none';
  if (nav)    nav.style.display    = 'none';

  // Show success overlay
  const suc = $('export-success');
  if (suc) suc.style.display = 'flex';

  // Launch confetti after a short delay (animation ramp-up)
  setTimeout(() => launchConfetti(), 400);
}

function hideExportSuccess() {
  const ui  = $('export-ui');
  const suc = $('export-success');
  if (ui)  { ui.style.visibility = ''; ui.style.pointerEvents = ''; }
  if (suc) { suc.style.display = 'none'; }

  // Cancel confetti if still running
  if (window._confettiRaf) { cancelAnimationFrame(window._confettiRaf); window._confettiRaf = null; }
  const cvs = $('confetti-cvs');
  if (cvs) { const cx = cvs.getContext('2d'); cx.clearRect(0,0,cvs.width,cvs.height); }

  // Restore header and nav
  const header = document.querySelector('.app-header');
  const nav    = $('btn-export-nav');
  if (header) header.style.display = '';
  if (nav && S.step === 2) nav.style.display = '';
}

/* ── Confetti ──────────────────────────────────────────────── */
function launchConfetti() {
  const cvs = $('confetti-cvs');
  if (!cvs) return;
  const W = cvs.width  = window.innerWidth;
  const H = cvs.height = window.innerHeight;
  const ctx = cvs.getContext('2d');

  const COLORS = ['#00d4ff','#00e5a0','#ffaa00','#ff6b8a','#a78bfa','#34d399','#f9a8d4'];
  const N = 90;
  const particles = Array.from({length: N}, (_, i) => ({
    x: W * 0.5 + (Math.random() - 0.5) * W * 0.4,
    y: H * 0.35,
    vx: (Math.random() - 0.5) * 14,
    vy: -(Math.random() * 14 + 6),
    rot: Math.random() * 360,
    rotV: (Math.random() - 0.5) * 12,
    w: Math.random() * 8 + 5,
    h: Math.random() * 4 + 3,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    alpha: 1,
    delay: i * 8,          // stagger launch
    tick: 0,
  }));

  let frame = 0;
  let rafId;
  function step() {
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    particles.forEach(p => {
      if (frame < p.delay) return;
      p.tick++;
      p.vy += 0.38;        // gravity
      p.vx *= 0.99;        // air friction
      p.x  += p.vx;
      p.y  += p.vy;
      p.rot += p.rotV;
      // Fade out after hitting ~60% of screen height
      if (p.y > H * 0.6) p.alpha = Math.max(0, p.alpha - 0.025);
      if (p.alpha <= 0 || p.y > H + 40) return;
      alive++;
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.rect(-p.w/2, -p.h/2, p.w, p.h);
      ctx.fill();
      ctx.restore();
    });
    frame++;
    if (alive > 0 || frame < N * 8 + 30) {
      rafId = requestAnimationFrame(step);
    } else {
      ctx.clearRect(0, 0, W, H);
    }
  }
  rafId = requestAnimationFrame(step);
  // Store so we can cancel if user navigates away
  window._confettiRaf = rafId;
}

async function exportShare(name) {
  // Build the file blob then open native iOS/Android share sheet
  const fname = san(name);
  let blob, fileName;

  if (S.exportFormat === 'pdf') {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) throw new Error('jsPDF non disponibile');
    const land = S.orientation === 'landscape';
    const doc  = new jsPDF({orientation:land?'landscape':'portrait',unit:'mm',format:S.pageFormat.toLowerCase()});
    for (let i = 0; i < S.layout.length; i++) {
      if (i > 0) doc.addPage();
      doc.addImage(pgCanvas(S.layout[i], S.dpi).toDataURL('image/jpeg',.92),'JPEG',0,0,S.layout[i].wMm,S.layout[i].hMm);
    }
    const pdfBytes = doc.output('arraybuffer');
    blob = new Blob([pdfBytes], { type: 'application/pdf' });
    fileName = `${fname}.pdf`;
  } else {
    const fmt  = S.exportFormat;
    const mime = fmt === 'png' ? 'image/png' : 'image/jpeg';
    const q    = fmt === 'jpeg' ? 0.92 : undefined;
    const url  = q != null ? pgCanvas(S.layout[0], S.dpi).toDataURL(mime, q) : pgCanvas(S.layout[0], S.dpi).toDataURL(mime);
    const res  = await fetch(url);
    blob = await res.blob();
    fileName = `${fname}${fmt === 'png' ? '.png' : '.jpg'}`;
  }

  const file = new File([blob], fileName, { type: blob.type });
  // Try share with file first, fallback to URL share or download
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: fileName });
  } else {
    // Fallback: share URL (blob URL)
    const blobUrl = URL.createObjectURL(blob);
    try {
      await navigator.share({ title: fileName, url: blobUrl });
    } catch {
      // Last fallback: direct download
      dlUrl(blobUrl, fileName);
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  }
}

async function exportPDF(name){
  const{jsPDF}=window.jspdf; if(!jsPDF)throw new Error('jsPDF non disponibile');
  const land=S.orientation==='landscape';
  const doc=new jsPDF({orientation:land?'landscape':'portrait',unit:'mm',format:S.pageFormat.toLowerCase()});
  for(let i=0;i<S.layout.length;i++){
    if(i>0)doc.addPage();
    const pg=S.layout[i];
    doc.addImage(pgCanvas(pg,S.dpi).toDataURL('image/jpeg',.92),'JPEG',0,0,pg.wMm,pg.hMm);
  }
  // Use blob URL for reliable cross-browser download
  const pdfBytes = doc.output('arraybuffer');
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const blobUrl = URL.createObjectURL(blob);
  dlUrl(blobUrl, `${san(name)}.pdf`);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
}

async function exportImg(name,fmt){
  const mime=fmt==='png'?'image/png':'image/jpeg';
  const q=fmt==='jpeg'?.92:undefined;
  for(let i=0;i<S.layout.length;i++){
    const dataUrl = q!=null
      ? pgCanvas(S.layout[i],S.dpi).toDataURL(mime,q)
      : pgCanvas(S.layout[i],S.dpi).toDataURL(mime);
    // Convert to blob URL for reliable download (data URLs can fail on large files)
    const res  = await fetch(dataUrl);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const ext = fmt==='png'?'.png':'.jpg';
    const suffix = S.layout.length>1?`_pag${i+1}`:'';
    dlUrl(blobUrl, `${san(name)}${suffix}${ext}`);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    if(i<S.layout.length-1) await new Promise(r=>setTimeout(r,300));
  }
}

function pgCanvas(page,dpi){
  const W=Math.round(mmToPx(page.wMm,dpi)),H=Math.round(mmToPx(page.hMm,dpi));
  const c=document.createElement('canvas');c.width=W;c.height=H;
  const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
  page.items.forEach(item=>{
    const x=Math.round(mmToPx(item.xMm,dpi)),y=Math.round(mmToPx(item.yMm,dpi));
    const iw=Math.round(mmToPx(item.wMm,dpi)),ih=Math.round(mmToPx(item.hMm,dpi));
    if(item.image){
      const img=new Image();img.src=item.image;
      if(img.complete){ctx.drawImage(img,x,y,iw,ih);ctx.strokeStyle='rgba(0,0,0,.08)';ctx.lineWidth=Math.max(.5,dpi/300);ctx.strokeRect(x,y,iw,ih);}
    }else{ctx.fillStyle='#eee';ctx.fillRect(x,y,iw,ih);}
  });
  return c;
}

function dlUrl(url,name){const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();document.body.removeChild(a);}
function san(n){return(n||'scan').replace(/[^\w\-\.àèéìíîòóùú ]/g,'').replace(/\s+/g,'_');}

/* ═════════════════════ SESSION ══════════════════════════════ */
function save(){
  try{
    localStorage.setItem(CONFIG.STORAGE_KEY,JSON.stringify({
      pageFormat:S.pageFormat,orientation:S.orientation,exportFormat:S.exportFormat,
      dpi:S.dpi,fileName:S.fileName,
      docs:S.docs.map(d=>({id:d.id,type:d.type,sides:d.sides,images:{front:d.images.front,back:d.images.back}})),
      step:S.step,_uid:S._uid,
    }));
  }catch{}
}

function loadSaved(){
  try{
    const r=localStorage.getItem(CONFIG.STORAGE_KEY); if(!r)return false;
    const x=JSON.parse(r);
    S.pageFormat=x.pageFormat||'A4'; S.orientation=x.orientation||'portrait';
    S.exportFormat=x.exportFormat||'pdf'; S.dpi=x.dpi||150; S.fileName=x.fileName||'scansione-documenti';
    S.docs=x.docs||[]; S._uid=x._uid||1; S.step=Math.min(x.step||0,1);
    return true;
  }catch{return false;}
}

function resetApp(){
  ConfirmModal.show('Nuovo progetto', 'Vuoi ricominciare? Tutte le scansioni aggiunte andranno perse.', () => {
    localStorage.removeItem(CONFIG.STORAGE_KEY);
    sessionStorage.removeItem('docscan_welcome_seen');
    S.pageFormat='A4';S.orientation='portrait';S.exportFormat='pdf';
    S.dpi=150;S.fileName='scansione-documenti';S.docs=[];S._uid=1;S.layout=null;
    _lastExportFn = null;
    hideExportSuccess();
    initStep0(); restoreStep0(); initStep1();
    syncExportUI();
    gotoStep(0,false);
    initWelcome();
  });
}

/* ═══════════════════ CONFIRM MODAL ══════════════════════════ */
const ConfirmModal = {
  _cb: null,
  show(title, msg, onConfirm) {
    this._cb = onConfirm;
    $('confirm-title').textContent = title;
    document.querySelector('.modal-msg').textContent = msg;
    $('confirm-backdrop').classList.add('open');
    $('confirm-modal').classList.add('open');
  },
  dismiss() {
    $('confirm-backdrop').classList.remove('open');
    $('confirm-modal').classList.remove('open');
    this._cb = null;
  },
  confirm() {
    const cb = this._cb;
    this.dismiss();
    if (cb) cb();
  },
};

/* ═══════════════════════ SYNC UI ════════════════════════════ */
function syncExportUI(){
  $('exp-fmt-row').querySelectorAll('.seg-btn').forEach(b=>b.classList.toggle('active',b.dataset.v===S.exportFormat));
  $('dpi-row').querySelectorAll('.dpi-btn').forEach(b=>b.classList.toggle('active',+b.dataset.v===S.dpi));
  $('export-name').value=S.fileName;
  const lbl = `Scarica ${S.exportFormat.toUpperCase()}`;
  $('btn-export-lbl').textContent = lbl;
  const navLbl = $('btn-export-nav-lbl');
  if (navLbl) navLbl.textContent = lbl;
}

/* ═══════════════════════ EVENTS ═════════════════════════════ */
function bindEvents(){
  // Mobile nav
  $('btn-back').addEventListener('click',()=>gotoStep(S.step-1,false));
  $('btn-fwd').addEventListener('click', ()=>gotoStep(S.step+1));

  // Mobile step pills
  document.querySelectorAll('.step-pill').forEach(el=>
    el.addEventListener('click',()=>{const n=+el.dataset.step;if(n<S.step)gotoStep(n,false);}));

  // Desktop sidebar
  document.querySelectorAll('.snav-item').forEach(el=>
    el.addEventListener('click',()=>{const n=+el.dataset.step;if(n<S.step)gotoStep(n,false);}));

  // Reset buttons
  $('btn-reset-mobile')?.addEventListener('click',resetApp);
  $('sidebar-reset')?.addEventListener('click',resetApp);

  // Confirm modal
  $('confirm-cancel')?.addEventListener('click', () => ConfirmModal.dismiss());
  $('confirm-ok')?.addEventListener('click',     () => ConfirmModal.confirm());
  $('confirm-backdrop')?.addEventListener('click', () => ConfirmModal.dismiss());

  // Desktop panel action buttons
  $('step0-next')?.addEventListener('click',()=>gotoStep(1));
  $('step1-back')?.addEventListener('click',()=>gotoStep(0,false));
  $('step1-next')?.addEventListener('click',()=>gotoStep(2));
  $('step2-back')?.addEventListener('click',()=>gotoStep(1,false));

  // Source picker
  $('source-backdrop').addEventListener('click', () => SourcePicker.dismiss());
  $('ss-cancel').addEventListener('click',       () => SourcePicker.dismiss());
  $('ss-opt-camera').addEventListener('click', () => {
    SourcePicker.dismiss();
    setTimeout(() => openCamera(SourcePicker._docId, SourcePicker._side), 180);
  });
  $('ss-opt-library').addEventListener('click', () => {
    // Set docId/side before opening gallery
    S.cam.docId = SourcePicker._docId;
    S.cam.side  = SourcePicker._side;
    SourcePicker.dismiss();
    setTimeout(() => openGallery(), 120);
  });

  // Camera card
  $('cam-x').addEventListener('click',       closeCam);
  $('btn-shutter').addEventListener('click', capturePhoto);
  $('btn-flip').addEventListener('click',    flipCamera);
  $('btn-gallery').addEventListener('click', () => {
    // Gallery from inside camera — keep docId/side from S.cam
    openGallery();
  });

  // Gallery file input — listener is now attached dynamically inside openGallery()
  // to ensure it works reliably on iOS Safari after repeated use.

  // Crop card
  $('btn-crop-back').addEventListener('click', () => CropEditor.retry());
  $('btn-crop-ok').addEventListener('click',   () => CropEditor.confirm());
  $('btn-crop-rotate')?.addEventListener('click', () => CropEditor.rotate());
  $('btn-crop-bgremove')?.addEventListener('click', () => CropEditor.toggleBgRemove());
  $('crop-backdrop').addEventListener('click', () => CropEditor.retry()); // click outside = retry

  const cc = $('crop-cvs');
  cc.addEventListener('touchstart',  e => CropEditor.down(e), {passive:false});
  cc.addEventListener('touchmove',   e => CropEditor.move(e), {passive:false});
  cc.addEventListener('touchend',    e => CropEditor.up(e),   {passive:false});
  cc.addEventListener('touchcancel', e => CropEditor.up(e),   {passive:false});
  cc.addEventListener('mousedown',   e => CropEditor.down(e));
  cc.addEventListener('mousemove',   e => CropEditor.move(e));
  cc.addEventListener('mouseup',     e => CropEditor.up(e));
  cc.addEventListener('mouseleave',  e => CropEditor.up(e));

  // Prevent pinch zoom
  document.addEventListener('touchmove', e => {
    const inCard = $('cam-card').classList.contains('open') || $('crop-card').classList.contains('open');
    if (inCard && e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  // Safari scroll: handled via CSS (-webkit-overflow-scrolling:touch on .app-main)

  // Export options
  $('exp-fmt-row').addEventListener('click',e=>{
    const b=e.target.closest('.seg-btn');if(!b)return;
    S.exportFormat=b.dataset.v;
    $('exp-fmt-row').querySelectorAll('.seg-btn').forEach(x=>x.classList.toggle('active',x===b));
    const lbl = `Scarica ${S.exportFormat.toUpperCase()}`;
    $('btn-export-lbl').textContent = lbl;
    const navLbl = $('btn-export-nav-lbl');
    if (navLbl) navLbl.textContent = lbl;
    $('export-ok').classList.remove('show');
    save();
  });
  $('dpi-row').addEventListener('click',e=>{
    const b=e.target.closest('.dpi-btn');if(!b)return;
    S.dpi=+b.dataset.v;
    $('dpi-row').querySelectorAll('.dpi-btn').forEach(x=>x.classList.toggle('active',x===b));
    save();
  });
  $('export-name').addEventListener('input',e=>{S.fileName=e.target.value;save();});
  $('btn-export').addEventListener('click',doExport);
  $('btn-export-nav')?.addEventListener('click', doExport);

  // Success screen buttons
  $('btn-retry-download')?.addEventListener('click', async () => {
    if (_lastExportFn) {
      try { await _lastExportFn(); toast('Download riavviato ✓','success',1800); }
      catch(err) { if(err?.name!=='AbortError') toast(`Errore: ${err.message}`,'error',4000); }
    }
  });
  $('btn-new-scan')?.addEventListener('click', () => {
    resetApp();
  });

  // Resize
  window.addEventListener('resize',()=>{
    if($('crop-card').classList.contains('open'))CropEditor._resize();
    if(S.step===2)renderPreview();
  });
}

/* ═══════════════════════ WELCOME ════════════════════════════ */
function initWelcome(){
  const el  = $('welcome');
  const btn = $('btn-start');
  if (!el || !btn) return;

  // If already dismissed this session AND we're not in a reset, hide immediately
  const seen = sessionStorage.getItem('docscan_welcome_seen');
  if (seen) { el.classList.add('gone'); return; }

  // Show the welcome (in case it was hidden by a previous dismiss)
  el.classList.remove('out', 'gone');

  // Remove any stale listener by replacing the button with a clone
  const fresh = btn.cloneNode(true);
  btn.parentNode.replaceChild(fresh, btn);
  fresh.addEventListener('click', dismissWelcome);
  fresh.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') dismissWelcome();
  });
}

function dismissWelcome(){
  const el = $('welcome');
  if (!el || el.classList.contains('gone')) return;
  sessionStorage.setItem('docscan_welcome_seen', '1');
  el.classList.add('out');
  setTimeout(() => el.classList.add('gone'), 720);
}

/* ═══════════════════════ INIT ═══════════════════════════════ */
function init(){
  const restored=loadSaved();
  initStep0(); initStep1(); bindEvents(); syncExportUI();
  if(restored){
    restoreStep0();
    gotoStep(S.step,false);
  }else{
    gotoStep(0,false);
  }
  syncBottomNav();
  // Welcome last — shows on top of everything
  initWelcome();
}

document.addEventListener('DOMContentLoaded',init);
