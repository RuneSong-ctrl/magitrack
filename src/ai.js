// Komponen sistem cerdas yang jalan di HP (offline):
// 1. Prediksi anakan hybrid: Gradient Boosting (tabel dari train.py) x kurva koreksi literatur.
// 2. Peringatan dini cuaca: sistem pakar berbasis aturan.

let model
export async function loadModel() {
  model ??= await fetch('/model.json').then(r => r.json())
  return model
}

// interpolasi linear pada titik kurva [[x, y], ...]
export function curve(points, x) {
  if (x <= points[0][0]) return points[0][1]
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i]
    if (x <= x1) {
      const [x0, y0] = points[i - 1]
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
    }
  }
  return points.at(-1)[1]
}

export const factor = (name, x) => {
  const k = model.koreksi[name]
  return Math.max(0, curve(k.titik, x) / k.acuan)
}

// Telur per gram, dari data ReproLab (egg_num / egg_weight konstan 39.171).
export const TELUR_PER_GRAM = 39171

export function predict({ pakan = 'FW', hari, suhu = 30, cahaya = 12, rh = 70, gram }) {
  const tabel = model.dasar[pakan]
  const hariAda = Object.keys(tabel).map(Number)
  const hariPakai = hariAda.reduce((a, b) => (Math.abs(b - hari) < Math.abs(a - hari) ? b : a))
  const dasar = tabel[hariPakai]
  const f = { suhu: factor('suhu', suhu), cahaya: factor('cahaya', cahaya), rh: factor('rh', rh) }
  const kali = f.suhu * f.cahaya * f.rh
  const mae = model.metrik_uji.GradientBoosting.mae
  const hasil = {
    pakan, hari, hariPakai, hariMaks: Math.max(...hariAda), dasar, faktor: f,
    anakan: Math.round(dasar * kali),
    bawah: Math.max(0, Math.round((dasar - mae) * kali)),
    atas: Math.round((dasar + mae) * kali),
  }
  if (gram > 0) {
    // perkiraan langsung dari timbangan: gram x telur/gram x daya tetas (Chia 2018) x faktor RH
    const dayaTetas = curve(model.koreksi.suhu.titik, suhu) / 100
    hasil.dariTimbangan = Math.round(gram * TELUR_PER_GRAM * dayaTetas * f.rh)
  }
  return hasil
}

// Model dilatih pada kandang penelitian ReproLab, ukurannya beda dengan kandang mitra.
// Kalibrasi: rasio (anakan dari timbangan / anakan model) dari catatan terakhir mitra,
// lalu dipakai untuk memperkirakan panen telur berikutnya (2 hari lagi).
export function forecastNext(eggs) {
  const recent = eggs.filter(e => !e.batal && +e.gram_telur > 0 && +e.hari > 0).slice(0, 5)
  if (!recent.length) return null
  const args = e => ({ pakan: e.pakan || 'FW', suhu: +e.suhu || 30, cahaya: +e.jam_cahaya || 12, rh: +e.rh || 70 })
  const ratios = recent
    .map(e => { const p = predict({ ...args(e), hari: +e.hari, gram: +e.gram_telur }); return p.anakan > 0 ? p.dariTimbangan / p.anakan : null })
    .filter(Boolean).sort((a, b) => a - b)
  if (!ratios.length) return null
  const k = ratios[Math.floor(ratios.length / 2)] // median, tahan terhadap satu catatan aneh
  const last = recent[0]
  const p = predict({ ...args(last), hari: +last.hari + 2 })
  return { hari: +last.hari + 2, anakan: Math.round(p.anakan * k), bawah: Math.round(p.bawah * k), atas: Math.round(p.atas * k), n: ratios.length, k, lewat: p.hariPakai !== p.hari }
}

// ---- cuaca (Open-Meteo, tanpa API key) ----
export async function weather(lat, lon) {
  const key = `mt.weather.${lat},${lon}`
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,' +
    'relative_humidity_2m_mean,shortwave_radiation_sum,weather_code&timezone=Asia%2FMakassar&forecast_days=7'
  try {
    const d = (await fetch(url).then(r => r.json())).daily
    const days = d.time.map((t, i) => ({
      tanggal: t, maks: d.temperature_2m_max[i], min: d.temperature_2m_min[i],
      hujan: d.precipitation_sum[i], peluang: d.precipitation_probability_max[i],
      rh: d.relative_humidity_2m_mean[i], radiasi: d.shortwave_radiation_sum[i], kode: d.weather_code[i],
    }))
    const data = { days, diambil: new Date().toISOString() }
    localStorage.setItem(key, JSON.stringify(data))
    return data
  } catch {
    const cached = localStorage.getItem(key)
    return cached ? { ...JSON.parse(cached), offline: true } : null
  }
}

// Basis aturan. Ambang masih perlu divalidasi bersama Magi Farm.
const RULES = [
  {
    id: 'hujan-telur', tingkat: 'waspada', untuk: ['mitra', 'admin'],
    cek: d => d.slice(0, 3).some(x => x.hujan >= 10 || x.radiasi < 12),
    judul: 'Produksi telur bisa turun',
    isi: 'Hujan atau mendung dalam 3 hari ke depan. Waktu musim hujan lalu, produksi sempat tinggal sekitar 20%.',
    saran: 'Nyalakan lampu bantu di kandang kawin 6 sampai 12 jam per hari.',
    sumber: 'Wawancara Magi Farm; Zhang dkk. 2025 (Insect Science)',
  },
  {
    id: 'banjir-box', tingkat: 'bahaya', untuk: ['admin', 'driver'],
    cek: d => d.slice(0, 2).some(x => x.hujan >= 30),
    judul: 'Box rumah tangga rawan kebanjiran',
    isi: 'Hujan lebat diperkirakan dalam 2 hari. Maggot di box pernah mati karena kehujanan dan banjir.',
    saran: 'Kabari pelanggan untuk menaruh box di tempat teduh, atau majukan jadwal jemput.',
    sumber: 'Wawancara Magi Farm',
  },
  {
    id: 'panas', tingkat: 'bahaya', untuk: ['mitra', 'admin'],
    cek: d => d.slice(0, 3).some(x => x.maks >= 36),
    judul: 'Terlalu panas untuk telur',
    isi: 'Di atas 35°C daya tetas anjlok, dari 75% ke sekitar 10% pada 37°C.',
    saran: 'Pindahkan wadah telur ke tempat yang lebih sejuk dan berventilasi.',
    sumber: 'Chia dkk. 2018 (PLOS ONE)',
  },
  {
    id: 'dingin', tingkat: 'info', untuk: ['mitra', 'admin'],
    cek: d => d.slice(0, 3).some(x => x.min <= 18),
    judul: 'Penetasan akan lebih lambat',
    isi: 'Malam bisa turun ke 18°C atau kurang. Pada 15°C telur butuh sekitar 14 hari untuk menetas.',
    saran: 'Tutup ruang inkubasi di malam hari.',
    sumber: 'Chia dkk. 2018 (PLOS ONE)',
  },
  {
    id: 'kering', tingkat: 'info', untuk: ['mitra', 'admin'],
    cek: d => d.slice(0, 3).some(x => x.rh < 50),
    judul: 'Udara kering',
    isi: 'Kelembapan di bawah 50% membuat telur cepat kering.',
    saran: 'Jaga kelembapan ruang telur di 60 sampai 70%.',
    sumber: 'Mendoza dkk. 2023 (IEEE ICDT)',
  },
]

// Aturan untuk catatan kandang manual (suhu & RH dark room)
export function checkReading({ suhu, rh }) {
  const out = []
  if (suhu >= 36) out.push('Dark room terlalu panas, daya tetas bisa jatuh di bawah 10%.')
  else if (suhu < 20) out.push('Dark room dingin, telur akan lambat menetas.')
  if (rh && rh < 50) out.push('Kelembapan rendah, telur bisa kering.')
  if (rh > 90) out.push('Terlalu lembap, waspadai jamur.')
  return out
}

export const alerts = (days, peran) =>
  days ? RULES.filter(r => r.untuk.includes(peran) && r.cek(days)) : []
