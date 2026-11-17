// Fase 3: klien, penyusunan rute (admin), dan jemputan harian (driver).
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { planLocal, km as jarakKm } from './route.js'

// tanpa biru (khusus cuaca) dan tanpa merah (khusus bahaya); nomor pin + daftar rute jadi penanda kedua
const WARNA = ['#2f7a3e', '#d9801a', '#7a5535', '#8a4fbf', '#138a8a', '#9c6b00']
const KAP = { motor: 8, mobil: 40 }          // box per jalan (wawancara: motor 7-8, mobil 30-50)
const KM_PER_L = { motor: 40, mobil: 10 }    // asumsi; mobil sama dengan notebook rute
const CO2_PER_L = { motor: 2.31, mobil: 2.68 } // bensin, solar (kg CO2/liter)
const JAM_MULAI = 6 * 60
const ALASAN = ['Tidak ada orang', 'Sampah belum dipilah', 'Box rusak', 'Kehujanan atau banjir']

export function logistik(x) {
  const { S, $, esc, num, today, icon, toast, openSheet, closeSheet, save, all, api, SHEET_H } = x
  const menit = hhmm => { if (!hhmm) return null; const [h, m] = String(hhmm).split(':').map(Number); return isNaN(h) ? null : h * 60 + (m || 0) - JAM_MULAI }
  const client = id => S.clients.find(c => c.id === id)
  let map, plan = null, drivers = [{ email: 'driver@demo', nama: 'Demo Driver' }]
  const R = { jenis: 'motor', jumlah: 3, tanggal: today() }

  // ---------- data ----------
  async function load() {
    ;[S.clients, S.routes, S.pickups] = await Promise.all([all('Clients'), all('Routes'), all('Pickups')])
    S.clients.sort((a, b) => (a.tipe === b.tipe ? a.nama.localeCompare(b.nama) : a.tipe === 'hotel' ? -1 : 1))
  }

  // Data contoh: 5 hotel dari notebook rute (depot Bresela) + 24 rumah tangga di Sanur.
  async function seed(dirty) {
    if ((await all('Clients')).length) return
    const now = new Date().toISOString()
    const hotel = [['Hotel A', 'Tegallalang', -8.433, 115.279, '07:00', '09:00'], ['Hotel B', 'Ubud Utara', -8.48, 115.265, '07:30', '10:00'],
      ['Hotel C', 'Ubud', -8.505, 115.26, '08:00', '11:00'], ['Hotel D', 'Kedewatan', -8.492, 115.245, '07:00', '10:00'], ['Hotel E', 'Taro', -8.37, 115.28, '06:30', '09:20']]
    const rows = hotel.map(([n, a, lat, lon, buka, tutup], i) => ({ tipe: 'hotel', nama: `${n} (${a})`, alamat: a + ', Gianyar', lat, lon, depot: 'bresela', box: [4, 5, 8, 3, 3][i], buka, tutup }))
    const jalan = ['Jl. Danau Tamblingan', 'Jl. Danau Poso', 'Jl. Tandakan', 'Jl. Pungutan', 'Jl. Sekar Waru', 'Jl. Kesari', 'Jl. Hang Tuah', 'Jl. Cemara']
    for (let i = 0; i < 24; i++) {
      const a = (i * 137.5 * Math.PI) / 180, r = 0.006 + 0.022 * Math.sqrt((i + 1) / 24)
      rows.push({ tipe: 'rumah', nama: `Rumah ${String(i + 1).padStart(2, '0')}`, alamat: `${jalan[i % 8]} no. ${10 + i * 3}, Sanur`, lat: +(-8.69 + r * Math.sin(a)).toFixed(5), lon: +(115.249 + r * 0.6 * Math.cos(a)).toFixed(5), depot: 'sanur', box: 1, buka: '', tutup: '' })
    }
    // ID tetap supaya data contoh tidak dobel di server walau login demo berulang
    for (const [i, r] of rows.entries()) await x.put('Clients', { id: `contoh-${r.tipe}-${String(i + 1).padStart(2, '0')}`, pic: '', wa: '', aktif: '1', contoh: '1', oleh: 'contoh', dibuat: now, ...r, _dirty: dirty ? 1 : 0 })
  }

  // Driver demo tanpa rute: buatkan rute contoh dari data klien supaya alurnya bisa dicoba.
  async function seedDriverRoute(email) {
    if ((await all('Pickups')).some(p => p.tanggal === today())) return
    await load()
    const depot = x.DEPOTS.find(d => d.id === 'sanur')
    const stops = S.clients.filter(c => c.depot === 'sanur').slice(0, 9).map(c => ({ id: c.id, lat: +c.lat, lon: +c.lon, box: +c.box || 1 }))
    const p = planLocal({ depot, stops, kendaraan: [{ id: 'Motor 1', kapasitas: 9 }] }).rute[0]
    const rid = crypto.randomUUID(), now = new Date().toISOString()
    await x.put('Routes', { id: rid, tanggal: today(), depot: 'sanur', kendaraan: 'Motor 1', driver: email, urutan: JSON.stringify(p.urutan), km: p.km, menit: p.menit, metode: 'contoh', dibuat: now, _dirty: 0 })
    for (const [i, cid] of p.urutan.entries())
      await x.put('Pickups', { id: crypto.randomUUID(), tanggal: today(), rute_id: rid, client_id: cid, urutan: i + 1, driver: email, status: 'rencana', kg: '', box_qr: '', foto_url: '', catatan: '', dibuat: now, _dirty: 0 })
  }

  // ---------- klien ----------
  function klienView() {
    const f = S.klienFilter || 'semua'
    const q = (S.klienCari || '').toLowerCase()
    const rows = S.clients.filter(c => (f === 'semua' || c.tipe === f) && (!q || `${c.nama} ${c.alamat}`.toLowerCase().includes(q)))
    const aktif = S.clients.filter(c => c.aktif !== '0')
    return `
    <div class="page-head">
      <h1>Klien</h1>
      <p class="summary">${aktif.filter(c => c.tipe === 'hotel').length} hotel · ${aktif.filter(c => c.tipe === 'rumah').length} rumah tangga · ${num(aktif.reduce((s, c) => s + (+c.box || 0), 0))} box beredar
        ${S.clients.some(c => c.contoh === '1') ? '<span class="tag">Data contoh</span>' : ''}</p>
    </div>
    <div class="toolbar">
      <div class="seg">${[['semua', 'Semua'], ['hotel', 'Hotel'], ['rumah', 'Rumah tangga']].map(([id, l]) => `<button class="seg-b" aria-pressed="${f === id}" data-kfilter="${id}">${l}</button>`).join('')}</div>
      <input class="search" type="search" placeholder="Cari nama atau alamat" value="${esc(S.klienCari || '')}" data-kcari aria-label="Cari klien">
      <button class="btn btn-primary" data-act="new-client">${icon('tambah')} Tambah klien</button>
    </div>
    ${rows.length ? `
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Nama</th><th>Depot</th><th class="n">Box</th><th>Jam jemput</th><th class="n">Skor pilah</th><th>Kontak</th></tr></thead>
        <tbody>${rows.map(c => `
          <tr class="row-link ${c.aktif === '0' ? 'is-void' : ''}" data-act="open-client" data-id="${c.id}" tabindex="0">
            <td><b>${esc(c.nama)}</b><br><small class="muted">${c.tipe === 'hotel' ? 'Hotel' : 'Rumah tangga'} · ${esc(c.alamat)}</small></td>
            <td>${esc(x.DEPOTS.find(d => d.id === c.depot)?.nama || c.depot)}</td>
            <td class="n">${num(c.box)}</td>
            <td>${c.buka ? `${esc(c.buka)}–${esc(c.tutup)}` : '<span class="muted">Pagi</span>'}</td>
            <td class="n">${pilah(c.id)}</td>
            <td>${c.wa ? `<a class="link" href="https://wa.me/${esc(c.wa.replace(/\D/g, '').replace(/^0/, '62'))}" target="_blank" rel="noopener">WhatsApp</a>` : '<span class="muted">–</span>'}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>` : `<div class="empty">${icon('lokasi')}<p>Tidak ada klien yang cocok.</p></div>`}`
  }

  // rata-rata skor pilah 5 foto terakhir klien; di bawah 80 ditandai supaya admin bisa memberi edukasi
  function pilah(id) {
    const sk = S.pickups.filter(p => p.client_id === id && p.skor_pilah !== '' && p.skor_pilah != null)
      .sort((a, b) => String(b.waktu).localeCompare(String(a.waktu))).slice(0, 5).map(p => +p.skor_pilah)
    if (!sk.length) return '<span class="muted">–</span>'
    const r = Math.round(sk.reduce((a, b) => a + b, 0) / sk.length)
    return `<span class="${r < 80 ? 'warn' : ''}" title="Rata-rata ${sk.length} foto terakhir">${r}</span>`
  }

  // Ambil koordinat dari tautan Google Maps (".../@-8.68,115.26,17z" atau "?q=-8.68,115.26") atau teks "lat, lon"
  const parseKoordinat = s => {
    const m = String(s).match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/)
    return m ? { lat: +m[1], lon: +m[2] } : null
  }

  function clientForm(c) {
    c ||= { tipe: 'rumah', depot: S.depot.id, box: 1, aktif: '1' }
    openSheet(`
    <form method="dialog" class="form" data-form="client" data-id="${c.id || ''}">
      ${SHEET_H(c.id ? esc(c.nama) : 'Klien baru')}
      <div class="seg seg-full">${[['rumah', 'Rumah tangga'], ['hotel', 'Hotel']].map(([id, l]) => `<label class="seg-b"><input type="radio" name="tipe" value="${id}" ${c.tipe === id ? 'checked' : ''}>${l}</label>`).join('')}</div>
      <div class="form-grid">
        <label class="field full"><span class="field-l">Nama</span><input name="nama" value="${esc(c.nama)}" required autofocus></label>
        <label class="field"><span class="field-l">Nama PIC</span><input name="pic" value="${esc(c.pic)}"></label>
        <label class="field"><span class="field-l">Nomor WhatsApp</span><input type="tel" name="wa" value="${esc(c.wa)}" placeholder="08…"></label>
        <label class="field full"><span class="field-l">Alamat</span><input name="alamat" value="${esc(c.alamat)}" required></label>
        <label class="field full"><span class="field-l">Lokasi</span>
          <span class="loc-row"><input name="lokasi" value="${c.lat ? `${c.lat}, ${c.lon}` : ''}" placeholder="Tempel tautan Google Maps atau koordinat" required data-loc>
          <button type="button" class="btn btn-quiet" data-act="my-loc">${icon('lokasi')} Lokasiku</button></span>
          <small class="muted" id="loc-hint">${c.lat ? 'Koordinat tersimpan' : ''}</small></label>
        <label class="field"><span class="field-l">Depot</span><select name="depot">${x.DEPOTS.map(d => `<option value="${d.id}" ${c.depot === d.id ? 'selected' : ''}>${esc(d.nama)}</option>`).join('')}</select></label>
        <label class="field"><span class="field-l">Jumlah box</span><input type="number" inputmode="numeric" name="box" min="0" value="${esc(c.box)}"></label>
        <label class="field"><span class="field-l">Bisa dijemput mulai</span><input type="time" name="buka" value="${esc(c.buka)}"></label>
        <label class="field"><span class="field-l">Paling lambat</span><input type="time" name="tutup" value="${esc(c.tutup)}"></label>
      </div>
      <label class="check"><input type="checkbox" name="aktif" value="1" ${c.aktif !== '0' ? 'checked' : ''}> Masih berlangganan</label>
      <footer class="sheet-f"><button class="btn btn-primary btn-wide">Simpan</button></footer>
    </form>`)
  }

  // ---------- rute (admin) ----------
  function ruteView() {
    const hari = S.routes.filter(r => r.tanggal === R.tanggal && r.depot === S.depot.id)
    const jalan = S.pickups.filter(p => hari.some(r => r.id === p.rute_id) && p.status !== 'dibatalkan')
    const stops = S.clients.filter(c => c.aktif !== '0' && c.depot === S.depot.id)
    return `
    <div class="page-head">
      <h1>Rute jemput</h1>
      <p class="summary">${esc(S.depot.nama)} · ${stops.length} titik aktif · ${num(stops.reduce((s, c) => s + (+c.box || 1), 0))} box</p>
    </div>
    <div class="route-grid">
      <section class="panel route-ctl">
        <label class="field"><span class="field-l">Tanggal</span><input type="date" value="${R.tanggal}" data-r="tanggal"></label>
        <div class="field"><span class="field-l">Kendaraan</span>
          <div class="seg seg-full">${['motor', 'mobil'].map(j => `<button class="seg-b" aria-pressed="${R.jenis === j}" data-rjenis="${j}">${j === 'motor' ? 'Motor' : 'Mobil'}</button>`).join('')}</div></div>
        <div class="field"><span class="field-l">Jumlah perjalanan<output>${KAP[R.jenis]} box sekali jalan</output></span>
          <div class="stepper"><button class="icon-b" data-rstep="-1" aria-label="Kurangi">−</button><b>${R.jumlah}</b><button class="icon-b" data-rstep="1" aria-label="Tambah">+</button></div>
</div>
        <button class="btn btn-primary btn-wide" data-act="plan" ${stops.length ? '' : 'disabled'}>Susun rute</button>
        ${hari.length ? `<p class="muted small">${hari.length} rute terkirim · ${jalan.filter(p => p.status !== 'rencana').length}/${jalan.length} titik selesai</p>` : ''}
      </section>
      <section class="map-wrap"><div id="map" class="map" role="img" aria-label="Peta rute"></div></section>
      <section class="plan" id="plan">${planHtml()}</section>
    </div>`
  }

  function planHtml() {
    if (!plan) return `<div class="empty">${icon('lokasi')}<p>Belum ada rute.</p></div>`
    const totKm = plan.rute.reduce((s, r) => s + r.km, 0)
    const liter = totKm / KM_PER_L[R.jenis]
    return `
      <div class="plan-sum">
        <p><b>${plan.rute.length} rute</b> · ${num(totKm, 1)} km · sekitar ${num(liter, 1)} liter BBM · ${num(liter * CO2_PER_L[R.jenis], 1)} kg CO₂</p>
        ${plan.dilewati.length ? `<p class="small warn">${plan.dilewati.length} titik tidak muat. Tambah perjalanan.</p>` : ''}
      </div>
      ${plan.rute.map((r, i) => `
      <article class="route-card" style="--rc:${WARNA[i % WARNA.length]}">
        <header><span class="rc-dot"></span><b>${esc(r.kendaraan)}</b><span class="muted small">${r.urutan.length} titik · ${num(r.km, 1)} km · ${num(r.menit)} menit</span></header>
        <label class="field"><span class="field-l">Driver</span><select data-rdriver="${i}">${drivers.map(d => `<option value="${esc(d.email)}" ${r.driver === d.email ? 'selected' : ''}>${esc(d.nama || d.email)}</option>`).join('')}</select></label>
        <ol class="stops">${r.urutan.map(id => { const c = client(id); return `<li>${esc(c?.nama)}<small class="muted"> · ${num(c?.box)} box${c?.buka ? ` · ${esc(c.buka)}–${esc(c.tutup)}` : ''}</small></li>` }).join('')}</ol>
      </article>`).join('')}
      ${plan.rute.length ? '<button class="btn btn-primary btn-wide" data-act="send-route">Kirim ke driver</button>' : ''}`
  }

  function drawMap() {
    const el = $('#map')
    if (!el) return
    map?.remove()
    map = L.map(el, { zoomControl: true, attributionControl: true }).setView([S.depot.lat, S.depot.lon], 13)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map)
    const pts = [[S.depot.lat, S.depot.lon]]
    L.marker([S.depot.lat, S.depot.lon], { icon: L.divIcon({ className: 'pin-depot', html: icon('rak'), iconSize: [30, 30] }) }).addTo(map).bindTooltip(S.depot.nama)
    const inRoute = new Map()
    plan?.rute.forEach((r, i) => r.urutan.forEach((id, k) => inRoute.set(id, [i, k + 1])))
    for (const c of S.clients.filter(c => c.aktif !== '0' && c.depot === S.depot.id)) {
      const [ri, k] = inRoute.get(c.id) || [-1, '']
      const col = ri >= 0 ? WARNA[ri % WARNA.length] : '#66706a'
      L.marker([+c.lat, +c.lon], { icon: L.divIcon({ className: 'pin', html: `<span style="--pc:${col}">${k}</span>`, iconSize: [24, 24] }) })
        .addTo(map).bindTooltip(`${c.nama} · ${c.box} box`)
      pts.push([+c.lat, +c.lon])
    }
    plan?.rute.forEach((r, i) => {
      const line = [[S.depot.lat, S.depot.lon], ...r.urutan.map(id => [+client(id).lat, +client(id).lon]), [S.depot.lat, S.depot.lon]]
      L.polyline(line, { color: WARNA[i % WARNA.length], weight: 3, opacity: 0.85 }).addTo(map)
    })
    if (pts.length > 1) map.fitBounds(pts, { padding: [24, 24] })
  }

  async function susun() {
    const btn = document.querySelector('[data-act="plan"]')
    btn.disabled = true
    btn.textContent = 'Menyusun…'
    const stops = S.clients.filter(c => c.aktif !== '0' && c.depot === S.depot.id).map(c => ({
      id: c.id, lat: +c.lat, lon: +c.lon, box: Math.max(1, +c.box || 1),
      buka: Math.max(0, menit(c.buka) ?? 0), tutup: Math.max(0, menit(c.tutup) ?? 360),
    }))
    const nama = R.jenis === 'motor' ? 'Motor' : 'Mobil'
    const kendaraan = Array.from({ length: R.jumlah }, (_, i) => ({ id: `${nama} ${i + 1}`, jenis: R.jenis, kapasitas: KAP[R.jenis] }))
    const depot = { lat: S.depot.lat, lon: S.depot.lon }
    try {
      if (!navigator.onLine) throw new Error('offline')
      plan = await Promise.race([api('/route', { depot, stops, kendaraan }), new Promise((_, no) => setTimeout(() => no(new Error('lambat')), 8000))])
    } catch (e) {
      if (e.status === 422) { toast(e.message); btn.disabled = false; btn.textContent = 'Susun rute'; return }
      plan = planLocal({ depot, stops, kendaraan, kmh: R.jenis === 'motor' ? 30 : 25 })
    }
    try { drivers = await api('/drivers') } catch { /* tetap pakai daftar lama */ }
    plan.rute.forEach((r, i) => (r.driver = drivers[i % drivers.length]?.email))
    x.go('rute')
  }

  async function kirim() {
    const lama = S.routes.filter(r => r.tanggal === R.tanggal && r.depot === S.depot.id)
    if (lama.length && !confirm('Rute lama untuk tanggal ini akan diganti. Titik yang sudah dijemput tetap tercatat. Lanjutkan?')) return
    for (const p of S.pickups.filter(p => lama.some(r => r.id === p.rute_id) && p.status === 'rencana'))
      await save('Pickups', { ...p, status: 'dibatalkan' })
    for (const r of plan.rute) {
      const rute = await save('Routes', { tanggal: R.tanggal, depot: S.depot.id, kendaraan: r.kendaraan, driver: r.driver, urutan: JSON.stringify(r.urutan), km: r.km, menit: r.menit, metode: plan.metode, oleh: S.user.email })
      for (const [i, cid] of r.urutan.entries())
        await save('Pickups', { tanggal: R.tanggal, rute_id: rute.id, client_id: cid, urutan: i + 1, driver: r.driver, status: 'rencana', kg: '', box_qr: '', foto_url: '', catatan: '', oleh: S.user.email })
    }
    plan = null
    await load()
    x.go('rute')
    toast('Rute terkirim ke driver')
  }

  // ---------- jemputan (driver) ----------
  // titik hari ini, urut per rute (Motor 1, Motor 2, ...) lalu per nomor urut
  const hariIni = () => {
    const ru = S.routes.filter(r => r.tanggal === today()).map(r => r.id + '|' + r.kendaraan).sort((a, b) => a.split('|')[1].localeCompare(b.split('|')[1], 'id', { numeric: true })).map(k => k.split('|')[0])
    return S.pickups.filter(p => p.tanggal === today() && p.status !== 'dibatalkan')
      .sort((a, b) => ru.indexOf(a.rute_id) - ru.indexOf(b.rute_id) || a.urutan - b.urutan)
  }
  const STATUS = { selesai: 'Selesai', gagal: 'Tidak bisa dijemput', box_hilang: 'Box hilang' }

  function jemputView() {
    const mine = hariIni()
    const done = mine.filter(p => p.status !== 'rencana')
    const kg = done.reduce((s, p) => s + (+p.kg || 0), 0)
    const cur = Math.max(0, mine.findIndex(p => p.status === 'rencana'))
    const ruteKu = S.routes.filter(r => mine.some(p => p.rute_id === r.id))
    const rute = ruteKu.length ? { km: ruteKu.reduce((t, r) => t + +r.km, 0), metode: ruteKu[0].metode } : null
    if (!mine.length) return `
      <div class="page-head"><h1>Jemputan hari ini</h1></div>
      ${x.alertList(true)}
      <div class="empty">${icon('lokasi')}<p>Belum ada rute hari ini.</p></div>`
    return `
    <div class="page-head">
      <h1>Jemputan hari ini</h1>
      <p class="summary"><b>${done.length} dari ${mine.length}</b> titik · ${num(kg, 1)} kg terkumpul${rute ? ` · ${num(rute.km, 1)} km` : ''}
        ${rute?.metode === 'contoh' ? '<span class="tag">Rute contoh</span>' : ''}</p>
      <div class="progress" aria-hidden="true"><i style="--w:${done.length / mine.length}"></i></div>
    </div>
    ${x.alertList(true)}
    <div class="dots" role="tablist" aria-label="Titik jemput">${mine.map((p, i) => `<button role="tab" class="dot st-${p.status}" data-go-stop="${i}" aria-label="Titik ${i + 1}">${i + 1}</button>`).join('')}</div>
    <div class="feed" id="feed" data-start="${cur}">${mine.map((p, i) => stopCard(p, i, mine.length)).join('')}</div>`
  }

  function stopCard(p, i, n) {
    const c = client(p.client_id) || { nama: 'Klien tidak ditemukan', alamat: '' }
    const done = p.status !== 'rencana'
    const maps = `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lon}`
    const wa = c.wa ? `https://wa.me/${c.wa.replace(/\D/g, '').replace(/^0/, '62')}` : ''
    return `
    <article class="stop ${done ? 'is-done st-' + p.status : ''}" data-stop="${p.id}">
      <form class="stop-in" data-form="pickup" data-id="${p.id}">
        <header class="stop-h">
          <span class="stop-n">${i + 1}<small>/${n}</small></span>
          <div><h2>${esc(c.nama)}</h2><p class="muted">${esc(c.alamat)}</p></div>
        </header>
        <p class="stop-meta">${c.tipe === 'hotel' ? 'Hotel' : 'Rumah tangga'} · ${num(c.box)} box${c.buka ? ` · ${esc(c.buka)}–${esc(c.tutup)}` : ''}</p>
        <div class="stop-links">
          <a class="btn btn-quiet" href="${maps}" target="_blank" rel="noopener">${icon('lokasi')} Buka Maps</a>
          ${wa ? `<a class="btn btn-quiet" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        </div>
        ${done ? `
        <div class="stamp"><b>${STATUS[p.status]}</b><span>${p.waktu ? new Date(p.waktu).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''}${p.kg ? ` · ${num(p.kg, 1)} kg` : ''}${p.catatan ? ` · ${esc(p.catatan)}` : ''}</span>
          <button type="button" class="link" data-act="reopen-stop" data-id="${p.id}">Ubah</button></div>` : `
        <label class="field"><span class="field-l">Berat sampah</span><span class="input-unit big-input"><input type="number" inputmode="decimal" name="kg" min="0" step="0.1" placeholder="0,0" value="${esc(p.kg)}"><span>kg</span></span></label>
        <div class="stop-tools">
          <button type="button" class="btn btn-quiet" data-act="scan" data-id="${p.id}">${p.box_qr ? `Box ${esc(p.box_qr)}` : 'Scan QR box'}</button>
          <label class="btn btn-quiet file-b">${p._foto || p.foto_url ? 'Foto ulang' : 'Foto isi box'}<input type="file" accept="image/*" capture="environment" data-photo="${p.id}" hidden></label>
        </div>
        ${fotoHtml(p)}
        <button class="btn btn-primary btn-wide" name="status" value="selesai">Selesai, lanjut</button>
        <div class="stop-alt">
          <button type="button" class="btn btn-quiet" data-act="fail" data-id="${p.id}">Gagal jemput</button>
          <button type="button" class="btn btn-danger-quiet" data-act="lost" data-id="${p.id}">Box hilang</button>
        </div>`}
      </form>
    </article>`
  }

  function goStop(i, smooth = true) {
    const feed = $('#feed')
    feed?.children[i]?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant', inline: 'start', block: 'nearest' })
  }

  async function setPickup(id, patch, msg) {
    const p = S.pickups.find(x => x.id === id)
    const { _dirty, ...prev } = p
    await save('Pickups', { ...prev, ...patch, waktu: new Date().toISOString(), oleh: S.user.email })
    await load()
    const mine = hariIni()
    x.go(S.view)
    const next = mine.findIndex(q => q.status === 'rencana')
    goStop(next < 0 ? mine.length - 1 : next, false)
    toast(next < 0 && patch.status ? 'Semua titik selesai' : msg, async () => {
      await save('Pickups', prev); await load(); x.go(S.view)
    })
  }

  async function foto(file, id) {
    const img = await createImageBitmap(file)
    const k = Math.min(1, 1024 / Math.max(img.width, img.height))
    const cv = Object.assign(document.createElement('canvas'), { width: img.width * k, height: img.height * k })
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height)
    const { _dirty, ...lama } = S.pickups.find(q => q.id === id)
    let p = { ...lama, _foto: cv.toDataURL('image/jpeg', 0.6) }
    if (navigator.onLine) {
      // langsung periksa kontaminan di server supaya driver bisa minta klien memilah ulang di tempat
      toast('Memeriksa foto…')
      try {
        const r = await api('/photos', { id: p.id, data: p._foto })
        p = { ...p, foto_url: r.url, _foto: '', _peta: r.kontaminan?.peta, skor_pilah: r.kontaminan?.skor ?? '', potongan_kotor: r.kontaminan?.potongan_kotor ?? '' }
      } catch { /* foto tetap di _foto, diunggah saat sinkron berikutnya */ }
    }
    await save('Pickups', p) // ditandai belum terkirim supaya foto_url & skor ikut ke Sheets
    await load()
    x.go(S.view)
    goStop(hariIni().findIndex(q => q.id === id), false)
    toast(p.skor_pilah === '' || p.skor_pilah == null ? 'Foto tersimpan'
      : +p.potongan_kotor ? `Cek bagian merah di foto, skor pilah ${p.skor_pilah}` : `Pilahan bersih, skor ${p.skor_pilah}`)
  }

  // Foto + peta panas 4x4 peluang anorganik
  function fotoHtml(p) {
    const src = p._foto || x.fileUrl(p.foto_url)
    if (!src) return ''
    const ada = p.skor_pilah !== '' && p.skor_pilah != null
    const kotor = ada && +p.skor_pilah < 80
    return `
      <figure class="shot">
        <div class="shot-img"><img src="${esc(src)}" alt="Foto isi box">
          ${p._peta ? `<div class="heat">${p._peta.map(v => `<i style="--a:${v > 0.5 ? v * 0.65 : 0}"></i>`).join('')}</div>` : ''}</div>
        <figcaption class="${kotor ? 'is-dirty' : ''}">${!ada ? 'Menunggu sinyal untuk diperiksa'
          : +p.potongan_kotor ? `<b>Skor pilah ${p.skor_pilah}</b> · ${p.potongan_kotor} bagian mungkin anorganik${kotor ? '. Minta klien memilah ulang.' : ''}`
          : `<b>Skor pilah ${p.skor_pilah}</b> · bersih`}</figcaption>
      </figure>`
  }

  // Scan QR: BarcodeDetector bawaan Chrome Android; kalau tidak ada, ketik kode box.
  async function scan(id) {
    const ada = 'BarcodeDetector' in window
    openSheet(`
      <div class="form">
        ${SHEET_H('Scan QR box')}
        ${ada ? '<video id="cam" class="cam" playsinline muted></video><p class="muted small">Arahkan kamera ke QR di box.</p>' : '<p class="muted">Ketik kode box.</p>'}
        <form class="loc-row" data-form="qr" data-id="${id}"><input name="kode" placeholder="Kode box, mis. MAGI-0123" ${ada ? '' : 'autofocus'} required><button class="btn btn-primary">Pakai</button></form>
      </div>`)
    if (!ada) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      const v = $('#cam'); v.srcObject = stream; await v.play()
      const det = new BarcodeDetector({ formats: ['qr_code'] })
      const stop = () => stream.getTracks().forEach(t => t.stop())
      $('#sheet').addEventListener('close', stop, { once: true })
      while ($('#sheet').open) {
        const [hit] = await det.detect(v).catch(() => [])
        if (hit) { stop(); navigator.vibrate?.(40); return pakaiQr(id, hit.rawValue) }
        await new Promise(r => setTimeout(r, 250))
      }
    } catch { toast('Kamera tidak bisa dibuka. Ketik kode box.') }
  }

  async function pakaiQr(id, kode) {
    const p = S.pickups.find(q => q.id === id)
    await x.put('Pickups', { ...p, box_qr: kode.trim() })
    closeSheet(); await load(); x.go(S.view)
    goStop(hariIni().findIndex(q => q.id === id), false)
    toast(`Box ${kode} tercatat`)
  }

  function failSheet(id) {
    openSheet(`
      <form class="form" data-form="fail" data-id="${id}">
        ${SHEET_H('Kenapa tidak bisa dijemput?')}
        <div class="reasons">${ALASAN.map(a => `<button class="btn btn-quiet" name="catatan" value="${a}">${a}</button>`).join('')}</div>
        <label class="field"><span class="field-l">Alasan lain</span><input name="lain" placeholder="Tulis singkat"></label>
        <footer class="sheet-f"><button class="btn btn-primary btn-wide" name="catatan" value="">Simpan</button></footer>
      </form>`)
  }

  // ---------- event ----------
  function onClick(t, e) {
    const d = t.dataset
    if (d.kfilter) { S.klienFilter = d.kfilter; x.go('klien'); return true }
    if (d.rjenis) { R.jenis = d.rjenis; x.go('rute'); return true }
    if (d.rstep) { R.jumlah = Math.min(12, Math.max(1, R.jumlah + +d.rstep)); x.go('rute'); return true }
    if (d.goStop) { goStop(+d.goStop); return true }
    const act = d.act
    if (act === 'new-client') return clientForm(), true
    if (act === 'open-client') return clientForm(client(d.id)), true
    if (act === 'my-loc') {
      navigator.geolocation?.getCurrentPosition(
        p => { const i = document.querySelector('[data-loc]'); i.value = `${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`; $('#loc-hint').textContent = `Akurasi sekitar ${Math.round(p.coords.accuracy)} m.` },
        () => toast('Lokasi tidak bisa dibaca. Izinkan akses lokasi di browser.'), { enableHighAccuracy: true, timeout: 10000 })
      return true
    }
    if (act === 'plan') return susun(), true
    if (act === 'send-route') return kirim(), true
    if (act === 'scan') return scan(d.id), true
    if (act === 'fail') return failSheet(d.id), true
    if (act === 'lost') return setPickup(d.id, { status: 'box_hilang' }, 'Box hilang dicatat'), true
    if (act === 'reopen-stop') return setPickup(d.id, { status: 'rencana' }, 'Titik dibuka lagi'), true
    return false
  }

  function onInput(e) {
    const t = e.target
    if (t.matches('[data-kcari]')) {
      S.klienCari = t.value
      const pos = t.selectionStart
      x.go('klien')
      const i = document.querySelector('[data-kcari]'); i.focus(); i.setSelectionRange(pos, pos)
      return true
    }
    if (t.matches('[data-r]')) { R[t.dataset.r] = t.value; plan = null; x.go('rute'); return true }
    if (t.matches('[data-rdriver]')) { plan.rute[+t.dataset.rdriver].driver = t.value; return true }
    if (t.matches('[data-photo]') && t.files[0]) { foto(t.files[0], t.dataset.photo); return true }
    if (t.matches('[data-loc]')) {
      const k = parseKoordinat(t.value)
      $('#loc-hint').textContent = k ? `${k.lat}, ${k.lon}` : 'Koordinat belum terbaca'
      return true
    }
    return false
  }

  async function onSubmit(f, v, submitter) {
    if (f.dataset.form === 'client') {
      const k = parseKoordinat(v.lokasi)
      if (!k) { toast('Lokasi belum terbaca. Tempel tautan Google Maps atau koordinat.'); return true }
      const old = client(f.dataset.id) || {}
      const { lokasi, ...rest } = v
      await save('Clients', { ...old, ...rest, ...k, aktif: v.aktif ? '1' : '0', oleh: S.user.email })
      closeSheet(); await load(); x.go('klien'); toast(`${v.nama} tersimpan`)
      return true
    }
    if (f.dataset.form === 'pickup') {
      await setPickup(f.dataset.id, { status: 'selesai', kg: v.kg }, `Titik selesai${v.kg ? `, ${v.kg} kg` : ''}`)
      return true
    }
    if (f.dataset.form === 'fail') {
      closeSheet()
      await setPickup(f.dataset.id, { status: 'gagal', catatan: submitter?.value || v.lain || '' }, 'Dicatat tidak bisa dijemput')
      return true
    }
    if (f.dataset.form === 'qr') { await pakaiQr(f.dataset.id, v.kode); return true }
    return false
  }

  function after(view) {
    if (view === 'rute') drawMap()
    if (view === 'jemput') {
      const feed = $('#feed')
      if (!feed) return
      goStop(+feed.dataset.start, false)
      // titik aktif ditandai saat kartu digeser
      const io = new IntersectionObserver(es => es.forEach(en => {
        if (!en.isIntersecting) return
        const i = [...feed.children].indexOf(en.target)
        document.querySelectorAll('.dot').forEach((d, k) => d.toggleAttribute('aria-selected', k === i))
      }), { root: feed, threshold: 0.6 })
      ;[...feed.children].forEach(c => io.observe(c))
    }
  }

  return { load, seed, seedDriverRoute, views: { klien: klienView, rute: ruteView, jemput: jemputView }, onClick, onInput, onSubmit, after }
}
