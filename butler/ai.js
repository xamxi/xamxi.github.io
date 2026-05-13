// ── ai.js ────────────────────────────────────────────────────────────────────
// Mr.Buttler — AI reply function for the Working/Chat Room.
//─────────────────────────────────────────────────────────────────────────────

// ✅ Points to your Cloudflare Worker — no token or system prompt needed here
const API_URL = "https://fowd.duongduc-ctb.workers.dev";

// ── In-memory conversation history ──────────────────────────────────────────
export const conversationHistory = [];

// ── Sensitive-data masking ───────────────────────────────────────────────────
const PATTERNS = [
    { regex: /(\+84|0)(3[2-9]|5[6-9]|7[06-9]|8[0-9]|9[0-9])\d{7}\b/g, label: "PHONE" },
    { regex: /\+?\d[\d\s\-().]{8,}\d/g, label: "PHONE" },
    { regex: /\b[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}\b/g, label: "EMAIL" },
    { regex: /\b\d{9}\b|\b\d{12}\b/g, label: "ID_NUMBER" },
    { regex: /\b(?:\d{4}[\s\-]?){3}\d{4}\b/g, label: "CARD_NUMBER" },
];

function maskSensitive(text) {
    const vault = {};
    const counter = {};

    for (const { regex, label } of PATTERNS) {
        text = text.replace(regex, (match) => {
            if (match.startsWith("[") && match.endsWith("]")) return match;
            const idx = counter[label] ?? 0;
            counter[label] = idx + 1;
            const token = `[${label}_${idx}]`;
            vault[token] = match;
            return token;
        });
    }

    return { masked: text, vault };
}

function restoreSensitive(text, vault) {
    for (const token in vault) {
        text = text.replaceAll(token, vault[token]);
    }
    return text;
}

// ── Core API call ────────────────────────────────────────────────────────────
/**
 * Send a message to Mr.Buttler and get a reply.
 *
 * @param {string} userMessage  - Raw user input.
 * @param {Array}  history      - Conversation history (defaults to module-level array).
 * @returns {Promise<string>}   - Butler's reply (sensitive data restored).
 */
export async function butlerReply(userMessage, history = conversationHistory) {
    const { masked, vault } = maskSensitive(userMessage);

    // No system message here — Worker injects it from its env
    const messages = [
        ...history,
        { role: "user", content: masked },
    ];

    const res = await fetch(API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "qwen/qwen3-32b",
            messages,
            max_tokens: 512,
            temperature: 0.8,
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Buttler API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    const rawReply = data.choices[0].message.content
        .replace(/<think>[\s\S]*?<\/think>/g, "")
        .trim();
    const finalReply = restoreSensitive(rawReply, vault);

    history.push({ role: "user", content: masked });
    history.push({ role: "assistant", content: rawReply });

    return finalReply;
}