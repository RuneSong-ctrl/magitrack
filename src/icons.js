// Ikon garis tipis buatan sendiri, satu gaya: 24px, stroke 1.6, ujung bulat.
const P = {
  rak: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 10h17M3.5 15h17M9 4v16M15 4v16"/>',
  telur: '<path d="M12 3.5c3.3 0 6 5 6 9.3a6 6 0 0 1-12 0C6 8.5 8.7 3.5 12 3.5Z"/><path d="M9.5 14.5a2.6 2.6 0 0 0 2.5 2"/>',
  batch: '<path d="M4 8.5 12 4l8 4.5-8 4.5-8-4.5Z"/><path d="m4 12.5 8 4.5 8-4.5M4 16.5 12 21l8-4.5"/>',
  prediksi: '<path d="M4 19.5h16"/><path d="m5 15 4-4.5 3.5 2.5L19 6"/><path d="M15 6h4v4"/>',
  cuaca: '<path d="M7.5 16.5h9a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 6.4 10a3.3 3.3 0 0 0 1.1 6.5Z"/><path d="m9 19-1 2M13 19l-1 2M17 19l-1 2"/>',
  lain: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  tambah: '<path d="M12 5v14M5 12h14"/>',
  sinkron: '<path d="M19.5 9A8 8 0 0 0 5 7.5M4.5 15A8 8 0 0 0 19 16.5"/><path d="M19.5 4v5h-5M4.5 20v-5h5"/>',
  cek: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  awas: '<path d="M12 4 21 19.5H3L12 4Z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  keluar: '<path d="M14 4.5h4.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M10 16l4-4-4-4M14 12H4"/>',
  lokasi: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
  tutup: '<path d="M6 6l12 12M18 6 6 18"/>',
  awan: '<path d="M7 18h10a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.6 1.8A3.6 3.6 0 0 0 7 18Z"/>',
  matahari: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M5.2 18.8l1.4-1.4M17.4 6.6l1.4-1.4"/>',
  rute: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8"/>',
  klien: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17.5 14.6a5.5 5.5 0 0 1 3 4.9"/>',
  kanan: '<path d="m9.5 6 6 6-6 6"/>',
  offline: '<path d="M3 3l18 18"/><path d="M8.5 16.5h8a3.5 3.5 0 0 0 1.3-6.8M6.2 8.8A3.4 3.4 0 0 0 7 15.8M10 6a5.8 5.8 0 0 1 6.6 2.3"/>',
}

export const icon = (name, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name]}</svg>`
