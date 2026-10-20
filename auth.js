// Whitelist User Database
const DEFAULT_USERS = [
    { name: "Hanif Alidika", email: "hanifalidika@chapterofus.com", pass: "kenangan123", role: "ADMIN", avatar: "👑" },
    { name: "Naufall Fadlan", email: "fall@chapterofus.com", pass: "kenangan231", role: "MEMBER", avatar: "📸" },
    { name: "Ale Ma'ruf", email: "jayakodok@chapterofus.com", pass: "kenangan321", role: "MEMBER", avatar: "🚗" }
];

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

function getSession() {
    const session = localStorage.getItem('kenangan_session');
    return session ? JSON.parse(session) : null;
}

function fillDemo(email, pass) {
    document.getElementById('login-email').value = email;
    document.getElementById('login-password').value = pass;
}

function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const pass = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');

    const users = getUsers();
    const found = users.find(u => u.email.toLowerCase() === email && u.pass === pass);

    if (found) {
        localStorage.setItem('kenangan_session', JSON.stringify(found));
        window.location.href = 'index.html';
    } else {
        errorDiv.classList.remove('hidden');
        errorDiv.innerText = "Email tidak terdaftar dalam whitelist atau kata sandi salah!";
    }
}

// Check redirect if on login page and already logged in
if (window.location.pathname.endsWith('login.html')) {
    if (getSession()) {
        window.location.href = 'index.html';
    }
}
