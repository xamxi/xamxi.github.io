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
  // bind events AFTER auth
  document.getElementById('joinBtn').addEventListener('click', doJoin);
  document.getElementById('sendBtn').addEventListener('click', sendMessage);

  document.getElementById('chatInput').addEventListener('keypress', e => {
    if (e.key === 'Enter') sendMessage();
  });
}

// ─── GET USER BY NAME ────────────────────────────────────────────────
async function getUserByName(name) {
  const q = query(collection(db, USERS_COL), where("name", "==", name));
  const snapshot = await getDocs(q);

  if (snapshot.empty) return null;
  return snapshot.docs[0].data();
}

// ─── DELETE DUPLICATE USERS ──────────────────────────────────────────
async function deleteUsersByName(name) {
  const q = query(collection(db, USERS_COL), where("name", "==", name));
  const snapshot = await getDocs(q);

  if (snapshot.empty) return;

  const deletes = [];
  snapshot.forEach(docSnap => {
    deletes.push(deleteDoc(doc(db, USERS_COL, docSnap.id)));
  });

  await Promise.all(deletes);
}

// ─── TOAST ───────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');

  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2600);
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
async function addSystemMessage(text) {
  const id = 'm_' + Date.now() + '_' + Math.random();

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

      if (m.type === "system") {
        div.className = 'chat-msg system-msg';
        div.textContent = m.text;
      } else {
        div.className = 'chat-msg';
        div.innerHTML = `
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

      if (isOnline(u)) currentOnline.add(u.id);
    });

    if (!isFirstLoad) {
      currentOnline.forEach(id => {
        if (!prevOnlineUsers.has(id)) {
          const u = fresh[id];
          if (u && u.name !== me?.name) {
            const msg = `🟢 ${u.name} joined`;
            showToast(msg);
            addSystemMessage(msg);
          }
        }
      });

      prevOnlineUsers.forEach(id => {
        if (!currentOnline.has(id)) {
          const u = users[id];
          if (u && u.name !== me?.name) {
            const msg = `⚫ ${u.name} left`;
            showToast(msg);
            addSystemMessage(msg);
          }
        }
      });
    }

    isFirstLoad = false;
    prevOnlineUsers = currentOnline;
    users = fresh;

    renderAll();
  });
}

// ─── JOIN ────────────────────────────────────────────────────────────
async function doJoin() {
  const name = document.getElementById('nameInput').value.trim();

  if (!name) {
    showToast('enter your name first! 👾');
    return;
  }

  try {
    const existingUser = await getUserByName(name);
    await deleteUsersByName(name);

    me = {
      id: myId,
      name,
      colorIdx: existingUser?.colorIdx ?? Math.floor(Math.random() * 6),
      room: null,
      joinedAt: Date.now()
    };

    await saveMySession();

    showToast(`welcome, ${name}! 🎉`);
    await addSystemMessage(`🟢 ${name} joined`);

    document.getElementById('joinModal').style.display = 'none';
    document.getElementById('mainApp').style.display = '';

    subscribeUsers();
    subscribeChat();

    setInterval(saveMySession, HEARTBEAT_INTERVAL);
    setInterval(renderAll, 3000);

  } catch (e) {
    console.error(e);
    showToast('something went wrong 😢');
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

  const tracks = {
    lofi: './assets/track_01.mp3',
    rain: './assets/rain.mp3',
    cafe: './assets/cafe.mp3',
    space: './assets/space.mp3'
  };

  vibeItems.forEach(item => {
    item.addEventListener('click', () => {
      const vibe = item.dataset.vibe;

      // 🎧 change music
      audio.src = tracks[vibe];
      audio.play().catch(e => console.log("Play blocked:", e));

      // 🎨 update active UI
      vibeItems.forEach(v => v.classList.remove('active'));
      item.classList.add('active');
    });
  });
}