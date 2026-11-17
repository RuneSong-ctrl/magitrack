// Fase 4: dasbor hotel dan laporan keberlanjutan (ID/EN), siap dicetak ke PDF dari browser.
import { hitung, P } from './dampak.js'
import { km as jarakKm } from './route.js'

const T = {
  id: {
    judul: 'Dampak pengolahan sampah', bulan: 'Bulan', unduh: 'Unduh laporan PDF', bahasa: 'English',
    kalimat: (h, kg, co2, b) => `Selama ${b}, ${kg} kg sisa makanan dari ${h} diolah menjadi pakan maggot dan pupuk. Hasilnya mencegah sekitar ${co2} CO₂e.`,
    kosong: 'Belum ada penjemputan di bulan ini.',
    diolah: 'Sampah diolah', co2: 'CO₂e bersih dicegah', larva: 'Larva maggot', kasgot: 'Pupuk kasgot', pilah: 'Skor pilah rata-rata', jemput: 'Penjemputan',
    harian: 'Sampah dijemput per hari (kg)', neraca: 'Ke mana sampahnya pergi', susut: 'Susut (air dan respirasi)',
    pilahJudul: 'Kualitas pemilahan', pilahKet: 'Skor dari foto isi box saat dijemput. 100 berarti tidak terlihat plastik, kaleng, atau tisu. Hari dengan skor di bawah 80 ditandai oranye.',
    pilahRendah: 'Skor pilah di bawah 80', mingguan: 'Ringkasan mingguan', minggu: 'Minggu', tgl: 'Tanggal',
    metode: 'Metode dan sumber', laporan: 'Laporan Keberlanjutan', disiapkan: 'Disiapkan oleh Magi Farm', dibuat: 'Dibuat',
    contoh: 'Data contoh, bukan data hotel sebenarnya.',
    metodeIsi: [
      'Berat sampah dari timbangan driver Magi Farm saat penjemputan.',
      'Larva 15% dan kasgot 30% dari berat sampah (Dortmans dkk. 2017, Eawag; nilai konservatif).',
      `Metana yang dicegah: sampah × DOC ${P.DOC} × DOCf ${P.DOCf} × MCF ${P.MCF} × F ${P.F} × 16/12 (IPCC 2006), dikali GWP ${P.GWP_CH4} (IPCC AR6, 100 tahun).`,
      'CO₂e bersih = dicegah − emisi proses BSF (0,02 kg/kg sampah) − bagian emisi BBM kendaraan penjemput.',
      'Skor pilah dari model regresi logistik fitur HSV, GLCM, dan LBP (akurasi uji 84,7% pada dataset Kaggle). Hasil di lapangan bisa berbeda.',
      'Angka emisi adalah potensi total, bukan emisi tahunan model First Order Decay.',
    ],
  },
  en: {
    judul: 'Waste processing impact', bulan: 'Month', unduh: 'Download PDF report', bahasa: 'Bahasa',
    kalimat: (h, kg, co2, b) => `In ${b}, ${kg} kg of food waste from ${h} became maggot feed and fertiliser, avoiding about ${co2} CO₂e.`,
    kosong: 'No pickups this month yet.',
    diolah: 'Waste processed', co2: 'Net CO₂e avoided', larva: 'Maggot larvae', kasgot: 'Frass fertiliser', pilah: 'Average sorting score', jemput: 'Pickups',
    harian: 'Waste collected per day (kg)', neraca: 'Where the waste went', susut: 'Loss (water and respiration)',
    pilahJudul: 'Sorting quality', pilahKet: 'Scored from a photo of each bin at pickup. 100 means no visible plastic, cans, or tissue. Days below 80 are marked orange.',
    pilahRendah: 'Sorting score below 80', mingguan: 'Weekly summary', minggu: 'Week', tgl: 'Date',
    metode: 'Method and sources', laporan: 'Sustainability Report', disiapkan: 'Prepared by Magi Farm', dibuat: 'Generated',
    contoh: 'Sample data, not real hotel data.',
    metodeIsi: [
      'Waste weight from the Magi Farm driver scale at pickup.',
      'Larvae 15% and frass 30% of waste weight (Dortmans et al. 2017, Eawag; conservative values).',
      `Methane avoided: waste × DOC ${P.DOC} × DOCf ${P.DOCf} × MCF ${P.MCF} × F ${P.F} × 16/12 (IPCC 2006), times GWP ${P.GWP_CH4} (IPCC AR6, 100-year).`,
      'Net CO₂e = avoided − BSF process emissions (0.02 kg/kg waste) − share of pickup vehicle fuel emissions.',
      'Sorting score from a logistic regression on HSV, GLCM, and LBP features (84.7% test accuracy on a Kaggle dataset). Field results may differ.',
      'Emission figures are total potential, not annual First Order Decay emissions.',
    ],
  },
}

export function hotel(x) {
  const { S, esc, icon, DEPOTS } = x
  const lang = () => (localStorage.getItem('mt.lang') === 'en' ? 'en' : 'id')
  const t = () => T[lang()]
  const loc = () => (lang() === 'en' ? 'en-GB' : 'id-ID')
  const n = (v, d = 0) => Number(v).toLocaleString(loc(), { maximumFractionDigits: d })
  const kgTon = v => (v >= 1000 ? `${n(v / 1000, 2)} ${lang() === 'en' ? 'tonnes' : 'ton'}` : `${n(v)} kg`)
  let bulan = new Date().toLocaleDateString('sv-SE').slice(0, 7)

  const refId = () => S.user.ref_id || localStorage.getItem('mt.hotelRef')
  const me = () => S.clients.find(c => c.id === refId())

  // Data contoh: 3 bulan penjemputan Senin/Rabu/Jumat untuk satu hotel.
  async function seed() {
    if (refId() && (await x.all('Clients')).some(c => c.id === refId())) return
    const id = 'contoh-hotel-c', now = new Date().toISOString()
    await x.put('Clients', { id, tipe: 'hotel', nama: 'Hotel C (Ubud)', alamat: 'Ubud, Gianyar', lat: -8.505, lon: 115.26, depot: 'bresela', box: 8, aktif: '1', contoh: '1', dibuat: now, _dirty: 0 })
    localStorage.setItem('mt.hotelRef', id)
    let acak = 7
    const r = () => ((acak = (acak * 16807) % 2147483647) / 2147483647)
    for (let d = 95; d >= 1; d--) {
      const tgl = new Date(Date.now() - d * 864e5)
      if (![1, 3, 5].includes(tgl.getDay())) continue
      const akhirPekan = tgl.getDay() === 1 ? 1.25 : 1 // sisa makanan akhir pekan lebih banyak
      await x.put('Pickups', { id: crypto.randomUUID(), tanggal: tgl.toLocaleDateString('sv-SE'), client_id: id, rute_id: '', urutan: 1, driver: 'contoh',
        status: 'selesai', kg: Math.round((95 + r() * 55) * akhirPekan * 10) / 10, skor_pilah: Math.round(70 + r() * 30), potongan_kotor: 0, contoh: '1', dibuat: now, _dirty: 0 })
    }
  }

  function data() {
    const h = me()
    const semua = S.pickups.filter(p => p.client_id === h?.id && p.status === 'selesai' && +p.kg > 0)
    const rows = semua.filter(p => p.tanggal.startsWith(bulan)).sort((a, b) => a.tanggal.localeCompare(b.tanggal))
    // bagian BBM: km rute dibagi jumlah titik; tanpa rute, pulang-pergi depot dibagi 4 titik (asumsi)
    const depot = DEPOTS.find(d => d.id === h?.depot) || DEPOTS[0]
    const km = rows.reduce((s, p) => {
      const rute = S.routes.find(r => r.id === p.rute_id)
      const titik = rute ? JSON.parse(rute.urutan || '[]').length || 1 : 0
      return s + (rute ? +rute.km / titik : (2 * jarakKm(depot, { lat: +h.lat, lon: +h.lon })) / 4)
    }, 0)
    const kg = rows.reduce((s, p) => s + +p.kg, 0)
    const sk = rows.filter(p => p.skor_pilah !== '' && p.skor_pilah != null).map(p => +p.skor_pilah)
    const bulanAda = [...new Set(semua.map(p => p.tanggal.slice(0, 7)))].sort().reverse()
    return { h, rows, d: hitung(kg, km), km, pilah: sk.length ? Math.round(sk.reduce((a, b) => a + b, 0) / sk.length) : null, bulanAda }
  }

  // Grafik batang harian, satu seri: tinggi = kg, batang oranye = skor pilah < 80 (dengan legenda).
  function chart(rows, w = 720, h = 220) {
    if (!rows.length) return ''
    const [y, m] = bulan.split('-').map(Number)
    const hari = new Date(y, m, 0).getDate()
    const maks = Math.max(...rows.map(p => +p.kg)) * 1.1
    const pad = { l: 36, r: 8, t: 10, b: 24 }
    const bw = (w - pad.l - pad.r) / hari
    const sy = v => pad.t + (h - pad.t - pad.b) * (1 - v / maks)
    const tick = [0, maks / 2, maks].map(v => Math.round(v / 10) * 10)
    const bars = rows.map(p => {
      const d = +p.tanggal.slice(8)
      const x0 = pad.l + (d - 1) * bw + 1, y0 = sy(+p.kg), hh = h - pad.b - y0
      const low = +p.skor_pilah < 80
      return `<g class="bar${low ? ' is-low' : ''}" tabindex="0"><title>${new Date(p.tanggal).toLocaleDateString(loc(), { day: 'numeric', month: 'short' })}: ${n(p.kg, 1)} kg · ${t().pilah.toLowerCase()} ${p.skor_pilah}</title>
        <rect class="hit" x="${x0 - 1}" y="${pad.t}" width="${bw}" height="${h - pad.t - pad.b}"/>
        <path d="M${x0},${h - pad.b} V${y0 + 4} q0,-4 4,-4 h${Math.max(0, bw - 10)} q4,0 4,4 V${h - pad.b} Z"/></g>`
    }).join('')
    return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${t().harian}">
      ${tick.map(v => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${sy(v)}" y2="${sy(v)}" class="grid"/><text x="${pad.l - 6}" y="${sy(v) + 4}" class="ax" text-anchor="end">${v}</text>`).join('')}
      ${[1, 8, 15, 22, hari].map(d => `<text x="${pad.l + (d - 0.5) * bw}" y="${h - 6}" class="ax" text-anchor="middle">${d}</text>`).join('')}
      ${bars}</svg>`
  }

  function massBar(d) {
    const part = [[t().larva, d.larva, 'var(--c-panen)'], [t().kasgot, d.kasgot, 'var(--c-prepupa)'], [t().susut, d.susut, '#c9cfc6']]
    return `<div class="mass" role="img" aria-label="${t().neraca}">${part.map(([l, v, c]) => `<i style="flex:${v};background:${c}" title="${l}: ${n(v)} kg"></i>`).join('')}</div>
      <ul class="mass-l">${part.map(([l, v, c]) => `<li><i style="background:${c}"></i>${l} <b>${n(v)} kg</b> <span class="muted">${n((v / (d.kg || 1)) * 100)}%</span></li>`).join('')}</ul>`
  }

  function weekly(rows) {
    const w = {}
    for (const p of rows) {
      const k = Math.ceil(+p.tanggal.slice(8) / 7)
      ;(w[k] ||= { kg: 0, n: 0, sk: [] }).kg += +p.kg
      w[k].n++
      if (p.skor_pilah !== '') w[k].sk.push(+p.skor_pilah)
    }
    return `<div class="table-scroll"><table class="table rtable"><thead><tr><th>${t().minggu}</th><th class="n">${t().jemput}</th><th class="n">kg</th><th class="n">CO₂e (kg)</th><th class="n">${lang() === 'en' ? 'Score' : 'Skor'}</th></tr></thead>
      <tbody>${Object.entries(w).map(([k, v]) => `<tr><td>${k}</td><td class="n">${v.n}</td><td class="n">${n(v.kg, 1)}</td><td class="n">${n(hitung(v.kg).cegah)}</td>
        <td class="n">${v.sk.length ? n(v.sk.reduce((a, b) => a + b, 0) / v.sk.length) : '–'}</td></tr>`).join('')}</tbody></table></div>`
  }

  const stats = (d, rows, pilah) => [
    [t().diolah, kgTon(d.kg)], [t().co2, kgTon(d.bersih)], [t().larva, `${n(d.larva)} kg`],
    [t().kasgot, `${n(d.kasgot)} kg`], [t().pilah, pilah == null ? '–' : `${pilah}/100`], [t().jemput, n(rows.length)],
  ].map(([l, v]) => `<div class="stat"><dt>${l}</dt><dd>${v}</dd></div>`).join('')

  const namaBulan = b => new Date(b + '-01').toLocaleDateString(loc(), { month: 'long', year: 'numeric' })

  function view() {
    const { h, rows, d, pilah, bulanAda } = data()
    if (!h) return `<div class="page-head"><h1>${t().judul}</h1></div><div class="empty">${icon('prediksi')}<p>${lang() === 'en' ? 'No data yet. Please contact Magi Farm.' : 'Data belum tersedia. Hubungi Magi Farm.'}</p></div>`
    if (!bulanAda.includes(bulan) && bulanAda.length) bulan = bulanAda[0]
    const low = rows.filter(p => +p.skor_pilah < 80)
    return `
    <div class="page-head">
      <h1>${esc(h.nama)}</h1>
      <p class="summary">${namaBulan(bulan)} · ${rows.length} ${t().jemput.toLowerCase()}${h.contoh === '1' ? ` <span class="tag">${lang() === 'en' ? 'Sample data' : 'Data contoh'}</span>` : ''}</p>
    </div>
    <div class="toolbar">
      <label class="sel"><span class="sr">${t().bulan}</span><select data-hbulan>${(bulanAda.length ? bulanAda : [bulan]).map(b => `<option value="${b}" ${b === bulan ? 'selected' : ''}>${namaBulan(b)}</option>`).join('')}</select></label>
      <button class="btn btn-quiet" data-act="lang">${t().bahasa}</button>
      <span class="grow"></span>
      <button class="btn btn-primary" data-act="print" ${rows.length ? '' : 'disabled'}>${t().unduh}</button>
    </div>
    ${rows.length ? `
    <section class="panel lead"><p>${t().kalimat(esc(h.nama), n(d.kg), kgTon(d.bersih), namaBulan(bulan))}</p><dl class="stats">${stats(d, rows, pilah)}</dl></section>
    <div class="h-grid">
      <section class="panel"><h2>${t().harian}</h2>${innerWidth < 600 ? chart(rows, 360, 200) : chart(rows)}
        ${low.length ? `<p class="legend-1"><i></i>${t().pilahRendah} (${low.length})</p>` : ''}</section>
      <section class="panel"><h2>${t().neraca}</h2>${massBar(d)}</section>
      <section class="panel"><h2>${t().mingguan}</h2>${weekly(rows)}</section>
    </div>` : `<div class="empty">${icon('prediksi')}<p>${t().kosong}</p></div>`}`
  }

  function report() {
    const { h, rows, d, pilah } = data()
    const el = document.getElementById('print')
    el.innerHTML = `
    <article class="report" lang="${lang()}">
      <header class="r-head"><img src="/mark.png" alt="" width="48" height="48"><div><h1>${esc(h.nama)}</h1><p>${t().laporan}, ${namaBulan(bulan)} · ${t().disiapkan}</p></div></header>
      ${h.contoh === '1' ? `<p class="r-sample">${t().contoh}</p>` : ''}
      <p class="r-lead">${t().kalimat(esc(h.nama), n(d.kg), kgTon(d.bersih), namaBulan(bulan))}</p>
      <dl class="stats">${stats(d, rows, pilah)}</dl>
      <h2>${t().harian}</h2>${chart(rows, 700, 200)}${rows.some(p => +p.skor_pilah < 80) ? `<p class="legend-1"><i></i>${t().pilahRendah}</p>` : ''}
      <h2>${t().neraca}</h2>${massBar(d)}
      <h2>${t().mingguan}</h2>${weekly(rows)}
      <h2>${t().metode}</h2><ol class="r-method">${t().metodeIsi.map(m => `<li>${m}</li>`).join('')}</ol>
      <footer>${t().dibuat} ${new Date().toLocaleDateString(loc(), { day: 'numeric', month: 'long', year: 'numeric' })} · MagiTrack</footer>
    </article>`
    document.title = `${t().laporan} ${h.nama} ${bulan}`
    print()
    document.title = 'MagiTrack'
  }

  function onClick(el) {
    if (el.dataset.act === 'lang') { localStorage.setItem('mt.lang', lang() === 'en' ? 'id' : 'en'); x.go('dampak'); return true }
    if (el.dataset.act === 'print') { report(); return true }
    return false
  }
  function onInput(e) {
    if (e.target.matches('[data-hbulan]')) { bulan = e.target.value; x.go('dampak'); return true }
    return false
  }
  return { seed, view, onClick, onInput }
}
