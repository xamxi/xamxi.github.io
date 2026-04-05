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


// ─── LANG INIT ─────────────────────────────────────────────────
import { LANG } from './lang/index.js';
function t(path) {
  const keys = path.split('.');
  let value = LANG[currentLang];

  for (const key of keys) {
    value = value?.[key];
  }

  return value;
}
let currentLang = localStorage.getItem("lang") || "en";

// ─── FIREBASE INIT ───────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, deleteDoc,
  onSnapshot, collection,
  query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const fireApp = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(fireApp);
const auth = getAuth(fireApp);

const USERS_COL = "users";
const CHAT_COL = "messages";

// ─── CONFIG ──────────────────────────────────────────────────────────
const HEARTBEAT_INTERVAL = 5000;
const ONLINE_TIMEOUT_MS = 20000;

// ─── SESSION ID ──────────────────────────────────────────────────────
let myId = 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

let me = null;
let users = {};

let prevOnlineUsers = new Set();
let isFirstLoad = true;

let lastChangeTime = {};
const STABLE_DELAY = 3000; // 3 seconds

// ─── 🔥 AUTH FIRST ───────────────────────────────────────────────────
signInAnonymously(auth)
  .then(() => {
    console.log("✅ Signed in anonymously");
    initApp(); // 👉 start app ONLY after auth
  })
  .catch((error) => {
    console.error("❌ Auth error:", error);
  });

// ─── INIT APP ────────────────────────────────────────────────────────
function initApp() {
  // lang
  document.getElementById('langBtn').addEventListener('click', toggleLang);
  applyLang();

  // bind events AFTER auth
  document.getElementById('joinBtn').addEventListener('click', doJoin);
  document.getElementById('sendBtn').addEventListener('click', sendMessage);

  document.getElementById('chatInput').addEventListener('keypress', e => {
    if (e.key === 'Enter') sendMessage();
  });
  initColorPicker();
  setupVibes();
  initClock();

}

// ─── LANGUAGE TOGGLE ───────────────────────────────────────────────
const langBtn = document.getElementById("langBtn");
const headerRight = document.getElementById("headerRight");

function moveLangToHeader() {
  const langBtn = document.getElementById("langBtn");
  const headerRight = document.getElementById("headerRight");

  if (!langBtn || !headerRight) return;

  langBtn.classList.remove("lang-global"); // remove floating style
  headerRight.prepend(langBtn); // move into header
}

function toggleLang() {
  currentLang = currentLang === "en" ? "vi" : "en";
  localStorage.setItem("lang", currentLang);
  applyLang();

  // ✅ RE-INIT ROOM TEXT
  if (me) {
    initRoomInteractions();
  }
}

function applyLang() {
  // JOIN MODAL
  document.querySelector('.modal-title').textContent = t('title');
  document.querySelector('.modal-sub').textContent = t('subtitle');
  document.getElementById('nameInput').placeholder = t('namePlaceholder');
  document.querySelector('.color-label').textContent = t('pickColor');
  document.getElementById('joinBtn').textContent = t('join');

  // HEADER
  document.querySelector('.header-title').textContent = `✨ ${t('title')}`;
  document.querySelector('.online-badge').innerHTML =
    `<span id="onlineCount">${document.getElementById('onlineCount').textContent}</span> ${t('online')}`;

  // ROOMS
  document.querySelector('#card-study .card-title').textContent = t('studyRoom');
  document.querySelector('#card-playah .card-title').textContent = t('playahRoom');

  // CHAT
  document.getElementById('chatInput').placeholder = t('chatPlaceholder');

  // BUTTON TEXT
  document.getElementById('langBtn').textContent =
    currentLang === "en" ? "🌐 EN" : "🌐 VI";
}

// ─── COLOR PICKER ─────────────────────────────────────────────────
const COLORS = [
  "#ff6b6b",
  "#feca57",
  "#48dbfb",
  "#1dd1a1",
  "#5f27cd",
  "#ff9ff3"
];

let selectedColorIdx = 0;

function initColorPicker() {
  const container = document.getElementById("colorSwatches");

  COLORS.forEach((color, idx) => {
    const swatch = document.createElement("div");
    swatch.className = "swatch";
    swatch.style.background = color;

    if (idx === 0) swatch.classList.add("selected");

    swatch.addEventListener("click", () => {
      selectedColorIdx = idx;

      document.querySelectorAll(".swatch").forEach(s =>
        s.classList.remove("selected")
      );

      swatch.classList.add("selected");
    });

    container.appendChild(swatch);
  });
}

// ─── ROOM ────────────────────────────────────────────────────────────
import { initRoomInteractions } from './rooms.js';

// ─── CLOCK ───────────────────────────────────────────
function formatTime(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function initClock() {
  // render 12 tick marks
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

    const hourDeg = (h % 12) * 30 + m * 0.5;
    const minuteDeg = m * 6 + s * 0.1;
    const secondDeg = s * 6;

    document.getElementById('hour').style.transform = `rotate(${hourDeg}deg)`;
    document.getElementById('minute').style.transform = `rotate(${minuteDeg}deg)`;
    document.getElementById('second').style.transform = `rotate(${secondDeg}deg)`;

    // digital time
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    document.getElementById('digitalTime').textContent = `${hh}:${mm}:${ss}`;

    // date
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    document.getElementById('clockDate').textContent =
      `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  }

  updateClock();
  setInterval(updateClock, 1000);
}

// ─── GET USER BY NAME ────────────────────────────────────────────────
// ─── GET USERS BY NAME (FIXED) ───────────────────────────────
async function getUsersByName(name) {
  const q = query(collection(db, USERS_COL), where("name", "==", name));
  const snapshot = await getDocs(q);

  if (snapshot.empty) return [];

  return snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data()
  }));
}



// ─── TOAST ───────────────────────────────────────────────────────────
let lastToast = "";

export function showToast(input, vars = {}) {
  let msg;

  if (typeof input === 'string' && input.includes('.')) {
    msg = t(input) || input;

    Object.keys(vars).forEach(k => {
      msg = msg.replace(`{${k}}`, vars[k]);
    });
  } else {
    msg = input;
  }

  // 🚫 prevent duplicate spam
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

// ─── ONLINE CHECK ────────────────────────────────────────────────────
function isOnline(u) {
  return u.heartbeat && (Date.now() - u.heartbeat < ONLINE_TIMEOUT_MS);
}

// ─── FIRESTORE HELPERS ───────────────────────────────────────────────
function myDocRef() {
  return doc(db, USERS_COL, myId);
}

async function saveMySession() {
  if (!me) return;

  try {
    await setDoc(myDocRef(), {
      name: me.name,
      colorIdx: me.colorIdx,
      room: me.room ?? null,
      joinedAt: me.joinedAt,
      heartbeat: Date.now(),
    }, { merge: true });
  } catch (e) {
    console.error('Firestore write error:', e);
  }
}

// ─── CHAT: SEND MESSAGE ──────────────────────────────────────────────
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
    createdAt: Date.now()
  });

  input.value = '';
}

// ─── SYSTEM MESSAGE ──────────────────────────────────────────────────
async function addSystemMessage(text, uniqueKey = null) {
  const id = uniqueKey || ('m_' + Date.now() + '_' + Math.random());

  await setDoc(doc(db, CHAT_COL, id), {
    text,
    type: "system",
    createdAt: Date.now()
  });
}
// ─── CHAT SUBSCRIBE ──────────────────────────────────────────────────
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
        div.innerHTML = `
      <span class="msg-time">[${time}]</span> ${m.text}
    `;
      } else {
        div.className = 'chat-msg';
        div.innerHTML = `
      <span class="msg-time">[${time}]</span>
      <span style="color:hsl(${m.colorIdx * 60},70%,70%)">
        ${m.name}
      </span>: ${m.text}
    `;
      }

      chat.appendChild(div);
    });

    chat.scrollTop = chat.scrollHeight;
  });
}

// ─── USERS SUBSCRIBE ─────────────────────────────────────────────────
function subscribeUsers() {
  return onSnapshot(collection(db, USERS_COL), snapshot => {
    const fresh = {};
    const currentOnline = new Set();

    snapshot.forEach(docSnap => {
      const u = { id: docSnap.id, ...docSnap.data() };
      fresh[u.id] = u;

      if (isOnline(u)) {
        currentOnline.add(u.id);
      }
    });

    const now = Date.now();
    const JOIN_WINDOW = 5000; // 🔥 5s = "recent join"

    if (!isFirstLoad) {
      // 🟢 HANDLE JOIN (stable, no spam)
      currentOnline.forEach(id => {
        if (!prevOnlineUsers.has(id)) {
          const u = fresh[id];

          if (u && u.name !== me?.name) {
            // ✅ Only show if just joined recently
            if (now - u.joinedAt < JOIN_WINDOW) {
              const timeStr = formatTime(u.joinedAt);

              showToast('toast.joined', {
                name: u.name,
                time: timeStr
              });

              addSystemMessage(
                t('toast.joined')
                  .replace('{name}', u.name)
                  .replace('{time}', timeStr),
                `join_${id}` // ✅ unique key
              );
            }
          }
        }
      });

      // 🔴 HANDLE LEAVE (simple + reliable)
      prevOnlineUsers.forEach(id => {
        if (!currentOnline.has(id)) {
          const u = users[id];

          if (u && u.name !== me?.name) {
            showToast('toast.left', { name: u.name });

            addSystemMessage(
              t('toast.left').replace('{name}', u.name),
              `left_${id}` // ✅ unique key
            );
          }
        }
      });
    }

    // ✅ update state AFTER processing
    isFirstLoad = false;
    prevOnlineUsers = currentOnline;
    users = fresh;

    renderAll();
  });
}

// ─── LIMIT USERS ───────────────────────────────────────────────────
const MAX_ONLINE_USERS = 15;
function countOnlineUsers(usersArr) {
  return usersArr.filter(u => isOnline(u)).length;
}

// ─── JOIN ────────────────────────────────────────────────────────────
async function doJoin() {
  const name = document.getElementById('nameInput').value.trim();

  // 🚫 BLOCK EMPTY NAME — before any UI change
  if (!name) {
    showToast('toast.enterName');
    return;
  }

  try {
    const sameNameUsers = await getUsersByName(name);

    // 🔥 Get ALL users (for counting)
    const allUsersSnapshot = await getDocs(collection(db, USERS_COL));
    const allUsers = allUsersSnapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    const onlineCount = countOnlineUsers(allUsers);

    // 🧱 HARD LIMIT CHECK — before any UI change
    if (onlineCount >= MAX_ONLINE_USERS) {
      showToast('toast.roomFull');
      return;
    }

    // 🔁 DUPLICATE NAME CHECK — before any UI change
    const onlineUser = sameNameUsers.find(u => isOnline(u));
    if (onlineUser) {
      showToast('toast.nameTaken');
      return;
    }

    let reusedUser = sameNameUsers[0];

    if (reusedUser) {
      // ✅ RESUME OFFLINE USER
      myId = reusedUser.id;
      me = {
        id: reusedUser.id,
        name: reusedUser.name,
        colorIdx: reusedUser.colorIdx,
        room: reusedUser.room ?? null,
        joinedAt: reusedUser.joinedAt
      };
      showToast('toast.welcomeBack', { name });
    } else {
      // ✅ NEW USER
      me = {
        id: myId,
        name,
        colorIdx: selectedColorIdx,
        room: null,
        joinedAt: Date.now()
      };
      showToast('toast.welcome', { name });
    }

    await saveMySession();

    // 🔥 Only announce NEW user
    if (!reusedUser) {
      const timeStr = formatTime(me.joinedAt);
      const msg = `🟢 ${me.name} joined at ${timeStr}`;
      const uniqueId = `join_${me.id}`;
      await addSystemMessage(msg, uniqueId);
    }

    // ✅ FLIP UI — only once, only here, after ALL checks pass
    document.getElementById('joinModal').style.display = 'none';
    document.getElementById('mainApp').style.display = '';
    moveLangToHeader();

    // ─── UI INIT ─────────────────────────
    initRoomInteractions();

    const audio = document.getElementById('bgMusic');
    audio.muted = true;
    audio.play().then(() => {
      audio.muted = false;
    }).catch(() => { });

    subscribeUsers();
    subscribeChat();

    setInterval(saveMySession, HEARTBEAT_INTERVAL);
    setInterval(renderAll, 3000);

  } catch (e) {
    console.error(e);
    showToast('toast.error');
  }
}

// ─── RENDER ──────────────────────────────────────────────────────────
function renderAll() {
  const list = document.getElementById('userList');
  list.innerHTML = '';

  Object.values(users).forEach(u => {
    const div = document.createElement('div');
    const online = isOnline(u);

    div.textContent = online ? `🟢 ${u.name}` : `⚫ ${u.name}`;
    div.style.opacity = online ? '1' : '0.5';

    list.appendChild(div);
  });

  const onlineCount = Object.values(users).filter(isOnline).length;
  document.getElementById('onlineCount').textContent = onlineCount;
}

// ─── CLEANUP ─────────────────────────────────────────────────────────
window.addEventListener('beforeunload', async () => {
  try {
    await deleteDoc(myDocRef());
  } catch {
    console.log("cleanup failed");
  }
});

// ─── VIBES ───────────────────────────────────────────────────────────
function setupVibes() {
  const audio = document.getElementById('bgMusic');
  const vibeItems = document.querySelectorAll('.vibe-item');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeLabel = document.querySelector('.volume-label');

  const tracks = {
    lofi: new URL('./assets/musics/track_01.mp3', import.meta.url).href,
    rain: new URL('./assets/musics/rain.mp3', import.meta.url).href,
    cafe: new URL('./assets/musics/cafe.mp3', import.meta.url).href,
    space: new URL('./assets/musics/space.mp3', import.meta.url).href
  };


  // Smooth replay 
  audio.loop = true;

  // 🔊 Load saved volume (or default)
  const DEFAULT_VOLUME = 0.5;

  let savedVolume = localStorage.getItem('volume');

  if (savedVolume === null) {
    // 🆕 first-time user
    savedVolume = DEFAULT_VOLUME;
    localStorage.setItem('volume', savedVolume);
  }

  savedVolume = parseFloat(savedVolume);

  audio.volume = savedVolume;
  volumeSlider.value = savedVolume;
  updateVolumeUI(savedVolume);

  // 🎚️ Volume control
  volumeSlider.addEventListener('input', (e) => {
    const vol = e.target.value;
    audio.volume = vol;

    // save
    localStorage.setItem('volume', vol);

    updateVolumeUI(vol);
  });

  function updateVolumeUI(vol) {
    const percent = vol * 100;

    // ✅ REAL dynamic fill
    volumeSlider.style.background =
      `linear-gradient(to right, var(--accent3) ${percent}%, var(--bg2) ${percent}%)`;

    // icon
    if (vol == 0) volumeLabel.textContent = '🔇';
    else if (vol < 0.5) volumeLabel.textContent = '🔉';
    else volumeLabel.textContent = '🔊';
  }

  // 🎵 Vibe switching 
  let fadeInterval = null;

  // Fix the "same track" guard — compare resolved URLs
  function isSameTrack(audio, newSrc) {
    const a = new URL(newSrc, location.href).href;
    const b = audio.src; // already absolute
    return a === b;
  }

  function smoothSwitch(audio, newSrc, targetVolume) {
    if (isSameTrack(audio, newSrc)) return; // ✅ correct comparison

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

    // ✅ load() forces the browser to re-fetch on GitHub Pages
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
        // ✅ Retry once on user-gesture contexts (GitHub Pages quirk)
        audio.load();
        audio.play().then(() => { audio.volume = targetVolume; }).catch(() => { });
      });
  }


  vibeItems.forEach(item => {
    item.addEventListener('click', () => {
      const vibe = item.dataset.vibe;

      // avoid reload if same track
      if (audio.src.includes(tracks[vibe])) return;

      const targetVolume = parseFloat(volumeSlider.value);
      smoothSwitch(audio, tracks[vibe], targetVolume);

      // UI active
      vibeItems.forEach(v => v.classList.remove('active'));
      item.classList.add('active');
    });
  });
}