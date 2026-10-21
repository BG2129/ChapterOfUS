// Whitelist User Database
const DEFAULT_USERS = [
    { name: "Hanif Alidika", email: "hanifalidika@chapterofus.com", pass: "kenangan123", role: "ADMIN", avatar: "👑" },
    { name: "Naufall Fadlan", email: "fall@chapterofus.com", pass: "kenangan231", role: "MEMBER", avatar: "📸" },
    { name: "Ale Ma'ruf", email: "jayakodok@chapterofus.com", pass: "kenangan321", role: "MEMBER", avatar: "🚗" }
];

// Halaman: index.html = halaman masuk (login), app.html = aplikasi utama
const SESSION_KEY = 'kenangan_session';

// Versi lama menyimpan sesi permanen di localStorage sehingga siapa pun yang pernah masuk
// akan otomatis masuk lagi. Hapus sisa sesi lama itu.
try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* abaikan */ }

function getUsers() {
    const saved = localStorage.getItem('kenangan_users');
    if (!saved) {
        localStorage.setItem('kenangan_users', JSON.stringify(DEFAULT_USERS));
        return DEFAULT_USERS;
    }
    return JSON.parse(saved);
}

function saveUsers(users) {
    localStorage.setItem('kenangan_users', JSON.stringify(users));
}

// Sesi disimpan di sessionStorage: berlaku selama tab/browser terbuka (refresh tetap aman),
// dan hilang otomatis saat tab/browser ditutup, jadi membuka link lagi selalu mulai dari login.
function getSession() {
    try {
        const session = sessionStorage.getItem(SESSION_KEY);
        return session ? JSON.parse(session) : null;
    } catch (e) {
        return null;
    }
}

function setSession(user) {
    const { pass, ...safeUser } = user; // jangan simpan kata sandi di dalam sesi
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(safeUser));
}

function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* abaikan */ }
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* abaikan */ }
}

function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const pass = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');

    const users = getUsers();
    const found = users.find(u => u.email.toLowerCase() === email && u.pass === pass);

    if (found) {
        setSession(found);
        window.location.replace('app.html');
    } else {
        errorDiv.classList.remove('hidden');
        errorDiv.innerText = "Email tidak terdaftar dalam whitelist atau kata sandi salah!";
    }
}

// Di halaman masuk: bila tab ini sudah punya sesi aktif (baru saja login), langsung ke aplikasi
if (document.getElementById('login-form') && getSession()) {
    window.location.replace('app.html');
}
