// ===== SEO Task Tracker =====
// Data is saved to the server (Vercel Blob via /api) and cached in the browser.
// If the server isn't available (e.g. opening index.html directly), it works offline in the browser only.

const STORAGE_KEY = "seo-task-tracker";
const CATEGORIES = ["Strategy", "Onsite Optimization", "Link Building", "AEO"];
const STATUSES = { todo: "To Do", doing: "Doing", blocked: "Blocked", done: "Done" };
const POINTS = [1, 2, 3, 5, 8, 13, 21]; // Fibonacci story points

let data = load();
let view = "sprint";
let categoryFilter = "All";
let editing = null; // task currently open in the modal
let online = false; // true when the backend is reachable
let saveTimer = null;
const PASSWORD_KEY = "seo-task-tracker-password";
const MAX_FILE_BYTES = 4 * 1024 * 1024;

// ---------- storage ----------
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.tasks) return saved;
  } catch (e) {}
  return { nextTaskId: 1, nextSprintId: 1, tasks: [], sprints: [], currentSprintId: null };
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  render();
  if (online) {
    setSync("Saving...");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(pushToServer, 600); // wait for quick edits to finish, then save once
  }
}

// ---------- backend ----------
async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "x-app-password": localStorage.getItem(PASSWORD_KEY) || "", ...(options.headers || {}) },
  });
  if (res.status === 401) {
    const password = prompt("Enter your tracker password:");
    if (!password) throw new Error("Password required");
    localStorage.setItem(PASSWORD_KEY, password);
    return api(path, options);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText);
  }
  return res;
}

async function pushToServer() {
  try {
    await api("/api/data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSync("✓ Saved to server");
  } catch (e) {
    setSync("⚠ Not saved to server: " + e.message);
  }
}

async function loadFromServer() {
  try {
    const res = await api("/api/data");
    const serverData = await res.json();
    online = true;
    if (serverData && serverData.tasks) {
      data = serverData;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } else if (data.tasks.length) {
      await pushToServer(); // first run: upload what's already in this browser
    }
    setSync("✓ Saved to server");
  } catch (e) {
    online = false;
    setSync("Offline: saved in this browser only (" + e.message + ")");
  }
  render();
}

function setSync(text) {
  $("#syncStatus").textContent = text;
}

// ---------- helpers ----------
const $ = (sel) => document.querySelector(sel);
const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
const taskNo = (t) => "#" + t.id;
const getTask = (id) => data.tasks.find((t) => t.id === id);
const getSprint = (id) => data.sprints.find((s) => s.id === id);
const currentSprint = () => getSprint(data.currentSprintId);
const isVisible = (t) => !t.showFrom || t.showFrom <= today(); // scheduled tasks stay hidden until their date
const inCategory = (t) => categoryFilter === "All" || t.category === categoryFilter;
const isOverdue = (t) => t.deadline && t.status !== "done" && t.deadline < today();

function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA");
}
function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
// Turns "#12" in text into a clickable link to task 12
function linkify(text) {
  return escapeHtml(text)
    .replace(/(^|\s)#(\d+)\b/g, (match, space, id) =>
      getTask(Number(id)) ? `${space}<span class="task-link" data-open="${id}">#${id}</span>` : match
    )
    .replace(/\n/g, "<br>");
}

// Status rules: To Do = 0%, Done = 100%, Doing/Blocked = your own %
function setStatus(task, status) {
  task.status = status;
  if (status === "todo") task.progress = 0;
  if (status === "done") {
    task.progress = 100;
    task.doneAt = today();
  } else {
    task.doneAt = null;
  }
  if (status === "doing" && task.progress === 0) task.progress = 10;
}

function sprintStats(tasks) {
  const count = tasks.length;
  const avg = count ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / count) : 0;
  const totalPts = tasks.reduce((s, t) => s + (t.points || 0), 0);
  const donePts = tasks.filter((t) => t.status === "done").reduce((s, t) => s + (t.points || 0), 0);
  const doneCount = tasks.filter((t) => t.status === "done").length;
  return { count, avg, totalPts, donePts, doneCount };
}

// ---------- rendering ----------
function render() {
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  const views = { sprint: renderSprint, backlog: renderBacklog, previous: renderPrevious, all: renderAll };
  $("#main").innerHTML = views[view]();
}

function card(t) {
  return `
    <div class="card" draggable="true" data-open="${t.id}" data-drag="${t.id}">
      <div class="card-top"><span>${taskNo(t)}</span><span>${t.points || "-"} pts</span></div>
      <div class="card-title">${escapeHtml(t.title)}</div>
      <span class="tag">${t.category}</span>
      ${t.deadline ? `<span class="muted ${isOverdue(t) ? "overdue" : ""}"> Due ${t.deadline}</span>` : ""}
      ${t.files && t.files.length ? `<span class="muted"> 📎 ${t.files.length}</span>` : ""}
      <div class="progress ${t.status === "done" ? "done" : ""}"><div style="width:${t.progress}%"></div></div>
      <div class="muted">${t.progress}%</div>
    </div>`;
}

function renderSprint() {
  const sprint = currentSprint();
  if (!sprint) {
    const backlog = data.tasks.filter((t) => t.status !== "done" && !t.sprintId && isVisible(t));
    return `
      <div class="box">
        <h2>Start a new sprint</h2>
        <form id="startSprintForm">
          <div class="grid">
            <div class="field"><label>Name</label><input name="name" value="Sprint ${data.nextSprintId}"></div>
            <div class="field"><label>Start date</label><input type="date" name="start" value="${today()}"></div>
            <div class="field"><label>Length</label>
              <select name="sprintLength"><option value="7">1 week</option><option value="14" selected>2 weeks</option></select>
            </div>
          </div>
          <div class="field"><label>Pick tasks from the full backlog</label>
            ${backlog.length
              ? backlog.map((t) => `<div><label><input type="checkbox" name="pick" value="${t.id}"> ${taskNo(t)} ${escapeHtml(t.title)} (${t.points || "-"} pts)</label></div>`).join("")
              : `<p class="muted">Backlog is empty. You can add tasks after starting.</p>`}
          </div>
          <button class="primary" type="submit">Start sprint</button>
        </form>
      </div>`;
  }

  const tasks = data.tasks.filter((t) => t.sprintId === sprint.id && inCategory(t));
  const s = sprintStats(tasks);
  const visibleTasks = tasks.filter(isVisible);

  return `
    <div class="box">
      <div class="sprint-top">
        <div>
          <h2>${escapeHtml(sprint.name)}</h2>
          <div class="muted">${sprint.start} → ${sprint.end}</div>
        </div>
        <button id="closeSprintBtn" class="primary">Close sprint</button>
      </div>
      <div class="stats">
        <div><b>${s.avg}%</b><span class="muted">Overall progress</span></div>
        <div><b>${s.doneCount} / ${s.count}</b><span class="muted">Tasks done</span></div>
        <div><b>${s.donePts} / ${s.totalPts}</b><span class="muted">Story points done</span></div>
      </div>
      <div class="progress"><div style="width:${s.avg}%"></div></div>
    </div>
    <div class="board">
      ${Object.entries(STATUSES).map(([key, label]) => {
        const col = visibleTasks.filter((t) => t.status === key);
        return `<div class="column" data-drop="${key}">
          <h3><span>${label}</span><span class="muted">${col.length}</span></h3>
          ${col.map(card).join("")}
        </div>`;
      }).join("")}
    </div>`;
}

function taskTable(tasks, extraColumn) {
  if (!tasks.length) return `<p class="muted">No tasks here.</p>`;
  return `
    <table>
      <tr><th>#</th><th>Task</th><th>Category</th><th>Status</th><th>Pts</th><th>%</th><th>Deadline</th>${extraColumn ? "<th></th>" : ""}</tr>
      ${tasks.map((t) => `
        <tr class="clickable" data-open="${t.id}">
          <td>${taskNo(t)}</td>
          <td>${escapeHtml(t.title)}</td>
          <td><span class="tag">${t.category}</span></td>
          <td>${STATUSES[t.status]}</td>
          <td>${t.points || "-"}</td>
          <td>${t.progress}%</td>
          <td class="${isOverdue(t) ? "overdue" : ""}">${t.deadline || "-"}</td>
          ${extraColumn ? `<td>${extraColumn(t)}</td>` : ""}
        </tr>`).join("")}
    </table>`;
}

function renderBacklog() {
  const sprint = currentSprint();
  const tasks = data.tasks.filter((t) => t.status !== "done" && !t.sprintId && isVisible(t) && inCategory(t));
  return `
    <div class="box">
      <h2>Full Backlog</h2>
      <p class="muted">Tasks not in the current sprint and not picked up yet.</p>
      <form id="quickAddForm" class="add-row">
        <input name="title" placeholder="Quick add a task..." required>
        <select name="category">${CATEGORIES.map((c) => `<option>${c}</option>`).join("")}</select>
        <select name="points"><option value="0">Points</option>${POINTS.map((p) => `<option>${p}</option>`).join("")}</select>
        <button class="primary">Add</button>
      </form>
      ${taskTable(tasks, sprint ? (t) => `<button class="small" data-to-sprint="${t.id}">Add to sprint</button>` : null)}
    </div>`;
}

function renderPrevious() {
  const done = data.tasks.filter((t) => t.status === "done" && inCategory(t));
  if (!done.length) return `<div class="box"><h2>Previous Backlog</h2><p class="muted">Done tasks will appear here.</p></div>`;

  // Group done tasks by the sprint they were finished in
  const groups = {};
  done.forEach((t) => {
    const key = t.doneSprintId || t.sprintId || "none";
    (groups[key] = groups[key] || []).push(t);
  });

  return Object.keys(groups).reverse().map((key) => {
    const sprint = getSprint(Number(key));
    let title = "Done outside a sprint";
    if (sprint) {
      title = escapeHtml(sprint.name) + (sprint.closed ? "" : " (in progress)");
      if (sprint.summary) title += ` <span class="muted">— completed ${sprint.summary.donePts} of ${sprint.summary.totalPts} points</span>`;
    }
    return `<div class="box"><h2>${title}</h2>${taskTable(groups[key])}</div>`;
  }).join("");
}

function renderAll() {
  const tasks = data.tasks.filter(inCategory).sort((a, b) => b.id - a.id);
  return `<div class="box"><h2>All Tasks</h2>${taskTable(tasks, (t) => {
    if (!isVisible(t)) return `<span class="muted">Scheduled ${t.showFrom}</span>`;
    if (t.status === "done") return `<span class="muted">Previous</span>`;
    if (t.sprintId) return `<span class="muted">Current sprint</span>`;
    return `<span class="muted">Backlog</span>`;
  })}</div>`;
}

// ---------- task modal ----------
function openTask(id, defaults = {}) {
  const existing = id ? getTask(id) : null;
  if (id && !existing) return alert("Task #" + id + " doesn't exist");

  editing = existing
    ? JSON.parse(JSON.stringify(existing))
    : { id: null, title: "", desc: "", category: categoryFilter !== "All" ? categoryFilter : CATEGORIES[0],
        status: "todo", progress: 0, points: 0, deadline: "", showFrom: "", sprintId: null,
        links: [], notes: [], files: [], ...defaults };
  editing.files = editing.files || [];
  renderModal();
  $("#modal").showModal();
}

function renderModal() {
  const t = editing;
  const sprint = currentSprint();
  const linked = t.links.map(getTask).filter(Boolean);
  const linkedFrom = t.id ? data.tasks.filter((o) => o.links.includes(t.id)) : [];

  $("#modal").innerHTML = `
    <form id="taskForm">
      <div class="modal-body">
        <h2>${t.id ? "Task " + taskNo(t) : "New task #" + data.nextTaskId}</h2>
        <div class="field"><label>Title</label><input name="title" value="${escapeHtml(t.title)}" required></div>
        <div class="grid">
          <div class="field"><label>Status</label>
            <select name="status">${Object.entries(STATUSES).map(([k, v]) => `<option value="${k}" ${t.status === k ? "selected" : ""}>${v}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Progress %</label>
            <input type="number" name="progress" min="0" max="100" value="${t.progress}" ${t.status === "todo" || t.status === "done" ? "disabled" : ""}>
          </div>
          <div class="field"><label>Story points</label>
            <select name="points"><option value="0">-</option>${POINTS.map((p) => `<option ${t.points === p ? "selected" : ""}>${p}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Category</label>
            <select name="category">${CATEGORIES.map((c) => `<option ${t.category === c ? "selected" : ""}>${c}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Deadline</label><input type="date" name="deadline" value="${t.deadline}"></div>
          <div class="field"><label>Show from (schedule)</label><input type="date" name="showFrom" value="${t.showFrom}"></div>
        </div>
        <div class="field"><label>Sprint</label>
          <select name="sprintId">
            <option value="">Full backlog</option>
            ${sprint ? `<option value="${sprint.id}" ${t.sprintId === sprint.id ? "selected" : ""}>${escapeHtml(sprint.name)} (current)</option>` : ""}
          </select>
        </div>
        <div class="field"><label>Description (type #12 to link task 12)</label>
          <textarea name="desc" rows="4">${escapeHtml(t.desc)}</textarea>
          ${t.desc ? `<div class="muted">${linkify(t.desc)}</div>` : ""}
        </div>
        <div class="field"><label>Linked tasks (task numbers, e.g. 3, 7)</label>
          <input name="links" value="${t.links.join(", ")}">
          ${linked.map((l) => `<div><span class="task-link" data-open="${l.id}">${taskNo(l)}</span> ${escapeHtml(l.title)}</div>`).join("")}
          ${linkedFrom.map((l) => `<div class="muted">Linked from <span class="task-link" data-open="${l.id}">${taskNo(l)}</span> ${escapeHtml(l.title)}</div>`).join("")}
        </div>
        <div class="field"><label>Status updates</label>
          <textarea name="newNote" rows="2" placeholder="Add a status update..."></textarea>
          ${t.notes.slice().reverse().map((n) => `<div class="note"><div class="muted">${n.date}</div>${linkify(n.text)}</div>`).join("")}
        </div>
        <div class="field"><label>Files</label>
          <div id="fileList"></div>
          ${online
            ? `<input type="file" id="fileInput" multiple><div class="muted">Max 4 MB per file. Files upload straight away.</div>`
            : `<p class="muted">File uploads need the server (deploy on Vercel).</p>`}
        </div>
      </div>
      <div class="modal-foot">
        ${t.id ? `<button type="button" class="danger" id="deleteTaskBtn">Delete</button>` : "<span></span>"}
        <span>
          <button type="button" id="cancelBtn">Cancel</button>
          <button type="submit" class="primary">Save</button>
        </span>
      </div>
    </form>`;
  renderFileList();
}

// ---------- files ----------
function renderFileList() {
  const files = editing.files;
  $("#fileList").innerHTML = files.length
    ? files.map((f, i) => `
        <div class="file-row">
          <a href="#" data-download="${i}">📄 ${escapeHtml(f.name)}</a>
          <span class="muted">${Math.ceil(f.size / 1024)} KB</span>
          <button type="button" class="small danger" data-remove-file="${i}">Remove</button>
        </div>`).join("")
    : `<p class="muted">No files yet.</p>`;
}

// Keep a saved task's file list in sync right away (uploads happen before you press Save)
function syncFilesToSavedTask() {
  const saved = editing.id && getTask(editing.id);
  if (saved) {
    saved.files = [...editing.files];
    save();
  }
}

async function uploadFiles(fileList) {
  for (const file of fileList) {
    if (file.size > MAX_FILE_BYTES) {
      alert(file.name + " is larger than 4 MB");
      continue;
    }
    $("#fileList").insertAdjacentHTML("beforeend", `<p class="muted">Uploading ${escapeHtml(file.name)}...</p>`);
    try {
      const res = await api("/api/files?name=" + encodeURIComponent(file.name), {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      editing.files.push(await res.json());
      syncFilesToSavedTask();
    } catch (e) {
      alert("Upload failed: " + e.message);
    }
    renderFileList();
  }
}

async function downloadFile(file) {
  try {
    const res = await api("/api/files?pathname=" + encodeURIComponent(file.pathname));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await res.blob());
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (e) {
    alert("Download failed: " + e.message);
  }
}

async function removeFile(index) {
  const file = editing.files[index];
  if (!confirm("Delete " + file.name + "?")) return;
  try {
    await api("/api/files?pathname=" + encodeURIComponent(file.pathname), { method: "DELETE" });
  } catch (e) {
    return alert("Delete failed: " + e.message);
  }
  editing.files.splice(index, 1);
  syncFilesToSavedTask();
  renderFileList();
}

function saveTask(form) {
  const f = form.elements;
  const t = editing;
  t.title = f.title.value.trim();
  t.category = f.category.value;
  t.points = Number(f.points.value);
  t.deadline = f.deadline.value;
  t.showFrom = f.showFrom.value;
  t.sprintId = f.sprintId.value ? Number(f.sprintId.value) : null;
  t.desc = f.desc.value;
  t.links = (f.links.value.match(/\d+/g) || []).map(Number).filter((n) => n !== t.id && getTask(n));
  t.progress = Math.max(0, Math.min(100, Number(f.progress.value) || 0));
  setStatus(t, f.status.value);
  if (f.newNote.value.trim()) t.notes.push({ date: new Date().toLocaleString(), text: f.newNote.value.trim() });

  if (t.id) {
    data.tasks = data.tasks.map((x) => (x.id === t.id ? t : x));
  } else {
    t.id = data.nextTaskId++;
    data.tasks.push(t);
  }
  $("#modal").close();
  save();
}

// ---------- close sprint ----------
function openCloseSprint() {
  const sprint = currentSprint();
  const unfinished = data.tasks.filter((t) => t.sprintId === sprint.id && t.status !== "done");
  $("#modal").innerHTML = `
    <form id="closeSprintForm">
      <div class="modal-body">
        <h2>Close ${escapeHtml(sprint.name)}</h2>
        <p class="muted">Done tasks move to the Previous Backlog. Update points and % for unfinished tasks, then pick where they go.</p>
        ${unfinished.length ? `
          <table>
            <tr><th>Task</th><th>Points</th><th>%</th><th>Move to</th></tr>
            ${unfinished.map((t) => `
              <tr data-task="${t.id}">
                <td>${taskNo(t)} ${escapeHtml(t.title)}</td>
                <td><select class="pts"><option value="0">-</option>${POINTS.map((p) => `<option ${t.points === p ? "selected" : ""}>${p}</option>`).join("")}</select></td>
                <td><input class="pct" type="number" min="0" max="99" value="${t.progress}" style="width:60px"></td>
                <td><select class="dest"><option value="next">Next sprint</option><option value="backlog">Full backlog</option></select></td>
              </tr>`).join("")}
          </table>` : `<p>All tasks are done.</p>`}
        <p><label><input type="checkbox" name="startNext" checked> Start the next sprint now</label>
          <select name="sprintLength"><option value="7">1 week</option><option value="14" selected>2 weeks</option></select></p>
      </div>
      <div class="modal-foot"><span></span>
        <span><button type="button" id="cancelBtn">Cancel</button> <button class="primary">Close sprint</button></span>
      </div>
    </form>`;
  $("#modal").showModal();
}

function closeSprint(form) {
  const sprint = currentSprint();
  const tasks = data.tasks.filter((t) => t.sprintId === sprint.id);
  sprint.summary = sprintStats(tasks);
  sprint.closed = true;

  let next = null;
  if (form.elements.startNext.checked) {
    const start = addDays(sprint.end, 1) > today() ? addDays(sprint.end, 1) : today();
    next = { id: data.nextSprintId++, name: "Sprint " + (data.nextSprintId - 1), start, end: addDays(start, Number(form.elements.sprintLength.value) - 1) };
    data.sprints.push(next);
  }

  tasks.forEach((t) => {
    if (t.status === "done") { t.doneSprintId = sprint.id; return; }
    const row = form.querySelector(`[data-task="${t.id}"]`);
    t.points = Number(row.querySelector(".pts").value);
    t.progress = Math.max(0, Math.min(99, Number(row.querySelector(".pct").value) || 0));
    t.status = t.progress === 0 ? "todo" : t.status === "todo" ? "doing" : t.status;
    t.sprintId = row.querySelector(".dest").value === "next" && next ? next.id : null;
  });

  data.currentSprintId = next ? next.id : null;
  $("#modal").close();
  save();
}

// ---------- events ----------
document.addEventListener("click", (e) => {
  const openEl = e.target.closest("[data-open]");
  const toSprint = e.target.closest("[data-to-sprint]");
  const download = e.target.closest("[data-download]");
  const removeBtn = e.target.closest("[data-remove-file]");

  if (download) {
    e.preventDefault();
    return downloadFile(editing.files[Number(download.dataset.download)]);
  }
  if (removeBtn) return removeFile(Number(removeBtn.dataset.removeFile));

  if (toSprint) {
    getTask(Number(toSprint.dataset.toSprint)).sprintId = data.currentSprintId;
    return save();
  }
  if (openEl) {
    if ($("#modal").open) $("#modal").close();
    return openTask(Number(openEl.dataset.open));
  }
  if (e.target.closest("#tabs button")) { view = e.target.dataset.view; return render(); }
  if (e.target.id === "newTaskBtn") return openTask(null, view === "sprint" && currentSprint() ? { sprintId: data.currentSprintId } : {});
  if (e.target.id === "cancelBtn") return $("#modal").close();
  if (e.target.id === "closeSprintBtn") return openCloseSprint();
  if (e.target.id === "deleteTaskBtn" && confirm("Delete this task and its files?")) {
    (editing.files || []).forEach((f) =>
      api("/api/files?pathname=" + encodeURIComponent(f.pathname), { method: "DELETE" }).catch(() => {})
    );
    data.tasks = data.tasks.filter((t) => t.id !== editing.id);
    $("#modal").close();
    return save();
  }
  if (e.target.id === "exportBtn") {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `seo-tasks-${today()}.json`;
    a.click();
  }
});

// Progress field is only editable for Doing / Blocked
document.addEventListener("change", (e) => {
  if (e.target.name === "status" && e.target.form?.id === "taskForm") {
    const pct = e.target.form.elements.progress;
    const s = e.target.value;
    pct.disabled = s === "todo" || s === "done";
    if (s === "todo") pct.value = 0;
    if (s === "done") pct.value = 100;
  }
  if (e.target.id === "fileInput" && e.target.files.length) {
    uploadFiles([...e.target.files]);
    e.target.value = "";
  }
  if (e.target.id === "categoryFilter") { categoryFilter = e.target.value; render(); }
  if (e.target.id === "importInput" && e.target.files[0]) {
    e.target.files[0].text().then((txt) => {
      try { data = JSON.parse(txt); save(); alert("Backup imported"); }
      catch { alert("Invalid backup file"); }
    });
  }
});

document.addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;

  if (form.id === "taskForm") return saveTask(form);
  if (form.id === "closeSprintForm") return closeSprint(form);

  if (form.id === "gotoForm") {
    const id = Number($("#gotoInput").value.replace(/\D/g, ""));
    if (id) openTask(id);
    $("#gotoInput").value = "";
  }

  if (form.id === "quickAddForm") {
    const f = form.elements;
    data.tasks.push({
      id: data.nextTaskId++, title: f.title.value.trim(), desc: "", category: f.category.value,
      status: "todo", progress: 0, points: Number(f.points.value), deadline: "", showFrom: "",
      sprintId: null, links: [], notes: [], files: [],
    });
    save();
  }

  if (form.id === "startSprintForm") {
    const f = form.elements;
    const sprint = {
      id: data.nextSprintId++, name: f.name.value, start: f.start.value,
      end: addDays(f.start.value, Number(f.sprintLength.value) - 1),
    };
    data.sprints.push(sprint);
    data.currentSprintId = sprint.id;
    form.querySelectorAll("[name=pick]:checked").forEach((c) => (getTask(Number(c.value)).sprintId = sprint.id));
    save();
  }
});

// Drag cards between columns
document.addEventListener("dragstart", (e) => {
  if (e.target.dataset?.drag) e.dataTransfer.setData("text", e.target.dataset.drag);
});
document.addEventListener("dragover", (e) => {
  const col = e.target.closest("[data-drop]");
  if (col) { e.preventDefault(); col.classList.add("over"); }
});
document.addEventListener("dragleave", (e) => {
  const col = e.target.closest("[data-drop]");
  if (col) col.classList.remove("over");
});
document.addEventListener("drop", (e) => {
  const col = e.target.closest("[data-drop]");
  if (!col) return;
  e.preventDefault();
  const task = getTask(Number(e.dataTransfer.getData("text")));
  if (task) { setStatus(task, col.dataset.drop); save(); }
});

// ---------- start ----------
$("#categoryFilter").innerHTML = ["All", ...CATEGORIES].map((c) => `<option value="${c}">${c === "All" ? "All categories" : c}</option>`).join("");
render();
loadFromServer();
