// Kalkulator dampak biokonversi, port dari notebook Kalkulator_Dampak_Biokonversi_...ipynb.
// Parameter sama dengan tabel ASUMSI di notebook (skenario moderat).
export const P = {
  konversi_larva: 0.15, // kg larva segar / kg sampah (Dortmans dkk. 2017, nilai konservatif)
  fraksi_kasgot: 0.3,   // kg kasgot / kg sampah (asumsi, ukur saat panen)
  DOC: 0.15, DOCf: 0.5, MCF: 0.6, F: 0.5, // IPCC 2006, sisa makanan, TPA tidak terkategori
  GWP_CH4: 27,          // IPCC AR6, metana non-fosil, 100 tahun
  emisi_bsf: 0.02,      // kg CO2e / kg sampah (asumsi konservatif, Mertenat dkk. 2019)
  km_per_liter: 10, co2_per_liter: 2.68, // pikap solar
  harga_maggot: 7000, harga_kasgot: 1500,
}

export function hitung(kg, km = 0, p = P) {
  const ch4 = kg * p.DOC * p.DOCf * p.MCF * p.F * 16 / 12
  const cegah = ch4 * p.GWP_CH4
  const proses = kg * p.emisi_bsf
  const angkut = (km / p.km_per_liter) * p.co2_per_liter
  const larva = kg * p.konversi_larva
  const kasgot = kg * p.fraksi_kasgot
  return { kg, larva, kasgot, susut: kg - larva - kasgot, ch4, cegah, proses, angkut, bersih: cegah - proses - angkut,
    nilai: larva * p.harga_maggot + kasgot * p.harga_kasgot }
}

// self-check: 100 kg sisa makanan -> 3,0 kg CH4 -> 81 kg CO2e dicegah (sama dengan notebook)
if (import.meta.env?.DEV) {
  const h = hitung(100)
  console.assert(Math.abs(h.ch4 - 3) < 1e-9 && Math.abs(h.cegah - 81) < 1e-9, 'rumus IPCC berubah', h)
}
