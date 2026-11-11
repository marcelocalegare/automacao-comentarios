/**
 * Instagram: comentário com palavra-chave → DM (private reply) com link.
 * Roda no Cloudflare Workers (plano gratuito).
 *
 * Variáveis/segredos (ver README):
 *   VERIFY_TOKEN       - texto que você inventa e cola no painel da Meta
 *   APP_SECRET         - "App Secret" do app na Meta (valida a assinatura)
 *   IG_TOKEN           - token de acesso de longa duração da conta Instagram
 *   IG_USER_ID         - ID da sua conta profissional do Instagram
 *   GRAPH_VERSION      - ex.: v23.0 (confira a versão atual na doc da Meta)
 *   DASHBOARD_PASSWORD - senha do painel /dashboard (Basic Auth)
 *   DASHBOARD_USER     - usuário do painel (opcional, padrão "admin")
 * KV opcional:
 *   SEEN               - namespace KV para não responder o mesmo comentário 2x e rate limit
 * D1 opcional:
 *   DB                 - banco para histórico do painel (/dashboard)
 */

import { renderDashboardHtml } from "./dashboard.js";
import { recordEvent, getStats, getEvents } from "./db.js";

// ====== CONFIGURE AQUI ======
// Cada regra: se o comentário contiver alguma palavra-chave, envia a DM.
// mediaIds vazio = vale para qualquer post. Preencha para limitar a posts específicos.
// dm e publicReply aceitam uma string única ou uma lista — com lista, uma é sorteada por comentário.
const RULES = [
  {
    keywords: [
      "link", "linck", "linki", "lynk",
      "quero", "qero", "kero", "qro",
      "eu quero", "eu qero", "eu kero",
      "manda", "me manda", "manda o link", "manda pra mim",
    ],
    mediaIds: [],
    dm: [
      "Oi! 👋 Aqui está o link que você pediu:\nhttps://seulink.com",
      "E aí! Segue o link certinho pra você:\nhttps://seulink.com",
      "Opa, chegou! Aqui está o link:\nhttps://seulink.com"
    ],
    publicReply: ["Te mandei no direct! 📩", "Olha a caixinha de mensagens! 📩", "Te chamei no direct! 📩"], // "" para não responder publicamente
  },
];
// ============================

function pickRandom(value) {
  if (Array.isArray(value)) return value[Math.floor(Math.random() * value.length)];
  return value;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Word-boundary Unicode-aware match: evita "kero" casar dentro de outra palavra.
function matchesKeyword(text, keyword) {
  const pattern = `(?<![\\p{L}\\p{N}])${escapeRegex(keyword.toLowerCase())}(?![\\p{L}\\p{N}])`;
  return new RegExp(pattern, "u").test(text);
}

function log(level, event, data = {}) {
  const line = JSON.stringify({ level, event, ts: new Date().toISOString(), ...data });
  if (level === "error") console.error(line);
  else console.log(line);
}

async function fetchWithRetry(url, options, attempts = 3, baseDelayMs = 300) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, options);
      // Erros 4xx são do pedido em si (token inválido, já respondido, etc.) — retry não ajuda.
      if (res.ok || (res.status >= 400 && res.status < 500)) return res;
      lastErr = new Error(`HTTP ${res.status}: ${await res.text()}`);
    } catch (err) {
      lastErr = err;
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** i));
    }
  }
  throw lastErr;
}

// Limite simples de envios por usuário, pra conter loop/abuso (só ativo se SEEN estiver configurado).
async function isRateLimited(fromId, env, maxPerWindow = 5, windowSeconds = 3600) {
  if (!env.SEEN || !fromId) return false;
  const key = `rl:${fromId}`;
  const current = parseInt((await env.SEEN.get(key)) || "0", 10);
  if (current >= maxPerWindow) return true;
  await env.SEEN.put(key, String(current + 1), { expirationTtl: windowSeconds });
  return false;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/dashboard") {
      if (!checkDashboardAuth(request, env)) return unauthorized();
      return new Response(renderDashboardHtml(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (request.method === "GET" && url.pathname === "/api/stats") {
      if (!checkDashboardAuth(request, env)) return unauthorized();
      const days = Number(url.searchParams.get("days") || "30");
      const stats = await getStats(env, days);
      return Response.json(stats);
    }

    if (request.method === "GET" && url.pathname === "/api/events") {
      if (!checkDashboardAuth(request, env)) return unauthorized();
      const limit = Number(url.searchParams.get("limit") || "50");
      const cursorParam = url.searchParams.get("cursor");
      const type = url.searchParams.get("type") || null;
      const result = await getEvents(env, {
        limit,
        cursor: cursorParam ? Number(cursorParam) : null,
        type,
      });
      return Response.json(result);
    }

    // 1) Verificação do webhook (Meta faz um GET ao configurar)
    if (request.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      if (mode === "subscribe" && token === env.VERIFY_TOKEN) {
        return new Response(challenge, { status: 200 });
      }
      return new Response("Forbidden", { status: 403 });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // 2) Valida assinatura X-Hub-Signature-256
    const raw = await request.text();
    const sig = request.headers.get("x-hub-signature-256") || "";
    if (!(await validSignature(raw, sig, env.APP_SECRET))) {
      return new Response("Invalid signature", { status: 401 });
    }

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    // Responde 200 rápido; processa em segundo plano
    ctx.waitUntil(handleEvent(body, env));
    return new Response("EVENT_RECEIVED", { status: 200 });
  },
};

async function handleEvent(body, env) {
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== "comments") continue;
      const value = change.value || {};
      try {
        await handleComment(value, env);
      } catch (err) {
        const errorMessage = String(err?.message || err);
        log("error", "process_comment_failed", { error: errorMessage });
        await recordEvent(env, {
          type: "process_comment_failed",
          commentId: value.id,
          fromId: value.from?.id,
          username: value.from?.username,
          mediaId: value.media?.id,
          errorMessage,
        });
      }
    }
  }
}

async function handleComment(value, env) {
  const commentId = value.id;
  const text = (value.text || "").toLowerCase();
  const fromId = value.from?.id;
  const mediaId = value.media?.id;

  if (!commentId || !text) return;

  // Ignora comentários da própria conta (evita loop com a resposta pública)
  if (fromId && String(fromId) === String(env.IG_USER_ID)) return;

  const rule = RULES.find(
    (r) =>
      (r.mediaIds.length === 0 || r.mediaIds.includes(mediaId)) &&
      r.keywords.some((k) => matchesKeyword(text, k))
  );
  if (!rule) return;

  // Evita duplicar (a Meta pode reenviar o mesmo evento)
  if (env.SEEN) {
    if (await env.SEEN.get(commentId)) return;
    await env.SEEN.put(commentId, "1", { expirationTtl: 60 * 60 * 24 * 8 });
  }

  if (await isRateLimited(fromId, env)) {
    log("warn", "rate_limited", { commentId, fromId });
    await recordEvent(env, {
      type: "rate_limited",
      commentId,
      fromId,
      username: value.from?.username,
      mediaId,
      ruleIndex: RULES.indexOf(rule),
      textSnippet: text.slice(0, 140),
    });
    return;
  }

  await sendPrivateReply(commentId, pickRandom(rule.dm), env);

  const publicReply = pickRandom(rule.publicReply);
  if (publicReply) {
    await replyToComment(commentId, publicReply, env);
  }

  log("info", "dm_sent", { commentId, username: value.from?.username, fromId });
  await recordEvent(env, {
    type: "dm_sent",
    commentId,
    fromId,
    username: value.from?.username,
    mediaId,
    ruleIndex: RULES.indexOf(rule),
    textSnippet: text.slice(0, 140),
  });
}

// DM para quem comentou (private reply)
async function sendPrivateReply(commentId, message, env) {
  const endpoint = `https://graph.facebook.com/${env.GRAPH_VERSION}/${env.IG_USER_ID}/messages`;
  const res = await fetchWithRetry(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.IG_TOKEN}`,
    },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: { text: message },
    }),
  });
  if (!res.ok) {
    throw new Error(`Falha na private reply: ${res.status} ${await res.text()}`);
  }
}

// Resposta pública no comentário (opcional)
async function replyToComment(commentId, message, env) {
  const endpoint = `https://graph.facebook.com/${env.GRAPH_VERSION}/${commentId}/replies`;
  const res = await fetchWithRetry(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.IG_TOKEN}`,
    },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    log("error", "public_reply_failed", { commentId, status: res.status, body: errBody });
    await recordEvent(env, {
      type: "public_reply_failed",
      commentId,
      errorMessage: `HTTP ${res.status}: ${errBody}`,
    });
  }
}

function checkDashboardAuth(request, env) {
  if (!env.DASHBOARD_PASSWORD) return false;
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Basic ")) return false;
  let decoded;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }
  const sepIdx = decoded.indexOf(":");
  if (sepIdx === -1) return false;
  const user = decoded.slice(0, sepIdx);
  const pass = decoded.slice(sepIdx + 1);
  const expectedUser = env.DASHBOARD_USER || "admin";
  return timingSafeEqual(user, expectedUser) && timingSafeEqual(pass, env.DASHBOARD_PASSWORD);
}

function unauthorized() {
  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="dashboard"' },
  });
}

async function validSignature(raw, header, secret) {
  if (!secret || !header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const expected =
    "sha256=" +
    [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(expected, header);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
