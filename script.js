// ─── FIREBASE CONFIG ─────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};


// ─── IMPORTS ─────────────────────────────────────────────────────────────────

import { LANG } from './lang/index.js';
// import { initButler } from './butler/index.js'; <- Adjust
import { initRoomInteractions } from './rooms.js';
import { registerCharHandlers, syncAllRooms } from './characters.js';

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc, setDoc, deleteDoc,
  onSnapshot, collection,
  query, where, getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ─── FIREBASE INIT ────────────────────────────────────────────────────────────

const fireApp = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(fireApp);
const auth = getAuth(fireApp);

const USERS_COL = "users";
const CHAT_COL = "messages";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL = 5000;
const ONLINE_TIMEOUT_MS = 20000;
const STABLE_DELAY = 3000;
const MAX_ONLINE_USERS = 15;
const JOIN_WINDOW_MS = 5000;

const COLORS = [
  "#ff6b6b",
  "#feca57",
  "#48dbfb",
  "#1dd1a1",
  "#5f27cd",
  "#ff9ff3",
];

// ─── SESSION STATE ────────────────────────────────────────────────────────────

let myId = 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

let me = null;
let users = {};
let prevOnlineUsers = new Set();
let isFirstLoad = true;
let selectedColorIdx = 0;

// ─── LANGUAGE ─────────────────────────────────────────────────────────────────

let currentLang = localStorage.getItem("lang") || "en";

function t(path) {
  const keys = path.split('.');
  let value = LANG[currentLang];
  for (const key of keys) value = value?.[key];
  return value;
}

function toggleLang() {
  currentLang = currentLang === "en" ? "vi" : "en";
  localStorage.setItem("lang", currentLang);
  applyLang();
  if (me) initRoomInteractions();
}

function applyLang() {
  // Join modal
  document.querySelector('.modal-title').textContent = t('title');
  document.querySelector('.modal-sub').textContent = t('subtitle');
  document.getElementById('nameInput').placeholder = t('namePlaceholder');
  document.querySelector('.color-label').textContent = t('pickColor');
  document.getElementById('joinBtn').textContent = t('join');

  // Header
  document.querySelector('.header-title').textContent = `✨ ${t('title')}`;
  document.querySelector('.online-badge-text').textContent = t('online');

  // Rooms
  document.querySelector('#card-study .card-title').textContent = t('studyRoom');
  document.querySelector('#card-playah .card-title').textContent = t('playahRoom');

  // Chat
  document.getElementById('chatInput').placeholder = t('chatPlaceholder');

  // Lang button
  document.getElementById('langBtn').textContent = currentLang === "en" ? "🌐 EN" : "🌐 VI";
}

// ─── TOAST ────────────────────────────────────────────────────────────────────

let lastToast = "";

export function showToast(input, vars = {}) {
  let msg = typeof input === 'string' && input.includes('.')
    ? t(input) || input
    : input;

  Object.keys(vars).forEach(k => {
    msg = msg.replace(`{${k}}`, vars[k]);
  });

  if (msg === lastToast) return;
  lastToast = msg;

  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');

  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.classList.remove('show');
    lastToast = "";
  }, 2600);
}

// ─── COLOR PICKER ─────────────────────────────────────────────────────────────

function initColorPicker() {
  const container = document.getElementById("colorSwatches");

  COLORS.forEach((color, idx) => {
    const swatch = document.createElement("div");
    swatch.className = "swatch";
    swatch.style.background = color;

    if (idx === 0) swatch.classList.add("selected");

    swatch.addEventListener("click", () => {
      selectedColorIdx = idx;
      document.querySelectorAll(".swatch").forEach(s => s.classList.remove("selected"));
      swatch.classList.add("selected");
    });

    container.appendChild(swatch);
  });
}

// ─── CLOCK ───────────────────────────────────────────────────────────────────

function formatTime(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function initClock() {
  const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  // Render 60 tick marks
  const tickContainer = document.getElementById('tickMarks');
  for (let i = 0; i < 60; i++) {
    const tick = document.createElement('div');
    tick.className = i % 5 === 0 ? 'tick-mark major' : 'tick-mark';
    tick.style.transform = `rotate(${i * 6}deg)`;
    tickContainer.appendChild(tick);
  }

  function updateClock() {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const s = now.getSeconds();

    document.getElementById('hour').style.transform = `rotate(${(h % 12) * 30 + m * 0.5}deg)`;
    document.getElementById('minute').style.transform = `rotate(${m * 6 + s * 0.1}deg)`;
    document.getElementById('second').style.transform = `rotate(${s * 6}deg)`;

    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    document.getElementById('digitalTime').textContent = `${hh}:${mm}:${ss}`;
    document.getElementById('clockDate').textContent =
      `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  }

  updateClock();
  setInterval(updateClock, 1000);
}

// ─── FIRESTORE HELPERS ────────────────────────────────────────────────────────

function myDocRef() {
  return doc(db, USERS_COL, me?.id || myId);
}

async function saveMySession(extra = {}) {
  if (!me?.id) return;

  await setDoc(doc(db, "users", me.id), {
    id: me.id,
    name: me.name,
    colorIdx: me.colorIdx,
    room: me.room || null,
    avatar: me.avatar || null,
    x: me.x || null,

    heartbeat: Date.now(),
    lastSeen: Date.now(),
    joinedAt: me.joinedAt || Date.now(),

    ...extra
  }, { merge: true });
}

async function getUsersByName(name) {
  const q = query(collection(db, USERS_COL), where("name", "==", name));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return [];
  return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
}

// ─── ONLINE HELPERS ───────────────────────────────────────────────────────────

function isOnline(u) {
  if (!u?.heartbeat) return false;
  return (Date.now() - u.heartbeat) < ONLINE_TIMEOUT_MS;
}

function getOnlineUsers(list = users) {
  return Object.values(list).filter(isOnline);
}

function countOnlineUsers(usersArr) {
  return usersArr.filter(u => isOnline(u)).length;
}

// ─── CHAT ─────────────────────────────────────────────────────────────────────

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text || !me) return;

  const id = 'm_' + Date.now() + '_' + Math.random();
  await setDoc(doc(db, CHAT_COL, id), {
    text,
    type: "user",
    name: me.name,
    colorIdx: me.colorIdx,
    createdAt: Date.now(),
  });

  input.value = '';
}

async function addSystemMessage(text, uniqueKey = null) {
  const id = uniqueKey || ('m_' + Date.now() + '_' + Math.random());
  await setDoc(doc(db, CHAT_COL, id), {
    text,
    type: "system",
    createdAt: Date.now(),
  });
}

function subscribeChat() {
  return onSnapshot(collection(db, CHAT_COL), snapshot => {
    const chat = document.getElementById('chatMessages');
    chat.innerHTML = '';

    const msgs = [];
    snapshot.forEach(docSnap => msgs.push(docSnap.data()));
    msgs.sort((a, b) => a.createdAt - b.createdAt);

    msgs.forEach(m => {
      const div = document.createElement('div');
      const time = formatTime(m.createdAt);

      if (m.type === "system") {
        div.className = 'chat-msg system-msg';
        div.innerHTML = `<span class="msg-time">[${time}]</span> ${m.text}`;
      } else {
        div.className = 'chat-msg';
        div.innerHTML = `
          <span class="msg-time">[${time}]</span>
          <span style="color:hsl(${m.colorIdx * 60},70%,70%)">${m.name}</span>: ${m.text}
        `;
      }

      chat.appendChild(div);
    });

    chat.scrollTop = chat.scrollHeight;
  });
}

// ─── USERS SUBSCRIBE ──────────────────────────────────────────────────────────

function subscribeUsers() {
  return onSnapshot(collection(db, USERS_COL), snapshot => {
    const fresh = {};
    const currentOnline = new Set();
    const now = Date.now();

    snapshot.forEach(docSnap => {
      const u = { id: docSnap.id, ...docSnap.data() };
      fresh[u.id] = u;

      if (isOnline(u)) {
        currentOnline.add(u.id);
      }
    });

    if (!isFirstLoad) {

      // JOIN detection
      currentOnline.forEach(id => {
        if (!prevOnlineUsers.has(id)) {
          const u = fresh[id];

          if (u && u.id !== me?.id) {
            const joinTime = u.joinedAt || now;

            if (u?.lastSeen && now - u.lastSeen > ONLINE_TIMEOUT_MS) {
              showToast('toast.joined', {
                name: u.name,
                time: formatTime(joinTime)
              });

              addSystemMessage(
                `🟢 ${u.name} joined`,
                `join_${id}_${joinTime}`
              );
            }
          }
        }
      });

      // LEAVE detection
      prevOnlineUsers.forEach(id => {
        if (!currentOnline.has(id)) {
          const u = users[id];

          if (u && u.id !== me?.id) {
            showToast('toast.left', { name: u.name });

            addSystemMessage(
              `🔴 ${u.name} left`,
              `left_${id}_${Date.now()}`
            );
          }
        }
      });
    }

    isFirstLoad = false;
    prevOnlineUsers = currentOnline;
    users = fresh;

    renderAll();
    syncAllRooms(users, myId);
  });
}

// ─── RENDER ───────────────────────────────────────────────────────────────────

function renderAll() {
  const list = document.getElementById('userList');
  list.innerHTML = '';

  const onlineUsers = getOnlineUsers();

  onlineUsers.forEach(u => {
    const div = document.createElement('div');
    div.textContent = `🟢 ${u.name}`;
    list.appendChild(div);
  });

  const offlineUsers = Object.values(users).filter(u => !isOnline(u));

  offlineUsers.forEach(u => {
    const div = document.createElement('div');
    div.textContent = `⚫ ${u.name}`;
    div.style.opacity = '0.5';
    list.appendChild(div);
  });

  document.getElementById('onlineCount').textContent = onlineUsers.length;
}

// ─── HEADER HELPERS ───────────────────────────────────────────────────────────

function moveLangToHeader() {
  const langBtn = document.getElementById("langBtn");
  const headerRight = document.getElementById("headerRight");
  if (!langBtn || !headerRight) return;
  langBtn.classList.remove("lang-global");
  headerRight.prepend(langBtn);
}

// ─── JOIN ─────────────────────────────────────────────────────────────────────

async function doJoin() {
  const name = document.getElementById('nameInput').value.trim();
  if (!name) return showToast('toast.enterName');

  const sameNameUsers = await getUsersByName(name);
  const onlineUsers = getOnlineUsers(await getDocsSnapshot());

  if (onlineUsers.length >= MAX_ONLINE_USERS) {
    return showToast('toast.roomFull');
  }

  const onlineSameName = sameNameUsers.find(isOnline);
  if (onlineSameName) {
    return showToast('toast.nameTaken');
  }

  const reusedUser = sameNameUsers
    .sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0))[0];

  const userId = reusedUser?.id || ('u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));


  if (reusedUser) {
    me = {
      id: userId,
      name,
      colorIdx: selectedColorIdx,
      room: null,
      joinedAt: Date.now(),
      lastSeen: Date.now()
    };

    showToast('toast.welcomeBack', { name });

  } else {
    me = {
      id: myId,
      name,
      colorIdx: selectedColorIdx,
      room: null,
      joinedAt: Date.now(),
      lastSeen: Date.now()
    };

    showToast('toast.welcome', { name });
  }

  await saveMySession();

  document.getElementById('joinModal').style.display = 'none';
  document.getElementById('mainApp').style.display = '';

  subscribeUsers();
  subscribeChat();
  startHeartbeat();
}

// ─── HEARTBEAT ────────────────────────────────────────────────────────────────
function startHeartbeat() {
  setInterval(() => {
    if (!me?.id) return;

    setDoc(doc(db, USERS_COL, me.id), {
      heartbeat: Date.now(),
      lastSeen: Date.now()
    }, { merge: true });

  }, HEARTBEAT_INTERVAL);
}

// ─── HELPER ───────────────────────────────────────────────────────────────────
async function getDocsSnapshot() {
  const snap = await getDocs(collection(db, USERS_COL));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─── VIBES (MUSIC) ────────────────────────────────────────────────────────────

function setupVibes() {
  const audio = document.getElementById('bgMusic');
  const vibeItems = document.querySelectorAll('.vibe-item');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeLabel = document.querySelector('.volume-label');

  const tracks = {
    lofi: new URL('./assets/musics/track_01.mp3', import.meta.url).href,
    rain: new URL('./assets/musics/rain.mp3', import.meta.url).href,
    cafe: new URL('./assets/musics/cafe.mp3', import.meta.url).href,
    space: new URL('./assets/musics/space.mp3', import.meta.url).href,
  };

  audio.loop = true;

  // Volume — load saved or default
  const DEFAULT_VOLUME = 0.5;
  let savedVolume = parseFloat(localStorage.getItem('volume') ?? DEFAULT_VOLUME);
  if (!localStorage.getItem('volume')) localStorage.setItem('volume', savedVolume);

  audio.volume = savedVolume;
  volumeSlider.value = savedVolume;
  updateVolumeUI(savedVolume);

  function setVolume(vol) {
    vol = parseFloat(vol);
    audio.volume = vol;
    localStorage.setItem('volume', vol);
    updateVolumeUI(vol);
  }

  function updateVolumeUI(vol) {
    const pct = vol * 100;
    volumeSlider.style.background =
      `linear-gradient(to right, var(--accent3) ${pct}%, var(--bg2) ${pct}%)`;
    volumeLabel.textContent = vol === 0 ? '🔇' : vol < 0.5 ? '🔉' : '🔊';
  }

  volumeSlider.addEventListener('input', e => setVolume(e.target.value));
  volumeSlider.addEventListener('change', e => setVolume(e.target.value));
  volumeSlider.addEventListener('touchmove', e => setVolume(e.target.value), { passive: true });

  // Track switching with fade
  let fadeInterval = null;

  function isSameTrack(audio, newSrc) {
    return new URL(newSrc, location.href).href === audio.src;
  }

  function smoothSwitch(audio, newSrc, targetVolume) {
    if (isSameTrack(audio, newSrc)) return;

    const FADE_SPEED = 0.04;
    const INTERVAL = 50;

    if (fadeInterval) {
      clearInterval(fadeInterval);
      fadeInterval = null;
    }

    audio.pause();
    audio.src = newSrc;
    audio.loop = true;
    audio.volume = 0;
    audio.load();

    const playPromise = audio.play();
    if (!playPromise) {
      audio.volume = targetVolume;
      return;
    }

    playPromise
      .then(() => {
        fadeInterval = setInterval(() => {
          const next = Math.min(targetVolume, audio.volume + FADE_SPEED);
          audio.volume = next;
          if (next >= targetVolume) {
            clearInterval(fadeInterval);
            fadeInterval = null;
          }
        }, INTERVAL);
      })
      .catch(e => {
        console.warn("Autoplay blocked:", e);
        audio.load();
        audio.play().then(() => { audio.volume = targetVolume; }).catch(() => { });
      });
  }

  function bindTap(el, handler) {
    let touched = false;

    el.addEventListener('touchstart', e => {
      touched = true;
      handler(e);
    }, { passive: true });

    el.addEventListener('click', e => {
      if (touched) { touched = false; return; }
      handler(e);
    });
  }

  vibeItems.forEach(item => {
    bindTap(item, () => {
      const vibe = item.dataset.vibe;
      if (audio.src.includes(tracks[vibe])) return;

      smoothSwitch(audio, tracks[vibe], parseFloat(volumeSlider.value));

      vibeItems.forEach(v => v.classList.remove('active'));
      item.classList.add('active');
    });
  });
}

// ─── APP INIT ─────────────────────────────────────────────────────────────────

function initApp() {
  document.getElementById('langBtn').addEventListener('click', toggleLang);
  applyLang();

  document.getElementById('joinBtn').addEventListener('click', doJoin);
  document.getElementById('sendBtn').addEventListener('click', sendMessage);
  document.getElementById('chatInput').addEventListener('keypress', e => {
    if (e.key === 'Enter') sendMessage();
  });

  initColorPicker();
  setupVibes();
  initClock();
}

// ─── CLEANUP ──────────────────────────────────────────────────────────────────

async function leaveImmediately() {
  if (!me?.id) return;

  try {
    await setDoc(doc(db, USERS_COL, me.id), {
      heartbeat: 0
    }, { merge: true });
  } catch (e) {
    console.log("leave failed");
  }
}

// desktop close / refresh
window.addEventListener("beforeunload", leaveImmediately);

// mobile + safari reliable
window.addEventListener("pagehide", leaveImmediately);

// tab background / app switch
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    leaveImmediately();
  }
});

// ─── BOOTSTRAP ────────────────────────────────────────────────────────────────

signInAnonymously(auth)
  .then(() => {
    console.log("✅ Signed in anonymously");
    initApp();
  })
  .catch(error => {
    console.error("❌ Auth error:", error);
  });