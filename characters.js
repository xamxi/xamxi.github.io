// ─── PIXEL CHARACTER SYSTEM ──────────────────────────────────────────────────
// characters.js — does NOT conflict with rooms.js.
// rooms.js owns: initRoomInteractions(), all room object click handlers.
// characters.js owns: pixel figures, SIT HERE button logic, room presence sync.
//
// ── HOW TO USE ───────────────────────────────────────────────────────────────
// In script.js, keep your existing rooms.js import untouched:
//   import { initRoomInteractions } from './rooms.js';
//
// Add these imports from characters.js:
//   import { registerCharHandlers, syncAllRooms } from './characters.js';
//
// After doJoin sets `me`, register handlers BEFORE calling initRoomInteractions:
//   registerCharHandlers({
//     getMe:    () => me,
//     saveRoom: async (room) => { me.room = room; await saveMySession(); }
//   });
//   initRoomInteractions(); // rooms.js — unchanged, runs as normal
//
// In subscribeUsers, after `users = fresh; renderAll();` add:
//   syncAllRooms(users, myId);
// ─────────────────────────────────────────────────────────────────────────────

// ─── CUSTOMIZATION ────────────────────────────────────────────────────────────

export const CHAR_CONFIG = {
  // How often a character picks a new action (ms)
  actionInterval: { min: 4000, max: 9000 },
};

// ─── ROOM BOUNDS ──────────────────────────────────────────────────────────────
const ROOM_BOUNDS = {
  study: { xMin: 30, xMax: 260 },
  playah: { xMin: 30, xMax: 260 },
};

// ─── ACTIONS ──────────────────────────────────────────────────────────────────
const ROOM_ACTIONS = {
  study: [
    { id: 'idle', weight: 30, label: null },
    { id: 'sit', weight: 25, label: '🪑' },
    { id: 'study', weight: 20, label: '📖' },
    { id: 'think', weight: 10, label: '💭' },
    { id: 'stretch', weight: 8, label: '🙆' },
    { id: 'sleep', weight: 7, label: '💤' },
  ],
  playah: [
    { id: 'idle', weight: 30, label: null },
    { id: 'sit', weight: 20, label: '🪑' },
    { id: 'play', weight: 25, label: '🎮' },
    { id: 'dance', weight: 10, label: '🕺' },
    { id: 'sing', weight: 8, label: '🎵' },
    { id: 'liedown', weight: 7, label: '😴' },
  ],
};

// ─── ACTIVE CHARACTERS ────────────────────────────────────────────────────────
const activeChars = new Map();

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

export function spawnCharacter(userId, name, colorIdx, room, avatar, x) {
  if (activeChars.has(userId)) removeCharacter(userId);

  const container = document.getElementById(`chars-${room}`);
  if (!container) return;

  const bounds = ROOM_BOUNDS[room] ?? ROOM_BOUNDS.study;
  const char = new PixelCharacter(userId, name, colorIdx, room, bounds, container, avatar, x);
  activeChars.set(userId, char);
}

export function removeCharacter(userId) {
  const char = activeChars.get(userId);
  if (!char) return;
  char.destroy();
  activeChars.delete(userId);
}

export function moveCharacter(userId, name, colorIdx, newRoom, avatar, x) {
  removeCharacter(userId);
  if (newRoom) spawnCharacter(userId, name, colorIdx, newRoom, avatar, x);
}

// ─── PIXEL CHARACTER CLASS ────────────────────────────────────────────────────

class PixelCharacter {
  constructor(userId, name, colorIdx, room, bounds, container, avatar, x) {
    this.userId = userId;
    this.name = name;
    this.colorIdx = colorIdx;
    this.room = room;
    this.bounds = bounds;
    this.container = container;
    this.avatarFile = avatar;

    this.x = x ?? randBetween(bounds.xMin, bounds.xMax);
    this.facing = 'right';
    this.moving = false;
    this.moveProgress = 0;
    this.moveDuration = 0;
    this.startX = this.x;
    this.targetX = this.x;
    this.bobPhase = Math.random() * Math.PI * 2;
    this.action = 'idle';

    this._timers = [];
    this._isDestroyed = false;

    this._buildDOM();
    this._scheduleNextAction();
    this._scheduleNextMove();
    this._startLoop();
  }

  // ─── DOM ───────────────────────────────────────────────────────────────────

  _buildDOM() {
    const el = document.createElement('div');
    el.className = 'pixel-char';
    el.dataset.userId = this.userId;
    el.style.cssText = `
      position: absolute;
      bottom: 0;
      left: ${this.x}px;
      width: 32px;
      display: flex;
      flex-direction: column;
      align-items: center;
      pointer-events: none;
      user-select: none;
    `;

    // Name tag
    const nameTag = document.createElement('div');
    nameTag.className = 'char-name';
    nameTag.textContent = this.name;
    nameTag.style.cssText = `
      font-size: 9px;
      font-family: monospace;
      color: ${this._color()};
      background: rgba(0,0,0,0.55);
      padding: 1px 4px;
      border-radius: 3px;
      margin-bottom: 2px;
      white-space: nowrap;
      max-width: 60px;
      overflow: hidden;
      text-overflow: ellipsis;
    `;

    // Action bubble
    const bubble = document.createElement('div');
    bubble.className = 'char-bubble';
    bubble.style.cssText = `
      font-size: 13px;
      height: 18px;
      margin-bottom: 1px;
      transition: opacity 0.3s;
      opacity: 0;
    `;

    // Avatar image
    const img = document.createElement('img');
    const fallback = 'cat.png';
    const file = this.avatarFile || fallback;

    img.src = (file.startsWith('http') || file.startsWith('./') || file.startsWith('/'))
      ? file
      : new URL(`./assets/avatars/${file}`, import.meta.url).href;

    img.onerror = () => {
      img.src = new URL(`./assets/avatars/${fallback}`, import.meta.url).href;
    };

    img.style.cssText = `
      width: 48px;
      height: 48px;
      object-fit: contain;
      image-rendering: pixelated;
    `;
    img.draggable = false;

    this.nameEl = nameTag;
    el.appendChild(nameTag);
    el.appendChild(bubble);
    el.appendChild(img);

    this.el = el;
    this.bubble = bubble;
    this.img = img;

    this.container.appendChild(el);
    this._updateTransform();
  }

  _color() {
    const PALETTE = ['#ff6b6b', '#feca57', '#48dbfb', '#1dd1a1', '#5f27cd', '#ff9ff3'];
    return PALETTE[this.colorIdx % PALETTE.length];
  }

  // ─── TRANSFORM ─────────────────────────────────────────────────────────────

  _updateTransform() {
    this.el.style.left = `${this.x}px`;
    this.el.style.transform = this.facing === 'left' ? 'scaleX(-1)' : 'scaleX(1)';
    // Always counter-flip name and bubble so they stay readable
    const fix = 'scaleX(-1)';
    this.el.querySelector('.char-name').style.transform = this.facing === 'left' ? fix : 'none';
    this.el.querySelector('.char-bubble').style.transform = this.facing === 'left' ? fix : 'none';
  }

  // ─── BUBBLE ────────────────────────────────────────────────────────────────

  _showBubble(emoji) {
    if (!emoji) { this._hideBubble(); return; }
    this.bubble.textContent = emoji;
    this.bubble.style.opacity = '1';
  }

  _hideBubble() {
    this.bubble.style.opacity = '0';
  }

  // ─── ACTION SCHEDULING ─────────────────────────────────────────────────────

  _scheduleNextAction() {
    if (this._isDestroyed) return;
    const delay = randBetween(CHAR_CONFIG.actionInterval.min, CHAR_CONFIG.actionInterval.max);
    this._timers.push(setTimeout(() => {
      if (!this._isDestroyed) this._pickAction();
    }, delay));
  }

  _pickAction() {
    const pool = ROOM_ACTIONS[this.room] ?? ROOM_ACTIONS.study;
    const action = weightedRandom(pool);
    this._doAction(action);
  }

  _doAction(action) {
    this.action = action.id;
    this._showBubble(action.label);

    const duration = randBetween(3000, 7000);
    this._timers.push(setTimeout(() => {
      if (this._isDestroyed) return;
      this.action = 'idle';
      this._hideBubble();
      this._scheduleNextAction();
    }, duration));
  }

  // ─── MOVEMENT SCHEDULING ───────────────────────────────────────────────────
  _scheduleNextMove() {
    const delay = randBetween(800, 3200);
    this._timers.push(setTimeout(() => {
      if (this._isDestroyed) return;
      this._pickDestination();
      this._scheduleNextMove();
    }, delay));
  }

  _pickDestination() {
    const spread = randBetween(30, 120);
    const dir = Math.random() < 0.5 ? -1 : 1;
    let target = this.x + dir * spread;
    target = Math.max(this.bounds.xMin, Math.min(this.bounds.xMax, target));
    if (Math.abs(target - this.x) < 10) return;

    this.startX = this.x;
    this.targetX = target;
    this.facing = target > this.x ? 'right' : 'left';
    this.moving = true;
    this.moveProgress = 0;
    // speed: pixels-per-ms, so duration scales with distance
    // this.moveDuration = Math.abs(target - this.x) / randBetween(0.04, 0.09);

    const CHAR_CONFIG = {
      // How often a character picks a new action (ms)
      actionInterval: { min: 4000, max: 9000 },

      // Different walking speed per room (pixels per ms)
      moveSpeed: {
        study: { min: 0.015, max: 0.03 },   // slower
        playah: { min: 0.08, max: 0.16 },   // faster
      }
    };
    const speedCfg =
      CHAR_CONFIG.moveSpeed[this.room] ||
      CHAR_CONFIG.moveSpeed.study;

    const speed = randBetween(speedCfg.min, speedCfg.max);

    // distance / speed = duration
    this.moveDuration = Math.abs(target - this.x) / speed;

  }

  _startLoop() {
    let last = performance.now();
    const tick = (now) => {
      if (this._isDestroyed) return;
      const dt = now - last;
      last = now;

      // Eased position interpolation
      if (this.moving) {
        this.moveProgress += dt;
        const t = Math.min(this.moveProgress / this.moveDuration, 1);
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;  // easeInOut
        this.x = this.startX + (this.targetX - this.startX) * ease;
        if (t >= 1) { this.x = this.targetX; this.moving = false; }
      }

      // Bob: faster + bigger when walking, gentle idle sway when still
      this.bobPhase += dt * (this.moving ? 0.012 : 0.004);
      const bob = this.moving ? Math.sin(this.bobPhase) * 3 : Math.sin(this.bobPhase) * 0.7;
      const squash = this.moving ? (1 + Math.abs(Math.sin(this.bobPhase)) * 0.06) : 1;

      this._updateTransform();
      this.img.style.transform = `translateY(${-bob}px) scaleY(${squash})`;
      this.nameEl.style.transform = this.facing === 'left' ? 'scaleX(-1)' : 'none';
      this.bubble.style.transform = this.facing === 'left' ? 'scaleX(-1)' : 'none';
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ─── CLEANUP ───────────────────────────────────────────────────────────────

  destroy() {
    this._isDestroyed = true;
    this._timers.forEach(t => clearTimeout(t));
    this.el?.remove();
  }
}

// ─── SIT-HERE BUTTONS ─────────────────────────────────────────────────────────

function initCharButtons() {
  document.querySelectorAll('.room-join-btn').forEach(btn => {
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
    fresh.addEventListener('click', () => {
      window.__charHandlers?.onRoomJoin?.(fresh.dataset.room);
    });
  });
}

// ─── PUBLIC: REGISTER HANDLERS ────────────────────────────────────────────────

export function registerCharHandlers(handlers) {
  initCharButtons();

  // Graceful close / refresh
  window.addEventListener('beforeunload', () => {
    if (handlers.getMe()?.room) handlers.saveRoom(null);
  });

  // Mobile: screen lock / backgrounding (30s grace period)
  let visibilityTimer = null;
  document.addEventListener('visibilitychange', () => {
    const me = handlers.getMe();
    if (!me) return;
    if (document.visibilityState === 'hidden') {
      visibilityTimer = setTimeout(() => {
        if (me.room) handlers.saveRoom(null);
      }, 30_000);
    } else {
      clearTimeout(visibilityTimer);
    }
  });

  window.__charHandlers = {
    onRoomJoin: async (room) => {
      const me = handlers.getMe();
      if (!me) return;

      const prevRoom = me.room;

      // Toggle off if already in this room
      if (prevRoom === room) {
        await handlers.saveRoom(null);
        removeCharacter(me.id);
        return;
      }

      // Leave previous room
      if (prevRoom) removeCharacter(me.id);

      me.room = room;
      me.avatar = randomAvatar();
      me.x = randomSpawnX(room);

      await handlers.saveRoom(room);
      spawnCharacter(me.id, me.name, me.colorIdx, room, me.avatar, me.x);
    },
  };
}

// ─── PUBLIC: SYNC ALL ROOMS ───────────────────────────────────────────────────

export function syncAllRooms(users, myId) {
  // Remove chars that are offline or roomless
  activeChars.forEach((char, uid) => {
    if (uid === myId) return;
    const u = users[uid];
    if (!u || !u.room || !isUserOnline(u)) {
      removeCharacter(uid);
      return;
    }
    if (char.room !== u.room) {
      moveCharacter(u.id, u.name, u.colorIdx, u.room, u.avatar, u.x);
    }
  });

  // Spawn / update occupant lists
  ['study', 'playah'].forEach(room => {
    const el = document.getElementById(`occ-${room}`);
    const inRoom = Object.values(users).filter(u => u.room === room && isUserOnline(u));

    if (el) {
      el.innerHTML = inRoom
        .map(u => `<span style="color:hsl(${u.colorIdx * 60},70%,65%);font-size:11px;margin-right:6px">● ${u.name}</span>`)
        .join('');
    }

    inRoom.forEach(u => {
      if (u.id === myId) return;
      const existing = activeChars.get(u.id);
      if (!existing) {
        spawnCharacter(u.id, u.name, u.colorIdx, room, u.avatar ?? 'cat.png', u.x ?? null);
      } else if (existing.room !== room) {
        moveCharacter(u.id, u.name, u.colorIdx, room, u.avatar ?? 'cat.png', u.x ?? null);
      }
    });
  });
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

function randBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function weightedRandom(items) {
  let r = Math.random() * items.reduce((s, i) => s + i.weight, 0);
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function randomAvatar() {
  const files = ['cat.png', 'dog.png'];
  return files[Math.floor(Math.random() * files.length)];
}

function randomSpawnX(room) {
  const bounds = ROOM_BOUNDS[room] ?? ROOM_BOUNDS.study;
  return randBetween(bounds.xMin, bounds.xMax);
}

function isUserOnline(u) {
  return u.heartbeat && (Date.now() - u.heartbeat < 20_000);
}