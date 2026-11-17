// Penyusunan rute cadangan yang jalan di HP/laptop tanpa server:
// 1. Sweep: titik diurutkan menurut sudutnya dari depot, lalu dipotong per kapasitas kendaraan (clustering).
// 2. Nearest neighbor: urutan awal tiap kelompok.
// 3. 2-opt: perbaiki urutan dengan membalik potongan rute selama jaraknya berkurang.
// Server memakai VRPTW OR-Tools; ini dipakai saat offline atau server tidak menjawab.

export const FAKTOR_JALAN = 1.35

export function km(a, b) {
  const r = Math.PI / 180
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h)) * FAKTOR_JALAN
}

const panjang = (depot, rute) => rute.reduce((s, p, i) => s + km(i ? rute[i - 1] : depot, p), 0) + (rute.length ? km(rute.at(-1), depot) : 0)

function nearest(depot, pts) {
  const sisa = [...pts], out = []
  let cur = depot
  while (sisa.length) {
    let bi = 0
    sisa.forEach((p, i) => { if (km(cur, p) < km(cur, sisa[bi])) bi = i })
    cur = sisa.splice(bi, 1)[0]
    out.push(cur)
  }
  return out
}

function twoOpt(depot, rute) {
  let best = rute, bestLen = panjang(depot, rute), membaik = true
  while (membaik) {
    membaik = false
    for (let i = 0; i < best.length - 1; i++)
      for (let j = i + 1; j < best.length; j++) {
        const coba = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)]
        const len = panjang(depot, coba)
        if (len < bestLen - 1e-9) { best = coba; bestLen = len; membaik = true }
      }
  }
  return best
}

export function planLocal({ depot, stops, kendaraan, kmh = 30, layanan = 5 }) {
  const sudut = p => Math.atan2(p.lat - depot.lat, p.lon - depot.lon)
  const urut = [...stops].sort((a, b) => sudut(a) - sudut(b))
  const kelompok = kendaraan.map(() => [])
  const dilewati = []
  let v = 0, isi = 0
  for (const s of urut) {
    while (v < kendaraan.length && isi + (s.box || 1) > kendaraan[v].kapasitas) { v++; isi = 0 }
    if (v >= kendaraan.length) { dilewati.push(s.id); continue }
    kelompok[v].push(s)
    isi += s.box || 1
  }
  const rute = kelompok.map((g, i) => {
    const r = twoOpt(depot, nearest(depot, g))
    const jarak = panjang(depot, r)
    return { kendaraan: kendaraan[i].id, urutan: r.map(p => p.id), km: Math.round(jarak * 10) / 10, menit: Math.round(jarak / kmh * 60 + r.length * layanan) }
  }).filter(r => r.urutan.length)
  return { metode: 'Sweep + nearest neighbor + 2-opt (di perangkat)', rute, dilewati }
}

// self-check kecil: 2-opt tidak pernah membuat rute lebih panjang dari nearest neighbor
if (import.meta.env?.DEV) {
  const d = { lat: 0, lon: 0 }
  const pts = Array.from({ length: 9 }, (_, i) => ({ id: 'p' + i, lat: Math.sin(i * 2.3) / 50, lon: Math.cos(i * 1.7) / 50 }))
  console.assert(panjang(d, twoOpt(d, nearest(d, pts))) <= panjang(d, nearest(d, pts)) + 1e-9, '2-opt memperpanjang rute')
}
