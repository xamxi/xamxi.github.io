
// butler/index.js
import { butlerReply } from './ai.js';

// ─── PUBLIC INIT ─────────────────────────────────────────────────────
export function initButler({ getMe = () => null, addSystemMessage = null, getLang = null } = {}) {
  injectStyles();
  buildDOM();
  setupInteraction({ getMe, addSystemMessage, getLang });
  startWander();
  scheduleIdleChatter(getLang);
}


// ─── LANG HELPER ─────────────────────────────────────────────────────
// Returns the butler lang object, or a built-in English fallback.
const FALLBACK = {
  hint: "click me! 👆",
  modalTitle: "🎩 Ask Buttler",
  modalSub: "your personal butler, at your service",
  placeholder: "What would you like to know, dear guest?",
  askBtn: "ASK ▶",
  dismissBtn: "DISMISS",
  loading: "asking butler...",
  greeting: "Hello! I'm Buttler, your beloved butler. Click me or Press B if you need anything! 🎩",
  openGreet: "Yes? How may I assist? ✨",
  idleLines: [
    "Fancy a break? ☕",
    "You're doing wonderfully! 🎩",
    "Need anything? Just click me!",
    "The hour grows late... 🕰️",
    "A butler's work is never done~ 🧹",
    "Splendid effort today! ✨",
    "Don't forget to hydrate! 💧",
    "Eyes on the prize! 📚",
    "I have biscuits, if you'd like. 🍪",
  ],
};

function bl(getLang) {
  // Called at render-time so it always reflects the latest language switch
  return (getLang && getLang()) || FALLBACK;
}

// ─── BUILD DOM ────────────────────────────────────────────────────────
function buildDOM() {
  if (document.getElementById('butler-layer')) return;

  const layer = document.createElement('div');
  layer.id = 'butler-layer';
  layer.innerHTML = `

    <!-- ════════════ BUTLER CHARACTER ════════════ -->
    <div id="butler" title="Click to ask Buttler!">

      <!-- Speech bubble -->
      <div id="butler-bubble" class="butler-bubble hidden">
        <div id="butler-bubble-text"></div>
        <div class="butler-bubble-tail"></div>
      </div>

      <!-- Ping dot (idle attention) -->
      <div id="butler-ping"></div>

      <!-- ── Pixel Sprite ──────────────────────────────────────────
           This div is the PLACEHOLDER for the detailed model.
           To upgrade: replace the inner markup / swap a canvas / 
           inject a Spine/Lottie animation here.
      ─────────────────────────────────────────────────────────── -->
      <div class="butler-sprite" id="butler-sprite">

        <!-- HAT -->
        <div class="b-hat">
          <div class="b-hat-brim"></div>
          <div class="b-hat-band"></div>
        </div>

        <!-- HEAD -->
        <div class="b-head">
          <div class="b-hair"></div>
          <div class="b-monocle"></div>
          <!-- eyes + mouth via CSS ::before/::after -->
        </div>

        <!-- BODY / SUIT -->
        <div class="b-body">
          <div class="b-lapel l"></div>
          <div class="b-lapel r"></div>
          <div class="b-bowtie"></div>
          <div class="b-pocket-square"></div>
          <div class="b-arm l"></div>
          <div class="b-arm r"></div>
          <!-- Tray on right hand -->
          <div class="b-tray">
            <div class="b-tray-cup"></div>
          </div>
        </div>

        <!-- LEGS -->
        <div class="b-legs">
          <div class="b-leg" id="b-leg-l"></div>
          <div class="b-leg" id="b-leg-r"></div>
        </div>

        <!-- SHOES -->
        <div class="b-shoes">
          <div class="b-shoe"></div>
          <div class="b-shoe"></div>
        </div>

        <!-- Drop shadow -->
        <div class="b-shadow"></div>
      </div>

      <!-- Name tag -->
      <div class="butler-label">Buttler</div>

      <!-- One-time click hint (hidden after first interaction) -->
      <div id="butler-hint" class="butler-hint">click me! 👆</div>

    </div><!-- /#butler -->


    <!-- ════════════ ASK MODAL ════════════ -->
    <div id="butler-modal" class="butler-modal hidden" role="dialog" aria-modal="true"
         aria-labelledby="butler-modal-title">
      <div class="butler-modal-box">

        <div class="butler-modal-title" id="butler-modal-title">🎩 Ask Buttler</div>
        <div class="butler-modal-sub">your personal butler, at your service</div>

        <textarea id="butler-question" class="butler-textarea"
          placeholder="What would you like to know, dear guest?"
          maxlength="300" rows="3"></textarea>

        <div class="butler-modal-actions">
          <button id="butler-ask-btn"    class="butler-btn primary">ASK ▶</button>
          <button id="butler-cancel-btn" class="butler-btn secondary">DISMISS</button>
        </div>

        <div id="butler-loading" class="butler-loading hidden">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
          <span id="butler-loading-text"></span>
        </div>

      </div>
    </div><!-- /#butler-modal -->

  `;

  document.body.appendChild(layer);

  // Hide hint if already seen
  if (localStorage.getItem('butler_hint_seen')) {
    document.getElementById('butler-hint').classList.add('hidden');
  }
}

// ─── APPLY LANG TO DOM ────────────────────────────────────────────────
// Call this whenever the language changes to refresh all static UI text.
export function applyButlerLang(getLang) {
  const L = bl(getLang);

  const hint = document.getElementById('butler-hint');
  const title = document.getElementById('butler-modal-title');
  const sub = title?.nextElementSibling;           // .butler-modal-sub
  const input = document.getElementById('butler-question');
  const askBtn = document.getElementById('butler-ask-btn');
  const cancel = document.getElementById('butler-cancel-btn');
  const loading = document.getElementById('butler-loading-text');

  if (hint && !localStorage.getItem('butler_hint_seen')) hint.textContent = L.hint;
  if (title) title.textContent = L.modalTitle;
  if (sub) sub.textContent = L.modalSub;
  if (input) input.placeholder = L.placeholder;
  if (askBtn) askBtn.textContent = L.askBtn;
  if (cancel) cancel.textContent = L.dismissBtn;
  if (loading) loading.textContent = L.loading;
}

// ─── INTERACTION ──────────────────────────────────────────────────────
function setupInteraction({ getMe, addSystemMessage, getLang }) {
  const butler = document.getElementById('butler');
  const modal = document.getElementById('butler-modal');
  const askBtn = document.getElementById('butler-ask-btn');
  const cancelBtn = document.getElementById('butler-cancel-btn');
  const qInput = document.getElementById('butler-question');
  const loading = document.getElementById('butler-loading');
  const hint = document.getElementById('butler-hint');

  // Populate text on first setup
  applyButlerLang(getLang);

  // ── Open modal ──
  function openModal() {
    // Refresh lang strings every time the modal opens (covers mid-session switches)
    applyButlerLang(getLang);

    hint.classList.add('hidden');
    localStorage.setItem('butler_hint_seen', '1');
    document.getElementById('butler-ping').style.display = 'none';

    hideBubble();
    modal.classList.remove('hidden');
    pauseWander();
    setTimeout(() => {
      showBubble(bl(getLang).openGreet, 3500);
      qInput.focus();
    }, 80);

  }

  // Keyboard shortcut (ignore if typing in input/textarea/contenteditable)
  document.addEventListener('keydown', (e) => {
    // ignore typing inside inputs/textareas/contenteditable
    const tag = document.activeElement?.tagName;
    const typing =
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      document.activeElement?.isContentEditable;

    if (typing) return;

    if (e.key.toLowerCase() === 'b') {
      e.preventDefault();
      openModal();
    }
  });

  // Tap + click (prevent double-fire on mobile)
  let tapped = false;
  butler.addEventListener('touchstart', () => { tapped = true; openModal(); }, { passive: true });
  butler.addEventListener('click', () => { if (tapped) { tapped = false; return; } openModal(); });

  // ── Close modal ──
  function closeModal() {
    modal.classList.add('hidden');
    resumeWander();
  }
  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // ── Submit question ──
  async function handleAsk() {
    const q = qInput.value.trim();
    if (!q) return;

    askBtn.disabled = true;
    loading.classList.remove('hidden');

    // Post question to system chat
    if (addSystemMessage) {
      const me = getMe();
      const asker = me?.name ?? 'A guest';
      await addSystemMessage(`🎩 ${asker} asked Buttler: "${q}"`);
    }

    // Get reply  ← swap butlerReply for real API here
    let reply = "Apologies sir, I seem unable to answer.";
    try {
      reply = await butlerReply(q);
    } catch (err) {
      console.error(err);
    }

    // Restore UI
    modal.classList.add('hidden');
    askBtn.disabled = false;
    loading.classList.add('hidden');
    qInput.value = '';

    // Show bubble response
    showBubble(reply, 7000);

    // Post reply to system chat
    if (addSystemMessage) {
      await addSystemMessage(`🎩 Buttler: "${reply}"`);
    }

    resumeWander();
  }

  askBtn.addEventListener('click', handleAsk);
  qInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk(); }
  });
}


// ─── SPEECH BUBBLE ────────────────────────────────────────────────────
let bubbleTimer = null;

function showBubble(text, duration = 5000) {
  const bubble = document.getElementById('butler-bubble');
  const bText = document.getElementById('butler-bubble-text');
  if (!bubble) return;
  bText.textContent = text;
  bubble.classList.remove('hidden');
  void bubble.offsetWidth; // reflow for re-trigger
  bubble.classList.add('pop-in');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(hideBubble, duration);
}

function hideBubble() {
  const bubble = document.getElementById('butler-bubble');
  if (!bubble) return;
  bubble.classList.remove('pop-in');
  bubble.classList.add('hidden');
}


// ─── WANDER ───────────────────────────────────────────────────────────
let pos = { x: 140, y: window.innerHeight - 110 };
let tgt = { x: 280, y: window.innerHeight - 110 };
let facing = 1;          // 1 = right, -1 = left
let wanderPaused = false;
let stepTimer = null;

function clamp(x, y) {
  const mx = 56, my = 80;
  return {
    x: Math.max(mx, Math.min(window.innerWidth - mx, x)),
    y: Math.max(window.innerHeight * 0.25, Math.min(window.innerHeight - my, y)),
  };
}

function pickTarget() {
  // Bias wandering toward lower portion of the screen
  const rx = 80 + Math.random() * (window.innerWidth - 160);
  const ry = window.innerHeight * 0.55 + Math.random() * (window.innerHeight * 0.35);
  return clamp(rx, ry);
}

function startWander() {
  // richer movement states
  let mode = 'wander';

  function pickInterestingTarget() {
    const modes = ['wander', 'orbit', 'peek-left', 'peek-right', 'cross'];
    mode = modes[Math.floor(Math.random() * modes.length)];

    const w = window.innerWidth;
    const h = window.innerHeight;

    switch (mode) {
      // normal random walk
      case 'wander':
        return pickTarget();

      // move toward left edge then back later
      case 'peek-left':
        return clamp(50, h * (0.55 + Math.random() * 0.25));

      // move toward right edge then back later
      case 'peek-right':
        return clamp(w - 50, h * (0.55 + Math.random() * 0.25));

      // dramatic full-screen crossing
      case 'cross':
        return clamp(
          pos.x < w / 2 ? w - 70 : 70,
          h * (0.55 + Math.random() * 0.25)
        );

      // circle around current point
      case 'orbit':
        const angle = Math.random() * Math.PI * 2;
        const radius = 90 + Math.random() * 80;
        return clamp(
          pos.x + Math.cos(angle) * radius,
          pos.y + Math.sin(angle) * radius
        );
    }

    return pickTarget();
  }

  tgt = pickInterestingTarget();

  function sched() {
    stepTimer = setTimeout(() => {
      if (!wanderPaused) {
        tgt = pickInterestingTarget();
      }
      sched();
    }, 2200 + Math.random() * 3800); // changes more often
  }

  sched();
  wanderLoop();
}

function wanderLoop() {
  if (!wanderPaused) {
    const dx = tgt.x - pos.x;
    const dy = tgt.y - pos.y;
    const dist = Math.hypot(dx, dy);
    const speed = 0.7;

    if (dist > 2) {
      pos.x += (dx / dist) * speed;
      pos.y += (dy / dist) * speed;
      if (Math.abs(dx) > 2) facing = dx > 0 ? 1 : -1;
    }

    const el = document.getElementById('butler');
    if (el) {
      // Fixed positioning: left = x, bottom = (viewport - y)
      el.style.left = pos.x + 'px';
      el.style.bottom = (window.innerHeight - pos.y) + 'px';

      // Flip sprite + keep label/bubble readable
      const sprite = document.getElementById('butler-sprite');
      if (sprite) sprite.style.transform = `scaleX(${facing})`;

      const label = el.querySelector('.butler-label');
      if (label) label.style.transform = `scaleX(${facing})`;

      const bubble = document.getElementById('butler-bubble');
      if (bubble) bubble.style.transform = `translateX(-50%) scaleX(${facing})`;

      // Walking animation
      if (dist > 4) sprite?.classList.add('walking');
      else sprite?.classList.remove('walking');
    }
  }
  requestAnimationFrame(wanderLoop);
}

function pauseWander() { wanderPaused = true; document.getElementById('butler-sprite')?.classList.remove('walking'); }
function resumeWander() { wanderPaused = false; tgt = pickTarget(); }


// ─── IDLE CHATTER ─────────────────────────────────────────────────────
function scheduleIdleChatter(getLang) {
  // Greeting
  setTimeout(() => {
    showBubble(bl(getLang).greeting, 6000);
  }, 7000);

  // Periodic idle lines — re-reads getLang each time so they're always translated
  function next() {
    const delay = 35000 + Math.random() * 55000;
    setTimeout(() => {
      if (!wanderPaused) {
        const lines = bl(getLang).idleLines;
        showBubble(lines[Math.floor(Math.random() * lines.length)], 4500);
      }
      next();
    }, delay);
  }
  next();
}


// ─── STYLES ───────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('butler-styles')) return;

  const s = document.createElement('style');
  s.id = 'butler-styles';
  s.textContent = `

  /* ════ Layer ════ */
  #butler-layer {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 800;
    overflow: hidden;
  }

  /* ════ Butler wrapper ════ */
  #butler {
    position: fixed;
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
    bottom: 80px;
    left: 140px;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }
  #butler:hover .butler-sprite { filter: brightness(1.15); }

  /* ════ Speech bubble ════ */
  .butler-bubble {
    position: absolute;
    bottom: calc(100% + 12px);
    left: 50%;
    transform: translateX(-50%);
    background: #1a1a35;
    border: 2px solid var(--accent3, #61ffd4);
    color: var(--accent3, #61ffd4);
    font-family: var(--font-main, monospace);
    font-size: 7px;
    padding: 8px 12px;
    width: 170px;
    text-align: center;
    line-height: 1.75;
    box-shadow: 2px 2px 0 var(--accent, #7b61ff);
    pointer-events: none;
    white-space: pre-wrap;
    z-index: 10;
  }
  .butler-bubble-tail {
    position: absolute;
    bottom: -8px; left: 50%;
    transform: translateX(-50%);
    width: 0; height: 0;
    border-left:  6px solid transparent;
    border-right: 6px solid transparent;
    border-top:   8px solid var(--accent3, #61ffd4);
  }
  .butler-bubble.pop-in {
    animation: bubblePop 0.22s ease forwards;
  }
  @keyframes bubblePop {
    0%   { transform: translateX(-50%) scale(0.65); opacity: 0; }
    75%  { transform: translateX(-50%) scale(1.06); opacity: 1; }
    100% { transform: translateX(-50%) scale(1);    opacity: 1; }
  }

  /* ════ Ping dot ════ */
  #butler-ping {
    position: absolute;
    top: 2px; right: 0px;
    width: 8px; height: 8px;
    background: var(--accent2, #ff6eb4);
    border: 1px solid #fff;
    animation: pingPulse 1.8s infinite;
  }
  @keyframes pingPulse {
    0%,100% { opacity: 1; transform: scale(1);   }
    50%      { opacity: .5; transform: scale(1.4); }
  }

  /* ════ One-time hint ════ */
  .butler-hint {
    position: absolute;
    top: -20px; left: 50%;
    transform: translateX(-50%);
    font-family: var(--font-main, monospace);
    font-size: 6px;
    color: var(--yellow, #ffe066);
    white-space: nowrap;
    pointer-events: none;
    animation: hintBlink 1.1s infinite alternate;
  }
  @keyframes hintBlink { from{opacity:1} to{opacity:0.25} }

  /* ═══════════════════════════════
     🎩 PIXEL BUTLER SPRITE
     Placeholder — replace inner HTML
     for detailed model later.
  ═══════════════════════════════ */
  .butler-sprite {
    display: flex;
    flex-direction: column;
    align-items: center;
    image-rendering: pixelated;
    animation: butlerBob 1.6s infinite alternate ease-in-out;
    transform-origin: bottom center;
    position: relative;
  }
  .butler-sprite.walking {
    animation: butlerWalk 0.38s steps(2) infinite;
  }
  @keyframes butlerBob {
    from { transform: translateY(0px);  }
    to   { transform: translateY(-3px); }
  }
  @keyframes butlerWalk {
    0%   { transform: translateY(0px);  }
    50%  { transform: translateY(-2px); }
    100% { transform: translateY(0px);  }
  }

  /* Hat */
  .b-hat {
    width: 22px; height: 20px;
    background: #111122;
    border: 2px solid #33335a;
    position: relative; z-index: 2;
  }
  .b-hat-brim {
    position: absolute;
    bottom: -4px; left: -5px;
    width: 32px; height: 5px;
    background: #111122;
    border: 2px solid #33335a;
  }
  .b-hat-band {
    position: absolute;
    bottom: 5px; left: 0; right: 0;
    height: 3px;
    background: var(--accent3, #61ffd4);
    opacity: .65;
  }

  /* Head */
  .b-head {
    width: 20px; height: 18px;
    background: #f5c89a;
    border: 2px solid #c8966a;
    position: relative;
    margin-top: -1px;
  }
  .b-head::before { /* eyes */
    content: '';
    position: absolute;
    top: 5px; left: 3px;
    width: 4px; height: 3px;
    background: #1a1a2e;
    box-shadow: 8px 0 0 #1a1a2e;
  }
  .b-head::after { /* smile */
    content: '';
    position: absolute;
    bottom: 3px; left: 5px;
    width: 10px; height: 2px;
    background: rgba(0,0,0,.25);
    border-radius: 0 0 3px 3px;
  }
  .b-hair {
    position: absolute;
    top: -2px; left: 0; right: 0; height: 4px;
    background: #2a1a0a;
    border-radius: 2px 2px 0 0;
  }
  .b-monocle {
    position: absolute;
    top: 3px; right: 1px;
    width: 7px; height: 7px;
    border: 1px solid rgba(200,150,106,.6);
    border-radius: 50%;
  }

  /* Body / Suit */
  .b-body {
    width: 22px; height: 22px;
    background: #111122;
    border: 2px solid #33335a;
    position: relative;
    margin-top: -1px;
  }
  .b-body::before { /* white shirt strip */
    content: '';
    position: absolute;
    top: 1px; left: 6px;
    width: 10px; height: 18px;
    background: #eeeeff;
    border-left: 1px solid #ccccee;
    border-right: 1px solid #ccccee;
  }
  .b-body::after { /* shirt buttons */
    content: '';
    position: absolute;
    top: 4px; left: 10px;
    width: 2px; height: 2px;
    background: #888;
    box-shadow: 0 5px 0 #888, 0 10px 0 #888;
  }
  .b-lapel {
    position: absolute; top: 0;
    width: 7px; height: 13px;
    background: #1c1c38;
    border: 1px solid #3a3a60;
  }
  .b-lapel.l { left: 0;  clip-path: polygon(0 0, 100% 0, 55% 100%, 0 100%); }
  .b-lapel.r { right: 0; clip-path: polygon(0 0, 100% 0, 100% 100%, 45% 100%); }
  .b-bowtie {
    position: absolute;
    top: 2px; left: 50%; transform: translateX(-50%);
    width: 10px; height: 6px;
    background: var(--accent2, #ff6eb4);
    clip-path: polygon(0 0, 42% 50%, 0 100%, 100% 100%, 58% 50%, 100% 0);
  }
  .b-pocket-square {
    position: absolute;
    top: 3px; right: 3px;
    width: 5px; height: 4px;
    background: #fff;
    border: 1px solid #ccc;
  }
  .b-pocket-square::after {
    content: '';
    position: absolute;
    top: -3px; left: 1px;
    width: 3px; height: 3px;
    background: var(--accent3, #61ffd4);
    clip-path: polygon(50% 0%, 100% 100%, 0% 100%);
  }
  .b-arm {
    position: absolute; top: 2px;
    width: 5px; height: 14px;
    background: #111122;
    border: 1px solid #33335a;
  }
  .b-arm.l { left:  -6px; transform: rotate( 6deg); transform-origin: top center; }
  .b-arm.r { right: -6px; transform: rotate(-6deg); transform-origin: top center; }
  /* Silver tray on right arm */
  .b-tray {
    position: absolute;
    bottom: 0px; right: -18px;
    width: 22px; height: 3px;
    background: #999aaa;
    border: 1px solid #bbbbcc;
    border-radius: 1px;
  }
  .b-tray-cup {
    position: absolute;
    top: -6px; left: 50%; transform: translateX(-50%);
    width: 8px; height: 6px;
    background: #cc8855;
    border: 1px solid #ee9966;
    border-radius: 2px 2px 0 0;
  }
  .b-tray-cup::after { /* steam */
    content: '~';
    position: absolute;
    top: -8px; left: 1px;
    font-size: 6px;
    color: rgba(255,255,255,.35);
    animation: steam 1.6s infinite alternate;
  }
  @keyframes steam { from{opacity:.1;transform:translateY(0)} to{opacity:.5;transform:translateY(-2px)} }

  /* Legs */
  .b-legs {
    display: flex; gap: 2px;
    margin-top: -1px;
  }
  .b-leg {
    width: 8px; height: 12px;
    background: #111122;
    border: 2px solid #33335a;
  }

  /* Shoes */
  .b-shoes { display: flex; gap: 2px; }
  .b-shoe {
    width: 10px; height: 5px;
    background: #0a0a14;
    border: 1px solid #33335a;
    border-radius: 0 2px 2px 0;
  }

  /* Shadow */
  .b-shadow {
    position: absolute;
    bottom: -6px; left: 50%;
    transform: translateX(-50%);
    width: 30px; height: 5px;
    background: rgba(0,0,0,.3);
    border-radius: 50%;
    filter: blur(2px);
  }

  /* ════ Label ════ */
  .butler-label {
    font-family: var(--font-main, monospace);
    font-size: 5px;
    color: var(--text2, #8888cc);
    margin-top: 3px;
    letter-spacing: 2px;
    pointer-events: none;
  }

  /* ════ Ask Modal ════ */
  .butler-modal {
    position: fixed; inset: 0;
    background: rgba(0,0,0,.72);
    display: flex;
    align-items: center; justify-content: center;
    z-index: 900;
    pointer-events: auto;
    backdrop-filter: blur(4px);
  }
  .butler-modal.hidden { display: none !important; }

  .butler-modal-box {
    background: var(--panel, #1a1a35);
    border: 2px solid var(--border2, #4a4aaa);
    box-shadow: 4px 4px 0 var(--accent, #7b61ff), 0 0 40px rgba(123,97,255,.3);
    width: min(92vw, 420px);
    padding: 28px 24px 20px;
    display: flex; flex-direction: column; gap: 14px;
    animation: modalIn .2s ease;
  }
  @keyframes modalIn {
    from { transform: translateY(14px) scale(.96); opacity:0; }
    to   { transform: translateY(0)    scale(1);   opacity:1; }
  }

  .butler-modal-title {
    font-family: var(--font-main, monospace);
    font-size: 14px;
    color: var(--accent3, #61ffd4);
    text-shadow: 2px 2px 0 var(--accent, #7b61ff);
    letter-spacing: 2px; text-align: center;
  }
  .butler-modal-sub {
    font-family: var(--font-main, monospace);
    font-size: 8px;
    color: var(--text2, #8888cc);
    text-align: center;
  }

  .butler-textarea {
    background: var(--bg2, #13132b);
    border: 2px solid var(--border2, #4a4aaa);
    color: var(--accent3, #61ffd4);
    font-family: var(--font-main, monospace);
    font-size: 9px;
    padding: 10px 12px;
    resize: none; outline: none;
    line-height: 1.75; width: 100%;
  }
  .butler-textarea:focus {
    border-color: var(--accent3, #61ffd4);
    box-shadow: 0 0 0 2px rgba(97,255,212,.15);
  }
  .butler-textarea::placeholder { color: var(--text2, #8888cc); }

  .butler-modal-actions { display: flex; gap: 8px; }

  .butler-btn {
    font-family: var(--font-main, monospace);
    font-size: 9px; padding: 10px 16px;
    border: none; cursor: pointer; flex: 1;
    transition: transform .1s, box-shadow .1s;
  }
  .butler-btn.primary {
    background: var(--accent, #7b61ff); color: #fff;
    box-shadow: 3px 3px 0 #3a2dbf;
  }
  .butler-btn.primary:hover  { transform: translate(-1px,-1px); box-shadow: 4px 4px 0 #3a2dbf; }
  .butler-btn.primary:active { transform: translate(1px,1px);   box-shadow: 1px 1px 0 #3a2dbf; }
  .butler-btn.primary:disabled { opacity:.5; cursor:not-allowed; transform:none; box-shadow:none; }
  .butler-btn.secondary {
    background: transparent;
    color: var(--text2, #8888cc);
    border: 2px solid var(--border, #2e2e6e);
  }
  .butler-btn.secondary:hover { border-color: var(--border2,#4a4aaa); color: var(--text,#e8e8ff); }

  /* Loading */
  .butler-loading {
    font-family: var(--font-main, monospace);
    font-size: 7px;
    color: var(--accent2, #ff6eb4);
    text-align: center;
    display: flex; align-items: center;
    justify-content: center; gap: 5px;
    letter-spacing: 1px;
  }
  .butler-loading.hidden { display: none !important; }
  .butler-loading .dot {
    width: 4px; height: 4px;
    background: var(--accent2, #ff6eb4);
    display: inline-block;
    animation: dotBounce .8s infinite;
  }
  .butler-loading .dot:nth-child(2) { animation-delay: .18s; }
  .butler-loading .dot:nth-child(3) { animation-delay: .36s; }
  @keyframes dotBounce {
    0%,100% { transform: translateY(0);   opacity: 1;  }
    50%      { transform: translateY(-4px); opacity: .5; }
  }

  /* Utility */
  .hidden { display: none !important; }
  `;
  document.head.appendChild(s);
}