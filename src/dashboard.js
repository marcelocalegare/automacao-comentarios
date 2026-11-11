import { LOGO_DATA_URI } from "./logo.js";

const TYPE_LABELS = {
  dm_sent: { icon: "✓", label: "DM enviada" },
  rate_limited: { icon: "⚠", label: "Bloqueio (rate limit)" },
  process_comment_failed: { icon: "✕", label: "Erro no processamento" },
  public_reply_failed: { icon: "✕", label: "Erro na resposta pública" },
};

export function renderDashboardHtml() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Painel — Automação Instagram</title>
<style>
  :root {
    --bg: #ffffff;
    --surface: #ffffff;
    --ink: #000000;
    --ink-muted: #595959;
    --ink-faint: #8a8a8a;
    --border: #e2e2e2;
    --grid: #ececec;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #000000;
      --surface: #000000;
      --ink: #ffffff;
      --ink-muted: #b3b3b3;
      --ink-faint: #797979;
      --border: #2b2b2b;
      --grid: #232323;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .wrap { max-width: 980px; margin: 0 auto; padding: 24px 20px 64px; }
  header.top {
    display: flex;
    align-items: center;
    gap: 14px;
    padding-bottom: 20px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 24px;
  }
  header.top img { width: 40px; height: 40px; border-radius: 8px; display: block; }
  header.top h1 { font-size: 18px; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
  header.top .sub { color: var(--ink-muted); font-size: 13px; margin-top: 2px; }
  .controls { margin-left: auto; display: flex; gap: 8px; align-items: center; }
  select {
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 13px;
  }
  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; margin-bottom: 24px; }
  .tile { background: var(--surface); padding: 16px; }
  .tile .value { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }
  .tile .label { font-size: 12px; color: var(--ink-muted); margin-top: 4px; }
  section.card {
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px 20px;
    margin-bottom: 20px;
  }
  section.card h2 { font-size: 14px; font-weight: 600; margin: 0 0 14px; }
  #chart { width: 100%; height: 220px; display: block; }
  .chart-tooltip {
    position: absolute;
    pointer-events: none;
    background: var(--ink);
    color: var(--bg);
    font-size: 11px;
    padding: 4px 8px;
    border-radius: 4px;
    transform: translate(-50%, -130%);
    white-space: nowrap;
    opacity: 0;
    transition: opacity 0.1s;
  }
  .chart-wrap { position: relative; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: var(--ink-muted); font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; padding: 8px 10px; border-bottom: 1px solid var(--border); }
  td { padding: 9px 10px; border-bottom: 1px solid var(--grid); vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .mono { font-variant-numeric: tabular-nums; color: var(--ink-muted); font-size: 12px; }
  .status-ok { color: var(--ink); }
  .status-warn, .status-err { color: var(--ink); }
  .empty { color: var(--ink-faint); font-size: 13px; padding: 20px 0; text-align: center; }
  .loadmore { display: block; margin: 14px auto 0; background: none; border: 1px solid var(--border); color: var(--ink); border-radius: 6px; padding: 8px 16px; font-size: 13px; cursor: pointer; }
  .loadmore:hover { background: var(--grid); }
  footer { color: var(--ink-faint); font-size: 11px; text-align: center; margin-top: 32px; }
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <img src="${LOGO_DATA_URI}" alt="logo" />
    <div>
      <h1>Automação Instagram</h1>
      <div class="sub">Painel de monitoramento</div>
    </div>
    <div class="controls">
      <select id="days">
        <option value="7">7 dias</option>
        <option value="30" selected>30 dias</option>
        <option value="90">90 dias</option>
      </select>
    </div>
  </header>

  <div class="tiles">
    <div class="tile"><div class="value" id="t-sent">—</div><div class="label">DMs enviadas</div></div>
    <div class="tile"><div class="value" id="t-errors">—</div><div class="label">Erros</div></div>
    <div class="tile"><div class="value" id="t-rl">—</div><div class="label">Bloqueios (rate limit)</div></div>
    <div class="tile"><div class="value" id="t-rate">—</div><div class="label">Taxa de sucesso</div></div>
  </div>

  <section class="card">
    <h2>DMs enviadas por dia</h2>
    <div class="chart-wrap">
      <svg id="chart" viewBox="0 0 860 220" preserveAspectRatio="none"></svg>
      <div class="chart-tooltip" id="tooltip"></div>
    </div>
  </section>

  <section class="card">
    <h2>Eventos recentes</h2>
    <div style="margin-bottom:10px;">
      <select id="type-filter">
        <option value="">Todos os tipos</option>
        <option value="dm_sent">DM enviada</option>
        <option value="rate_limited">Bloqueio (rate limit)</option>
        <option value="process_comment_failed">Erro no processamento</option>
        <option value="public_reply_failed">Erro na resposta pública</option>
      </select>
    </div>
    <table>
      <thead>
        <tr><th>Quando</th><th>Status</th><th>Usuário</th><th>Comentário</th><th>Detalhe</th></tr>
      </thead>
      <tbody id="events-body"></tbody>
    </table>
    <div class="empty" id="events-empty" style="display:none;">Sem dados — banco D1 não configurado ou sem eventos ainda.</div>
    <button class="loadmore" id="load-more" style="display:none;">Carregar mais</button>
  </section>

  <footer>Dados retidos conforme histórico do D1. Atualize a página para ver eventos novos.</footer>
</div>

<script>
const TYPE_META = ${JSON.stringify(TYPE_LABELS)};

function fmtPct(v) { return v === null || v === undefined ? "—" : Math.round(v * 100) + "%"; }
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

async function loadStats(days) {
  const res = await fetch("/api/stats?days=" + days);
  if (!res.ok) return;
  const data = await res.json();
  if (!data) {
    document.getElementById("t-sent").textContent = "—";
    return;
  }
  document.getElementById("t-sent").textContent = data.totals.dmSent;
  document.getElementById("t-errors").textContent = data.totals.errors;
  document.getElementById("t-rl").textContent = data.totals.rateLimited;
  document.getElementById("t-rate").textContent = fmtPct(data.totals.successRate);
  drawChart(data.daily, days);
}

function drawChart(daily, days) {
  const svg = document.getElementById("chart");
  const tooltip = document.getElementById("tooltip");
  svg.innerHTML = "";

  const n = Number(days);
  const series = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const found = (daily || []).find((row) => row.date === key);
    series.push({ date: key, value: found ? (found.dm_sent || 0) : 0 });
  }

  const W = 860, H = 220, padL = 28, padR = 10, padT = 10, padB = 24;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const maxVal = Math.max(1, ...series.map((s) => s.value));

  const x = (i) => padL + (i / Math.max(1, series.length - 1)) * innerW;
  const y = (v) => padT + innerH - (v / maxVal) * innerH;

  const ns = "http://www.w3.org/2000/svg";
  const styleInk = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
  const styleGrid = getComputedStyle(document.documentElement).getPropertyValue("--grid").trim();
  const styleMuted = getComputedStyle(document.documentElement).getPropertyValue("--ink-muted").trim();

  // Gridlines horizontais (recessivas)
  const gridLines = 4;
  for (let g = 0; g <= gridLines; g++) {
    const gy = padT + (g / gridLines) * innerH;
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", padL); line.setAttribute("x2", W - padR);
    line.setAttribute("y1", gy); line.setAttribute("y2", gy);
    line.setAttribute("stroke", styleGrid); line.setAttribute("stroke-width", "1");
    svg.appendChild(line);
  }

  // Linha da série
  const path = document.createElementNS(ns, "path");
  const d = series.map((s, i) => (i === 0 ? "M" : "L") + x(i).toFixed(1) + " " + y(s.value).toFixed(1)).join(" ");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", styleInk);
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);

  // Rótulos de eixo X esparsos
  const labelEvery = Math.ceil(series.length / 6);
  series.forEach((s, i) => {
    if (i % labelEvery !== 0 && i !== series.length - 1) return;
    const t = document.createElementNS(ns, "text");
    t.setAttribute("x", x(i)); t.setAttribute("y", H - 6);
    t.setAttribute("font-size", "10"); t.setAttribute("fill", styleMuted);
    t.setAttribute("text-anchor", i === series.length - 1 ? "end" : "middle");
    t.textContent = s.date.slice(5);
    svg.appendChild(t);
  });

  // Camada de hover: crosshair + tooltip
  const hitLine = document.createElementNS(ns, "line");
  hitLine.setAttribute("y1", padT); hitLine.setAttribute("y2", H - padB);
  hitLine.setAttribute("stroke", styleMuted); hitLine.setAttribute("stroke-width", "1");
  hitLine.setAttribute("opacity", "0");
  svg.appendChild(hitLine);

  const overlay = document.createElementNS(ns, "rect");
  overlay.setAttribute("x", padL); overlay.setAttribute("y", padT);
  overlay.setAttribute("width", innerW); overlay.setAttribute("height", innerH);
  overlay.setAttribute("fill", "transparent");
  overlay.addEventListener("mousemove", (ev) => {
    const rect = svg.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * W;
    const idx = Math.max(0, Math.min(series.length - 1, Math.round(((px - padL) / innerW) * (series.length - 1))));
    const s = series[idx];
    hitLine.setAttribute("x1", x(idx)); hitLine.setAttribute("x2", x(idx)); hitLine.setAttribute("opacity", "1");
    tooltip.style.opacity = "1";
    tooltip.style.left = ((x(idx) / W) * rect.width) + "px";
    tooltip.style.top = ((y(s.value) / H) * rect.height) + "px";
    tooltip.textContent = s.date + " — " + s.value + " DM(s)";
  });
  overlay.addEventListener("mouseleave", () => {
    hitLine.setAttribute("opacity", "0");
    tooltip.style.opacity = "0";
  });
  svg.appendChild(overlay);
}

let cursor = null;
let currentType = "";

async function loadEvents(reset) {
  if (reset) { cursor = null; document.getElementById("events-body").innerHTML = ""; }
  const params = new URLSearchParams({ limit: "25" });
  if (cursor) params.set("cursor", cursor);
  if (currentType) params.set("type", currentType);
  const res = await fetch("/api/events?" + params.toString());
  if (!res.ok) return;
  const data = await res.json();
  const tbody = document.getElementById("events-body");
  const empty = document.getElementById("events-empty");
  const loadMore = document.getElementById("load-more");

  if (reset && data.events.length === 0) {
    empty.style.display = "block";
    loadMore.style.display = "none";
    return;
  }
  empty.style.display = "none";

  for (const ev of data.events) {
    const meta = TYPE_META[ev.type] || { icon: "•", label: ev.type };
    const tr = document.createElement("tr");
    tr.innerHTML =
      "<td class=\\"mono\\">" + fmtDate(ev.ts) + "</td>" +
      "<td>" + meta.icon + " " + meta.label + "</td>" +
      "<td>" + (ev.username ? "@" + ev.username : "—") + "</td>" +
      "<td class=\\"mono\\">" + (ev.comment_id || "—") + "</td>" +
      "<td>" + (ev.error_message || ev.text_snippet || "—") + "</td>";
    tbody.appendChild(tr);
  }

  cursor = data.nextCursor;
  loadMore.style.display = cursor ? "block" : "none";
}

document.getElementById("days").addEventListener("change", (e) => loadStats(e.target.value));
document.getElementById("type-filter").addEventListener("change", (e) => {
  currentType = e.target.value;
  loadEvents(true);
});
document.getElementById("load-more").addEventListener("click", () => loadEvents(false));

loadStats(document.getElementById("days").value);
loadEvents(true);
</script>
</body>
</html>`;
}
