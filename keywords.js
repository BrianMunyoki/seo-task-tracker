// ===== Keywords: daily positions, ranking URL history, links =====
// Uses globals from app.js: data, save, render, $, escapeHtml, today, addDays, projectFilter

const KW_PERIODS = [
  ["daily", "Daily", 1],
  ["weekly", "7 days", 7],
  ["biweekly", "14 days", 14],
  ["monthly", "28 days", 28],
  ["6months", "6 months", 180],
  ["yearly", "12 months", 365],
];
const LINK_TYPES = ["Editorial contribution", "Niche edit", "Directory / citation", "PR / news", "Forum / community", "Other"];
const LOCATIONS = ["Kenya", "Nairobi", "Mombasa", "Kisumu", "Nakuru", "Uganda", "Tanzania"];

let kwPeriod = "weekly";
let kwTab = "rankings"; // "rankings" or "links"
let kwOpenId = null;    // keyword open in the detail window

// ---------- helpers ----------
function kwList() {
  data.keywords = data.keywords || [];
  return data.keywords;
}
const kwById = (id) => kwList().find((k) => k.id === id);
const kwVisible = () => kwList().filter((k) => projectFilter === "All" || k.project === projectFilter);
const normUrl = (u) => String(u || "").trim().toLowerCase()
  .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
const shortUrl = (u) => {
  const s = String(u || "").replace(/^https?:\/\/(www\.)?/, "");
  return s.length > 48 ? s.slice(0, 45) + "..." : s;
};
const fmtNum = (n) => (n || n === 0 ? Number(n).toLocaleString() : "-");
const fmtPos = (p) => (p == null ? "-" : p);

// History is stored compactly: history["YYYY-MM-DD"] = [position or null, index into k.urls]
function kwEntries(k) {
  const h = k.history || {};
  return Object.keys(h).sort().map((date) => {
    const [pos, ui] = h[date];
    return { date, pos, url: ui == null ? "" : k.urls[ui] };
  });
}
function setRank(k, date, pos, url) {
  k.history = k.history || {};
  k.urls = k.urls || [];
  let ui = null;
  if (url) {
    ui = k.urls.indexOf(url);
    if (ui < 0) { k.urls.push(url); ui = k.urls.length - 1; }
  }
  k.history[date] = [pos, ui];
}
const latest = (k) => kwEntries(k).slice(-1)[0] || null;
const isWrongPage = (k, url) => url && k.targetUrl && normUrl(url) !== normUrl(k.targetUrl);

// Average position over a date range (days the keyword ranked), like Search Console
function avgPos(k, from, to) {
  const vals = kwEntries(k).filter((e) => e.date >= from && e.date <= to && e.pos != null).map((e) => e.pos);
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
}

// Current vs previous period
function periodStats(k, periodKey = kwPeriod) {
  const days = KW_PERIODS.find((p) => p[0] === periodKey)[2];
  if (days === 1) {
    const es = kwEntries(k);
    return { cur: es.length ? es[es.length - 1].pos : null, prev: es.length > 1 ? es[es.length - 2].pos : null };
  }
  const end = today();
  return {
    cur: avgPos(k, addDays(end, -(days - 1)), end),
    prev: avgPos(k, addDays(end, -(2 * days - 1)), addDays(end, -days)),
  };
}
function changeHtml({ cur, prev }) {
  if (cur == null || prev == null) return "";
  const diff = Math.round((prev - cur) * 10) / 10; // positive = moved up
  if (diff > 0) return `<span class="up">▲ ${diff}</span>`;
  if (diff < 0) return `<span class="down">▼ ${Math.abs(diff)}</span>`;
  return `<span class="muted">=</span>`;
}

function newKeywordId() {
  const id = Math.max(data.nextKeywordId || 1, ...kwList().map((k) => k.id + 1));
  data.nextKeywordId = id + 1;
  return id;
}
function ensureProject(name) {
  name = String(name || "").trim();
  if (!name) return data.projects[0];
  if (!data.projects.includes(name)) data.projects.push(name);
  return name;
}

// ---------- main page ----------
function renderKeywords() {
  const list = kwVisible();
  const lat = list.map(latest);
  const ranked = lat.filter((e) => e && e.pos != null);
  const avgs = list.map((k) => periodStats(k).cur).filter((v) => v != null);
  const periodLabel = KW_PERIODS.find((p) => p[0] === kwPeriod)[1];
  const linkCount = list.reduce((s, k) => s + (k.links || []).length, 0);

  return `
    <div class="box">
      <div class="sprint-top">
        <div>
          <h2>Keywords</h2>
          <div class="muted">${projectFilter === "All" ? "All projects" : escapeHtml(projectFilter)} · ${list.length} tracked</div>
        </div>
        <div class="header-tools">
          <button id="kwAddBtn">+ Add keyword</button>
          <button id="kwDailyBtn" class="primary">Daily update</button>
        </div>
      </div>
      <div class="stats">
        <div><b>${avgs.length ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 10) / 10 : "-"}</b><span class="muted">Avg position (${periodLabel})</span></div>
        <div><b>${ranked.filter((e) => e.pos <= 3).length}</b><span class="muted">Top 3</span></div>
        <div><b>${ranked.filter((e) => e.pos <= 10).length}</b><span class="muted">Top 10</span></div>
        <div><b class="${list.some((k, i) => lat[i] && isWrongPage(k, lat[i].url)) ? "warn" : ""}">${list.filter((k, i) => lat[i] && isWrongPage(k, lat[i].url)).length}</b><span class="muted">Ranking on wrong URL</span></div>
        <div><b>${list.filter((k, i) => !lat[i] || lat[i].pos == null).length}</b><span class="muted">Not ranking / no data</span></div>
        <div><b>${linkCount}</b><span class="muted">Links built</span></div>
      </div>
    </div>

    <div class="kw-bar">
      <div class="pill-group">
        <label><input type="radio" name="kw-tab" value="rankings" ${kwTab === "rankings" ? "checked" : ""}> Rankings</label>
        <label><input type="radio" name="kw-tab" value="links" ${kwTab === "links" ? "checked" : ""}> Links (${linkCount})</label>
      </div>
      ${kwTab === "rankings" ? `<div class="pill-group">${KW_PERIODS.map(([key, label]) =>
        `<label><input type="radio" name="kw-period" value="${key}" ${kwPeriod === key ? "checked" : ""}> ${label}</label>`).join("")}</div>` : ""}
    </div>

    <div class="box">${kwTab === "links" ? allLinksTable(list) : rankingsTable(list)}</div>`;
}

function rankingsTable(list) {
  if (!list.length) return `<p class="muted">No keywords yet. Click "+ Add keyword" to start tracking.</p>`;
  const periodLabel = KW_PERIODS.find((p) => p[0] === kwPeriod)[1];
  const rows = list.slice().sort((a, b) => (b.volume || 0) - (a.volume || 0));
  return `
    <table>
      <tr>
        <th>Keyword</th>${projectFilter === "All" ? "<th>Project</th>" : ""}<th>Location</th><th>Volume</th>
        <th>Optimization URL</th><th>Position</th><th>${kwPeriod === "daily" ? "Change" : "Avg " + periodLabel}</th>
        <th>Ranking URL (latest)</th><th>Links</th>
      </tr>
      ${rows.map((k) => {
        const l = latest(k);
        const st = periodStats(k);
        const wrong = l && isWrongPage(k, l.url);
        const live = (k.links || []).filter((x) => x.status !== "planned").length;
        const planned = (k.links || []).length - live;
        return `
        <tr class="clickable" data-kw-open="${k.id}">
          <td><b>${escapeHtml(k.keyword)}</b></td>
          ${projectFilter === "All" ? `<td>${escapeHtml(k.project)}</td>` : ""}
          <td>${escapeHtml(k.location)}</td>
          <td>${fmtNum(k.volume)}</td>
          <td class="url-cell">${escapeHtml(shortUrl(k.targetUrl)) || "-"}</td>
          <td><b class="pos">${l ? fmtPos(l.pos) : "-"}</b>${l ? `<div class="muted">${l.date}</div>` : ""}</td>
          <td>${kwPeriod === "daily" ? changeHtml(st) || "-" : `${fmtPos(st.cur)} ${changeHtml(st)}`}</td>
          <td><div class="url-cell">${l && l.url ? escapeHtml(shortUrl(l.url)) : "-"}</div>${wrong ? `<span class="badge-warn" title="Not the optimization URL">⚠ wrong URL</span>` : ""}</td>
          <td><button class="small lens" data-kw-links="${k.id}" title="View links">🔍 ${live}${planned ? ` <span class="muted">+${planned}</span>` : ""}</button></td>
        </tr>`;
      }).join("")}
    </table>`;
}

function allLinksTable(list) {
  const links = [];
  list.forEach((k) => (k.links || []).forEach((l) => links.push({ k, l })));
  if (!links.length) return `<p class="muted">No links recorded yet. Open a keyword and add links under it.</p>`;
  links.sort((a, b) => (b.l.date || "").localeCompare(a.l.date || ""));
  return `
    <table>
      <tr><th>Date</th><th>Keyword</th><th>Optimization URL</th><th>Link from (source)</th><th>Anchor</th><th>Type</th><th>Status</th></tr>
      ${links.map(({ k, l }) => `
        <tr class="clickable" data-kw-links="${k.id}">
          <td>${l.date || "-"}</td>
          <td><b>${escapeHtml(k.keyword)}</b></td>
          <td class="url-cell">${escapeHtml(shortUrl(k.targetUrl))}</td>
          <td class="url-cell">${escapeHtml(shortUrl(l.source))}</td>
          <td>${escapeHtml(l.anchor)}</td>
          <td>${escapeHtml(l.type)}</td>
          <td>${l.status === "planned" ? `<span class="tag">Planned</span>` : `<span class="tag live">Live</span>`}</td>
        </tr>`).join("")}
    </table>`;
}

// ---------- add / edit keyword ----------
function openKeywordForm(id) {
  const k = id ? kwById(id) : null;
  const project = k ? k.project : projectFilter !== "All" ? projectFilter : "";
  $("#modal").innerHTML = `
    <form id="kwForm" data-id="${k ? k.id : ""}">
      <div class="modal-body">
        <h2>${k ? "Edit keyword" : "Add keyword"}</h2>
        <div class="field"><label>Keyword</label><input name="keyword" required value="${escapeHtml(k ? k.keyword : "")}" placeholder="e.g. beer delivery nairobi"></div>
        <div class="grid">
          <div class="field"><label>Project (pick or type a new one)</label>
            <input name="project" list="kwProjects" value="${escapeHtml(project)}" placeholder="e.g. EABL" required>
            <datalist id="kwProjects">${data.projects.map((p) => `<option value="${escapeHtml(p)}">`).join("")}</datalist>
          </div>
          <div class="field"><label>Location</label>
            <input name="location" list="kwLocations" value="${escapeHtml(k ? k.location : "Kenya")}">
            <datalist id="kwLocations">${LOCATIONS.map((l) => `<option value="${l}">`).join("")}</datalist>
          </div>
          <div class="field"><label>Monthly search volume</label><input name="volume" type="number" min="0" value="${k && k.volume != null ? k.volume : ""}"></div>
        </div>
        <div class="field"><label>Optimization URL (the page that should rank)</label>
          <input name="targetUrl" type="url" required value="${escapeHtml(k ? k.targetUrl : "")}" placeholder="https://partify.ke/...">
        </div>
      </div>
      <div class="modal-foot"><span></span>
        <span><button type="button" id="cancelBtn">Cancel</button> <button class="primary">Save</button></span>
      </div>
    </form>`;
  if (!$("#modal").open) $("#modal").showModal();
}

function saveKeywordForm(form) {
  const f = form.elements;
  const id = Number(form.dataset.id);
  const values = {
    keyword: f.keyword.value.trim(),
    project: ensureProject(f.project.value),
    location: f.location.value.trim() || "Kenya",
    volume: f.volume.value === "" ? null : Number(f.volume.value),
    targetUrl: f.targetUrl.value.trim(),
  };
  if (id) {
    Object.assign(kwById(id), values);
    save();
    openKeyword(id);
  } else {
    kwList().push({ id: newKeywordId(), ...values, createdAt: today(), history: {}, urls: [], links: [] });
    $("#modal").close();
    save();
  }
}

// ---------- daily update (every morning) ----------
function openDailyUpdate(date = today()) {
  const list = kwVisible();
  if (!list.length) return alert("Add a keyword first.");
  $("#modal").innerHTML = `
    <form id="kwDailyForm">
      <div class="modal-body">
        <h2>Daily ranking update</h2>
        <div class="field" style="max-width:200px"><label>Date</label><input type="date" id="kwDailyDate" name="date" value="${date}"></div>
        <p class="muted">Enter the position and the URL that ranks. Leave position empty to skip a keyword. Type 0 if it is not ranking (not in the top 100).</p>
        <table>
          <tr><th>Keyword</th><th style="width:90px">Position</th><th>Ranking URL</th></tr>
          ${list.map((k) => {
            const entry = kwEntries(k).find((e) => e.date === date);
            const prevUrl = (kwEntries(k).filter((e) => e.date < date && e.url).slice(-1)[0] || {}).url;
            return `
            <tr data-kw="${k.id}">
              <td><b>${escapeHtml(k.keyword)}</b><div class="muted">${escapeHtml(shortUrl(k.targetUrl))}</div></td>
              <td><input class="kw-pos" type="number" min="0" max="100" value="${entry ? (entry.pos == null ? 0 : entry.pos) : ""}" style="width:80px"></td>
              <td><input class="kw-url" type="url" value="${escapeHtml(entry ? entry.url : prevUrl || k.targetUrl)}" style="width:100%"></td>
            </tr>`;
          }).join("")}
        </table>
      </div>
      <div class="modal-foot"><span></span>
        <span><button type="button" id="cancelBtn">Cancel</button> <button class="primary">Save all</button></span>
      </div>
    </form>`;
  if (!$("#modal").open) $("#modal").showModal();
}

function saveDailyUpdate(form) {
  const date = form.elements.date.value || today();
  let count = 0;
  form.querySelectorAll("tr[data-kw]").forEach((row) => {
    const posValue = row.querySelector(".kw-pos").value;
    if (posValue === "") return;
    const pos = Number(posValue) > 0 ? Number(posValue) : null;
    setRank(kwById(Number(row.dataset.kw)), date, pos, pos == null ? "" : row.querySelector(".kw-url").value.trim());
    count++;
  });
  $("#modal").close();
  save();
  alert(`Saved ${count} keyword${count === 1 ? "" : "s"} for ${date}`);
}

// ---------- keyword detail ----------
function openKeyword(id, focus) {
  kwOpenId = id;
  renderKeywordDetail();
  if (!$("#modal").open) $("#modal").showModal();
  if (focus === "links") setTimeout(() => $("#kwLinks")?.scrollIntoView({ block: "start" }), 50);
}

function chartSvg(k) {
  const days = 90;
  const start = addDays(today(), -(days - 1));
  const points = kwEntries(k).filter((e) => e.date >= start);
  if (!points.length) return `<p class="muted">No rankings recorded in the last 90 days.</p>`;
  const W = 560, H = 150, P = 24;
  const maxPos = Math.max(10, ...points.filter((e) => e.pos != null).map((e) => e.pos));
  const x = (d) => P + (daysBetween(start, d) / (days - 1)) * (W - 2 * P);
  const y = (p) => P + ((p - 1) / (maxPos - 1)) * (H - 2 * P);
  let path = "", drawing = false;
  points.forEach((e) => {
    if (e.pos == null) { drawing = false; return; }
    path += `${drawing ? "L" : "M"}${x(e.date).toFixed(1)},${y(e.pos).toFixed(1)} `;
    drawing = true;
  });
  const dots = points.filter((e) => e.pos != null).map((e) =>
    `<circle cx="${x(e.date).toFixed(1)}" cy="${y(e.pos).toFixed(1)}" r="3" class="${isWrongPage(k, e.url) ? "dot-warn" : "dot"}"><title>${e.date}: #${e.pos}\n${e.url}</title></circle>`).join("");
  return `
    <svg viewBox="0 0 ${W} ${H}" class="kw-chart">
      <line x1="${P}" y1="${y(1)}" x2="${W - P}" y2="${y(1)}" class="grid-line"/>
      <line x1="${P}" y1="${y(Math.min(10, maxPos))}" x2="${W - P}" y2="${y(Math.min(10, maxPos))}" class="grid-line"/>
      <text x="2" y="${y(1) + 4}">1</text>
      <text x="2" y="${y(Math.min(10, maxPos)) + 4}">10</text>
      ${maxPos > 10 ? `<text x="2" y="${y(maxPos) + 4}">${maxPos}</text>` : ""}
      <text x="${P}" y="${H - 4}">${start}</text>
      <text x="${W - P}" y="${H - 4}" text-anchor="end">${today()}</text>
      <path d="${path}" class="line"/>
      ${dots}
    </svg>
    <div class="muted">Last 90 days. Orange dots = days it ranked on a different URL than the optimization URL.</div>`;
}

function daysBetween(a, b) {
  return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
}

function urlHistoryHtml(k, prevUrl) {
  const entries = kwEntries(k).filter((e) => e.url).reverse(); // newest first
  return `
    <h3>Ranking URLs</h3>
    <form id="kwRankForm" class="add-row">
      <input type="hidden" name="date" value="${today()}">
      <span class="date-chip">Today · ${today()}</span>
      <input type="url" name="url" required value="${escapeHtml(prevUrl || k.targetUrl)}" placeholder="URL ranking today" style="flex:1;min-width:240px">
      <input type="number" name="pos" min="1" max="100" placeholder="Position (optional)" style="width:150px">
      <button class="primary">Save</button>
    </form>
    ${entries.length ? `<div class="scroll-table"><table>
      <tr><th>Date</th><th>Ranking URL</th><th>Position</th><th></th></tr>
      ${entries.map((e) => `
        <tr>
          <td>${e.date}</td>
          <td class="url-cell ${isWrongPage(k, e.url) ? "wrong-url" : ""}" title="${escapeHtml(e.url)}">${isWrongPage(k, e.url) ? "⚠ " : ""}${escapeHtml(e.url)}</td>
          <td>${e.pos ?? "-"}</td>
          <td><button type="button" class="small danger" data-kw-del-rank="${e.date}" title="Delete this day">✕</button></td>
        </tr>`).join("")}
    </table></div>` : `<p class="muted">No ranking URLs yet.</p>`}`;
}

function renderKeywordDetail() {
  const k = kwById(kwOpenId);
  if (!k) return $("#modal").close();
  const entries = kwEntries(k);
  const l = entries.slice(-1)[0];
  const prevUrl = (entries.filter((e) => e.url).slice(-1)[0] || {}).url;

  // which URLs ranked for this keyword in the last 90 days (cannibalization check)
  const since = addDays(today(), -89);
  const urlDays = {};
  entries.filter((e) => e.date >= since && e.url).forEach((e) => (urlDays[e.url] = (urlDays[e.url] || 0) + 1));
  const urlRows = Object.entries(urlDays).sort((a, b) => b[1] - a[1]);

  const statBox = (label, key) => {
    const st = periodStats(k, key);
    return `<div><b>${fmtPos(st.cur)}</b><span class="muted">${label} ${changeHtml(st)}</span></div>`;
  };
  const links = (k.links || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  $("#modal").innerHTML = `
    <div class="modal-body">
      <div class="sprint-top">
        <div>
          <h2>${escapeHtml(k.keyword)}</h2>
          <div class="muted">${escapeHtml(k.project)} · ${escapeHtml(k.location)} · ${fmtNum(k.volume)} searches / month</div>
        </div>
        <button type="button" data-kw-edit>Edit</button>
      </div>

      <div class="field" style="margin-top:12px"><label>Optimization URL</label>
        <a href="${escapeHtml(k.targetUrl)}" target="_blank" rel="noopener" class="target-url">${escapeHtml(k.targetUrl)}</a>
        ${l && isWrongPage(k, l.url) ? `<div class="badge-warn" style="margin-top:6px">⚠ Latest ranking URL is different: ${escapeHtml(l.url)}</div>` : ""}
      </div>

      <div class="stats">
        <div><b>${l ? fmtPos(l.pos) : "-"}</b><span class="muted">Latest ${l ? "(" + l.date + ")" : ""}</span></div>
        ${statBox("7-day avg", "weekly")}
        ${statBox("28-day avg", "monthly")}
        ${statBox("6-month avg", "6months")}
        ${statBox("12-month avg", "yearly")}
      </div>

      ${urlHistoryHtml(k, prevUrl)}

      <h3>Position history</h3>
      ${chartSvg(k)}


      <h3 id="kwLinks">Links to this keyword (${links.length})</h3>
      <form id="kwLinkForm">
        <div class="grid">
          <div class="field"><label>Date built</label><input type="date" name="date" value="${today()}"></div>
          <div class="field"><label>Type</label><select name="type">${LINK_TYPES.map((t) => `<option>${t}</option>`).join("")}</select></div>
          <div class="field"><label>Status</label><select name="linkStatus"><option value="live">Live</option><option value="planned">Planned</option></select></div>
        </div>
        <div class="grid">
          <div class="field" style="grid-column: span 2"><label>Link from (page where the link is placed)</label><input type="url" name="source" required placeholder="https://..."></div>
          <div class="field"><label>Anchor text</label><input name="anchor" placeholder="${escapeHtml(k.keyword)}"></div>
        </div>
        <div class="add-row"><input name="notes" placeholder="Notes (optional)" style="flex:1"><button class="primary">Add link</button></div>
      </form>
      ${links.length ? `<table>
        <tr><th>Date</th><th>Link from</th><th>Anchor</th><th>Type</th><th>Status</th><th></th></tr>
        ${links.map((x) => `
          <tr>
            <td>${x.date || "-"}</td>
            <td class="url-cell"><a href="${escapeHtml(x.source)}" target="_blank" rel="noopener">${escapeHtml(shortUrl(x.source))}</a>${x.notes ? `<div class="muted">${escapeHtml(x.notes)}</div>` : ""}</td>
            <td>${escapeHtml(x.anchor)}</td>
            <td>${escapeHtml(x.type)}</td>
            <td>${x.status === "planned"
              ? `<button type="button" class="small" data-kw-link-live="${x.id}" title="Mark as live">Planned → Live</button>`
              : `<span class="tag live">Live</span>`}</td>
            <td><button type="button" class="small danger" data-kw-del-link="${x.id}" title="Delete link">✕</button></td>
          </tr>`).join("")}
      </table>` : `<p class="muted">No links yet. All links point to the optimization URL above.</p>`}
    </div>
    <div class="modal-foot">
      <button type="button" class="danger" data-kw-delete>Delete keyword</button>
      <button type="button" id="cancelBtn">Close</button>
    </div>`;
}

// ---------- events ----------
document.addEventListener("click", (e) => {
  const t = e.target;
  if (t.id === "kwAddBtn") return openKeywordForm(null);
  if (t.id === "kwDailyBtn") return openDailyUpdate();

  const lens = t.closest("[data-kw-links]");
  if (lens) return openKeyword(Number(lens.dataset.kwLinks), "links");
  const row = t.closest("[data-kw-open]");
  if (row) return openKeyword(Number(row.dataset.kwOpen));

  if (t.closest("[data-kw-edit]")) return openKeywordForm(kwOpenId);

  if (t.closest("[data-kw-delete]")) {
    const k = kwById(kwOpenId);
    if (!confirm(`Delete "${k.keyword}" and all its ranking history and links?`)) return;
    data.keywords = kwList().filter((x) => x.id !== kwOpenId);
    $("#modal").close();
    return save();
  }

  const delRank = t.closest("[data-kw-del-rank]");
  if (delRank) {
    delete kwById(kwOpenId).history[delRank.dataset.kwDelRank];
    save();
    return renderKeywordDetail();
  }

  const delLink = t.closest("[data-kw-del-link]");
  if (delLink && confirm("Delete this link?")) {
    const k = kwById(kwOpenId);
    k.links = k.links.filter((x) => x.id !== Number(delLink.dataset.kwDelLink));
    save();
    return renderKeywordDetail();
  }

  const makeLive = t.closest("[data-kw-link-live]");
  if (makeLive) {
    const link = kwById(kwOpenId).links.find((x) => x.id === Number(makeLive.dataset.kwLinkLive));
    link.status = "live";
    save();
    return renderKeywordDetail();
  }
});

document.addEventListener("change", (e) => {
  if (e.target.name === "kw-period") { kwPeriod = e.target.value; render(); }
  if (e.target.name === "kw-tab") { kwTab = e.target.value; render(); }
  if (e.target.id === "kwDailyDate") openDailyUpdate(e.target.value || today());
});

document.addEventListener("submit", (e) => {
  const form = e.target;
  if (form.id === "kwForm") { e.preventDefault(); saveKeywordForm(form); }
  if (form.id === "kwDailyForm") { e.preventDefault(); saveDailyUpdate(form); }

  if (form.id === "kwRankForm") {
    e.preventDefault();
    const f = form.elements;
    const k = kwById(kwOpenId);
    const existing = kwEntries(k).find((x) => x.date === f.date.value);
    const pos = Number(f.pos.value) > 0 ? Number(f.pos.value) : existing ? existing.pos : null;
    setRank(k, f.date.value, pos, f.url.value.trim());
    save();
    renderKeywordDetail();
  }

  if (form.id === "kwLinkForm") {
    e.preventDefault();
    const f = form.elements;
    const k = kwById(kwOpenId);
    k.links = k.links || [];
    k.links.push({
      id: Math.max(0, ...k.links.map((x) => x.id)) + 1,
      date: f.date.value,
      source: f.source.value.trim(),
      anchor: f.anchor.value.trim(),
      type: f.type.value,
      status: f.linkStatus.value,
      notes: f.notes.value.trim(),
    });
    save();
    renderKeywordDetail();
    setTimeout(() => $("#kwLinks")?.scrollIntoView({ block: "start" }), 50);
  }
});
