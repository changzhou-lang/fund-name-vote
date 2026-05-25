const state = {
  names: [],
  styles: [],
  search: "",
  style: "all",
  sort: "votes",
  adminToken: sessionStorage.getItem("fund-name-admin-token") || "",
  voted: new Set(JSON.parse(localStorage.getItem("fund-name-votes") || "[]"))
};

const els = {
  refreshButton: document.querySelector("#refreshButton"),
  nameCount: document.querySelector("#nameCount"),
  voteCount: document.querySelector("#voteCount"),
  leaderName: document.querySelector("#leaderName"),
  searchInput: document.querySelector("#searchInput"),
  styleFilter: document.querySelector("#styleFilter"),
  sortSelect: document.querySelector("#sortSelect"),
  statusText: document.querySelector("#statusText"),
  nameList: document.querySelector("#nameList"),
  rankingList: document.querySelector("#rankingList"),
  nameForm: document.querySelector("#nameForm"),
  formMessage: document.querySelector("#formMessage"),
  adminTokenInput: document.querySelector("#adminTokenInput"),
  adminUnlockButton: document.querySelector("#adminUnlockButton"),
  adminMessage: document.querySelector("#adminMessage")
};

if (els.adminTokenInput) els.adminTokenInput.value = state.adminToken;

function saveVoted() {
  localStorage.setItem("fund-name-votes", JSON.stringify([...state.voted]));
}

function status(text, tone = "normal") {
  els.statusText.textContent = text;
  els.statusText.style.color = tone === "error" ? "var(--red)" : "var(--muted)";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

function filteredNames() {
  const q = state.search.trim().toLowerCase();
  let items = [...state.names];
  if (state.style !== "all") items = items.filter((item) => item.style === state.style);
  if (q) {
    items = items.filter((item) => [item.chinese, item.english, item.style, item.note, item.conflict?.label, item.conflict?.detail]
      .join(" ")
      .toLowerCase()
      .includes(q));
  }
  items.sort((a, b) => {
    if (state.sort === "chinese") return a.chinese.localeCompare(b.chinese, "zh-CN");
    if (state.sort === "english") return a.english.localeCompare(b.english);
    if (state.sort === "newest") return new Date(b.createdAt) - new Date(a.createdAt);
    return b.votes - a.votes || a.chinese.localeCompare(b.chinese, "zh-CN");
  });
  return items;
}

function renderStyles() {
  const current = els.styleFilter.value || "all";
  els.styleFilter.innerHTML = "<option value=\"all\">全部风格 / All Styles</option>";
  state.styles.forEach((style) => {
    const option = document.createElement("option");
    option.value = style;
    option.textContent = style;
    els.styleFilter.append(option);
  });
  els.styleFilter.value = state.styles.includes(current) ? current : "all";
  state.style = els.styleFilter.value;
}

function renderSummary() {
  const totalVotes = state.names.reduce((sum, item) => sum + item.votes, 0);
  const leader = [...state.names].sort((a, b) => b.votes - a.votes)[0];
  els.nameCount.textContent = state.names.length;
  els.voteCount.textContent = totalVotes;
  els.leaderName.textContent = leader ? `${leader.chinese} / ${leader.english}` : "--";
}

function renderRanking() {
  const top = [...state.names].sort((a, b) => b.votes - a.votes).slice(0, 3);
  els.rankingList.innerHTML = top.map((item, index) => `
    <li>
      <span class="rank-number">${index + 1}</span>
      <span class="rank-name">${escapeHtml(item.chinese)}<span>${escapeHtml(item.english)}</span></span>
      <strong>${item.votes}</strong>
    </li>
  `).join("");
}

function conflictMarkup(item) {
  const conflict = item.conflict || { status: "unknown", label: "Not checked", detail: "Pending conflict check." };
  const status = conflict.status === "unknown" ? "clear" : conflict.status;
  const label = status === "used" ? "已有 / Already used" : "暂未发现 / No obvious match";
  const detail = conflict.status === "unknown"
    ? "No exact private fund match is currently in the conflict list. Please verify through AMAC search before final use."
    : conflict.detail || "";
  return `
    <div class="conflict-check conflict-${escapeHtml(status || "clear")}">
      <div class="conflict-top">
        <strong>Conflict check</strong>
        <span>AMAC / public search</span>
      </div>
      <span class="conflict-badge">${escapeHtml(label)}</span>
      <p>${escapeHtml(detail)}</p>
      <a href="https://gs.amac.org.cn/amac-infodisc/res/pof/fund/index.html" target="_blank" rel="noreferrer">打开中基协查询 / Open AMAC search</a>
    </div>
  `;
}

function renderNames() {
  const items = filteredNames();
  if (!items.length) {
    els.nameList.innerHTML = "<div class=\"empty\">没有匹配的名字。No matching candidates.</div>";
    return;
  }
  els.nameList.innerHTML = items.map((item) => {
    const voted = state.voted.has(item.id);
    const deleteButton = state.adminToken ? `<button class="delete-button" type="button" data-delete="${escapeHtml(item.id)}">删除 / Delete</button>` : "";
    return `
      <article class="name-card">
        <div class="name-main">
          <div class="name-title">
            <strong>${escapeHtml(item.chinese)}</strong>
            <label class="english-edit">
              <span>English name</span>
              <input data-english-input="${escapeHtml(item.id)}" value="${escapeHtml(item.english)}" maxlength="42" />
            </label>
          </div>
          <div class="meta">
            <span class="tag">${escapeHtml(item.style || "其他 / Other")}</span>
            <span>${new Date(item.createdAt).toLocaleDateString("zh-CN")}</span>
          </div>
          <p class="note">${escapeHtml(item.note || "暂无备注 / No note")}</p>
          ${conflictMarkup(item)}
          <div class="card-actions">
            <button class="save-english-button" type="button" data-save-english="${escapeHtml(item.id)}">保存英文名 / Save English</button>
            ${deleteButton}
          </div>
        </div>
        <div class="vote-box">
          <div>
            <div class="vote-count">${item.votes}</div>
            <div class="vote-caption">votes</div>
          </div>
          <button class="vote-button ${voted ? "voted" : ""}" type="button" data-vote="${escapeHtml(item.id)}" ${voted ? "disabled" : ""}>
            ${voted ? "已投 / Voted" : "投票 / Vote"}
          </button>
        </div>
      </article>
    `;
  }).join("");
}

function renderAll() {
  renderStyles();
  renderSummary();
  renderRanking();
  renderNames();
}

async function loadNames() {
  status("更新中 / Updating...");
  const response = await fetch("/api/names");
  if (!response.ok) throw new Error("Unable to load names.");
  const payload = await response.json();
  state.names = payload.names || [];
  state.styles = payload.styles || [];
  renderAll();
  status("已更新 / Updated");
}

async function vote(id) {
  if (state.voted.has(id)) return;
  state.voted.add(id);
  saveVoted();
  renderNames();
  const response = await fetch(`/api/names/${encodeURIComponent(id)}/vote`, { method: "POST" });
  if (!response.ok) {
    state.voted.delete(id);
    saveVoted();
    throw new Error("Vote failed.");
  }
  const payload = await response.json();
  state.names = payload.names || [];
  state.styles = payload.styles || [];
  renderAll();
  status("投票已记录 / Vote recorded");
}

async function updateEnglish(id) {
  const input = document.querySelector(`[data-english-input="${CSS.escape(id)}"]`);
  const english = input?.value.trim();
  if (!english) {
    status("English name is required.", "error");
    return;
  }
  status("保存中 / Saving...");
  const response = await fetch(`/api/names/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ english })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Save failed.");
  state.names = payload.names || [];
  state.styles = payload.styles || [];
  renderAll();
  status("英文名已保存 / English name saved");
}

async function deleteName(id) {
  const item = state.names.find((entry) => entry.id === id);
  const label = item ? `${item.chinese} / ${item.english}` : id;
  if (!window.confirm(`Delete ${label}?`)) return;
  status("删除中 / Deleting...");
  const response = await fetch(`/api/names/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      "x-admin-token": state.adminToken
    }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Delete failed.");
  state.names = payload.names || [];
  state.styles = payload.styles || [];
  renderAll();
  status("已删除 / Deleted");
}

async function addName(event) {
  event.preventDefault();
  els.formMessage.textContent = "提交中 / Submitting...";
  const formData = new FormData(els.nameForm);
  const payload = Object.fromEntries(formData.entries());
  const response = await fetch("/api/names", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok) {
    els.formMessage.textContent = result.error || "添加失败 / Add failed";
    return;
  }
  state.names = result.names || [];
  state.styles = result.styles || [];
  els.nameForm.reset();
  els.formMessage.textContent = "已添加到候选名单 / Candidate added";
  renderAll();
  status("新名字已添加 / New name added");
}

function unlockAdmin() {
  state.adminToken = els.adminTokenInput.value.trim();
  if (!state.adminToken) {
    sessionStorage.removeItem("fund-name-admin-token");
    els.adminMessage.textContent = "请输入删除口令。Please enter the delete password.";
    renderNames();
    return;
  }
  sessionStorage.setItem("fund-name-admin-token", state.adminToken);
  els.adminMessage.textContent = "管理员模式已启用。Admin mode enabled.";
  renderNames();
}

els.refreshButton.addEventListener("click", () => loadNames().catch((error) => status(error.message, "error")));
els.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderNames();
});
els.styleFilter.addEventListener("change", (event) => {
  state.style = event.target.value;
  renderNames();
});
els.sortSelect.addEventListener("change", (event) => {
  state.sort = event.target.value;
  renderNames();
});
els.nameList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete]");
  if (deleteButton) {
    deleteName(deleteButton.dataset.delete).catch((error) => status(error.message, "error"));
    return;
  }
  const saveButton = event.target.closest("[data-save-english]");
  if (saveButton) {
    updateEnglish(saveButton.dataset.saveEnglish).catch((error) => status(error.message, "error"));
    return;
  }
  const button = event.target.closest("[data-vote]");
  if (!button) return;
  vote(button.dataset.vote).catch((error) => {
    status(error.message, "error");
    renderNames();
  });
});
els.nameForm.addEventListener("submit", addName);
els.adminUnlockButton.addEventListener("click", unlockAdmin);
els.adminTokenInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") unlockAdmin();
});

loadNames().catch((error) => status(error.message, "error"));
