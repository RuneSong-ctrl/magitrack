// Penyimpanan offline (IndexedDB) + antrean sinkron ke server.
// Setiap catatan punya _dirty = 1 sampai server menerimanya.
const API = import.meta.env.VITE_API_URL || '/api'
// foto disimpan sebagai /api/photos/...; di Netlify harus diarahkan ke domain server
export const fileUrl = u => (u?.startsWith('/api/') ? API.replace(/\/api$/, '') + u : u)
const TABS = ['Eggs', 'Batches', 'Readings', 'Clients', 'Routes', 'Pickups']
// sama dengan WRITE / READ di server/app.py
const WRITE = { Eggs: ['admin', 'mitra'], Batches: ['admin', 'mitra'], Readings: ['admin', 'mitra'], Clients: ['admin'], Routes: ['admin'], Pickups: ['admin', 'driver'] }
const READ = { ...WRITE, Clients: ['admin', 'driver', 'hotel'], Routes: ['admin', 'driver'], Pickups: ['admin', 'driver', 'hotel'] }
let dbp

function db() {
  dbp ??= new Promise((ok, fail) => {
    const req = indexedDB.open('magitrack', 2)
    req.onupgradeneeded = () => TABS.forEach(t => req.result.objectStoreNames.contains(t) || req.result.createObjectStore(t, { keyPath: 'id' }))
    req.onsuccess = () => ok(req.result)
    req.onerror = () => fail(req.error)
  })
  return dbp
}

async function tx(tab, mode, fn) {
  const d = await db()
  return new Promise((ok, fail) => {
    const t = d.transaction(tab, mode)
    const r = fn(t.objectStore(tab))
    t.oncomplete = () => ok(r?.result)
    t.onerror = () => fail(t.error)
  })
}

export const all = tab => tx(tab, 'readonly', s => s.getAll())
export const put = (tab, row) => tx(tab, 'readwrite', s => s.put(row))

export async function save(tab, row) {
  const now = new Date().toISOString()
  const full = { dibuat: now, ...row, id: row.id || crypto.randomUUID(), diubah: now, _dirty: 1 }
  await put(tab, full)
  sync()
  return full
}

// ---- sesi ----
export const session = {
  get: () => { try { return JSON.parse(localStorage.getItem('mt.session')) } catch { return null } },
  set: s => localStorage.setItem('mt.session', JSON.stringify(s)),
  clear: () => localStorage.removeItem('mt.session'),
}

export async function api(path, body) {
  const s = session.get()
  const res = await fetch(API + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(s && { Authorization: 'Bearer ' + s.token }) },
    body: body && JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.detail || 'Server tidak menjawab.'), { status: res.status })
  return data
}

// ---- sinkron ----
const listeners = new Set()
export const onSync = fn => listeners.add(fn)
export const syncState = { pending: 0, last: null, error: null, busy: false }
const emit = () => listeners.forEach(fn => fn(syncState))

export async function countPending() {
  let n = 0
  for (const t of TABS) n += (await all(t)).filter(r => r._dirty).length
  syncState.pending = n
  return n
}

export async function sync() {
  if (syncState.busy || !session.get()) return
  syncState.busy = true
  emit()
  try {
    if (navigator.onLine) {
      const peran = session.get().user.peran
      for (const tab of TABS) {
        if (!READ[tab].includes(peran)) continue
        const dirty = (await all(tab)).filter(r => r._dirty)
        if (dirty.length && WRITE[tab].includes(peran)) {
          for (const r of dirty) if (r._foto) {
            // foto bukti diunggah dulu, lalu URL-nya ikut tersimpan di Sheets
            const { url, kontaminan: k } = await api('/photos', { id: r.id, data: r._foto })
            Object.assign(r, { foto_url: url, _foto: '', _peta: k?.peta, skor_pilah: k?.skor ?? '', potongan_kotor: k?.potongan_kotor ?? '' })
            await put(tab, r)
          }
          const rows = dirty.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('_'))))
          const { diterima } = await api('/sync', { tab, rows })
          for (const r of dirty) if (diterima.includes(r.id)) await put(tab, { ...r, _dirty: 0 })
        }
        // tarik data server; jangan timpa catatan lokal yang belum terkirim
        const server = await api('/data/' + tab)
        const local = new Map((await all(tab)).map(r => [r.id, r]))
        for (const r of server) if (r.id && !local.get(r.id)?._dirty) await put(tab, { ...local.get(r.id), ...r, _dirty: 0 })
      }
      syncState.last = new Date()
      syncState.error = null
    }
  } catch (e) {
    syncState.error = e.status === 401 ? 'Sesi habis, masuk lagi.' : 'Belum terkirim. Nanti dicoba lagi otomatis.'
  } finally {
    syncState.busy = false
    await countPending()
    emit()
  }
}

addEventListener('online', sync)
setInterval(sync, 60_000)
