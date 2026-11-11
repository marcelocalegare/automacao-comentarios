// Persistência de eventos no D1 (opcional — painel funciona em modo degradado sem o binding DB).

export async function recordEvent(env, fields) {
  if (!env.DB) return;
  const {
    type,
    commentId = null,
    fromId = null,
    username = null,
    mediaId = null,
    ruleIndex = null,
    textSnippet = null,
    errorMessage = null,
  } = fields;
  try {
    await env.DB.prepare(
      `INSERT INTO events (ts, type, comment_id, from_id, username, media_id, rule_index, text_snippet, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        new Date().toISOString(),
        type,
        commentId,
        fromId,
        username,
        mediaId,
        ruleIndex,
        textSnippet,
        errorMessage
      )
      .run();
  } catch (err) {
    console.error(JSON.stringify({ level: "error", event: "d1_write_failed", error: String(err?.message || err) }));
  }
}

export async function getStats(env, days = 30) {
  if (!env.DB) return null;
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const totalsRes = await env.DB.prepare(
    `SELECT type, COUNT(*) as count FROM events WHERE ts >= ? GROUP BY type`
  )
    .bind(since)
    .all();

  const totals = {};
  for (const row of totalsRes.results || []) totals[row.type] = row.count;

  const dailyRes = await env.DB.prepare(
    `SELECT substr(ts, 1, 10) as day, type, COUNT(*) as count
     FROM events WHERE ts >= ? GROUP BY day, type ORDER BY day ASC`
  )
    .bind(since)
    .all();

  const dailyMap = new Map();
  for (const row of dailyRes.results || []) {
    if (!dailyMap.has(row.day)) dailyMap.set(row.day, { date: row.day });
    dailyMap.get(row.day)[row.type] = row.count;
  }

  const dmSent = totals.dm_sent || 0;
  const errors = (totals.process_comment_failed || 0) + (totals.public_reply_failed || 0);
  const rateLimited = totals.rate_limited || 0;
  const successRate = dmSent + errors > 0 ? dmSent / (dmSent + errors) : null;

  return {
    since,
    totals: { dmSent, errors, rateLimited, successRate },
    daily: [...dailyMap.values()],
  };
}

export async function getEvents(env, { limit = 50, cursor = null, type = null } = {}) {
  if (!env.DB) return { events: [], nextCursor: null };
  const safeLimit = Math.min(Math.max(limit, 1), 200);

  const conditions = [];
  const params = [];
  if (type) {
    conditions.push("type = ?");
    params.push(type);
  }
  if (cursor) {
    conditions.push("id < ?");
    params.push(cursor);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const res = await env.DB.prepare(
    `SELECT * FROM events ${where} ORDER BY id DESC LIMIT ?`
  )
    .bind(...params, safeLimit + 1)
    .all();

  const rows = res.results || [];
  const hasMore = rows.length > safeLimit;
  const events = hasMore ? rows.slice(0, safeLimit) : rows;
  const nextCursor = hasMore ? events[events.length - 1].id : null;

  return { events, nextCursor };
}
