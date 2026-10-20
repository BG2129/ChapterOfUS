// =====================================================================
// Kenangan App - app.js (revisi 3)
// =====================================================================

// Proteksi: cek sesi login
const currentSession = getSession();
if (!currentSession) {
    window.location.href = 'login.html';
}

// ---------------------------------------------------------------------
// State & util
// ---------------------------------------------------------------------
let db = { albums: [], moments: [], journals: [], quotes: [], privateAuth: {} };
let currentTab = 'home';
let privateUnlocked = false;
let privateMode = 'auto'; // auto | setup | reset
let albumModalScope = 'public';
let openedMomentId = null;
let calYear = new Date().getFullYear();
const albumView = { public: { albumId: null }, private: { albumId: null } };

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const WEEKDAYS = ['SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB', 'MIN'];

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const pfx = (scope) => (scope === 'private' ? 'pv' : 'pub');

function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(iso) {
    if (!iso || iso.length < 10) return iso || '';
    const [y, m, d] = iso.split('-').map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
}

function todayISO() {
    const n = new Date();
    return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}

function nowTime() {
    const n = new Date();
    return `${pad(n.getHours())}:${pad(n.getMinutes())}`;
}

function sortMomentsDesc(list) {
    return [...list].sort((a, b) => (b.date + ' ' + b.time).localeCompare(a.date + ' ' + a.time));
}

function toast(msg, type = 'ok') {
    const root = $('toast-root');
    if (!root) return;
    const el = document.createElement('div');
    el.className = `pointer-events-auto px-4 py-3 rounded-xl shadow-2xl text-sm font-medium flex items-center gap-2 border transition-opacity duration-300 max-w-sm ${
        type === 'error' ? 'bg-rose-600 text-white border-rose-700' : 'bg-amber-800 text-cream-50 border-amber-600'
    }`;
    el.innerHTML = `<i class="fa-solid ${type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i><span>${esc(msg)}</span>`;
    root.appendChild(el);
    setTimeout(() => {
        el.classList.add('opacity-0');
        setTimeout(() => el.remove(), 300);
    }, 3800);
}

function setBusy(btn, busy, label) {
    if (!btn) return;
    if (busy) {
        btn.dataset.label = btn.innerHTML;
        btn.disabled = true;
        btn.classList.add('opacity-70', 'cursor-wait');
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${label || 'Memproses...'}`;
    } else {
        btn.disabled = false;
        btn.classList.remove('opacity-70', 'cursor-wait');
        if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
    }
}

// ---------------------------------------------------------------------
// Penyimpanan (IndexedDB - kapasitas jauh lebih besar dari localStorage)
// ---------------------------------------------------------------------
const IDB_NAME = 'kenangan_app_store';
const IDB_STORE = 'kv';

function idbOpen() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function idbGet(key) {
    const d = await idbOpen();
    return new Promise((resolve, reject) => {
        const r = d.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
    });
}

async function idbSet(key, value) {
    const d = await idbOpen();
    return new Promise((resolve, reject) => {
        const tx = d.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

function normalizeDB() {
    db.albums = db.albums || [];
    db.moments = db.moments || [];
    db.journals = db.journals || [];
    db.quotes = db.quotes || [];
    db.privateAuth = db.privateAuth || {};
    db.moments.forEach((m) => {
        m.emojis = m.emojis || {};
        m.comments = m.comments || [];
        m.mediaType = m.mediaType || 'image/jpeg';
    });
}

async function loadDB() {
    try {
        const saved = await idbGet('db');
        if (saved) {
            db = saved;
        } else {
            // Migrasi dari versi lama (localStorage)
            const legacy = localStorage.getItem('kenangan_app_db');
            if (legacy) {
                db = JSON.parse(legacy);
                await idbSet('db', db);
            }
        }
    } catch (e) {
        console.error('Gagal memuat data:', e);
        toast('Gagal memuat data tersimpan.', 'error');
    }
    normalizeDB();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

async function saveDB() {
    try {
        await idbSet('db', db);
        updateStats();
        return true;
    } catch (e) {
        console.error('Gagal menyimpan:', e);
        toast('Penyimpanan gagal (ruang penyimpanan browser penuh?). Coba file yang lebih kecil.', 'error');
        return false;
    }
}

// ---------------------------------------------------------------------
// Scope (publik vs Ruang Pribadi) & hak akses
// ---------------------------------------------------------------------
function inScope(item, scope) {
    if (scope === 'private') return item.private === true && item.ownerEmail === currentSession.email;
    return !item.private;
}
const albumsOf = (scope) => db.albums.filter((a) => inScope(a, scope));
const momentsOf = (scope) => db.moments.filter((m) => inScope(m, scope));

function isAdmin() {
    return currentSession.role === 'ADMIN';
}
function canDelete(item) {
    return isAdmin() || !item.ownerEmail || item.ownerEmail === currentSession.email;
}
function ownerStamp(extra = {}) {
    return { ownerName: currentSession.name, ownerEmail: currentSession.email, ...extra };
}

// ---------------------------------------------------------------------
// Media helper (kompres foto agar hemat penyimpanan)
// ---------------------------------------------------------------------
function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
    });
}

function compressImage(file, maxSide, quality) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * scale));
            const h = Math.max(1, Math.round(img.height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Gagal membaca gambar'));
        };
        img.src = url;
    });
}

async function fileToMedia(file, maxSide = 1600, quality = 0.82) {
    if (file.type.startsWith('image/') && !file.type.includes('gif')) {
        try {
            return await compressImage(file, maxSide, quality);
        } catch (e) {
            /* fallback ke data URL asli */
        }
    }
    return readAsDataURL(file);
}

function mediaTypeOf(dataUrl, file) {
    const m = /^data:([^;,]+)/.exec(dataUrl);
    return m ? m[1] : file.type || 'image/jpeg';
}

function isVideo(m) {
    return (m.mediaType || '').startsWith('video');
}

function mediaThumb(m, cls = 'w-full h-full object-cover') {
    return isVideo(m)
        ? `<video src="${m.mediaUrl}" preload="metadata" muted class="${cls}"></video>`
        : `<img src="${m.mediaUrl}" class="${cls}" loading="lazy">`;
}

function albumCover(a) {
    if (a.thumbnail) return a.thumbnail;
    const m = db.moments.find((x) => x.albumId === a.id && !isVideo(x));
    return m ? m.mediaUrl : null;
}

function coverHTML(a, cls = 'w-full h-full object-cover') {
    const c = albumCover(a);
    return c
        ? `<img src="${c}" class="${cls}" loading="lazy">`
        : `<div class="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-200 to-amber-400 dark:from-amber-900 dark:to-cream-800 text-4xl">📷</div>`;
}

// ---------------------------------------------------------------------
// Tema, user, navigasi
// ---------------------------------------------------------------------
function initUserAndTheme() {
    const savedTheme = localStorage.getItem('kenangan_theme') || 'light';
    document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    document.documentElement.classList.toggle('light', savedTheme !== 'dark');

    $('user-display-name').innerText = currentSession.name;
    $('user-display-role').innerText = currentSession.role;
    $('user-avatar').innerText = currentSession.name.charAt(0);
    if (currentSession.role === 'ADMIN') $('nav-btn-manage').classList.remove('hidden');
}

function toggleTheme() {
    const html = document.documentElement;
    const toDark = !html.classList.contains('dark');
    html.classList.toggle('dark', toDark);
    html.classList.toggle('light', !toDark);
    localStorage.setItem('kenangan_theme', toDark ? 'dark' : 'light');
}

function logout() {
    localStorage.removeItem('kenangan_session');
    window.location.href = 'login.html';
}

function confirmLogout() {
    if (confirm('Yakin ingin keluar dari akun?')) logout();
}

function switchTab(tabId) {
    // Ruang Pribadi otomatis terkunci saat ditinggalkan
    if (currentTab === 'private' && tabId !== 'private') {
        privateUnlocked = false;
        privateMode = 'auto';
    }
    currentTab = tabId;

    document.querySelectorAll('.tab-content').forEach((el) => el.classList.add('hidden'));
    $(`tab-${tabId}`).classList.remove('hidden');

    document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.remove('active', 'bg-amber-200/50', 'dark:bg-amber-900/40'));
    const activeBtn = document.querySelector(`[data-tab="${tabId}"]`);
    if (activeBtn) activeBtn.classList.add('active', 'bg-amber-200/50', 'dark:bg-amber-900/40');

    if (tabId === 'home') renderHome();
    if (tabId === 'albums') renderAlbumModule('public');
    if (tabId === 'calendar') renderCalendar();
    if (tabId === 'upload') prepareUploadForm('public');
    if (tabId === 'journal') renderJournal();
    if (tabId === 'private') renderPrivate();
    if (tabId === 'manage') renderManageUsers();
    window.scrollTo({ top: 0 });
}

function refreshViews() {
    updateStats();
    if (currentTab === 'home') renderHome();
    if (currentTab === 'albums') renderAlbumModule('public');
    if (currentTab === 'calendar') renderCalendar();
    if (currentTab === 'journal') renderJournal();
    if (currentTab === 'private' && privateUnlocked) renderAlbumModule('private');
}

function switchJournalSub(sub) {
    const on = 'px-4 py-2 rounded-xl text-sm font-medium bg-amber-800 text-cream-50 transition';
    const off = 'px-4 py-2 rounded-xl text-sm font-medium bg-cream-200 dark:bg-cream-800 text-amber-950 dark:text-cream-100 transition';
    $('journal-sub-chapters').classList.toggle('hidden', sub !== 'chapters');
    $('journal-sub-quotes').classList.toggle('hidden', sub !== 'quotes');
    $('sub-btn-chapters').className = sub === 'chapters' ? on : off;
    $('sub-btn-quotes').className = sub === 'quotes' ? on : off;
    if (sub === 'quotes') renderQuotes();
}

function updateStats() {
    $('stat-albums').innerText = albumsOf('public').length;
    $('stat-moments').innerText = momentsOf('public').length;
    $('stat-journals').innerText = db.journals.length;
    $('stat-quotes').innerText = db.quotes.length;
}

// ---------------------------------------------------------------------
// Beranda
// ---------------------------------------------------------------------
function renderHome() {
    updateStats();
    const grid = $('recent-moments-grid');
    const list = sortMomentsDesc(momentsOf('public'));
    if (list.length === 0) {
        grid.innerHTML = `<div class="col-span-full py-12 text-center text-amber-800/60 dark:text-cream-300 text-sm">Belum ada momen yang diunggah. Mulai tambahkan momen di menu Unggah Foto.</div>`;
        return;
    }
    grid.innerHTML = list
        .slice(0, 6)
        .map((m) => {
            const album = db.albums.find((a) => a.id === m.albumId);
            return `
            <div onclick="openMomentDetail('${m.id}')" class="bg-white/80 dark:bg-cream-800/80 border border-amber-200 dark:border-amber-900/50 rounded-2xl overflow-hidden hover:border-amber-600/50 transition cursor-pointer group shadow-sm">
                <div class="h-48 overflow-hidden bg-cream-900 relative">
                    ${mediaThumb(m, 'w-full h-full object-cover group-hover:scale-105 transition duration-500')}
                    <span class="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[10px] font-medium text-cream-100">${esc(album ? album.title : 'Album')}</span>
                </div>
                <div class="p-4 space-y-2">
                    <div class="flex items-center justify-between text-xs text-amber-800/70 dark:text-cream-300">
                        <span><i class="fa-regular fa-calendar"></i> ${fmtDate(m.date)}</span>
                        <span><i class="fa-regular fa-clock"></i> ${esc(m.time)}</span>
                    </div>
                    <h3 class="font-bold text-base truncate group-hover:text-amber-800 dark:group-hover:text-amber-300 transition">${esc(m.title)}</h3>
                    <p class="text-xs text-amber-900/70 dark:text-cream-300 line-clamp-2">${esc(m.caption || 'Tanpa keterangan.')}</p>
                    ${m.ownerName ? `<p class="text-[11px] text-amber-800/70 dark:text-amber-300"><i class="fa-solid fa-user"></i> ${esc(m.ownerName)}</p>` : ''}
                </div>
            </div>`;
        })
        .join('');
}

// ---------------------------------------------------------------------
// Modul Album (dipakai Koleksi Album & Ruang Pribadi)
// ---------------------------------------------------------------------
function renderAlbumModule(scope) {
    const root = $(`${pfx(scope)}-album-root`);
    if (!root) return;
    const view = albumView[scope];
    if (view.albumId && albumsOf(scope).some((a) => a.id === view.albumId)) {
        renderAlbumDetail(scope, root);
        return;
    }
    view.albumId = null;

    const albums = albumsOf(scope);
    const isPv = scope === 'private';
    root.innerHTML = `
        <div class="space-y-6">
            <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 class="text-2xl font-bold">${isPv ? 'Album Pribadi Saya' : 'Koleksi Album Kenangan'}</h2>
                    <p class="text-amber-800/70 dark:text-cream-300 text-sm">${isPv ? 'Hanya akun Anda yang bisa melihat album dan momen di sini.' : 'Pilih album untuk melihat detail momen dan cerita di dalamnya.'}</p>
                </div>
                <div class="flex gap-2 self-start md:self-auto">
                    ${isPv ? `<button onclick="openPrivateUpload()" class="px-4 py-2 bg-amber-200 dark:bg-amber-900/60 hover:bg-amber-300 dark:hover:bg-amber-800 text-amber-950 dark:text-cream-50 rounded-xl text-sm font-medium transition flex items-center gap-2"><i class="fa-solid fa-cloud-arrow-up"></i> Tambah Momen</button>` : ''}
                    <button onclick="openNewAlbumModal('${scope}')" class="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-cream-50 rounded-xl text-sm font-medium transition flex items-center gap-2 shadow-md">
                        <i class="fa-solid fa-folder-plus"></i> Buat Album Baru
                    </button>
                </div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                ${
                    albums.length === 0
                        ? `<div class="col-span-full py-16 text-center text-amber-800/60 dark:text-cream-300 text-sm">Belum ada album. Klik tombol "Buat Album Baru".</div>`
                        : albums
                              .map((a) => {
                                  const count = db.moments.filter((m) => m.albumId === a.id).length;
                                  return `
                <div onclick="openAlbumDetail('${scope}','${a.id}')" class="bg-white/80 dark:bg-cream-800/80 border border-amber-200 dark:border-amber-900/50 rounded-2xl overflow-hidden hover:border-amber-600/50 transition cursor-pointer group shadow-sm">
                    <div class="h-44 overflow-hidden bg-cream-900 relative">
                        ${coverHTML(a, 'w-full h-full object-cover group-hover:scale-105 transition duration-500')}
                        <div class="absolute inset-0 bg-gradient-to-t from-cream-950/80 via-transparent pointer-events-none"></div>
                        <span class="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg bg-amber-800 text-cream-50 text-[10px] font-semibold">${count} Momen</span>
                        ${canDelete(a) ? `<button onclick="event.stopPropagation(); deleteAlbum('${a.id}')" title="Hapus album" class="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/55 hover:bg-rose-600 text-white flex items-center justify-center text-xs transition"><i class="fa-solid fa-trash-can"></i></button>` : ''}
                    </div>
                    <div class="p-5 space-y-1.5">
                        <h3 class="font-bold text-lg group-hover:text-amber-800 dark:group-hover:text-amber-300 transition">${esc(a.title)}</h3>
                        <p class="text-xs text-amber-900/70 dark:text-cream-300 line-clamp-2">${esc(a.desc || 'Album koleksi kenangan bermakna.')}</p>
                        ${a.ownerName ? `<p class="text-[11px] text-amber-800/80 dark:text-amber-300"><i class="fa-solid fa-user-pen"></i> Dibuat oleh ${esc(a.ownerName)}</p>` : ''}
                    </div>
                </div>`;
                              })
                              .join('')
                }
            </div>
        </div>`;
}

function openAlbumDetail(scope, albumId) {
    albumView[scope].albumId = albumId;
    renderAlbumModule(scope);
    window.scrollTo({ top: 0 });
}

function backToAlbums(scope) {
    albumView[scope].albumId = null;
    renderAlbumModule(scope);
}

function renderAlbumDetail(scope, root) {
    const album = albumsOf(scope).find((a) => a.id === albumView[scope].albumId);
    const moments = sortMomentsDesc(db.moments.filter((m) => m.albumId === album.id));

    root.innerHTML = `
        <div class="space-y-6">
            <button onclick="backToAlbums('${scope}')" class="px-4 py-2 bg-amber-200 dark:bg-cream-800 hover:bg-amber-300 dark:hover:bg-cream-700 text-amber-950 dark:text-cream-100 rounded-xl text-sm font-medium transition flex items-center gap-2">
                <i class="fa-solid fa-arrow-left"></i> Kembali ke Daftar Album
            </button>
            <div class="bg-white/80 dark:bg-cream-800/80 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-6">
                <div class="flex flex-col md:flex-row gap-6 items-start md:items-center">
                    <div class="w-full md:w-48 h-36 rounded-xl overflow-hidden shadow-md shrink-0 bg-cream-900">${coverHTML(album)}</div>
                    <div class="space-y-2 flex-1 min-w-0">
                        <span class="px-2.5 py-1 rounded-full bg-amber-800/10 dark:bg-amber-300/10 text-amber-800 dark:text-amber-300 text-xs font-semibold">${scope === 'private' ? 'Album Pribadi' : 'Album Kenangan'}</span>
                        <h2 class="text-2xl md:text-3xl font-bold break-words">${esc(album.title)}</h2>
                        <p class="text-amber-900/80 dark:text-cream-200 text-sm">${esc(album.desc || 'Tidak ada deskripsi.')}</p>
                        ${album.ownerName ? `<p class="text-xs text-amber-800/80 dark:text-amber-300"><i class="fa-solid fa-user-pen"></i> Dibuat oleh <b>${esc(album.ownerName)}</b></p>` : ''}
                    </div>
                    <div class="flex md:flex-col gap-2 shrink-0">
                        <button onclick="quickUpload('${scope}','${album.id}')" class="px-3 py-2 bg-amber-800 hover:bg-amber-900 text-cream-50 rounded-xl text-xs font-semibold transition flex items-center gap-2"><i class="fa-solid fa-plus"></i> Tambah Momen</button>
                        ${canDelete(album) ? `<button onclick="deleteAlbum('${album.id}')" class="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-400 rounded-xl text-xs font-semibold transition flex items-center gap-2"><i class="fa-solid fa-trash-can"></i> Hapus Album</button>` : ''}
                    </div>
                </div>
            </div>
            <div class="space-y-4">
                <h3 class="text-lg font-bold">Daftar Sub-Momen (Terbaru - Terlama)</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    ${
                        moments.length === 0
                            ? `<div class="col-span-full py-12 text-center text-amber-800/60 dark:text-cream-300 text-sm">Belum ada momen di dalam album ini.</div>`
                            : moments
                                  .map(
                                      (m) => `
                    <div onclick="openMomentDetail('${m.id}')" class="bg-white/80 dark:bg-cream-800/80 border border-amber-200 dark:border-amber-900/50 rounded-xl p-4 flex gap-4 hover:border-amber-600/50 transition cursor-pointer group shadow-sm">
                        <div class="w-24 h-24 rounded-lg overflow-hidden bg-cream-900 shrink-0">${mediaThumb(m)}</div>
                        <div class="flex-1 min-w-0 space-y-1">
                            <div class="text-xs text-amber-800/70 dark:text-cream-300"><i class="fa-regular fa-calendar"></i> ${fmtDate(m.date)} | ${esc(m.time)}</div>
                            <h4 class="font-bold text-base truncate group-hover:text-amber-800 dark:group-hover:text-amber-300 transition">${esc(m.title)}</h4>
                            <p class="text-xs text-amber-900/70 dark:text-cream-300 line-clamp-2">${esc(m.caption || 'Tanpa keterangan.')}</p>
                            <div class="flex items-center gap-3 pt-1 text-[11px] text-amber-800/70 dark:text-cream-300 flex-wrap">
                                ${m.ownerName ? `<span class="text-amber-800 dark:text-amber-300 font-semibold"><i class="fa-solid fa-user"></i> ${esc(m.ownerName)}</span>` : ''}
                                <span><i class="fa-regular fa-comment"></i> ${m.comments.length}</span>
                                <span><i class="fa-solid fa-face-smile"></i> ${Object.values(m.emojis).reduce((a, b) => a + b, 0)}</span>
                            </div>
                        </div>
                        ${canDelete(m) ? `<button onclick="event.stopPropagation(); deleteMoment('${m.id}')" title="Hapus" class="self-start w-8 h-8 shrink-0 rounded-full bg-rose-500/10 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 flex items-center justify-center text-xs transition"><i class="fa-solid fa-trash-can"></i></button>` : ''}
                    </div>`
                                  )
                                  .join('')
                    }
                </div>
            </div>
        </div>`;
}

function quickUpload(scope, albumId) {
    if (scope === 'private') {
        openPrivateUpload(albumId);
    } else {
        switchTab('upload');
        $('pub-album-select').value = albumId;
    }
}

// ---------------------------------------------------------------------
// Detail momen (modal) + reaksi + komentar
// ---------------------------------------------------------------------
function openMomentDetail(momentId) {
    openedMomentId = momentId;
    if (!renderMomentModal()) return;
    $('modal-moment').classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

function closeMomentModal() {
    $('modal-moment').classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    openedMomentId = null;
}

function renderMomentModal() {
    const m = db.moments.find((x) => x.id === openedMomentId);
    if (!m) return false;
    const album = db.albums.find((a) => a.id === m.albumId);
    $('moment-modal-content').innerHTML = `
        <div class="space-y-4">
            <div class="flex items-center justify-between gap-3 text-xs text-amber-800/70 dark:text-cream-300 flex-wrap">
                <span class="px-3 py-1 rounded-full bg-amber-800/10 dark:bg-amber-300/10 text-amber-800 dark:text-amber-300 font-semibold">${esc(album ? album.title : 'Album')}</span>
                <span><i class="fa-regular fa-calendar"></i> ${fmtDate(m.date)} - <i class="fa-regular fa-clock"></i> ${esc(m.time)}</span>
            </div>
            <h2 class="text-2xl font-bold break-words">${esc(m.title)}</h2>
            ${m.ownerName ? `<p class="text-xs text-amber-800 dark:text-amber-300"><i class="fa-solid fa-user"></i> Diunggah oleh <b>${esc(m.ownerName)}</b></p>` : ''}
            <div class="rounded-2xl overflow-hidden bg-cream-900 max-h-[480px] flex items-center justify-center">
                ${isVideo(m) ? `<video src="${m.mediaUrl}" controls class="max-h-[480px] w-auto mx-auto"></video>` : `<img src="${m.mediaUrl}" class="max-h-[480px] w-auto mx-auto object-contain">`}
            </div>
            <p class="text-amber-900/80 dark:text-cream-200 text-sm leading-relaxed whitespace-pre-line">${esc(m.caption || 'Tidak ada keterangan.')}</p>

            <div class="pt-4 border-t border-amber-200 dark:border-amber-900/60 space-y-2">
                <h4 class="text-xs font-semibold text-amber-800/70 dark:text-cream-300">Reaksi Emoji</h4>
                <div class="flex flex-wrap gap-2">
                    ${['❤️', '😍', '🔥', '👏', '🥹', '✨']
                        .map((emoji) => `<button onclick="reactEmoji('${m.id}','${emoji}')" class="px-3 py-1.5 rounded-xl bg-cream-200/60 dark:bg-cream-900 text-sm flex items-center gap-1.5 transition border border-amber-300 dark:border-amber-800"><span>${emoji}</span> <span class="text-xs font-semibold">${m.emojis[emoji] || 0}</span></button>`)
                        .join('')}
                </div>
            </div>

            <div class="pt-4 border-t border-amber-200 dark:border-amber-900/60 space-y-4">
                <h4 class="text-sm font-bold">Komentar (${m.comments.length})</h4>
                <div class="space-y-3 max-h-60 overflow-y-auto pr-1">
                    ${
                        m.comments.length === 0
                            ? `<p class="text-xs text-amber-800/60 dark:text-cream-300">Belum ada komentar.</p>`
                            : m.comments
                                  .map(
                                      (c) => `
                        <div class="bg-cream-50 dark:bg-cream-900/80 p-3 rounded-xl border border-amber-200 dark:border-amber-800 space-y-1">
                            <div class="flex justify-between text-xs font-bold text-amber-800 dark:text-amber-300"><span>${esc(c.name)}</span><span class="text-[10px] text-amber-800/60 dark:text-cream-300 font-normal">${esc(c.time)}</span></div>
                            <p class="text-xs text-amber-950 dark:text-cream-100">${esc(c.text)}</p>
                        </div>`
                                  )
                                  .join('')
                    }
                </div>
                <div class="flex gap-2 pt-1">
                    <input type="text" id="comment-text" placeholder="Tulis komentar..." class="flex-1 bg-cream-50 dark:bg-cream-900 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2 text-xs text-amber-950 dark:text-cream-100 focus:outline-none focus:border-amber-600" onkeypress="if(event.key==='Enter') addComment('${m.id}')">
                    <button onclick="addComment('${m.id}')" class="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-cream-50 rounded-xl text-xs font-medium transition">Kirim</button>
                </div>
            </div>

            ${canDelete(m) ? `<div class="pt-4 border-t border-amber-200 dark:border-amber-900/60 flex justify-end"><button onclick="deleteMoment('${m.id}')" class="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-400 rounded-xl text-xs font-semibold transition flex items-center gap-2"><i class="fa-solid fa-trash-can"></i> Hapus Momen Ini</button></div>` : ''}
        </div>`;
    return true;
}

async function reactEmoji(momentId, emoji) {
    const m = db.moments.find((x) => x.id === momentId);
    if (!m) return;
    m.emojis[emoji] = (m.emojis[emoji] || 0) + 1;
    await saveDB();
    renderMomentModal();
}

async function addComment(momentId) {
    const input = $('comment-text');
    const text = input.value.trim();
    if (!text) return;
    const m = db.moments.find((x) => x.id === momentId);
    if (!m) return;
    m.comments.push({ name: currentSession.name, text, time: new Date().toLocaleString('id-ID') });
    await saveDB();
    renderMomentModal();
}

// ---------------------------------------------------------------------
// Hapus album / momen
// ---------------------------------------------------------------------
async function deleteAlbum(albumId) {
    const album = db.albums.find((a) => a.id === albumId);
    if (!album) return;
    if (!canDelete(album)) {
        toast('Hanya pembuat album atau Admin yang dapat menghapus album ini.', 'error');
        return;
    }
    const count = db.moments.filter((m) => m.albumId === albumId).length;
    if (!confirm(`Hapus album "${album.title}" beserta ${count} foto/video di dalamnya?\n\nTindakan ini tidak dapat dibatalkan.`)) return;

    const backup = JSON.stringify({ a: db.albums, m: db.moments, j: db.journals });
    db.albums = db.albums.filter((a) => a.id !== albumId);
    db.moments = db.moments.filter((m) => m.albumId !== albumId);
    db.journals = db.journals.filter((j) => j.albumId !== albumId);
    if (!(await saveDB())) {
        const b = JSON.parse(backup);
        db.albums = b.a;
        db.moments = b.m;
        db.journals = b.j;
        return;
    }
    ['public', 'private'].forEach((s) => {
        if (albumView[s].albumId === albumId) albumView[s].albumId = null;
    });
    closeMomentModal();
    toast(`Album "${album.title}" berhasil dihapus.`);
    refreshViews();
}

async function deleteMoment(momentId) {
    const m = db.moments.find((x) => x.id === momentId);
    if (!m) return;
    if (!canDelete(m)) {
        toast('Hanya pengunggah atau Admin yang dapat menghapus momen ini.', 'error');
        return;
    }
    if (!confirm(`Hapus "${m.title}"?\n\nTindakan ini tidak dapat dibatalkan.`)) return;
    const idx = db.moments.indexOf(m);
    db.moments.splice(idx, 1);
    if (!(await saveDB())) {
        db.moments.splice(idx, 0, m);
        return;
    }
    closeMomentModal();
    closeModal('modal-day');
    toast('Momen berhasil dihapus.');
    refreshViews();
}

// ---------------------------------------------------------------------
// Kalender Foto (grid harian per bulan)
// ---------------------------------------------------------------------
function renderCalendar() {
    const root = $('calendar-root');
    const ms = momentsOf('public');
    const nowY = new Date().getFullYear();
    const years = [...new Set([...ms.map((m) => Number(m.date.slice(0, 4))), nowY, calYear])].sort((a, b) => b - a);

    const byDate = {};
    ms.forEach((m) => (byDate[m.date] = byDate[m.date] || []).push(m));
    const hasPhoto = (i) => ms.some((m) => m.date.startsWith(`${calYear}-${pad(i + 1)}-`));
    const today = todayISO();

    const monthSections = MONTHS.map((name, i) => {
        const offset = (new Date(calYear, i, 1).getDay() + 6) % 7; // Senin = 0
        const days = new Date(calYear, i + 1, 0).getDate();
        let cells = '';
        for (let b = 0; b < offset; b++) cells += `<div></div>`;
        for (let d = 1; d <= days; d++) {
            const key = `${calYear}-${pad(i + 1)}-${pad(d)}`;
            const list = byDate[key];
            const ring = key === today ? 'ring-2 ring-amber-600 dark:ring-amber-400 ring-offset-2 ring-offset-cream-100 dark:ring-offset-cream-900' : '';
            if (list) {
                const cover = list.find((x) => !isVideo(x));
                cells += `
                <button onclick="openDayModal('${key}')" title="${list.length} momen" class="relative aspect-square rounded-full overflow-hidden shadow-md hover:scale-105 transition ${ring} bg-cream-900 flex items-center justify-center">
                    ${cover ? `<img src="${cover.mediaUrl}" class="absolute inset-0 w-full h-full object-cover" loading="lazy">` : `<i class="fa-solid fa-play text-amber-200/70 absolute text-lg"></i>`}
                    <span class="absolute inset-0 bg-black/25"></span>
                    <span class="relative z-10 text-white font-bold text-sm sm:text-base" style="text-shadow:0 1px 3px rgba(0,0,0,.7)">${d}</span>
                    ${list.length > 1 ? `<span class="absolute bottom-0.5 right-1 z-10 text-[9px] font-bold text-white bg-amber-800/90 rounded-full px-1.5">${list.length}</span>` : ''}
                </button>`;
            } else {
                cells += `<div class="aspect-square rounded-full bg-amber-900/10 dark:bg-cream-800 flex items-center justify-center text-sm font-semibold text-amber-900/45 dark:text-cream-300/60 ${ring}">${d}</div>`;
            }
        }
        return `
        <div id="cal-month-${i}" class="scroll-mt-24 space-y-3">
            <h3 class="font-bold text-lg text-amber-950 dark:text-cream-50">${name} ${calYear}</h3>
            <div class="grid grid-cols-7 gap-2 sm:gap-3 text-center text-[10px] font-semibold tracking-wider text-amber-800/60 dark:text-cream-300/70">${WEEKDAYS.map((w) => `<span>${w}</span>`).join('')}</div>
            <div class="grid grid-cols-7 gap-2 sm:gap-3">${cells}</div>
        </div>`;
    }).join('<div class="h-6"></div>');

    root.innerHTML = `
        <div class="sticky top-0 z-20 -mx-4 md:-mx-8 px-4 md:px-8 py-3 bg-cream-100/95 dark:bg-cream-900/95 backdrop-blur border-b border-amber-200/60 dark:border-amber-900/50">
            <div class="flex items-center justify-between gap-3 max-w-xl mx-auto">
                <select onchange="setCalYear(this.value)" class="bg-white dark:bg-cream-800 border border-amber-300 dark:border-amber-800 rounded-full px-4 py-1.5 text-sm font-semibold text-amber-950 dark:text-cream-100 focus:outline-none">
                    ${years.map((y) => `<option value="${y}" ${y === calYear ? 'selected' : ''}>${y}</option>`).join('')}
                </select>
                <div class="flex gap-3 overflow-x-auto text-xs font-bold pb-0.5">
                    ${MONTHS_SHORT.map((s, i) => `<button onclick="scrollToMonth(${i})" class="shrink-0 ${hasPhoto(i) ? 'text-amber-950 dark:text-cream-50' : 'text-amber-800/35 dark:text-cream-300/35'} hover:text-amber-700 dark:hover:text-amber-300 transition">${s}</button>`).join('')}
                </div>
            </div>
        </div>
        <div class="max-w-xl mx-auto pt-6 pb-10">${monthSections}</div>`;

    if (calYear === nowY) setTimeout(() => scrollToMonth(new Date().getMonth(), false), 30);
}

function setCalYear(y) {
    calYear = Number(y);
    renderCalendar();
    window.scrollTo({ top: 0 });
}

function scrollToMonth(i, smooth = true) {
    const el = $(`cal-month-${i}`);
    if (el) el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
}

function openDayModal(dateKey) {
    const list = sortMomentsDesc(momentsOf('public').filter((m) => m.date === dateKey));
    $('day-modal-title').innerText = fmtDate(dateKey);
    $('day-modal-sub').innerText = `${list.length} momen pada tanggal ini`;
    $('day-modal-list').innerHTML = list
        .map((m) => {
            const album = db.albums.find((a) => a.id === m.albumId);
            return `
            <div onclick="closeModal('modal-day'); openMomentDetail('${m.id}')" class="flex gap-3 p-3 rounded-xl bg-cream-50 dark:bg-cream-900/80 border border-amber-200 dark:border-amber-800 hover:border-amber-600/60 cursor-pointer transition">
                <div class="w-20 h-20 rounded-lg overflow-hidden bg-cream-900 shrink-0">${mediaThumb(m)}</div>
                <div class="min-w-0 space-y-0.5">
                    <span class="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-800/10 dark:bg-amber-300/10 text-amber-800 dark:text-amber-300">${esc(album ? album.title : 'Album')}</span>
                    <h4 class="font-bold text-sm truncate">${esc(m.title)}</h4>
                    <p class="text-[11px] text-amber-800/70 dark:text-cream-300"><i class="fa-regular fa-clock"></i> ${esc(m.time)}${m.ownerName ? ` · ${esc(m.ownerName)}` : ''}</p>
                    <p class="text-xs text-amber-900/70 dark:text-cream-300 line-clamp-1">${esc(m.caption || '')}</p>
                </div>
            </div>`;
        })
        .join('');
    $('modal-day').classList.remove('hidden');
}

// ---------------------------------------------------------------------
// Form unggah (dipakai tab Unggah Foto & Ruang Pribadi)
// ---------------------------------------------------------------------
function uploadFormHTML(scope) {
    const p = pfx(scope);
    const inputCls = 'w-full bg-cream-50 dark:bg-cream-900 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-2.5 text-sm text-amber-950 dark:text-cream-100 focus:outline-none focus:border-amber-600';
    const fileCls = 'w-full text-xs text-amber-800 dark:text-cream-300 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-amber-800 file:text-cream-50 hover:file:bg-amber-900';
    return `
    <form id="${p}-upload-form" onsubmit="handleUpload(event,'${scope}')" class="space-y-5">
        <div>
            <label class="block text-xs font-semibold mb-1.5">Pilih Album</label>
            <div class="flex gap-2">
                <select id="${p}-album-select" class="flex-1 ${inputCls}"></select>
                <button type="button" onclick="toggleNewAlbumInput('${scope}')" class="px-4 py-2.5 bg-amber-200 dark:bg-amber-800 hover:bg-amber-300 dark:hover:bg-amber-700 text-amber-950 dark:text-cream-50 text-xs rounded-xl font-semibold transition">Album Baru</button>
            </div>
        </div>
        <div id="${p}-new-album-box" class="hidden space-y-4 p-4 bg-cream-100/60 dark:bg-cream-900/60 rounded-xl border border-amber-200 dark:border-amber-800">
            <div>
                <label class="block text-xs font-semibold mb-1.5">Nama Album Baru</label>
                <input type="text" id="${p}-new-album-name" placeholder="Misal: Perjalanan SMAN 1" class="${inputCls}">
            </div>
            <div>
                <label class="block text-xs font-semibold mb-1.5">Foto Sampul Album (opsional)</label>
                <input type="file" id="${p}-new-album-thumb" accept="image/*" class="${fileCls}">
            </div>
        </div>
        <div>
            <label class="block text-xs font-semibold mb-1.5">Judul Momen / Sub-Momen</label>
            <input type="text" id="${p}-title" required placeholder="Judul momen..." class="${inputCls}">
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label class="block text-xs font-semibold mb-1.5">Tanggal / Bulan / Tahun</label>
                <input type="date" id="${p}-date" required class="${inputCls}">
            </div>
            <div>
                <label class="block text-xs font-semibold mb-1.5">Jam (Waktu Kejadian)</label>
                <input type="time" id="${p}-time" required class="${inputCls}">
            </div>
        </div>
        <div>
            <label class="block text-xs font-semibold mb-1.5">File Foto / Video</label>
            <input type="file" id="${p}-media" accept="image/*,video/*" required class="${fileCls}">
        </div>
        <div>
            <label class="block text-xs font-semibold mb-1.5">Cerita / Keterangan</label>
            <textarea id="${p}-caption" rows="4" placeholder="Tuliskan cerita atau catatan tentang momen ini..." class="${inputCls}"></textarea>
        </div>
        <button type="submit" id="${p}-submit" class="w-full py-3 bg-amber-800 hover:bg-amber-900 text-cream-50 rounded-xl text-sm font-semibold transition shadow-lg shadow-amber-900/20 flex items-center justify-center gap-2">
            <i class="fa-solid fa-cloud-arrow-up"></i> Simpan & Unggah Momen
        </button>
    </form>`;
}

function prepareUploadForm(scope, presetAlbumId) {
    const p = pfx(scope);
    const select = $(`${p}-album-select`);
    if (!select) return;
    const albums = albumsOf(scope);
    select.innerHTML = albums.length
        ? albums.map((a) => `<option value="${a.id}">${esc(a.title)}</option>`).join('')
        : `<option value="">-- Belum ada album, buat baru --</option>`;
    if (presetAlbumId) select.value = presetAlbumId;
    $(`${p}-new-album-box`).classList.toggle('hidden', albums.length > 0);
    if (!$(`${p}-date`).value) $(`${p}-date`).value = todayISO();
    if (!$(`${p}-time`).value) $(`${p}-time`).value = nowTime();
}

function toggleNewAlbumInput(scope) {
    $(`${pfx(scope)}-new-album-box`).classList.toggle('hidden');
}

async function handleUpload(event, scope) {
    event.preventDefault();
    const p = pfx(scope);
    const g = (n) => $(`${p}-${n}`);
    const btn = g('submit');

    const newBoxOpen = !g('new-album-box').classList.contains('hidden');
    const newName = g('new-album-name').value.trim();
    let albumId = g('album-select').value;
    const createNew = newBoxOpen && newName;

    if (newBoxOpen && !newName) {
        toast('Isi nama album baru, atau tutup bagian "Album Baru" untuk memakai album yang ada.', 'error');
        return;
    }
    if (!createNew && !albumId) {
        toast('Pilih atau buat album terlebih dahulu.', 'error');
        return;
    }
    const file = g('media').files[0];
    if (!file) {
        toast('Pilih file foto/video terlebih dahulu.', 'error');
        return;
    }

    setBusy(btn, true, 'Menyimpan...');
    const added = { albums: [], moments: [] };
    try {
        const mediaUrl = await fileToMedia(file);
        const isPv = scope === 'private';

        if (createNew) {
            const tf = g('new-album-thumb').files[0];
            const thumb = tf ? await fileToMedia(tf, 800, 0.8) : null;
            const album = { id: 'album_' + Date.now(), title: newName, desc: '', thumbnail: thumb, createdAt: new Date().toISOString(), private: isPv, ...ownerStamp() };
            db.albums.push(album);
            added.albums.push(album);
            albumId = album.id;
        }

        const moment = {
            id: 'moment_' + Date.now(),
            albumId,
            title: g('title').value.trim(),
            date: g('date').value,
            time: g('time').value,
            mediaUrl,
            mediaType: mediaTypeOf(mediaUrl, file),
            caption: g('caption').value,
            emojis: {},
            comments: [],
            private: isPv,
            ...ownerStamp()
        };
        db.moments.push(moment);
        added.moments.push(moment);

        if (!(await saveDB())) throw new Error('save-failed');

        const albumName = db.albums.find((a) => a.id === albumId)?.title || 'album';
        toast(`✅ Momen "${moment.title}" berhasil disimpan ke album "${albumName}".`);
        g('upload-form').reset();
        g('new-album-box').classList.add('hidden');

        // Langsung buka koleksi album agar pengguna melihat hasilnya
        albumView[scope].albumId = albumId;
        if (isPv) {
            closeModal('modal-upload-private');
            renderAlbumModule('private');
        } else {
            switchTab('albums');
        }
    } catch (err) {
        console.error(err);
        added.moments.forEach((m) => db.moments.splice(db.moments.indexOf(m), 1));
        added.albums.forEach((a) => db.albums.splice(db.albums.indexOf(a), 1));
        if (err.message !== 'save-failed') toast('Gagal memproses file. Coba file lain.', 'error');
    } finally {
        setBusy(btn, false);
    }
}

// ---------------------------------------------------------------------
// Modal Album Baru
// ---------------------------------------------------------------------
function openNewAlbumModal(scope = 'public') {
    albumModalScope = scope;
    $('modal-album-heading').innerText = scope === 'private' ? 'Buat Album Pribadi Baru' : 'Buat Album Kenangan Baru';
    $('modal-album').classList.remove('hidden');
}

function closeModal(modalId) {
    $(modalId).classList.add('hidden');
}

async function handleCreateAlbum(event) {
    event.preventDefault();
    const btn = event.submitter || event.target.querySelector('button[type="submit"]');
    const title = $('modal-album-title').value.trim();
    const desc = $('modal-album-desc').value.trim();
    const thumbFile = $('modal-album-thumb').files[0];
    setBusy(btn, true, 'Menyimpan...');
    try {
        const thumb = thumbFile ? await fileToMedia(thumbFile, 800, 0.8) : null;
        const album = { id: 'album_' + Date.now(), title, desc, thumbnail: thumb, createdAt: new Date().toISOString(), private: albumModalScope === 'private', ...ownerStamp() };
        db.albums.push(album);
        if (!(await saveDB())) {
            db.albums.pop();
            return;
        }
        closeModal('modal-album');
        $('modal-album-title').value = '';
        $('modal-album-desc').value = '';
        $('modal-album-thumb').value = '';
        toast(`Album "${title}" berhasil dibuat.`);
        renderAlbumModule(albumModalScope);
    } catch (e) {
        toast('Gagal membuat album.', 'error');
    } finally {
        setBusy(btn, false);
    }
}

// ---------------------------------------------------------------------
// Jurnal & Curhat
// ---------------------------------------------------------------------
function renderJournal() {
    renderChapters();
    renderQuotes();
}

function renderChapters() {
    const grid = $('journal-chapters-grid');
    const pubAlbumIds = new Set(albumsOf('public').map((a) => a.id));
    const list = db.journals.filter((j) => pubAlbumIds.has(j.albumId));
    if (list.length === 0) {
        grid.innerHTML = `<div class="col-span-full py-12 text-center text-amber-800/60 dark:text-cream-300 text-sm">Belum ada jurnal bab perjalanan album.</div>`;
        return;
    }
    grid.innerHTML = list
        .map((j) => {
            const album = db.albums.find((a) => a.id === j.albumId);
            return `
            <div class="bg-white/80 dark:bg-cream-800/80 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-6 space-y-3 shadow-sm">
                <span class="px-2.5 py-1 rounded-md bg-amber-800/10 dark:bg-amber-300/10 text-amber-800 dark:text-amber-300 text-xs font-semibold">${esc(album ? album.title : 'Album')}</span>
                <h3 class="font-bold text-lg">${esc(j.title)}</h3>
                <p class="text-xs text-amber-900/80 dark:text-cream-200 leading-relaxed whitespace-pre-line">${esc(j.content)}</p>
                ${j.ownerName ? `<p class="text-[11px] font-semibold text-amber-800 dark:text-amber-300 pt-1 border-t border-amber-200/70 dark:border-amber-900/50"><i class="fa-solid fa-user-pen"></i> Ditulis oleh ${esc(j.ownerName)}</p>` : ''}
            </div>`;
        })
        .join('');
}

function openJournalModal() {
    const albums = albumsOf('public');
    $('journal-album-select').innerHTML = albums.length ? albums.map((a) => `<option value="${a.id}">${esc(a.title)}</option>`).join('') : `<option value="">-- Belum ada album --</option>`;
    $('modal-journal').classList.remove('hidden');
}

async function handleSaveJournal(event) {
    event.preventDefault();
    const albumId = $('journal-album-select').value;
    if (!albumId) {
        toast('Pilih album terlebih dahulu.', 'error');
        return;
    }
    const entry = { id: 'journal_' + Date.now(), albumId, title: $('journal-title').value.trim(), content: $('journal-content').value, ...ownerStamp() };
    db.journals.push(entry);
    if (!(await saveDB())) {
        db.journals.pop();
        return;
    }
    closeModal('modal-journal');
    $('journal-title').value = '';
    $('journal-content').value = '';
    toast('Catatan jurnal tersimpan.');
    renderChapters();
}

// ---------------------------------------------------------------------
// Quotes (input tanggal, tampil dikelompokkan per bulan)
// ---------------------------------------------------------------------
function renderQuotes() {
    const container = $('quotes-months-container');
    if (db.quotes.length === 0) {
        container.innerHTML = `<div class="py-12 text-center text-amber-800/60 dark:text-cream-300 text-sm">Belum ada quotes yang ditambahkan. Klik "Tambah Quotes" di atas.</div>`;
        return;
    }
    // Kelompokkan berdasarkan bulan-tahun dari tanggal quote
    const groups = {};
    db.quotes.forEach((q) => {
        const key = q.date ? q.date.slice(0, 7) : 'lama:' + (q.month || 'Tanpa tanggal');
        (groups[key] = groups[key] || []).push(q);
    });
    const keys = Object.keys(groups).sort((a, b) => {
        const al = a.startsWith('lama:');
        const bl = b.startsWith('lama:');
        if (al !== bl) return al ? 1 : -1;
        return b.localeCompare(a);
    });
    container.innerHTML = keys
        .map((key) => {
            const label = key.startsWith('lama:') ? `Bulan ${key.slice(5)}` : `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
            const items = groups[key].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            return `
            <div class="bg-white/60 dark:bg-cream-800/60 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-6 space-y-4">
                <h4 class="text-base font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2"><i class="fa-solid fa-calendar-days"></i> ${esc(label)}</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    ${items
                        .map(
                            (q) => `
                        <div class="bg-cream-50 dark:bg-cream-900/80 border border-amber-200 dark:border-amber-800 rounded-xl p-4 space-y-2 relative shadow-sm">
                            <i class="fa-solid fa-quote-right absolute top-3 right-4 text-amber-200 dark:text-amber-900/40 text-2xl"></i>
                            <p class="text-xs text-amber-950 dark:text-cream-100 italic pr-6">"${esc(q.text)}"</p>
                            <div class="flex items-center justify-between text-[11px]">
                                <span class="font-bold text-amber-800 dark:text-amber-300">— ${esc(q.author)}</span>
                                ${q.date ? `<span class="text-amber-800/60 dark:text-cream-300">${fmtDate(q.date)}</span>` : ''}
                            </div>
                        </div>`
                        )
                        .join('')}
                </div>
            </div>`;
        })
        .join('');
}

function openQuoteModal() {
    $('quote-date').value = todayISO();
    $('modal-quote').classList.remove('hidden');
}

async function handleSaveQuote(event) {
    event.preventDefault();
    const q = { id: 'quote_' + Date.now(), date: $('quote-date').value, author: currentSession.name, ownerEmail: currentSession.email, text: $('quote-text').value.trim() };
    db.quotes.push(q);
    if (!(await saveDB())) {
        db.quotes.pop();
        return;
    }
    closeModal('modal-quote');
    $('quote-text').value = '';
    toast('Quotes tersimpan.');
    renderQuotes();
}

// ---------------------------------------------------------------------
// Ruang Pribadi (sandi per akun + album pribadi)
// ---------------------------------------------------------------------
async function hashPass(email, pass) {
    const data = `${email}::kenangan::${pass}`;
    if (window.crypto && crypto.subtle) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback sederhana bila crypto.subtle tidak tersedia (mis. http non-lokal)
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < data.length; i++) {
        const ch = data.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 'f' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

function renderPrivate() {
    const box = $('private-root');
    const auth = db.privateAuth[currentSession.email];
    const inputCls = 'w-full bg-cream-50 dark:bg-cream-900 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-center text-base text-amber-950 dark:text-cream-100 tracking-widest focus:outline-none focus:border-amber-600';
    const btnCls = 'w-full py-3 bg-amber-800 hover:bg-amber-900 text-cream-50 rounded-xl text-sm font-semibold transition shadow-lg shadow-amber-900/20';
    const shell = (inner) => `
        <div class="max-w-md mx-auto bg-white/90 dark:bg-cream-800/90 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-6 md:p-8 shadow-xl text-center space-y-6">
            <div class="w-16 h-16 bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 rounded-2xl flex items-center justify-center mx-auto text-2xl shadow-inner"><i class="fa-solid fa-shield-halved"></i></div>
            ${inner}
        </div>`;

    if (privateUnlocked) {
        box.innerHTML = `
            <div class="space-y-6">
                <div class="flex items-center justify-between gap-3 flex-wrap bg-amber-100/70 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-900/60 rounded-2xl px-5 py-3">
                    <div class="flex items-center gap-3 text-sm font-semibold text-amber-900 dark:text-amber-200"><i class="fa-solid fa-lock-open"></i> Ruang Pribadi terbuka — hanya akun ${esc(currentSession.name)} yang dapat melihat ini</div>
                    <div class="flex gap-2">
                        <button onclick="startPrivateReset()" class="px-3 py-1.5 rounded-lg bg-white/80 dark:bg-cream-800 text-xs font-semibold text-amber-900 dark:text-cream-100 border border-amber-300 dark:border-amber-800">Ganti Sandi</button>
                        <button onclick="lockPrivate()" class="px-3 py-1.5 rounded-lg bg-amber-800 text-cream-50 text-xs font-semibold flex items-center gap-1.5"><i class="fa-solid fa-lock"></i> Kunci</button>
                    </div>
                </div>
                <div id="pv-album-root"></div>
            </div>`;
        renderAlbumModule('private');
        return;
    }

    if (!auth || privateMode === 'setup') {
        box.innerHTML = shell(`
            <div><h2 class="text-2xl font-bold">Buat Sandi Ruang Pribadi</h2>
            <p class="text-amber-800/70 dark:text-cream-300 text-sm mt-1">Buat sandi khusus untuk membuka Ruang Pribadi akun <b>${esc(currentSession.name)}</b>. Akun lain tidak bisa membuka atau melihat isinya.</p></div>
            <form onsubmit="handleSetupPrivate(event)" class="space-y-3">
                <input type="password" id="pv-new-pass" required minlength="4" autocomplete="new-password" placeholder="Sandi baru (min. 4 karakter)" class="${inputCls}">
                <input type="password" id="pv-new-pass2" required minlength="4" autocomplete="new-password" placeholder="Ulangi sandi" class="${inputCls}">
                <p id="pv-error" class="hidden text-xs text-rose-600 dark:text-rose-400 font-medium"></p>
                <button type="submit" class="${btnCls}">Simpan Sandi & Buka</button>
            </form>`);
    } else if (privateMode === 'reset') {
        box.innerHTML = shell(`
            <div><h2 class="text-2xl font-bold">Reset Sandi Ruang Pribadi</h2>
            <p class="text-amber-800/70 dark:text-cream-300 text-sm mt-1">Verifikasi dengan <b>kata sandi login akun</b> Anda, lalu buat sandi Ruang Pribadi yang baru. Isi album pribadi tetap aman.</p></div>
            <form onsubmit="handleResetPrivate(event)" class="space-y-3">
                <input type="password" id="pv-acct-pass" required autocomplete="current-password" placeholder="Kata sandi login akun" class="${inputCls}">
                <input type="password" id="pv-new-pass" required minlength="4" autocomplete="new-password" placeholder="Sandi Ruang Pribadi baru" class="${inputCls}">
                <input type="password" id="pv-new-pass2" required minlength="4" autocomplete="new-password" placeholder="Ulangi sandi baru" class="${inputCls}">
                <p id="pv-error" class="hidden text-xs text-rose-600 dark:text-rose-400 font-medium"></p>
                <button type="submit" class="${btnCls}">Simpan Sandi Baru</button>
                <button type="button" onclick="cancelPrivateReset()" class="text-xs text-amber-800 dark:text-amber-300 hover:underline">Batal</button>
            </form>`);
    } else {
        box.innerHTML = shell(`
            <div><h2 class="text-2xl font-bold">Ruang Pribadi</h2>
            <p class="text-amber-800/70 dark:text-cream-300 text-sm mt-1">Masukkan sandi untuk membuka album pribadi Anda.</p></div>
            <form onsubmit="handleUnlockPrivate(event)" class="space-y-3">
                <input type="password" id="pv-pass" required autocomplete="current-password" placeholder="Sandi Ruang Pribadi" class="${inputCls}">
                <p id="pv-error" class="hidden text-xs text-rose-600 dark:text-rose-400 font-medium"></p>
                <button type="submit" class="${btnCls}">Buka Ruang Pribadi</button>
                <button type="button" onclick="startPrivateReset()" class="text-xs text-amber-800 dark:text-amber-300 hover:underline">Lupa sandi?</button>
            </form>`);
        setTimeout(() => $('pv-pass') && $('pv-pass').focus(), 30);
    }
}

function showPvError(msg) {
    const el = $('pv-error');
    if (!el) return;
    el.innerText = msg;
    el.classList.remove('hidden');
}

async function handleSetupPrivate(e) {
    e.preventDefault();
    const a = $('pv-new-pass').value;
    const b = $('pv-new-pass2').value;
    if (a.length < 4) return showPvError('Sandi minimal 4 karakter.');
    if (a !== b) return showPvError('Kedua sandi tidak sama.');
    db.privateAuth[currentSession.email] = { hash: await hashPass(currentSession.email, a), updatedAt: new Date().toISOString() };
    if (!(await saveDB())) return;
    privateUnlocked = true;
    privateMode = 'auto';
    toast('Sandi Ruang Pribadi berhasil dibuat.');
    renderPrivate();
}

async function handleUnlockPrivate(e) {
    e.preventDefault();
    const auth = db.privateAuth[currentSession.email];
    const h = await hashPass(currentSession.email, $('pv-pass').value);
    if (auth && auth.hash === h) {
        privateUnlocked = true;
        renderPrivate();
    } else {
        showPvError('Sandi salah. Coba lagi atau pilih "Lupa sandi?".');
        $('pv-pass').value = '';
    }
}

function startPrivateReset() {
    privateUnlocked = false;
    privateMode = 'reset';
    renderPrivate();
}

function cancelPrivateReset() {
    privateMode = 'auto';
    renderPrivate();
}

async function handleResetPrivate(e) {
    e.preventDefault();
    const acct = $('pv-acct-pass').value;
    const a = $('pv-new-pass').value;
    const b = $('pv-new-pass2').value;
    const user = getUsers().find((u) => u.email.toLowerCase() === currentSession.email.toLowerCase());
    if (!user || user.pass !== acct) return showPvError('Kata sandi login akun salah.');
    if (a.length < 4) return showPvError('Sandi minimal 4 karakter.');
    if (a !== b) return showPvError('Kedua sandi baru tidak sama.');
    db.privateAuth[currentSession.email] = { hash: await hashPass(currentSession.email, a), updatedAt: new Date().toISOString() };
    if (!(await saveDB())) return;
    privateUnlocked = true;
    privateMode = 'auto';
    toast('Sandi Ruang Pribadi berhasil diganti.');
    renderPrivate();
}

function lockPrivate() {
    privateUnlocked = false;
    privateMode = 'auto';
    albumView.private.albumId = null;
    renderPrivate();
}

function openPrivateUpload(albumId) {
    prepareUploadForm('private', albumId);
    $('modal-upload-private').classList.remove('hidden');
}

// ---------------------------------------------------------------------
// Kelola akun (Admin)
// ---------------------------------------------------------------------
function renderManageUsers() {
    if (!isAdmin()) {
        toast('Akses ditolak! Fitur ini khusus Admin.', 'error');
        switchTab('home');
        return;
    }
    const users = getUsers();
    $('manage-users-list').innerHTML = users
        .map(
            (u) => `
        <tr class="hover:bg-amber-50/50 dark:hover:bg-cream-900/30 transition">
            <td class="p-4 flex items-center gap-3">
                <span class="w-8 h-8 rounded-full bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 flex items-center justify-center font-bold text-xs">${esc(u.avatar || '👤')}</span>
                <span class="font-semibold text-amber-950 dark:text-cream-100">${esc(u.name)}</span>
            </td>
            <td class="p-4 font-mono text-xs text-amber-800 dark:text-amber-300">${esc(u.email)}</td>
            <td class="p-4"><span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${u.role === 'ADMIN' ? 'bg-amber-800 text-cream-50' : 'bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200'}">${esc(u.role)}</span></td>
            <td class="p-4 text-right">
                ${
                    u.email === currentSession.email
                        ? `<span class="text-xs text-amber-800/50 dark:text-cream-300/60 italic">Akun Anda</span>`
                        : `<button onclick="deleteUser('${esc(u.email)}')" class="px-3 py-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-semibold rounded-lg hover:bg-rose-500/20 transition"><i class="fa-solid fa-trash-can"></i> Hapus</button>`
                }
            </td>
        </tr>`
        )
        .join('');
}

function openAddUserModal() {
    $('modal-user').classList.remove('hidden');
}

function handleCreateUser(e) {
    e.preventDefault();
    const name = $('modal-user-name').value.trim();
    const email = $('modal-user-email').value.trim().toLowerCase();
    const pass = $('modal-user-pass').value;
    const role = $('modal-user-role').value;
    const users = getUsers();
    if (users.some((u) => u.email.toLowerCase() === email)) {
        toast('Email ini sudah terdaftar dalam whitelist!', 'error');
        return;
    }
    users.push({ name, email, pass, role, avatar: role === 'ADMIN' ? '👑' : '📸' });
    saveUsers(users);
    toast(`Akun ${name} berhasil ditambahkan.`);
    closeModal('modal-user');
    renderManageUsers();
}

function deleteUser(email) {
    if (confirm(`Apakah Anda yakin ingin menghapus email ${email} dari whitelist?`)) {
        saveUsers(getUsers().filter((u) => u.email.toLowerCase() !== email.toLowerCase()));
        renderManageUsers();
    }
}

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', async () => {
    initUserAndTheme();
    $('pub-upload-host').innerHTML = uploadFormHTML('public');
    $('pv-upload-host').innerHTML = uploadFormHTML('private');
    await loadDB();
    switchTab('home');
});
