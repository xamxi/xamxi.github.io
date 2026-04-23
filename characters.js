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
// Tweak these to change how characters look and behave.

export const CHAR_CONFIG = {
  // Scale of the pixel character (base = 1)
  scale: 1,

  // How often a character picks a new action (ms)
  actionInterval: { min: 4000, max: 9000 },

  // How long a walk takes (ms per pixel of distance)
  walkSpeed: 3.5,

  // Pixel size (px per "pixel unit")
  px: 4,
};

// ─── ROOM BOUNDS ──────────────────────────────────────────────────────────────
// X range (in px) a character can wander within each room.
// Adjust if your rooms are wider/narrower.
const ROOM_BOUNDS = {
  study: { xMin: 30, xMax: 260, yBase: 72 },
  playah: { xMin: 30, xMax: 260, yBase: 72 },
};

// ─── ACTIONS ──────────────────────────────────────────────────────────────────
// Each room has a set of weighted actions.
// "weight" = relative probability. Higher = more likely.
// Custom actions can be added — just match the shape.

const ROOM_ACTIONS = {
  study: [
    { id: 'walk', weight: 30, label: null },
    { id: 'sit', weight: 25, label: '💺' },
    { id: 'study', weight: 20, label: '📖' },
    { id: 'think', weight: 10, label: '💭' },
    { id: 'stretch', weight: 8, label: '🙆' },
    { id: 'sleep', weight: 7, label: '💤' },
  ],
  playah: [
    { id: 'walk', weight: 30, label: null },
    { id: 'sit', weight: 20, label: '💺' },
    { id: 'play', weight: 25, label: '🎮' },
    { id: 'dance', weight: 10, label: '🕺' },
    { id: 'sing', weight: 8, label: '🎵' },
    { id: 'liedown', weight: 7, label: '😴' },
  ],
};

// ─── ACTIVE CHARACTERS ────────────────────────────────────────────────────────
// Map of userId → CharacterInstance
const activeChars = new Map();

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Spawn a character into a room.
 * @param {string} userId
 * @param {string} name
 * @param {number} colorIdx  — 0–5, maps to the COLORS palette in script.js
 * @param {string} room      — "study" | "playah"
 */
export function spawnCharacter(userId, name, colorIdx, room, avatar, x) {
  // Don't duplicate
  if (activeChars.has(userId)) removeCharacter(userId);

  const container = document.getElementById(`chars-${room}`);
  if (!container) return;

  const bounds = ROOM_BOUNDS[room] || ROOM_BOUNDS.study;
  const char = new PixelCharacter(
    userId,
    name,
    colorIdx,
    room,
    bounds,
    container,
    avatar,
    x
  );
  activeChars.set(userId, char);
}

/**
 * Remove a character from wherever they are.
 */
export function removeCharacter(userId) {
  const char = activeChars.get(userId);
  if (!char) return;
  char.destroy();
  activeChars.delete(userId);
}

/**
 * Move a character to a different room (removes and re-spawns).
 */
export function moveCharacter(userId, name, colorIdx, newRoom, avatar, x) {
  removeCharacter(userId);

  if (newRoom) {
    spawnCharacter(
      userId,
      name,
      colorIdx,
      newRoom,
      avatar,
      x
    );
  }
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
    this.action = 'idle';
    this.actionLabel = null;
    this._timers = [];
    this._animFrame = null;
    this._walkTarget = null;
    this._walkStartX = null;
    this._walkStartTime = null;
    this._isDestroyed = false;

    this._buildDOM();
    this._render();
    this._scheduleNextAction();
  }

  // ─── DOM BUILD ─────────────────────────────────────────────────────────────

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
      transition: none;
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

    // Bubble (action label)
    const bubble = document.createElement('div');
    bubble.className = 'char-bubble';
    bubble.style.cssText = `
      font-size: 13px;
      height: 18px;
      margin-bottom: 1px;
      transition: opacity 0.3s;
      opacity: 0;
    `;

    // SVG character
    // const svg = this._buildSVG();
    const svg = this._buildPNG();

    el.appendChild(nameTag);
    el.appendChild(bubble);
    el.appendChild(svg);

    this.el = el;
    this.bubble = bubble;
    this.svg = svg;

    this.container.appendChild(el);
  }

  _color() {
    // Matches COLORS array in script.js
    const PALETTE = [
      '#ff6b6b', '#feca57', '#48dbfb',
      '#1dd1a1', '#5f27cd', '#ff9ff3',
    ];
    return PALETTE[this.colorIdx % PALETTE.length];
  }

  // ─── PNG BODY (fallback) ─────────────────────────────────────────────────────
  _buildPNG() {
    const img = document.createElement('img');

    const fallback = 'cat.png';

    let file = this.avatarFile || fallback;

    // If already full path or URL, use directly
    if (
      file.startsWith('http://') ||
      file.startsWith('https://') ||
      file.startsWith('./') ||
      file.startsWith('/')
    ) {
      img.src = file;
    } else {
      img.src = new URL(`./assets/avatars/${file}`, import.meta.url).href;
    }

    img.onerror = () => {
      img.src = new URL(`./assets/avatars/${fallback}`, import.meta.url).href;
    };

    img.style.width = '48px';
    img.style.height = '48px';
    img.style.objectFit = 'contain';
    img.style.imageRendering = 'pixelated';
    img.draggable = false;
    img.style.pointerEvents = 'none';

    this.avatar = img;
    return img;
  }

  // ─── SVG BODY ──────────────────────────────────────────────────────────────
  // A minimal 8×16 pixel-art person drawn in SVG.
  // Customization: change px (pixel unit size), color, or swap parts.

  _buildSVG() {
    const p = CHAR_CONFIG.px;    // px per "pixel unit"
    const c = this._color();
    const W = 8 * p;
    const H = 16 * p;
    const ns = 'http://www.w3.org/2000/svg';

    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.display = 'block';
    svg.style.imageRendering = 'pixelated';

    // Helper: draw a filled rect in "pixel units"
    const R = (col, x, y, w = 1, h = 1) => {
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('fill', col);
      r.setAttribute('x', String(x * p));
      r.setAttribute('y', String(y * p));
      r.setAttribute('width', String(w * p));
      r.setAttribute('height', String(h * p));
      return r;
    };

    const skinTone = '#f5cba7';
    const hair = shadeColor(c, -0.3);
    const shirt = c;
    const pants = shadeColor(c, -0.45);
    const shoes = '#333';

    // ── PARTS (pixel grid, 8 wide × 16 tall) ──────────────────────
    // Head: cols 2–5, rows 0–3
    const head = document.createElementNS(ns, 'g');
    head.id = 'head';
    [
      R(hair, 2, 0, 4, 1),   // hair top
      R(hair, 1, 1, 1, 1),   // hair left
      R(skinTone, 2, 1, 4, 1),   // forehead
      R(hair, 5, 1, 1, 1),   // hair right
      R(skinTone, 1, 2, 6, 1),   // face
      R(skinTone, 1, 3, 6, 1),   // chin
    ].forEach(r => head.appendChild(r));

    // Eyes (default idle) — overridden per action
    const eyeL = R('#333', 2, 2, 1, 1);
    const eyeR = R('#333', 5, 2, 1, 1);
    eyeL.id = 'eyeL';
    eyeR.id = 'eyeR';
    head.appendChild(eyeL);
    head.appendChild(eyeR);

    // Mouth
    const mouth = R('#e07070', 3, 3, 2, 1);
    mouth.id = 'mouth';
    head.appendChild(mouth);

    // Body: cols 1–6, rows 4–8
    const body = document.createElementNS(ns, 'g');
    body.id = 'body';
    [
      R(shirt, 2, 4, 4, 1),  // neck/collar
      R(shirt, 1, 5, 6, 3),  // torso
    ].forEach(r => body.appendChild(r));

    // Arms: cols 0 and 7, rows 5–7
    const arms = document.createElementNS(ns, 'g');
    arms.id = 'arms';
    [
      R(shirt, 0, 5, 1, 3),   // left arm upper
      R(skinTone, 0, 7, 1, 1),   // left hand
      R(shirt, 7, 5, 1, 3),   // right arm upper
      R(skinTone, 7, 7, 1, 1),   // right hand
    ].forEach(r => arms.appendChild(r));

    // Legs: cols 2–5, rows 8–11
    const legs = document.createElementNS(ns, 'g');
    legs.id = 'legs';
    [
      R(pants, 2, 8, 2, 4),   // left leg
      R(pants, 4, 8, 2, 4),   // right leg
    ].forEach(r => legs.appendChild(r));

    // Feet: cols 1–3 and 4–6, rows 12–13
    const feet = document.createElementNS(ns, 'g');
    feet.id = 'feet';
    [
      R(shoes, 1, 12, 3, 2),  // left shoe
      R(shoes, 4, 12, 3, 2),  // right shoe
    ].forEach(r => feet.appendChild(r));

    [head, body, arms, legs, feet].forEach(g => svg.appendChild(g));

    this._svgParts = { head, body, arms, legs, feet, eyeL, eyeR, mouth, svg };
    return svg;
  }

  // ─── RENDER POSITION ───────────────────────────────────────────────────────

  _render() {
    this.el.style.left = `${this.x}px`;
    this.el.style.transform = this.facing === 'left' ? 'scaleX(-1)' : 'scaleX(1)';
    // flip name back so it reads correctly
    if (this._svgParts) {
      // name tag stays readable
      const nt = this.el.querySelector('.char-name');
      if (nt) nt.style.transform = this.facing === 'left' ? 'scaleX(-1)' : 'none';
      const bb = this.el.querySelector('.char-bubble');
      if (bb) bb.style.transform = this.facing === 'left' ? 'scaleX(-1)' : 'none';
    }
    this._applyActionPose();
  }

  // ─── ACTION POSES ──────────────────────────────────────────────────────────
  // Modify SVG part positions/colors to visually represent each action.

  _applyActionPose() {
    if (!this._svgParts) return;
    const { head, body, arms, legs, feet, eyeL, eyeR, mouth, svg } = this._svgParts;
    const p = CHAR_CONFIG.px;

    // Reset all transforms
    [head, body, arms, legs, feet].forEach(g => {
      g.setAttribute('transform', '');
    });
    svg.style.filter = '';
    eyeL.setAttribute('height', String(p));
    eyeR.setAttribute('height', String(p));
    mouth.setAttribute('width', String(2 * p));
    mouth.setAttribute('x', String(3 * p));
    mouth.setAttribute('fill', '#e07070');

    svg.style.marginTop = '0px';
    const nt = this.el.querySelector('.char-name');
    const bb = this.el.querySelector('.char-bubble');
    if (nt) nt.style.marginBottom = '2px';
    if (bb) bb.style.marginBottom = '1px';

    switch (this.action) {

      case 'sit':
        // Compress legs, tilt body slightly
        legs.setAttribute('transform', `translate(0, ${2 * p})`);
        feet.setAttribute('transform', `translate(0, ${2 * p})`);
        arms.setAttribute('transform', `translate(0, ${1 * p})`);
        body.setAttribute('transform', `translate(0, ${1 * p})`);
        head.setAttribute('transform', `translate(0, ${1 * p})`);
        break;

      case 'study':
        // Lean head forward (down), arms raised
        head.setAttribute('transform', `translate(${1 * p}, ${1 * p})`);
        arms.setAttribute('transform', `translate(0, -${1 * p})`);
        // squinting eyes
        eyeL.setAttribute('height', String(Math.floor(p * 0.5)));
        eyeR.setAttribute('height', String(Math.floor(p * 0.5)));
        break;

      case 'think':
        // Hand on chin gesture — raise one arm
        arms.setAttribute('transform', `translate(0, -${2 * p})`);
        // raised eyebrow look
        eyeL.setAttribute('height', String(Math.floor(p * 0.5)));
        break;

      case 'sleep':
      case 'liedown':
        svg.style.transformOrigin = 'bottom center';
        svg.style.transform = 'rotate(-90deg) translateX(-100%)';
        svg.style.marginLeft = `${8 * p}px`;
        svg.style.marginTop = `10px`;

        // bring name closer
        this.el.querySelector('.char-name').style.marginBottom = '-6px';
        this.el.querySelector('.char-bubble').style.marginBottom = '-2px';

        eyeL.setAttribute('height', String(Math.floor(p * 0.25)));
        eyeR.setAttribute('height', String(Math.floor(p * 0.25)));
        mouth.setAttribute('fill', '#c0c0c0');
        break;

      case 'dance':
        // Exaggerated arm raise on one side
        arms.setAttribute('transform', `translate(0, -${3 * p})`);
        legs.setAttribute('transform', `translate(${1 * p}, 0)`);
        mouth.setAttribute('width', String(4 * p));
        mouth.setAttribute('x', String(2 * p));
        mouth.setAttribute('fill', '#ff9f9f');
        break;

      case 'sing':
        // Open mouth, arms slightly raised
        arms.setAttribute('transform', `translate(0, -${1 * p})`);
        mouth.setAttribute('width', String(4 * p));
        mouth.setAttribute('x', String(2 * p));
        mouth.setAttribute('fill', '#cc6666');
        break;

      case 'stretch':
        // Both arms raised high
        arms.setAttribute('transform', `translate(0, -${4 * p})`);
        legs.setAttribute('transform', `translate(0, ${1 * p})`);
        feet.setAttribute('transform', `translate(0, ${1 * p})`);
        break;

      case 'play':
        // Leaning forward, arms forward
        head.setAttribute('transform', `translate(${1 * p}, 0)`);
        arms.setAttribute('transform', `translate(${2 * p}, 0)`);
        break;

      case 'walk':
      case 'idle':
      default:
        // Standing straight — all defaults
        break;
    }
  }

  // ─── SHOW / HIDE BUBBLE ────────────────────────────────────────────────────

  _showBubble(emoji) {
    if (!emoji) { this.bubble.style.opacity = '0'; return; }
    this.bubble.textContent = emoji;
    this.bubble.style.opacity = '1';
  }
  _hideBubble() {
    this.bubble.style.opacity = '0';
  }

  // ─── ACTION SCHEDULING ─────────────────────────────────────────────────────

  _scheduleNextAction() {
    if (this._isDestroyed) return;
    const delay = randBetween(
      CHAR_CONFIG.actionInterval.min,
      CHAR_CONFIG.actionInterval.max
    );
    const timer = setTimeout(() => {
      if (this._isDestroyed) return;
      this._pickAction();
    }, delay);
    this._timers.push(timer);
  }

  _pickAction() {
    const pool = ROOM_ACTIONS[this.room] || ROOM_ACTIONS.study;
    const action = weightedRandom(pool);

    if (action.id === 'walk') {
      // this._startWalk();
      this._scheduleNextAction();
      return;
    } else {
      this._doAction(action);
    }
  }

  _doAction(action) {
    this.action = action.id;
    this._showBubble(action.label);
    this._render();

    // Duration: most actions last 3–7s
    const duration = randBetween(3000, 7000);
    const timer = setTimeout(() => {
      if (this._isDestroyed) return;
      this.action = 'idle';
      this._hideBubble();
      this._render();
      this._scheduleNextAction();
    }, duration);
    this._timers.push(timer);
  }

  // ─── WALKING ───────────────────────────────────────────────────────────────

  _startWalk() {
    const { xMin, xMax } = this.bounds;
    const target = randBetween(xMin, xMax);

    this._walkTarget = target;
    this._walkStartX = this.x;
    this._walkStartTime = performance.now();
    this.facing = target > this.x ? 'right' : 'left';
    this.action = 'walk';
    this._hideBubble();

    const distance = Math.abs(target - this.x);
    const duration = distance * CHAR_CONFIG.walkSpeed;

    this._walkDuration = duration;
    this._animateWalk();
  }

  _animateWalk() {
    if (this._isDestroyed) return;

    const elapsed = performance.now() - this._walkStartTime;
    const progress = Math.min(elapsed / this._walkDuration, 1);

    // Ease in-out
    const eased = easeInOut(progress);
    this.x = this._walkStartX + (this._walkTarget - this._walkStartX) * eased;

    // Leg bob
    const bob = Math.sin(elapsed / 120) * 2;
    if (this._svgParts) {
      this._svgParts.legs.setAttribute('transform', `translate(0, ${bob})`);
      this._svgParts.head.setAttribute('transform', `translate(0, ${-bob * 0.5})`);
    }

    this.el.style.left = `${this.x}px`;
    this.el.style.transform = this.facing === 'left' ? 'scaleX(-1)' : 'scaleX(1)';

    if (progress < 1) {
      this._animFrame = requestAnimationFrame(() => this._animateWalk());
    } else {
      this.x = this._walkTarget;
      this.action = 'idle';
      if (this._svgParts) {
        this._svgParts.legs.setAttribute('transform', '');
        this._svgParts.head.setAttribute('transform', '');
      }
      this._render();
      this._scheduleNextAction();
    }
  }

  // ─── CLEANUP ───────────────────────────────────────────────────────────────

  destroy() {
    this._isDestroyed = true;
    this._timers.forEach(t => clearTimeout(t));
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    this.el?.remove();
  }
}

// ─── INIT SIT-HERE BUTTONS ────────────────────────────────────────────────────
// Internal only — wires .room-join-btn clicks.
// rooms.js owns initRoomInteractions(); this does NOT conflict.

function initCharButtons() {
  document.querySelectorAll('.room-join-btn').forEach(btn => {
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
    fresh.addEventListener('click', () => handleRoomJoin(fresh.dataset.room));
  });
}

// ─── ROOM JOIN HANDLER ────────────────────────────────────────────────────────
// Calls back into the main app. We import me/saveMySession lazily via window.

function handleRoomJoin(room) {
  // Expose a hook from script.js — set window.__charHandlers before calling initRoomInteractions
  if (window.__charHandlers?.onRoomJoin) {
    window.__charHandlers.onRoomJoin(room);
  }
}

/**
 * Wire character system into your app. Call this BEFORE rooms.js initRoomInteractions().
 *
 * script.js example:
 *   import { registerCharHandlers, syncAllRooms } from './characters.js';
 *   import { initRoomInteractions } from './rooms.js'; // unchanged
 *
 *   registerCharHandlers({ getMe: () => me, saveRoom: async (r) => { me.room=r; await saveMySession(); } });
 *   initRoomInteractions(); // rooms.js runs normally after
 */
export function registerCharHandlers(handlers) {
  initCharButtons();

  // ── STALE PRESENCE CLEANUP ─────────────────────────────────────
  // 1. Graceful close / refresh
  window.addEventListener('beforeunload', () => {
    const me = handlers.getMe();
    if (me?.room) handlers.saveRoom(null);
  });

  // 2. Mobile: screen lock, app background (with grace period)
  let visibilityTimer = null;
  document.addEventListener('visibilitychange', () => {
    const me = handlers.getMe();
    if (!me) return;

    if (document.visibilityState === 'hidden') {
      visibilityTimer = setTimeout(() => {
        if (me.room) handlers.saveRoom(null);
      }, 30_000); // 30s grace — cancels if user comes back
    } else {
      clearTimeout(visibilityTimer);
    }
  });

  // ── EXISTING LOGIC (unchanged) ─────────────────────────────────
  window.__charHandlers = {
    onRoomJoin: async (room) => {
      const me = handlers.getMe();
      if (!me) return;

      const prevRoom = me.room;

      if (prevRoom === room) {
        await handlers.saveRoom(null);
        removeCharacter(me.id);
        updateRoomOccupants(room, null);
        return;
      }

      if (prevRoom) {
        removeCharacter(me.id);
        updateRoomOccupants(prevRoom, null);
      }

      me.room = room;
      me.avatar = randomAvatar();
      me.x = randomSpawnX(room);

      await handlers.saveRoom(room);

      spawnCharacter(me.id, me.name, me.colorIdx, room, me.avatar, me.x);
      updateRoomOccupants(room, me);
    }
  };
}

// ─── ROOM OCCUPANT LIST ───────────────────────────────────────────────────────
// Syncs the text list under each room card.

export function syncAllRooms(users, myId) {
  ['study', 'playah'].forEach(room => {
    const el = document.getElementById(`occ-${room}`);
    if (!el) return;
    const inRoom = Object.values(users).filter(u => u.room === room);
    el.innerHTML = inRoom.map(u =>
      `<span style="color:hsl(${u.colorIdx * 60},70%,65%);font-size:11px;margin-right:6px">● ${u.name}</span>`
    ).join('');

    // Spawn/remove characters based on Firestore snapshot
    inRoom.forEach(u => {
      const existing = activeChars.get(u.id);

      // not spawned yet
      if (!existing) {
        spawnCharacter(
          u.id,
          u.name,
          u.colorIdx,
          room,
          u.avatar,
          u.x
        );
        return;
      }

      // already spawned but wrong room
      if (existing.room !== room) {
        moveCharacter(
          u.id,
          u.name,
          u.colorIdx,
          room,
          u.avatar,
          u.x
        );
      }
    });
  });

  // Remove characters that are no longer in any room or are offline
  activeChars.forEach((char, uid) => {
    if (uid === myId) return; // managed separately
    const u = users[uid];
    if (!u || !u.room) {
      removeCharacter(uid);
      return;
    }

    if (char.room !== u.room) {
      moveCharacter(
        u.id,
        u.name,
        u.colorIdx,
        u.room,
        u.avatar,
        u.x
      );
    }
  });
}

function updateRoomOccupants(room, user) {
  // Lightweight local refresh — full sync comes from subscribeUsers
  const el = document.getElementById(`occ-${room}`);
  if (!el) return;
  // Just trigger a re-render next tick; syncAllRooms will do the real work
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

function randBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function weightedRandom(items) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function shadeColor(hex, amount) {
  // Lighten (positive) or darken (negative) a hex color
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  r = Math.max(0, Math.min(255, Math.round(r + 255 * amount)));
  g = Math.max(0, Math.min(255, Math.round(g + 255 * amount)));
  b = Math.max(0, Math.min(255, Math.round(b + 255 * amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function randomAvatar() {
  const files = ['cat.png', 'dog.png'];
  return files[Math.floor(Math.random() * files.length)];
}

function randomSpawnX(room) {
  const bounds = ROOM_BOUNDS[room] || ROOM_BOUNDS.study;
  return randBetween(bounds.xMin, bounds.xMax);
}