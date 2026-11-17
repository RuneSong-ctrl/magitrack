import '@fontsource-variable/figtree'
import './style.css'
import { icon } from './icons.js'
import { all, save, put, session, api, sync, onSync, syncState, countPending, fileUrl } from './store.js'
import { loadModel, predict, forecastNext, weather, alerts, checkReading } from './ai.js'
import { logistik } from './logistik.js'
import { hotel } from './hotel.js'

// ---------- data tetap ----------
const DEPOTS = [
  { id: 'bresela', nama: 'Wantilan Bresela', lat: -8.3935, lon: 115.2465 },
  { id: 'sanur', nama: 'Magi Farm Sanur', lat: -8.6805, lon: 115.2565 },
]
const TAHAP = [
  { id: 'telur', label: 'Telur' },
  { id: 'baby', label: 'Baby maggot' },
  { id: 'larva', label: 'Larva' },
  { id: 'prepupa', label: 'Prepupa' },
  { id: 'panen', label: 'Dipanen' },
]
const RAK = ['A', 'B']
const SLOT_PER_RAK = 12
const NAV = {
  mitra: [['rak', 'Rak', 'rak'], ['telur', 'Telur', 'telur'], ['batch', 'Batch', 'batch'], ['prediksi', 'Prediksi', 'prediksi'], ['lain', 'Lainnya', 'lain']],
  // item ke-4 dst. (selain Lainnya) hanya tampil di rail desktop untuk admin
  admin: [['rak', 'Rak', 'rak'], ['rute', 'Rute', 'rute'], ['klien', 'Klien', 'klien'], ['batch', 'Batch', 'batch'], ['telur', 'Telur', 'telur', 1], ['prediksi', 'Prediksi', 'prediksi', 1], ['lain', 'Lainnya', 'lain']],
  driver: [['jemput', 'Hari ini', 'rute'], ['cuaca', 'Cuaca', 'cuaca'], ['lain', 'Lainnya', 'lain']],
  hotel: [['dampak', 'Dampak', 'prediksi'], ['lain', 'Lainnya', 'lain']],
}
const GOOGLE_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

// ---------- state ----------
const S = {
  user: session.get()?.user,
  view: localStorage.getItem('mt.view') || 'rak',
  depot: DEPOTS.find(d => d.id === localStorage.getItem('mt.depot')) || DEPOTS[0],
  eggs: [], batches: [], clients: [], routes: [], pickups: [], weather: null, filter: 'semua',
  sim: { pakan: 'FW', hari: 5, suhu: 30, cahaya: 12, rh: 70, gram: '' },
}

// ---------- util ----------
const $ = s => document.querySelector(s)
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const num = (v, d = 0) => (v === '' || v == null || isNaN(v) ? '–' : Number(v).toLocaleString('id-ID', { maximumFractionDigits: d }))
const today = () => new Date().toLocaleDateString('sv-SE')
const tgl = s => s ? new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '–'
const hariSejak = s => Math.floor((Date.now() - new Date(s)) / 864e5)
const live = rows => rows.filter(r => !r.batal)

function tahapSaran(b) {
  if (b.kg_larva > 0) return 'panen'
  const h = hariSejak(b.tanggal_tetas)
  return h < 0 ? 'telur' : h < 7 ? 'baby' : h < 21 ? 'larva' : 'prepupa'
}
const tahapOf = b => b.tahap || tahapSaran(b)
const tahapLabel = id => TAHAP.find(t => t.id === id)?.label || id

function toast(msg, undo) {
  const t = $('#toast')
  toast.undo = undo
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button class="toast-b" data-act="toast-undo">Urungkan</button>' : ''}`
  t.classList.add('show')
  clearTimeout(toast.t)
  toast.t = setTimeout(toast.hide, undo ? 5000 : 2600)
}
toast.hide = () => { $('#toast')?.classList.remove('show'); toast.undo = null }

async function load() {
  ;[S.eggs, S.batches] = await Promise.all([all('Eggs'), all('Batches'), LG?.load()])
  S.eggs.sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.dibuat.localeCompare(a.dibuat))
  S.batches.sort((a, b) => (b.tanggal_tetas || '').localeCompare(a.tanggal_tetas || ''))
}

// ---------- data contoh (hanya mode demo) ----------
async function seedDemo() {
  if ((await all('Batches')).length) return
  const d = n => new Date(Date.now() - n * 864e5).toLocaleDateString('sv-SE')
  const rows = [
    ['A-1', 26, 9.2, 'FW', 3.1, 28, 4.6, 7.8], ['A-2', 23, 10.4, 'FW', 3.4, 30, 0, 0], ['A-3', 18, 8.8, 'FW', 2.9, 22, 0, 0],
    ['A-4', 15, 11.0, 'OKA', 3.6, 18, 0, 0], ['A-5', 11, 9.6, 'FW', 3.0, 9, 0, 0], ['A-6', 8, 10.1, 'FW', 3.3, 5, 0, 0],
    ['A-7', 5, 12.3, 'FW', 0, 0, 0, 0], ['A-8', 3, 11.7, 'FW', 0, 0, 0, 0], ['B-1', 1, 10.8, 'FW', 0, 0, 0, 0],
    ['B-2', -2, 12.0, 'FW', 0, 0, 0, 0],
  ]
  for (const [rak, umur, gt, pakan, gb, kp, kl, kk] of rows)
    await put('Batches', {
      id: crypto.randomUUID(), kode: 'B' + d(umur).slice(5).replace('-', ''), rak, tanggal_tetas: d(umur),
      gram_telur: gt, pakan, gram_baby: gb ? gb * 1000 / 10 : '', kg_pakan: kp, kg_larva: kl, kg_kasgot: kk,
      tahap: '', oleh: 'contoh', dibuat: new Date().toISOString(), contoh: 1, _dirty: 0,
    })
  const eggs = [[0, 6, 11.4, 29, 72, 11], [2, 4, 12.6, 30, 70, 12], [4, 2, 6.1, 27, 78, 8], [6, 16, 1.2, 28, 75, 10]]
  for (const [n, hari, gram, suhu, rh, cahaya] of eggs)
    await put('Eggs', {
      id: crypto.randomUUID(), tanggal: d(n), kandang: 'Kandang 1', hari, pakan: 'FW', gram_telur: gram, suhu, rh,
      jam_cahaya: cahaya, catatan: '', oleh: 'contoh', dibuat: new Date().toISOString(), contoh: 1, _dirty: 0,
    })
}

// ---------- login ----------
function renderLogin(err = '') {
  document.body.className = 'is-login'
  $('#app').innerHTML = `
  <main class="login">
    <div class="login-card">
      <img src="/mark.png" alt="" class="login-mark" width="88" height="88">
      <h1>MagiTrack</h1>
      <p class="login-sub">Aplikasi mitra Magi Farm</p>
      ${GOOGLE_ID ? '<div id="gbtn" class="gbtn"></div>' : `
        <p class="login-note">Masuk sebagai</p>
        <div class="role-grid">
          ${[['mitra', 'Mitra budidaya'], ['admin', 'Admin'], ['driver', 'Driver'], ['hotel', 'Hotel']]
            .map(([id, l]) => `<button class="btn btn-ghost-light" data-demo="${id}">${l}${icon('kanan')}</button>`).join('')}
        </div>`}
      ${err ? `<p class="login-err" role="alert">${esc(err)}</p>` : ''}
    </div>
    <p class="login-foot">Magi Farm · Bali</p>
  </main>`
  if (GOOGLE_ID) {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.onload = () => {
      google.accounts.id.initialize({ client_id: GOOGLE_ID, callback: r => login('/auth/google', { credential: r.credential }) })
      google.accounts.id.renderButton($('#gbtn'), { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', locale: 'id' })
    }
    document.head.append(s)
  }
}

async function login(path, body) {
  try {
    const s = await api(path, body)
    session.set(s)
    S.user = s.user
    if (path === '/auth/demo') {
      await seedDemo()
      if (s.user.peran === 'admin') await LG.seed(true)
      if (s.user.peran === 'hotel') await HT.seed()
      if (s.user.peran === 'driver') { await LG.seed(false); await LG.seedDriverRoute(s.user.email) }
    }
    S.view = NAV[S.user.peran][0][0]
    start()
  } catch (e) {
    renderLogin(navigator.onLine ? e.message : 'Perlu internet untuk masuk pertama kali.')
  }
}

// ---------- shell ----------
function shell() {
  const nav = NAV[S.user.peran]
  if (!nav.some(n => n[0] === S.view) && !['cuaca', 'panduan'].includes(S.view)) S.view = nav[0][0]
  document.body.className = ''
  $('#app').innerHTML = `
  <header class="top">
    <div class="brand"><img src="/mark.png" alt="" width="28" height="28"><span>MagiTrack</span></div>
    ${S.user.peran === 'hotel' ? '' : `<button class="depot" data-act="depot" aria-label="Ganti lokasi depot">${icon('lokasi')}<span>${esc(S.depot.nama)}</span></button>`}
    <button class="sync" data-act="sync" id="sync" aria-live="polite"></button>
  </header>
  <nav class="rail" aria-label="Menu utama">
    <div class="rail-brand"><img src="/mark.png" alt="" width="36" height="36"><span>MagiTrack</span></div>
    ${nav.map(([id, l, ic, desk]) => `<a href="#${id}" class="nav-item${desk ? ' desk-only' : ''}" data-view="${id}">${icon(ic)}<span>${l}</span></a>`).join('')}
    <div class="rail-foot">
      <span class="who">${esc(S.user.nama)}<small>${esc(S.user.peran)}</small></span>
    </div>
  </nav>
  <main id="view" class="view" tabindex="-1"></main>
  ${['mitra', 'admin'].includes(S.user.peran) ? `<button class="fab" data-act="new-egg">${icon('tambah')}<span>Catat telur</span></button>` : ''}
  <dialog id="sheet" class="sheet"></dialog>
  <div id="toast" class="toast" role="status"></div>
  <div id="print" class="print-only"></div>`
  renderSync(syncState)
}

function renderSync(st) {
  const el = $('#sync')
  if (!el) return
  const off = !navigator.onLine
  el.className = 'sync' + (st.pending ? ' is-pending' : '') + (st.error ? ' is-error' : '')
  el.innerHTML = st.busy ? `${icon('sinkron', 'spin')}<span>Mengirim…</span>`
    : off ? `${icon('offline')}<span>${st.pending ? st.pending + ' belum terkirim' : 'Offline'}</span>`
    : st.error ? `${icon('awas')}<span>${st.pending} belum terkirim</span>`
    : st.pending ? `${icon('sinkron')}<span>${st.pending} belum terkirim</span>`
    : `${icon('cek')}<span>Tersimpan</span>`
  el.title = st.error || (st.last ? 'Terakhir sinkron ' + st.last.toLocaleTimeString('id-ID') : '')
}

function go(view) {
  S.view = view
  localStorage.setItem('mt.view', view)
  document.querySelectorAll('.nav-item').forEach(a => a.dataset.view === view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'))
  const v = $('#view')
  v.innerHTML = (VIEWS[view] || VIEWS.rak)()
  v.dataset.view = view
  v.focus({ preventScroll: true })
  scrollTo(0, 0)
  if (view === 'prediksi') updateSim()
  if (view === 'panduan') localStorage.setItem('mt.guide', '1')
  LG.after(view)
}

// ---------- komponen ----------
function alertList(compact) {
  const list = alerts(S.weather?.days, S.user.peran)
  if (!S.weather) return `<p class="muted small">Prakiraan cuaca belum tersedia.</p>`
  if (!list.length) return compact ? '' : `<p class="ok-line">${icon('cek')} Tidak ada peringatan untuk 3 hari ke depan.</p>`
  return list.map(a => `
    <article class="alert alert-${a.tingkat}"${compact ? ' data-view-go="cuaca" role="link" tabindex="0"' : ''}>
      ${icon('awas')}
      <div><strong>${a.judul}</strong><p>${a.isi}</p>${compact ? '' : `<p class="alert-do">${a.saran}</p>`}</div>
    </article>`).join('')
}

function weatherStrip() {
  const w = S.weather
  if (!w) return `<button class="wx" data-view-go="cuaca">${icon('awan')}<span>Memuat cuaca…</span></button>`
  const d = w.days[0]
  const hujan = d.hujan >= 1
  return `
  <button class="wx" data-view-go="cuaca" aria-label="Lihat prakiraan 7 hari">
    ${icon(hujan ? 'cuaca' : d.radiasi < 15 ? 'awan' : 'matahari')}
    <span class="wx-t"><b>${num(d.min)}–${num(d.maks)}°C</b>RH ${num(d.rh)}% · hujan ${num(d.hujan, 1)} mm</span>
    <span class="wx-more">7 hari</span>
  </button>`
}

function trayCell(b, slot) {
  if (!b) return `<button class="tray tray-empty" data-act="new-batch" data-slot="${slot}" aria-label="Tray ${slot} kosong, mulai batch">
      <span class="tray-slot">${slot}</span><span class="tray-empty-t">${icon('tambah')}Kosong</span></button>`
  const t = tahapOf(b)
  const umur = hariSejak(b.tanggal_tetas)
  const idx = TAHAP.findIndex(x => x.id === t)
  const siap = t === 'prepupa'
  const massa = b.kg_larva > 0 ? `${num(b.kg_larva, 1)} kg larva` : b.kg_pakan > 0 ? `${num(b.kg_pakan, 1)} kg pakan` : `${num(b.gram_telur, 1)} g telur`
  return `<button class="tray st-${t}${siap ? ' is-ready' : ''}" data-act="open-batch" data-id="${b.id}" aria-label="${esc(b.kode)}, ${tahapLabel(t)}, ${umur < 0 ? 'belum menetas' : 'hari ke-' + umur}">
    <span class="tray-in">
      <span class="tray-slot">${slot}</span>
      <span class="tray-stage">${tahapLabel(t)}</span>
      <span class="tray-day">${umur < 0 ? 'menetas ' + -umur + ' hr lagi' : 'hari ke-' + umur}</span>
      <span class="tray-mass">${massa}</span>
      <span class="tray-life" aria-hidden="true">${TAHAP.map((_, i) => `<i class="${i <= idx ? 'on' : ''}"></i>`).join('')}</span>
    </span>
    ${siap ? '<span class="tray-flag">Siap panen</span>' : ''}
  </button>`
}

// ---------- views ----------
const VIEWS = {
  rak() {
    const aktif = live(S.batches).filter(b => tahapOf(b) !== 'panen' || hariSejak(b.tanggal_tetas) < 35)
    const bySlot = Object.fromEntries(aktif.map(b => [b.rak, b]))
    const siap = aktif.filter(b => tahapOf(b) === 'prepupa').length
    const last = live(S.eggs)[0]
    const p = last && predict({ pakan: last.pakan, hari: +last.hari, suhu: +last.suhu, cahaya: +last.jam_cahaya, rh: +last.rh, gram: +last.gram_telur })
    const next = last && forecastNext(live(S.eggs))
    const contoh = S.batches.some(b => b.contoh)
    return `
    <div class="page-head">
      <h1>Rak biopond</h1>
      <p class="summary">${aktif.length} tray terisi · <b>${siap}</b> siap panen · ${RAK.length * SLOT_PER_RAK - aktif.length} kosong
        ${contoh ? '<span class="tag">Data contoh</span>' : ''}</p>
    </div>
    <div class="home-grid">
      <section class="rack-wrap" aria-label="Rak biopond">
        ${RAK.map(r => `
          <div class="rack">
            <h2 class="rack-name">Rak ${r}</h2>
            <div class="rack-grid">${Array.from({ length: SLOT_PER_RAK }, (_, i) => trayCell(bySlot[`${r}-${i + 1}`], `${r}-${i + 1}`)).join('')}</div>
          </div>`).join('')}
        <ul class="legend">${TAHAP.map(t => `<li><i class="sw st-${t.id}"></i>${t.label}</li>`).join('')}</ul>
      </section>
      <aside class="side">
        ${localStorage.getItem('mt.guide') ? '' : `<div class="hint"><span>Baru pertama kali? Baca cara pakainya dulu.</span><button class="link" data-view-go="panduan">Buka panduan</button></div>`}
        ${weatherStrip()}
        ${alertList(true)}
        ${last ? `<button class="nh-row" data-view-go="prediksi"><span>Panen ${tgl(new Date(new Date(last.tanggal).getTime() + 2 * 864e5))}</span><b>±${num(next.anakan)}</b><span class="muted">anakan</span>${icon('kanan')}</button>` : ''}
        <section class="panel nh-full">
          <h2>Panen telur berikutnya</h2>
          ${last ? `
            <p class="muted small">Hari ke-${next.hari} kandang, sekitar ${tgl(new Date(new Date(last.tanggal).getTime() + 2 * 864e5))}</p>
            <p class="big">${num(next.anakan)}<small> anakan</small></p>
            <p class="muted small">${num(next.bawah)}–${num(next.atas)} <span class="tag tag-void">perkiraan</span></p>
            <p class="small">Terakhir ${tgl(last.tanggal)}: ${num(last.gram_telur, 1)} g telur, ±${num(p.dariTimbangan)} anakan</p>
            <button class="link" data-view-go="prediksi">Simulasi</button>`
          : `<p class="muted">Belum ada catatan telur.</p>
             <button class="btn btn-primary" data-act="new-egg">Catat telur</button>`}
        </section>
      </aside>
    </div>`
  },

  telur() {
    const rows = S.eggs
    return `
    <div class="page-head">
      <h1>Panen telur</h1>
      <p class="summary">${(() => { const b = live(rows).filter(e => e.tanggal.startsWith(today().slice(0, 7))); return `${b.length} panen bulan ini · ${num(b.reduce((s, e) => s + +e.gram_telur, 0), 1)} g telur` })()}${rows[0] ? ` · terakhir ${tgl(rows[0].tanggal)}` : ''}</p>
    </div>
    ${rows.length ? `
    <div class="table-wrap">
      <table class="table t-telur">
        <thead><tr><th>Tanggal</th><th>Kandang</th><th class="n">Hari</th><th class="n">Telur (g)</th><th class="n">Suhu</th><th class="n">RH</th><th class="n">Perkiraan anakan</th><th class="n">Model</th><th></th></tr></thead>
        <tbody>${rows.map(e => {
          const p = predict({ pakan: e.pakan || 'FW', hari: +e.hari || 1, suhu: +e.suhu || 30, cahaya: +e.jam_cahaya || 12, rh: +e.rh || 70, gram: +e.gram_telur })
          return `<tr class="${e.batal ? 'is-void' : ''}">
            <td class="c-tgl">${tgl(e.tanggal)}<span class="m-only"> · hari ke-${num(e.hari)}</span></td><td class="c-kdg">${esc(e.kandang)}</td><td class="n c-hari">${num(e.hari)}</td><td class="n c-g">${num(e.gram_telur, 1)}<span class="m-only"> g · ${num(e.suhu, 1)}° · ${num(e.rh)}%</span></td>
            <td class="n c-suhu">${num(e.suhu, 1)}°</td><td class="n c-rh">${num(e.rh)}%</td>
            <td class="n c-pred"><b>${num(p.dariTimbangan)}</b><span class="m-only"> anakan</span></td><td class="n muted c-model">${num(p.anakan)}</td>
            <td class="st">${e.batal ? '<span class="tag tag-void">Batal</span>' : e._dirty ? '<span class="tag tag-wait">Belum terkirim</span>' : ''}</td>
          </tr>`}).join('')}</tbody>
      </table>
    </div>` : `<div class="empty">${icon('telur')}<p>Belum ada catatan telur.</p></div>`}`
  },

  batch() {
    const f = S.filter
    const rows = S.batches.filter(b => f === 'semua' || (f === 'batal' ? b.batal : !b.batal && tahapOf(b) === f))
    return `
    <div class="page-head">
      <h1>Batch</h1>
      <p class="summary">${(() => { const a = live(S.batches); return `${a.filter(b => tahapOf(b) !== 'panen').length} aktif · ${a.filter(b => tahapOf(b) === 'prepupa').length} siap panen · ${a.filter(b => tahapOf(b) === 'panen').length} dipanen` })()}</p>
    </div>
    <div class="chips" role="tablist" aria-label="Saring tahap">
      ${[['semua', 'Semua'], ...TAHAP.map(t => [t.id, t.label]), ['batal', 'Batal']].map(([id, l]) =>
        `<button role="tab" class="chip" aria-selected="${f === id}" data-filter="${id}">${l}</button>`).join('')}
    </div>
    ${rows.length ? `
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Kode</th><th>Tray</th><th>Tahap</th><th class="n">Umur</th><th class="n">Telur (g)</th><th class="n">Pakan (kg)</th><th class="n">Larva (kg)</th><th class="n">Kasgot (kg)</th><th class="n">FCR</th></tr></thead>
        <tbody>${rows.map(b => {
          const t = tahapOf(b)
          return `<tr class="row-link ${b.batal ? 'is-void' : ''}" data-act="open-batch" data-id="${b.id}" tabindex="0">
            <td><b>${esc(b.kode)}</b></td><td>${esc(b.rak)}</td>
            <td><span class="stage-pill st-${t}">${tahapLabel(t)}</span></td>
            <td class="n">${hariSejak(b.tanggal_tetas)} hr</td><td class="n">${num(b.gram_telur, 1)}</td><td class="n">${num(b.kg_pakan, 1)}</td>
            <td class="n">${num(b.kg_larva, 1)}</td><td class="n">${num(b.kg_kasgot, 1)}</td>
            <td class="n">${b.kg_larva > 0 && b.kg_pakan > 0 ? num(b.kg_pakan / b.kg_larva, 1) : '–'}</td>
          </tr>`}).join('')}</tbody>
      </table>
    </div>` : `<div class="empty">${icon('batch')}<p>Tidak ada batch di tahap ini.</p></div>`}`
  },

  prediksi() {
    const s = S.sim
    const m = window.__model
    const slider = (id, label, min, max, step, unit) => `
      <label class="field slider">
        <span class="field-l">${label}<output id="o-${id}">${s[id]}${unit}</output></span>
        <input type="range" name="${id}" min="${min}" max="${max}" step="${step}" value="${s[id]}" data-sim>
      </label>`
    return `
    <div class="page-head">
      <h1>Prediksi anakan</h1>
    </div>
    <div class="sim">
      <form class="panel sim-in" onsubmit="return false">
        <label class="field"><span class="field-l">Pakan indukan saat larva</span>
          <select name="pakan" data-sim>${Object.entries(m.pakan).map(([k, v]) => `<option value="${k}" ${s.pakan === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        </label>
        ${slider('hari', 'Hari ke- sejak lalat keluar', 1, 17, 1, '')}
        ${slider('suhu', 'Suhu ruang telur', 15, 42, 0.5, '°C')}
        ${slider('cahaya', 'Cahaya per hari', 0, 24, 1, ' jam')}
        ${slider('rh', 'Kelembapan', 30, 100, 1, '%')}
        <label class="field"><span class="field-l">Berat telur ditimbang (opsional)</span>
          <span class="input-unit"><input type="number" inputmode="decimal" name="gram" min="0" step="0.1" value="${s.gram}" placeholder="0" data-sim><span>gram</span></span>
        </label>
      </form>
      <section class="panel sim-out" aria-live="polite" id="sim-out"></section>
    </div>`
  },

  cuaca() {
    const w = S.weather
    return `
    <div class="page-head">
      <h1>Cuaca dan peringatan</h1>
      <p class="summary">${esc(S.depot.nama)} · 7 hari${w?.offline ? ' · offline' : ''}</p>
    </div>
    <div class="wx-grid">
      <section>${alertList(false)}</section>
      <section class="panel">
        <h2>7 hari ke depan</h2>
        ${w ? `<ol class="days">${w.days.map(d => `
          <li class="${d.hujan >= 10 ? 'is-rain' : ''}">
            <span class="d-name">${new Date(d.tanggal).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' })}</span>
            ${icon(d.hujan >= 1 ? 'cuaca' : d.radiasi < 15 ? 'awan' : 'matahari')}
            <span class="d-t">${num(d.min)}–${num(d.maks)}°</span>
            <span class="d-r">${num(d.hujan, 1)} mm</span>
            <span class="d-h">RH ${num(d.rh)}%</span>
          </li>`).join('')}</ol>` : '<p class="muted">Belum bisa memuat prakiraan.</p>'}
      </section>
    </div>`
  },

  panduan() {
    const bagian = [
      ['Membaca rak', `
        <p>Setiap kotak di halaman Rak adalah satu tray. Warnanya menunjukkan tahap: krem untuk telur, kuning untuk baby maggot, oranye untuk larva, cokelat untuk prepupa, dan hijau untuk yang sudah dipanen.</p>
        <p>Garis kecil di bawah kotak menunjukkan sudah sampai tahap mana. Titik merah di pojok berarti tray itu siap dipanen.</p>
        <p>Kotak bergaris putus-putus berarti tray kosong. Ketuk untuk memulai batch baru di tray itu.</p>`],
      ['Mencatat panen telur', `
        <p>Ketuk tombol Catat telur di kanan bawah. Biasanya kamu cukup mengisi berat telur hari ini, lalu Simpan.</p>
        <p>Suhu dan kelembapan sudah terisi dari catatan sebelumnya atau dari prakiraan cuaca. Kalau termometer di ruang telur menunjukkan angka lain, ganti dengan angka itu supaya perkiraannya lebih tepat.</p>
        <p>Tanggal, kandang, hari kandang, dan jenis pakan indukan ada di baris paling bawah. Hari kandang dihitung otomatis dari catatan terakhir. Ubah kalau kamu baru mengganti lalat di kandang.</p>`],
      ['Mengurus batch', `
        <p>Ketuk tray untuk membuka batch. Dari sana kamu bisa:</p>
        <ul>
          <li>menambah pakan sampah hari ini dengan tombol +1, +2, atau +5 kg,</li>
          <li>memindahkan batch ke tahap berikutnya,</li>
          <li>mencatat hasil panen larva dan kasgot (muncul saat batch sudah jadi larva atau prepupa).</li>
        </ul>
        <p>Kalau salah ketuk, tekan Urungkan di pesan yang muncul di bawah layar. Pesan itu hilang setelah 5 detik.</p>
        <p>Batch yang salah dicatat bisa ditandai batal lewat Ubah data batch. Datanya tetap ada dan bisa dilihat di halaman Batch dengan saringan Batal.</p>`],
      ['Membaca prediksi anakan', `
        <p>Angka di kartu Panen telur berikutnya adalah perkiraan anakan dari panen telur 2 hari lagi. Angka ini memakai pola harian dari model, lalu disesuaikan dengan hasil timbangan di kandangmu sendiri. Makin rajin kamu mencatat, makin dekat perkiraannya.</p>
        <p>Di halaman Prediksi kamu bisa menggeser suhu, lama cahaya, dan kelembapan untuk melihat pengaruhnya. Contohnya, di atas 35°C daya tetas telur turun tajam.</p>
        <p>Rentang di bawah angka utama menunjukkan seberapa jauh perkiraan bisa meleset. Anggap angka ini sebagai pegangan kasar, bukan hitungan pasti.</p>`],
      ['Peringatan cuaca', `
        <p>Kartu biru di halaman Rak berisi cuaca hari ini untuk lokasi depot. Ketuk untuk melihat 7 hari ke depan.</p>
        <p>Kalau hujan, mendung, terlalu panas, atau terlalu kering diperkirakan dalam beberapa hari, peringatan muncul beserta saran, misalnya menyalakan lampu bantu di kandang kawin.</p>
        <p>Lokasi depot bisa diganti dengan mengetuk nama lokasi di bagian atas layar.</p>`],
      ['Bekerja tanpa sinyal', `
        <p>Semua catatan langsung tersimpan di HP, jadi kamu tetap bisa mencatat di kandang yang tidak ada sinyal.</p>
        <p>Tombol kecil di kanan atas menunjukkan status. Tanda centang berarti semua sudah terkirim ke Google Sheets. Kalau tertulis "belum terkirim", catatan akan dikirim sendiri begitu ada sinyal. Kamu juga bisa menekan Kirim sekarang di halaman Lainnya.</p>`],
      ['Memasang di layar utama HP', `
        <p>Di Chrome Android, buka menu titik tiga lalu pilih Tambahkan ke layar utama atau Instal aplikasi. Setelah itu MagiTrack bisa dibuka seperti aplikasi biasa, termasuk saat offline.</p>
        <p>Di iPhone, buka lewat Safari, tekan tombol Bagikan, lalu pilih Tambahkan ke Layar Utama.</p>`],
    ]
    const logistik = [
      ['Menjemput sampah (driver)', `
        <p>Halaman Hari ini berisi titik jemput sesuai urutan rute. Satu kartu untuk satu titik. Geser ke kiri untuk titik berikutnya, atau ketuk nomor di atas kartu.</p>
        <p>Di setiap titik: tekan Buka Maps untuk petunjuk jalan, scan QR di box, isi berat sampah, lalu tekan Selesai, lanjut. Kartu berikutnya terbuka sendiri.</p>
        <p>Kalau sampah tidak bisa diambil, tekan Tidak bisa dijemput dan pilih alasannya. Box yang hilang dicatat lewat tombol Box hilang supaya admin bisa menagih biaya penggantian.</p>`, ['driver', 'admin']],
      ['Foto isi box dan skor pilah', `
        <p>Tekan Foto isi box dan arahkan kamera ke isi box saja, jangan ke orang atau ruangan. Foto diperiksa server untuk mencari sampah anorganik seperti plastik, kaleng, atau tisu.</p>
        <p>Bagian foto yang ditandai merah kemungkinan berisi anorganik. Skor pilah 100 berarti bersih. Kalau skornya rendah, cek isinya dan minta klien memilah ulang.</p>
        <p>Pemeriksaan ini masih dilatih dari foto contoh, bukan foto box Magi Farm, jadi bisa keliru. Anggap sebagai pengingat, bukan keputusan.</p>
        <p>Tanpa sinyal, foto disimpan di HP dan diperiksa begitu ada sinyal.</p>`, ['driver', 'admin']],
      ['Membaca dasbor hotel', `
        <p>Halaman Dampak menunjukkan berapa kilogram sisa makanan hotel yang dijemput dan diolah Magi Farm setiap bulan, berapa CO₂e yang dicegah, serta berapa larva dan pupuk kasgot yang dihasilkan.</p>
        <p>Batang oranye di grafik adalah hari dengan skor pilah di bawah 80, artinya foto isi box menunjukkan kemungkinan plastik, kaleng, atau tisu. Tabel di bawahnya merangkum per minggu.</p>
        <p>Tekan Unduh laporan PDF, lalu pilih Simpan sebagai PDF di jendela cetak. Laporan bisa dibuat dalam Bahasa Indonesia atau Inggris lewat tombol bahasa.</p>`, ['hotel']],
      ['Menyusun rute (admin)', `
        <p>Buka halaman Rute, pilih tanggal, jenis kendaraan, dan jumlah perjalanan. Satu motor yang jalan pagi dan siang dihitung 2 perjalanan. Tekan Susun rute.</p>
        <p>Server membagi titik ke tiap perjalanan dan mengurutkannya dengan memperhitungkan kapasitas box dan jam jemput hotel. Kalau server tidak terjangkau, rute disusun di perangkat dengan cara yang lebih sederhana.</p>
        <p>Periksa peta, pilih driver untuk tiap rute, lalu tekan Kirim ke driver.</p>`, ['admin']],
      ['Mengelola klien (admin)', `
        <p>Di halaman Klien, tekan Tambah klien. Untuk lokasi, tempel tautan dari tombol Bagikan di Google Maps, atau tekan Lokasiku saat berada di rumah klien.</p>
        <p>Kolom Skor pilah adalah rata-rata 5 foto terakhir. Angka di bawah 80 ditandai, tanda klien itu perlu diingatkan cara memilah.</p>`, ['admin']],
    ]
    const peran = S.user.peran
    bagian.splice(0, bagian.length, ...[...(peran === 'driver' ? bagian.slice(4) : peran === 'hotel' ? bagian.slice(5) : bagian), ...logistik.filter(b => b[2].includes(peran))])
    return `
    <div class="page-head">
      <h1>Cara pakai</h1>
      <p class="summary">Ketuk judul untuk membuka.</p>
    </div>
    <div class="stack guide">
      ${bagian.map(([judul, isi], i) => `<details class="panel" ${i === 0 ? 'open' : ''}><summary>${judul}</summary><div class="guide-body">${isi}</div></details>`).join('')}
      <button class="btn btn-quiet" data-view-go="lain">Kembali</button>
    </div>`
  },

  lain() {
    const m = window.__model
    const g = m.metrik_uji.GradientBoosting
    return `
    <div class="page-head"><h1>Lainnya</h1></div>
    <div class="stack">
      <section class="panel">
        <h2>Cara pakai</h2>
        <button class="btn btn-primary" data-view-go="panduan">Buka panduan</button>
      </section>
      <section class="panel">
        <h2>Akun</h2>
        <p><b>${esc(S.user.nama)}</b><br><span class="muted">${esc(S.user.email)} · ${esc(S.user.peran)}</span></p>
        <button class="btn btn-quiet" data-act="logout">${icon('keluar')} Keluar</button>
      </section>
      ${S.user.peran === 'hotel' ? '' : `<section class="panel">
        <h2>Lokasi depot</h2>
        <div class="seg">${DEPOTS.map(d => `<button class="seg-b" aria-pressed="${S.depot.id === d.id}" data-depot="${d.id}">${esc(d.nama)}</button>`).join('')}</div>
      </section>
      <section class="panel">
        <h2>Sinkron</h2>
        <p>${syncState.pending ? `${syncState.pending} catatan belum terkirim ke Sheets.` : 'Semua catatan sudah terkirim.'}</p>
        <button class="btn btn-quiet" data-act="sync">${icon('sinkron')} Kirim sekarang</button>
      </section>
      <section class="panel">
        <h2>Tentang perhitungan</h2>
        <h3>Prediksi anakan</h3>
        <p>Gradient Boosting dari data penetasan ReproLab (12 kelompok, 168 pengamatan), MAE ${num(g.mae)} anakan per koleksi, R² ${num(g.r2, 2)}. Rentang yang ditampilkan adalah ± MAE. Hasilnya dikoreksi kurva suhu (Chia dkk. 2018), lama cahaya, dan kelembapan; besaran koreksi cahaya dan kelembapan di luar rentang ideal masih asumsi. Model dilatih pada kandang penelitian, jadi angka untuk kandangmu disesuaikan dari timbangan telur terakhir. Perkiraan dari timbangan memakai 39.171 telur per gram.</p>
        <h3>Rute jemput</h3>
        <p>VRPTW dengan OR-Tools (kapasitas box dan jam jemput), jarak garis lurus × 1,35. Tanpa server: sweep, nearest neighbor, dan 2-opt.</p>
        <h3>Skor pilah</h3>
        <p>Regresi logistik fitur HSV, GLCM, dan LBP pada 16 potongan foto, akurasi uji 84,7% pada dataset Kaggle (Sekar 2019). Belum dilatih dengan foto box Magi Farm.</p>
        <h3>Peringatan cuaca</h3>
        <p>Prakiraan Open-Meteo dengan aturan dari wawancara Magi Farm, Chia dkk. 2018, Zhang dkk. 2025, dan Mendoza dkk. 2023. Ambang aturan belum divalidasi lapangan.</p>
        <h3>Sumber</h3>
        <ul class="refs">${Object.values(m.koreksi).map(k => `<li>${esc(k.sumber)}</li>`).join('')}<li>${esc(m.sumber_data)}</li></ul>
      </section>`}
    </div>`
  },
}

// ---------- prediksi live ----------
function updateSim() {
  const out = $('#sim-out')
  if (!out) return
  const s = S.sim
  const p = predict({ ...s, hari: +s.hari, suhu: +s.suhu, cahaya: +s.cahaya, rh: +s.rh, gram: +s.gram })
  const bar = (label, f, note) => `
    <li><span class="f-l">${label}</span><span class="f-bar"><i style="--w:${Math.min(1, f)}"></i></span><span class="f-v">×${num(f, 2)}</span>${note ? `<span class="f-n">${note}</span>` : ''}</li>`
  const risk = checkReading({ suhu: +s.suhu, rh: +s.rh })
  out.innerHTML = `
    <p class="muted small">Koleksi telur hari ke-${p.hari} <span class="tag tag-void">perkiraan</span></p>
    <p class="hero-n">${num(p.anakan)}</p>
    <p class="range">${num(p.bawah)}–${num(p.atas)}</p>
    ${(() => { const n = forecastNext(live(S.eggs)); return n ? `<p class="scale-est">Kandangmu: <b>±${num(p.anakan * n.k)}</b> anakan</p>` : '' })()}
    ${p.dariTimbangan != null ? `<p class="scale-est">${num(s.gram, 1)} g telur: <b>±${num(p.dariTimbangan)}</b> anakan</p>` : ''}
    ${risk.map(r => `<p class="warn-line">${icon('awas')} ${r}</p>`).join('')}
    <h3>Pengaruh kondisi</h3>
    <ul class="factors">
      <li><span class="f-l">Model dasar</span><span class="f-v wide">${num(p.dasar)}</span></li>
      ${bar('Suhu', p.faktor.suhu)}${bar('Cahaya', p.faktor.cahaya)}${bar('Kelembapan', p.faktor.rh)}
    </ul>`
  for (const k of ['hari', 'suhu', 'cahaya', 'rh']) {
    const o = $('#o-' + k)
    if (o) o.textContent = s[k] + ({ suhu: '°C', cahaya: ' jam', rh: '%' }[k] || '')
    const r = document.querySelector(`input[name="${k}"][data-sim]`)
    if (r) r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min)) * 100 + '%')
  }
}

// ---------- form (sheet) ----------
function openSheet(html) {
  const d = $('#sheet')
  const top = d.open ? d.scrollTop : 0
  d.innerHTML = html
  if (!d.open) d.showModal()
  d.scrollTop = top
  d.querySelector('[autofocus]')?.focus()
}

function closeSheet() {
  const d = $('#sheet')
  if (!d.open) return
  const mobile = innerWidth < 960 && !matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!mobile) return d.close()
  d.style.transition = 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)'
  d.style.transform = 'translateY(100%)'
  setTimeout(() => { d.close(); d.style.transition = d.style.transform = '' }, 280)
}

// Tarik sheet ke bawah untuk menutup: ikut jari 1:1, lalu proyeksikan momentum saat dilepas.
;(() => {
  let y0, t0, last, d
  const project = v => (v / 1000) * 0.998 / (1 - 0.998)
  document.addEventListener('pointerdown', e => {
    d = $('#sheet')
    if (!d?.open || innerWidth >= 960 || !e.target.closest('.sheet-h, .grabber') || e.target.closest('button')) return
    y0 = e.clientY; t0 = performance.now(); last = [{ y: 0, t: t0 }]
    d.setPointerCapture(e.pointerId)
    d.style.transition = 'none'
  })
  document.addEventListener('pointermove', e => {
    if (y0 == null) return
    let dy = e.clientY - y0
    if (dy < 0) dy = -Math.sqrt(-dy) * 2 // tahan saat ditarik ke atas (rubber band)
    d.style.transform = `translateY(${dy}px)`
    last.push({ y: dy, t: performance.now() }); if (last.length > 5) last.shift()
  })
  document.addEventListener('pointerup', () => {
    if (y0 == null) return
    const a = last[0], b = last.at(-1)
    const v = ((b.y - a.y) / Math.max(1, b.t - a.t)) * 1000
    y0 = null
    if (b.y + project(v) > d.offsetHeight * 0.4) return closeSheet()
    d.style.transition = 'transform 320ms cubic-bezier(0.32, 0.72, 0, 1)'
    d.style.transform = ''
  })
})()

const SHEET_H = title => `<div class="grabber" aria-hidden="true"></div>
  <header class="sheet-h"><h2>${title}</h2><button type="button" class="icon-b" data-act="close" aria-label="Tutup">${icon('tutup')}</button></header>`

function eggForm() {
  const last = live(S.eggs)[0]
  // hari kandang ikut berjalan sejak catatan terakhir, jadi mitra cukup menimbang
  const hari = last ? Math.max(1, +last.hari + Math.max(1, hariSejak(last.tanggal))) : 3
  const today_ = S.weather?.days[0]
  openSheet(`
  <form method="dialog" class="form" data-form="egg">
    ${SHEET_H('Catat panen telur')}
    <label class="field"><span class="field-l">Berat telur hari ini</span>
      <span class="input-unit big-input"><input type="number" inputmode="decimal" name="gram_telur" min="0" step="0.1" required placeholder="0,0" autofocus><span>gram</span></span></label>
    <div class="form-grid">
      <label class="field"><span class="field-l">Suhu ruang telur</span><span class="input-unit"><input type="number" inputmode="decimal" name="suhu" step="0.1" value="${last?.suhu || Math.round(today_?.maks || 29)}" required><span>°C</span></span></label>
      <label class="field"><span class="field-l">Kelembapan</span><span class="input-unit"><input type="number" inputmode="numeric" name="rh" min="0" max="100" value="${last?.rh || Math.round(today_?.rh || 70)}" required><span>%</span></span></label>
    </div>
    <p class="preview" id="egg-preview"></p>
    <details class="more">
      <summary>${esc(last?.kandang || 'Kandang 1')} · hari ke-${hari} · ${tgl(today())}</summary>
      <div class="form-grid">
        <label class="field"><span class="field-l">Tanggal</span><input type="date" name="tanggal" value="${today()}" required></label>
        <label class="field"><span class="field-l">Kandang</span><input name="kandang" value="${esc(last?.kandang || 'Kandang 1')}" required></label>
        <label class="field"><span class="field-l">Hari ke- sejak lalat keluar</span><input type="number" inputmode="numeric" name="hari" min="1" max="40" value="${hari}" required></label>
        <label class="field"><span class="field-l">Cahaya hari ini</span><span class="input-unit"><input type="number" inputmode="numeric" name="jam_cahaya" min="0" max="24" value="${last?.jam_cahaya || 12}"><span>jam</span></span></label>
        <label class="field"><span class="field-l">Pakan indukan</span><select name="pakan">${Object.entries(window.__model.pakan).map(([k, v]) => `<option value="${k}" ${(last?.pakan || 'FW') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field"><span class="field-l">Catatan</span><input name="catatan" placeholder="Misal: hujan, lampu dinyalakan"></label>
      </div>
    </details>
    <footer class="sheet-f"><button class="btn btn-primary btn-wide">Simpan</button></footer>
  </form>`)
  previewEgg()
}

function previewEgg() {
  const f = document.querySelector('[data-form="egg"]')
  const el = $('#egg-preview')
  if (!f || !el) return
  const v = Object.fromEntries(new FormData(f))
  el.hidden = !v.gram_telur
  if (!v.gram_telur) return
  const p = predict({ pakan: v.pakan, hari: +v.hari, suhu: +v.suhu, cahaya: +v.jam_cahaya, rh: +v.rh, gram: +v.gram_telur })
  const r = checkReading({ suhu: +v.suhu, rh: +v.rh })
  el.innerHTML = `Sekitar <b>${num(p.dariTimbangan)}</b> anakan akan menetas dari ${num(v.gram_telur, 1)} g telur ini.${r.length ? `<br><span class="warn">${r.join(' ')}</span>` : ''}`
}

const nextTahap = t => TAHAP[Math.min(TAHAP.findIndex(x => x.id === t) + 1, TAHAP.length - 1)]

function batchForm(b, slot) {
  if (!b) return newBatchForm(slot)
  const t = tahapOf(b)
  const idx = TAHAP.findIndex(x => x.id === t)
  const umur = hariSejak(b.tanggal_tetas)
  const nx = nextTahap(t)
  const panenMode = ['larva', 'prepupa'].includes(t)
  const used = new Set(live(S.batches).filter(x => tahapOf(x) !== 'panen' && x.id !== b.id).map(x => x.rak))
  const slots = RAK.flatMap(r => Array.from({ length: SLOT_PER_RAK }, (_, i) => `${r}-${i + 1}`)).filter(s => !used.has(s))
  openSheet(`
  <form method="dialog" class="form" data-form="batch" data-id="${b.id}">
    ${SHEET_H(`${esc(b.kode)} <span class="muted h-sub">Tray ${esc(b.rak)}</span>${b.batal ? ' <span class="tag tag-void">Batal</span>' : ''}`)}
    <div class="b-status st-${t}">
      <p class="b-stage">${tahapLabel(t)}</p>
      <p class="muted">${umur < 0 ? `Menetas ${-umur} hari lagi` : `Hari ke-${umur} sejak menetas`} · ${num(b.gram_telur, 1)} g telur</p>
      <ol class="life" aria-label="Tahap">${TAHAP.map((x, i) => `<li class="${i <= idx ? 'on' : ''} st-${x.id}">${x.label}</li>`).join('')}</ol>
    </div>
    ${b.batal ? '' : `
    <div class="quick">
      <p class="field-l">Tambah pakan sampah hari ini</p>
      <div class="quick-row">
        ${[1, 2, 5].map(kg => `<button type="button" class="btn btn-quiet" data-act="feed" data-kg="${kg}" data-id="${b.id}">+${kg} kg</button>`).join('')}
        <span class="quick-total">Total ${num(b.kg_pakan || 0, 1)} kg</span>
      </div>
      ${t !== 'panen' && !panenMode ? `<button type="button" class="btn btn-primary btn-wide" data-act="stage" data-to="${nx.id}" data-id="${b.id}">Pindah ke ${nx.label.toLowerCase()}</button>` : ''}
    </div>
    ${panenMode ? `
    <fieldset class="harvest">
      <legend class="field-l">Catat panen</legend>
      <div class="form-grid">
        <label class="field"><span class="field-l">Larva</span><span class="input-unit"><input type="number" inputmode="decimal" name="kg_larva" step="0.1" min="0" value="${esc(b.kg_larva || '')}" placeholder="0"><span>kg</span></span></label>
        <label class="field"><span class="field-l">Kasgot</span><span class="input-unit"><input type="number" inputmode="decimal" name="kg_kasgot" step="0.1" min="0" value="${esc(b.kg_kasgot || '')}" placeholder="0"><span>kg</span></span></label>
      </div>
      <button class="btn btn-primary btn-wide" name="aksi" value="panen">Simpan panen</button>
    </fieldset>` : ''}`}
    ${b.kg_larva > 0 && b.kg_pakan > 0 ? `<p class="preview">${num(b.kg_pakan, 1)} kg sampah jadi ${num(b.kg_larva, 1)} kg larva (konversi ${num(b.kg_larva / b.kg_pakan * 100, 1)}%, FCR ${num(b.kg_pakan / b.kg_larva, 1)}). Kasgot ${num(b.kg_kasgot, 1)} kg, sekitar Rp${num(b.kg_kasgot * 5000)}.</p>` : ''}
    <details class="more">
      <summary>Ubah data batch</summary>
      <div class="form-grid">
        <label class="field"><span class="field-l">Kode batch</span><input name="kode" value="${esc(b.kode)}" required></label>
        <label class="field"><span class="field-l">Tray</span><select name="rak">${slots.map(s => `<option ${s === b.rak ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label class="field"><span class="field-l">Tanggal menetas</span><input type="date" name="tanggal_tetas" value="${esc(b.tanggal_tetas)}" required></label>
        <label class="field"><span class="field-l">Telur awal</span><span class="input-unit"><input type="number" inputmode="decimal" name="gram_telur" step="0.1" min="0" value="${esc(b.gram_telur)}"><span>gram</span></span></label>
        <label class="field"><span class="field-l">Tahap</span><select name="tahap">
          <option value="">Otomatis (${tahapLabel(tahapSaran(b))})</option>
          ${TAHAP.map(x => `<option value="${x.id}" ${b.tahap === x.id ? 'selected' : ''}>${x.label}</option>`).join('')}</select></label>
        <label class="field"><span class="field-l">Baby maggot</span><span class="input-unit"><input type="number" inputmode="decimal" name="gram_baby" min="0" value="${esc(b.gram_baby)}"><span>gram</span></span></label>
        <label class="field"><span class="field-l">Total pakan</span><span class="input-unit"><input type="number" inputmode="decimal" name="kg_pakan" step="0.1" min="0" value="${esc(b.kg_pakan)}"><span>kg</span></span></label>
        ${panenMode ? '' : `
        <label class="field"><span class="field-l">Larva dipanen</span><span class="input-unit"><input type="number" inputmode="decimal" name="kg_larva" step="0.1" min="0" value="${esc(b.kg_larva)}"><span>kg</span></span></label>
        <label class="field"><span class="field-l">Kasgot</span><span class="input-unit"><input type="number" inputmode="decimal" name="kg_kasgot" step="0.1" min="0" value="${esc(b.kg_kasgot)}"><span>kg</span></span></label>`}
      </div>
      <div class="sheet-f">
        ${b.batal ? '' : `<button type="button" class="btn btn-danger-quiet" data-act="void-batch" data-id="${b.id}">Tandai batal</button><span class="grow"></span><button class="btn btn-primary" name="aksi" value="ubah">Simpan perubahan</button>`}
      </div>
    </details>
  </form>`)
}

function newBatchForm(slot) {
  const used = new Set(live(S.batches).filter(x => tahapOf(x) !== 'panen').map(x => x.rak))
  const slots = RAK.flatMap(r => Array.from({ length: SLOT_PER_RAK }, (_, i) => `${r}-${i + 1}`)).filter(s => !used.has(s))
  const egg = live(S.eggs)[0]
  openSheet(`
  <form method="dialog" class="form" data-form="batch" data-id="">
    ${SHEET_H('Mulai batch baru')}
    <div class="form-grid">
      <label class="field"><span class="field-l">Tray</span><select name="rak">${slots.map(s => `<option ${s === slot ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label class="field"><span class="field-l">Telur ditebar</span><span class="input-unit"><input type="number" inputmode="decimal" name="gram_telur" step="0.1" min="0" value="${esc(egg?.gram_telur || '')}" required><span>gram</span></span></label>
      <label class="field"><span class="field-l">Tanggal menetas</span><input type="date" name="tanggal_tetas" value="${new Date(Date.now() + 3 * 864e5).toLocaleDateString('sv-SE')}" required></label>
      <label class="field"><span class="field-l">Kode batch</span><input name="kode" value="B${today().slice(5).replace('-', '')}" required></label>
    </div>
    <input type="hidden" name="pakan" value="${esc(egg?.pakan || 'FW')}">
    <footer class="sheet-f"><button class="btn btn-primary btn-wide">Mulai batch</button></footer>
  </form>`)
}

// simpan perubahan kecil + tawarkan urungkan
async function patchBatch(id, patch, msg) {
  const old = S.batches.find(b => b.id === id)
  const { contoh, _dirty, ...rest } = old
  await save('Batches', { ...rest, ...patch, oleh: S.user.email })
  await load()
  toast(msg, async () => {
    await save('Batches', { ...rest })
    await load(); go(S.view)
    if ($('#sheet').open) batchForm(S.batches.find(b => b.id === id))
  })
  go(S.view)
  return S.batches.find(b => b.id === id)
}

// ---------- event ----------
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-act],[data-view-go],[data-filter],[data-depot],[data-demo],[data-kfilter],[data-rjenis],[data-rstep],[data-go-stop],.nav-item')
  if (!t) return
  if (t.dataset.demo) return login('/auth/demo', { peran: t.dataset.demo })
  if (t.classList.contains('nav-item')) { e.preventDefault(); return go(t.dataset.view) }
  if (t.dataset.viewGo) return go(t.dataset.viewGo)
  if (t.dataset.filter) { S.filter = t.dataset.filter; return go('batch') }
  if (t.dataset.depot) return setDepot(t.dataset.depot)
  if (LG.onClick(t, e) || HT.onClick(t)) return
  const act = t.dataset.act
  if (act === 'close') return closeSheet()
  if (act === 'new-egg') return eggForm()
  if (act === 'new-batch') return batchForm(null, t.dataset.slot)
  if (act === 'open-batch') return batchForm(S.batches.find(b => b.id === t.dataset.id))
  if (act === 'sync') { await sync(); return toast(syncState.error || 'Data sudah diperbarui.') }
  if (act === 'depot') return setDepot(DEPOTS[(DEPOTS.indexOf(S.depot) + 1) % DEPOTS.length].id)
  if (act === 'logout') { session.clear(); S.user = null; return renderLogin() }
  if (act === 'toast-undo') { const fn = toast.undo; toast.hide(); return fn?.() }
  if (act === 'feed') {
    const b = S.batches.find(x => x.id === t.dataset.id)
    const total = Math.round(((+b.kg_pakan || 0) + +t.dataset.kg) * 10) / 10
    return batchForm(await patchBatch(b.id, { kg_pakan: total }, `+${t.dataset.kg} kg pakan untuk ${b.kode}`))
  }
  if (act === 'stage') {
    const b = S.batches.find(x => x.id === t.dataset.id)
    return batchForm(await patchBatch(b.id, { tahap: t.dataset.to }, `${b.kode} pindah ke ${tahapLabel(t.dataset.to).toLowerCase()}`))
  }
  if (act === 'void-batch') {
    const b = S.batches.find(x => x.id === t.dataset.id)
    closeSheet()
    await patchBatch(b.id, { batal: new Date().toISOString() }, `${b.kode} ditandai batal`)
  }
})

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('tr[data-act], [role=link][data-view-go]')) e.target.click()
})

document.addEventListener('input', e => {
  if (LG.onInput(e) || HT.onInput(e)) return
  if (e.target.matches('[data-sim]')) { S.sim[e.target.name] = e.target.value; updateSim() }
  if (e.target.closest('[data-form="egg"]')) previewEgg()
})

document.addEventListener('submit', async e => {
  const f = e.target
  if (!f.dataset.form) return
  e.preventDefault()
  const v = Object.fromEntries(new FormData(f))
  if (await LG.onSubmit(f, v, e.submitter)) return
  const aksi = e.submitter?.value
  delete v.aksi
  const oleh = S.user.email
  if (f.dataset.form === 'egg') {
    await save('Eggs', { ...v, oleh })
    toast(navigator.onLine ? 'Panen telur tersimpan' : 'Tersimpan di HP, dikirim saat ada sinyal')
  } else if (!f.dataset.id) {
    await save('Batches', { ...v, oleh })
    toast(`${v.kode} dimulai di tray ${v.rak}`)
  } else {
    // tombol panen hanya mengirim angka panen; tombol ubah mengirim semua isian
    const patch = aksi === 'panen' ? { kg_larva: v.kg_larva, kg_kasgot: v.kg_kasgot, tahap: 'panen' } : v
    closeSheet()
    return patchBatch(f.dataset.id, patch, aksi === 'panen' ? `Panen ${v.kg_larva || 0} kg larva tersimpan` : 'Perubahan tersimpan')
  }
  closeSheet()
  await load()
  go(S.view)
})

async function setDepot(id) {
  S.depot = DEPOTS.find(d => d.id === id)
  localStorage.setItem('mt.depot', id)
  shell(); go(S.view)
  S.weather = await weather(S.depot.lat, S.depot.lon)
  go(S.view)
}

onSync(async st => {
  renderSync(st)
  if (!st.busy && S.user) { await load(); if (!$('#sheet')?.open && S.view !== 'prediksi') go(S.view) }
})
addEventListener('offline', () => renderSync(syncState))

// ---------- mulai ----------
let LG, HT
async function start() {
  LG = logistik({ S, $, esc, num, today, icon, toast, openSheet, closeSheet, save, all, put, api, fileUrl, SHEET_H, DEPOTS, alertList,
    go: v => go(v) })
  HT = hotel({ S, esc, icon, put, all, DEPOTS, go: v => go(v) })
  Object.assign(VIEWS, LG.views, { dampak: HT.view })
  window.__model = await loadModel()
  if (!S.user) return renderLogin()
  await load()
  await countPending()
  shell()
  go(S.view)
  weather(S.depot.lat, S.depot.lon).then(w => { S.weather = w; if (!$('#sheet')?.open && S.view !== 'prediksi') go(S.view) })
  sync()
}

start()
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js')
