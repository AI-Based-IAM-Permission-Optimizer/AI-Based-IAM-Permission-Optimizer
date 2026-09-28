const DEFAULT_ADMIN = { email: "admin@iamguard.local", password: "admin123" };
let ADMIN = {
  email: localStorage.getItem("ig-admin-email") || DEFAULT_ADMIN.email,
  password: localStorage.getItem("ig-admin-password") || DEFAULT_ADMIN.password
};

const API_CONFIG = window.IAM_GUARD_CONFIG || {
  API_BASE_URL: "https://6ldbesb1a0.execute-api.ap-south-1.amazonaws.com",
  USE_API: true,
  FALLBACK_TO_LOCAL_DATA: false,
};

let recs = [];
let audit = JSON.parse(localStorage.getItem("ig-audit") || "[]");
let selected = null;
let liveApi = false;
let policyCache = new Map();

const $ = (id) => document.getElementById(id);
const esc = (x) => String(x ?? "")
  .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
  .replaceAll('"',"&quot;").replaceAll("'","&#039;");

function apiUrl(path, query = {}) {
  const base = API_CONFIG.API_BASE_URL.replace(/\/+$/, "");
  const qs = new URLSearchParams();
  Object.entries(query).forEach(([k,v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, v);
  });
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return `${base}${path}${suffix}`;
}

async function apiFetch(path, options = {}, query = {}) {
  // IMPORTANT: do not send Content-Type on GET/HEAD requests.
  // Content-Type: application/json makes a cross-origin GET non-simple and
  // triggers an OPTIONS preflight. The screenshots showed the API rejecting
  // that preflight. Only send JSON Content-Type when a request actually has
  // a JSON body (e.g. the approve/reject PATCH calls).
  const method = String(options.method || "GET").toUpperCase();
  const headers = {
    Accept: "application/json",
    ...(options.headers || {})
  };
  if (options.body !== undefined && options.body !== null && method !== "GET" && method !== "HEAD") {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(apiUrl(path, query), {
    ...options,
    headers
  });

  let body = null;
  const text = await response.text();
  if (text) {
    try { body = JSON.parse(text); }
    catch { body = text; }
  }

  if (!response.ok) {
    const message = typeof body?.message === "string" ? body.message
      : typeof body?.error === "string" ? body.error
      : body?.message || body?.error ? JSON.stringify(body.message || body.error)
      : `API request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function saveAudit() {
  localStorage.setItem("ig-audit", JSON.stringify(audit));
}

function cls(x) { return String(x ?? "").toLowerCase().replaceAll(" ","-"); }
function badge(x) { return `<span class="badge ${cls(x)}">${esc(x)}</span>`; }

function normalizeListPayload(payload) {
  if (Array.isArray(payload)) return { items: payload, nextToken: null };
  const container = payload?.data && typeof payload.data === "object" && !Array.isArray(payload.data)
    ? payload.data
    : payload;
  const items = container?.recommendations || container?.items || container?.results || (Array.isArray(container?.data) ? container.data : []);
  const nextToken =
    container?.next_token ??
    container?.nextToken ??
    container?.pagination?.next_token ??
    container?.pagination?.nextToken ??
    payload?.next_token ??
    payload?.nextToken ??
    null;
  return { items: Array.isArray(items) ? items : [], nextToken };
}

function unwrapRecommendationPayload(payload) {
  let value = payload;

  // API Gateway/Lambda integrations sometimes wrap the JSON response in a
  // `body` string. Decode it before looking for the recommendation object.
  if (typeof value?.body === "string") {
    try { value = JSON.parse(value.body); } catch {}
  }

  // Accept the common response wrappers used by REST APIs.
  for (let i = 0; i < 4; i++) {
    if (!value || typeof value !== "object" || Array.isArray(value)) break;
    const next = value.recommendation ?? value.item ?? value.result ?? value.data;
    if (next && typeof next === "object" && !Array.isArray(next)) {
      value = next;
      continue;
    }
    break;
  }
  return value || {};
}

function normalizeRecommendation(raw) {
  raw = unwrapRecommendationPayload(raw);
  const scoreRaw = Number(raw.risk_score ?? raw.riskScore ?? raw.risk ?? 0);
  const score = Number.isFinite(scoreRaw)
    ? (scoreRaw <= 1 ? Math.round(scoreRaw * 100) : Math.round(scoreRaw))
    : 0;

  const level = String(raw.risk_level ?? raw.riskLevel ?? "UNKNOWN").toUpperCase();
  const verdict = String(raw.recommendation ?? raw.verdict ?? "REVIEW").toUpperCase();
  const status = String(raw.approval_status ?? raw.status ?? "PENDING").toUpperCase();

  const userId =
    raw.user_id ?? raw.userId ?? raw.identity_id ?? raw.identityId ??
    raw.principal_id ?? raw.principalId ?? raw.identity?.user_id ??
    raw.identity?.userId ?? raw.user?.user_id ?? raw.user?.userId ??
    raw.principal?.user_id ?? raw.principal?.userId ?? "unknown-user";
  const roleId =
    raw.role_id ?? raw.roleId ?? raw.role_name ?? raw.roleName ??
    raw.role?.role_id ?? raw.role?.roleId ?? raw.role?.name ??
    raw.identity?.role_id ?? raw.identity?.roleId ?? "unknown-role";
  const action = raw.action ?? raw.permission ?? raw.permission_action ?? raw.permissionAction ?? "";
  const resource = raw.resource ?? raw.resource_arn ?? raw.resourceArn ?? "*";

  // The handoff contract does not define usage-count fields. Preserve them when
  // the API supplies optional fields, otherwise explicitly show "Not provided".
  const usage = raw.usage || raw.usage_stats || raw.usageStatistics || {};
  const reasonCodes = Array.isArray(raw.reason_codes) ? raw.reason_codes : (Array.isArray(raw.reasonCodes) ? raw.reasonCodes : []);

  return {
    raw,
    id: raw.recommendation_id ?? raw.recommendationId ?? raw.id ?? raw.rec_id,
    userId,
    user: raw.user_name ?? raw.userName ?? raw.username ??
      (typeof raw.user === "string" ? raw.user : raw.user?.name) ??
      raw.identity?.name ?? userId,
    role: raw.role_name ?? raw.roleName ??
      (typeof raw.role === "string" ? raw.role : raw.role?.name) ?? roleId,
    permission: action,
    resource,
    score,
    level,
    verdict,
    status,
    reason: raw.explanation ?? raw.reason ?? raw.recommendation_reason ?? raw.recommendationReason ?? "No explanation was provided by the recommendation service.",
    reasonCodes,
    modelVersion: raw.model_version ?? raw.modelVersion ?? "—",
    generatedAt: raw.generated_at ?? raw.generatedAt ?? "—",
    usage: {
      events: usage.total_events ?? usage.events ?? raw.total_events ?? "—",
      calls: usage.permission_calls ?? usage.calls ?? raw.permission_calls ?? "—",
      days: usage.active_days ?? usage.days ?? "—",
      last: usage.last_used ?? raw.last_used ?? "Not provided by API"
    },
    current: raw.current_policy ?? raw.currentPolicy ?? {
      effect: "Allow",
      action,
      resource,
      condition: "See generated policy"
    },
    recommended: raw.recommended_policy ?? raw.recommendedPolicy ?? {
      effect: verdict === "REMOVE" ? "Deny / remove" : "Allow",
      action,
      resource,
      condition: verdict === "KEEP" ? "No change" : "Admin review"
    }
  };
}

async function loadAllRecommendations() {
  let token = null;
  const all = [];

  // The backend explicitly requires next_token to be passed unchanged.
  do {
    const query = token ? { next_token: token } : {};
    const payload = await apiFetch("/api/v1/recommendations", {}, query);
    const page = normalizeListPayload(payload);
    all.push(...page.items.map(normalizeRecommendation));
    token = page.nextToken || null;
  } while (token);

  return all;
}

async function checkHealth() {
  try {
    const result = await apiFetch("/api/health");
    return result?.status === "ok";
  } catch {
    return false;
  }
}

async function loadRecommendations() {
  if (!API_CONFIG.USE_API) {
    liveApi = false;
    recs = [];
    return;
  }

  try {
    $("list").innerHTML = '<div class="empty">Loading recommendations…</div>';
    recs = await loadAllRecommendations();
    liveApi = true;

    if (!recs.length) {
      $("list").innerHTML = '<div class="empty">The API returned no recommendations.</div>';
    }

    toast(`Loaded ${recs.length.toLocaleString()} recommendations.`);
  } catch (error) {
    liveApi = false;
    recs = [];
    $("list").innerHTML = `<div class="empty"><h3>Unable to load recommendations</h3><p>${esc(error.message)}</p><button class="action" id="retryRecommendations">Retry</button></div>`;
    $("retryRecommendations")?.addEventListener("click", refreshLiveData);
  }
}

function login() {
  const email = $("email").value.trim().toLowerCase();
  const password = $("password").value;
  $("loginError").textContent = "";

  if (email === ADMIN.email.toLowerCase() && password === ADMIN.password) {
    sessionStorage.ig = "1";
    $("loginScreen").classList.add("hidden");
    $("app").classList.remove("hidden");
    renderAll();
    refreshLiveData();
  } else {
    $("loginError").textContent = "Invalid reviewer credentials.";
  }
}

$("loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  login();
});

function eyeIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-5 9.5-5 9.5 5 9.5 5-3.4 5-9.5 5-9.5-5-9.5-5Z"/><circle cx="12" cy="12" r="2.5"/></svg>`;
}

function setupPasswordToggle(buttonId, inputId) {
  const button = $(buttonId);
  const input = $(inputId);
  if (!button || !input) return;

  button.addEventListener("click", () => {
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    button.innerHTML = eyeIcon();
    button.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
    button.setAttribute("title", isPassword ? "Hide password" : "Show password");
  });
}

setupPasswordToggle("togglePassword", "password");
setupPasswordToggle("toggleNewPassword", "newPassword");
setupPasswordToggle("toggleConfirmPassword", "confirmPassword");

const resetModal = $("resetModal");
const resetForm = $("resetForm");
let resetVerified = false;

$("forgotPassword")?.addEventListener("click", () => {
  resetModal.classList.remove("hidden");
  $("resetEmail").value = $("email").value.trim();
  $("resetMessage").textContent = "Enter your Admin email address to continue.";
  $("resetMessage").className = "";
  $("resetError").textContent = "";
  $("newPasswordFields").classList.add("hidden");
  $("newPassword").value = "";
  $("confirmPassword").value = "";
  $("resetSubmit").textContent = "Verify email";
  $("resetSubmit").onclick = null;
  resetVerified = false;
  setTimeout(() => $("resetEmail").focus(), 50);
});

$("closeReset")?.addEventListener("click", () => resetModal.classList.add("hidden"));
resetModal?.addEventListener("click", (event) => {
  if (event.target === resetModal) resetModal.classList.add("hidden");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && resetModal && !resetModal.classList.contains("hidden")) {
    resetModal.classList.add("hidden");
  }
});

resetForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  $("resetError").textContent = "";

  const email = $("resetEmail").value.trim().toLowerCase();

  if (!resetVerified) {
    if (email !== ADMIN.email.toLowerCase()) {
      $("resetError").textContent = "No Admin account was found with this email.";
      return;
    }

    resetVerified = true;
    $("newPasswordFields").classList.remove("hidden");
    $("resetMessage").textContent = "Email verified. Create a new Admin password.";
    $("resetMessage").className = "success";
    $("resetSubmit").textContent = "Update password";
    $("newPassword").focus();
    return;
  }

  const newPassword = $("newPassword").value;
  const confirmPassword = $("confirmPassword").value;

  if (newPassword.length < 6) {
    $("resetError").textContent = "Password must contain at least 6 characters.";
    return;
  }
  if (newPassword !== confirmPassword) {
    $("resetError").textContent = "Passwords do not match.";
    return;
  }

  ADMIN.password = newPassword;
  localStorage.setItem("ig-admin-password", newPassword);
  localStorage.setItem("ig-admin-email", ADMIN.email);

  $("resetMessage").textContent = "Password updated successfully. You can now sign in.";
  $("resetMessage").className = "success";
  $("resetError").textContent = "";
  $("resetSubmit").textContent = "Close";
  $("resetSubmit").onclick = () => {
    resetModal.classList.add("hidden");
    $("password").value = "";
    $("password").focus();
  };
});

$("logout").onclick = () => {
  sessionStorage.removeItem("ig");
  $("app").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
};

async function renderAll() {
  renderRec();
  renderPoliciesFromApi();
  renderAudit();
  renderUsers();
  renderRoles();
}

async function refreshLiveData() {
  if (!API_CONFIG.USE_API) return;
  const healthy = await checkHealth();
  setPipelineStatus(healthy);
  if (healthy) {
    await loadRecommendations();
    renderAll();
  }
}

function setPipelineStatus(healthy) {
  const el = document.querySelector(".online");
  if (!el) return;
  el.textContent = healthy ? "● API online" : "● API unavailable";
  el.classList.toggle("offline", !healthy);
}

function nav(view) {
  document.querySelectorAll(".view").forEach((x) => x.classList.add("hidden"));
  $(view).classList.remove("hidden");
  document.querySelectorAll(".nav").forEach((x) => x.classList.toggle("active", x.dataset.view === view));
  if (view === "recommendations") renderRec();
  if (view === "policies") renderPoliciesFromApi();
  if (view === "audit") renderAudit();
  if (view === "users") renderUsers();
  if (view === "roles") renderRoles();
}

document.querySelectorAll(".nav").forEach(
  (x) => (x.onclick = (e) => { e.preventDefault(); nav(x.dataset.view); })
);

function renderRec() {
  let q = $("globalSearch").value.trim().toLowerCase(),
      r = $("risk").value,
      s = $("status").value;

  let a = recs.filter((x) =>
    `${x.user} ${x.userId} ${x.role} ${x.permission} ${x.resource} ${x.id} ${x.verdict}`
      .toLowerCase().includes(q) &&
    (r === "ALL" || x.level === r) &&
    (s === "ALL" || x.status === s)
  );

  $("total").textContent = recs.length.toLocaleString();
  $("pending").textContent = recs.filter((x) => x.status === "PENDING").length.toLocaleString();
  $("high").textContent = recs.filter((x) => ["HIGH","CRITICAL"].includes(x.level)).length.toLocaleString();
  $("resolved").textContent = recs.filter((x) => x.status !== "PENDING").length.toLocaleString();
  $("pendingBadge").textContent = recs.filter((x) => x.status === "PENDING").length.toLocaleString();

  if (!a.length) {
    $("list").innerHTML = '<div class="empty">No recommendations match these filters.</div>';
    return;
  }

  $("list").innerHTML =
    '<div class="table-head"><div>Identity</div><div>Permission</div><div>Risk</div><div>Verdict</div><div>Status</div><div></div></div>' +
    a.map((x) =>
      `<div class="row" data-id="${esc(x.id)}">
        <div><b>${esc(x.user)}</b><div class="sub">${esc(x.role)}</div></div>
        <div><b>${esc(x.permission)}</b><div class="sub">${esc(x.resource)}</div></div>
        <div><span class="risk">${x.score}</span> ${badge(x.level)}</div>
        <div>${badge(x.verdict)}</div><div>${badge(x.status)}</div>
        <div><button class="review-btn">Review →</button></div>
      </div>`
    ).join("");

  document.querySelectorAll(".row").forEach((x) => x.onclick = () => detail(x.dataset.id));
}

async function detail(id) {
  const local = recs.find((x) => String(x.id) === String(id));
  if (!local) return;

  selected = local;
  if (liveApi) {
    try {
      const raw = await apiFetch(`/api/v1/recommendations/${encodeURIComponent(id)}`);
      const detailRecord = normalizeRecommendation(raw);

      // The list endpoint is already known-good. Some detail responses may
      // omit display fields or use a wrapper, so never replace valid list data
      // with `unknown-*` just because a detail field was absent.
      selected = {
        ...local,
        ...detailRecord,
        id: detailRecord.id || local.id,
        userId: detailRecord.userId && detailRecord.userId !== "unknown-user" ? detailRecord.userId : local.userId,
        user: detailRecord.user && detailRecord.user !== "unknown-user" ? detailRecord.user : local.user,
        role: detailRecord.role && detailRecord.role !== "unknown-role" ? detailRecord.role : local.role,
        permission: detailRecord.permission || local.permission,
        resource: detailRecord.resource || local.resource,
        score: Number.isFinite(detailRecord.score) && detailRecord.score !== 0 ? detailRecord.score : local.score,
        level: detailRecord.level !== "UNKNOWN" ? detailRecord.level : local.level,
        verdict: detailRecord.verdict || local.verdict,
        status: detailRecord.status || local.status,
        reason: detailRecord.reason || local.reason
      };
      recs = recs.map(x => String(x.id) === String(id) ? selected : x);
    } catch (error) {
      toast(`Could not load recommendation detail: ${error.message}`);
    }
  }

  $("recommendations").classList.add("hidden");
  $("detail").classList.remove("hidden");
  document.querySelectorAll(".nav").forEach((x) => x.classList.remove("active"));
  renderDetail();
}

function renderPolicyValue(key, value) {
  const normalizedKey = String(key || "").toLowerCase();

  // IAM Statement is commonly an array of statement objects. Never stringify
  // those objects directly because that produces the unhelpful "[object Object]".
  if (normalizedKey === "statement" || normalizedKey === "statements") {
    let statements = value;

    // Some APIs return Statement as a JSON string.
    if (typeof statements === "string") {
      try { statements = JSON.parse(statements); } catch {}
    }

    if (!Array.isArray(statements)) statements = [statements];

    return `
      <div class="policy-statements">
        ${statements.map((statement, index) => renderPolicyStatement(statement, index)).join("")}
      </div>
    `;
  }

  if (Array.isArray(value)) {
    const items = value.flatMap(item => Array.isArray(item) ? item : [item]);
    return `<div class="permission-tags">${items.map(item => {
      if (item && typeof item === "object") {
        return `<span class="permission-tag permission-object">${esc(JSON.stringify(item))}</span>`;
      }
      return `<span class="permission-tag">${esc(item)}</span>`;
    }).join("")}</div>`;
  }

  if (value && typeof value === "object") {
    return `<pre class="policy-json">${esc(JSON.stringify(value, null, 2))}</pre>`;
  }

  return `<span class="policy-text">${esc(value ?? "—")}</span>`;
}

function renderPolicyStatement(statement, index) {
  // Handle a primitive statement gracefully.
  if (!statement || typeof statement !== "object") {
    return `
      <div class="policy-statement">
        <div class="statement-title">Statement ${index + 1}</div>
        <div class="permission-tags">
          <span class="permission-tag">${esc(statement ?? "—")}</span>
        </div>
      </div>
    `;
  }

  const effect = statement.Effect ?? statement.effect ?? "—";
  const action = statement.Action ?? statement.action ?? statement.Actions ?? statement.actions ?? [];
  const resource = statement.Resource ?? statement.resource ?? [];
  const condition = statement.Condition ?? statement.condition;
  const principal = statement.Principal ?? statement.principal;

  const actions = Array.isArray(action) ? action : [action];
  const resources = Array.isArray(resource) ? resource : [resource];

  const renderValues = (values, cls = "") => `
    <div class="permission-tags ${cls}">
      ${values.filter(v => v !== undefined && v !== null && v !== "").map(v => {
        if (typeof v === "object") {
          return `<span class="permission-tag permission-object">${esc(JSON.stringify(v))}</span>`;
        }
        return `<span class="permission-tag">${esc(v)}</span>`;
      }).join("") || '<span class="policy-empty">—</span>'}
    </div>
  `;

  return `
    <div class="policy-statement">
      <div class="statement-title">Statement ${index + 1}</div>

      <div class="statement-field">
        <span class="statement-key">Effect</span>
        <span class="effect-badge ${String(effect).toLowerCase() === "allow" ? "allow" : "deny"}">${esc(effect)}</span>
      </div>

      <div class="statement-field statement-field-stack">
        <span class="statement-key">Action</span>
        ${renderValues(actions)}
      </div>

      <div class="statement-field statement-field-stack">
        <span class="statement-key">Resource</span>
        ${renderValues(resources)}
      </div>

      ${condition ? `
        <div class="statement-field statement-field-stack">
          <span class="statement-key">Condition</span>
          <pre class="policy-json">${esc(JSON.stringify(condition, null, 2))}</pre>
        </div>` : ""}

      ${principal ? `
        <div class="statement-field statement-field-stack">
          <span class="statement-key">Principal</span>
          <pre class="policy-json">${esc(JSON.stringify(principal, null, 2))}</pre>
        </div>` : ""}
    </div>
  `;
}

function renderPolicyEntries(entries) {
  return entries.map(([key, value]) => `
    <div class="policy-row">
      <span class="policy-key">${esc(key)}</span>
      <div class="policy-value">${renderPolicyValue(key, value)}</div>
    </div>
  `).join("");
}

function renderDetail() {
  const x = selected;
  if (!x) return;

  $("detailBox").innerHTML =
    `<div class="detail-head">
      <div><small class="sub">RECOMMENDATION ${esc(x.id)}</small>
        <h2>${esc(x.user)} · ${esc(x.permission)}</h2>
        <div class="sub">${esc(x.role)} · ${liveApi ? "API recommendation" : "Recommendation data unavailable"}</div>
      </div>
      <div class="actions">${badge(x.level + " RISK · " + x.score + "/100")}
        ${x.status === "PENDING"
          ? '<button class="action" id="reject">Reject</button><button class="action approve" id="approve">Approve</button>'
          : badge(x.status)}
      </div>
    </div>
    <div class="usage">
      <div><span>CloudTrail events</span><strong>${esc(x.usage.events)}</strong></div>
      <div><span>Permission calls</span><strong>${esc(x.usage.calls)}</strong></div>
      <div><span>Active days</span><strong>${esc(x.usage.days)}</strong></div>
      <div><span>Last used</span><strong>${esc(x.usage.last)}</strong></div>
    </div>
    <div class="detail-grid">
      <div class="policy">
        <h3>Current permission</h3>
        <div class="policy-live-data"><div class="policy-loading">${liveApi ? "Loading generated policy…" : "Using recommendation context"}</div></div>
      </div>
      ${policy("Recommended permission", "after", x.recommended)}
    </div>
    <div class="explain">
      <h3>Why did the ML analysis recommend this?</h3>
      <p>${esc(x.reason)}</p>
      ${x.reasonCodes.length ? `<div class="tags detail-tags">${x.reasonCodes.map(code => `<span class="tag">${esc(code)}</span>`).join("")}</div>` : ""}
    </div>
    <div class="meta">
      <div><span>Identity</span><strong>${esc(x.userId)}</strong></div>
      <div><span>Role</span><strong>${esc(x.role)}</strong></div>
      <div><span>Risk</span><strong>${esc(x.level)} / ${x.score}</strong></div>
      <div><span>Verdict</span><strong>${esc(x.verdict)}</strong></div>
      <div><span>Status</span><strong>${esc(x.status)}</strong></div>
      <div><span>Model</span><strong>${esc(x.modelVersion)}</strong></div>
      <div><span>Generated</span><strong>${esc(x.generatedAt)}</strong></div>
    </div>`;

  $("approve")?.addEventListener("click", () => decide("APPROVED"));
  $("reject")?.addEventListener("click", () => decide("REJECTED"));

  // Load the selected user's generated policy only when the Admin opens a
  // recommendation. This replaces the previous N-user burst of policy calls.
  if (liveApi && typeof x.userId === "string" && x.userId.trim() && x.userId !== "unknown-user") {
    loadPolicyForUser(x.userId).then(raw => {
      if (!raw || selected?.id !== x.id) return;
      const entries = policyEntries(raw);
      const policyPanel = document.querySelector(".policy-live-data");
      if (policyPanel) {
        policyPanel.innerHTML = entries.length
          ? renderPolicyEntries(entries)
          : `<pre class="api-json">${esc(JSON.stringify(raw, null, 2))}</pre>`;
      }
    });
  }
}

function policy(title, c, p) {
  return `<div class="policy"><h3 class="${c}">${title}</h3>${Object.entries(p || {})
    .map(([k,v]) => `<div class="policy-row"><span class="policy-key">${esc(k)}</span><div class="policy-value">${renderPolicyValue(k, v)}</div></div>`).join("")}</div>`;
}

$("back").onclick = () => {
  $("detail").classList.add("hidden");
  $("recommendations").classList.remove("hidden");
  document.querySelector("[data-view=recommendations]").classList.add("active");
  renderRec();
};

async function decide(status) {
  if (!selected || selected.status !== "PENDING") return;

  const id = selected.id;
  const button = status === "APPROVED" ? $("approve") : $("reject");
  if (button) {
    button.disabled = true;
    button.textContent = "Saving…";
  }

  try {
    if (liveApi) {
      if (status === "APPROVED") {
        await apiFetch(`/api/v1/recommendations/${encodeURIComponent(id)}/approve`, {
          method: "PATCH",
          body: JSON.stringify({ approved_by: ADMIN.email })
        });
      } else {
        await apiFetch(`/api/v1/recommendations/${encodeURIComponent(id)}/reject`, {
          method: "PATCH",
          body: JSON.stringify({ rejection_reason: "Permission is not required." })
        });
      }

      // Refresh the authoritative recommendation after the decision.
      const raw = await apiFetch(`/api/v1/recommendations/${encodeURIComponent(id)}`);
      selected = normalizeRecommendation(raw);
      recs = recs.map(x => String(x.id) === String(id) ? selected : x);
    } else {
      selected.status = status;
      recs = recs.map(x => String(x.id) === String(id) ? selected : x);
    }

    // Backend handoff does not provide an Audit Log endpoint, so the dashboard
    // keeps a local reviewer audit trail. This can be swapped for a backend
    // audit endpoint later without changing the UI.
    audit.unshift({
      id: "AUD-" + Date.now().toString().slice(-7),
      rec: selected.id,
      time: new Date().toLocaleString("en-IN", { dateStyle:"medium", timeStyle:"short" }),
      user: selected.user,
      permission: selected.permission,
      decision: selected.status,
      admin: ADMIN.email,
      note: liveApi
        ? "Decision recorded by the review workflow."
        : "Decision recorded by the review workflow."
    });
    saveAudit();

    renderAll();
    detail(selected.id);
    toast(status === "APPROVED" ? "Recommendation approved and recorded." : "Recommendation rejected and recorded.");
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.textContent = status === "APPROVED" ? "Approve" : "Reject";
    }
    toast(`Could not ${status.toLowerCase()} recommendation: ${error.message}`);
  }
}

function renderPolicies() {
  if (!liveApi) {
    $("policiesBox").innerHTML = '<div class="empty"><h3>Policy service unavailable</h3><p>Connect the API to inspect generated IAM policies.</p></div>';
    return;
  }

  const q = $("globalSearch").value.trim().toLowerCase();
  const allUserIds = [...new Set(recs.map(x => x.userId).filter(Boolean))];

  const userIds = allUserIds.filter(userId => {
    const records = recs.filter(x => x.userId === userId);
    if (!q) return true;
    return records.some(x =>
      `${x.user || ""} ${x.userId || ""} ${x.role || ""} ${x.permission || ""} ${x.resource || ""}`
        .toLowerCase().includes(q)
    );
  });

  if (!userIds.length) {
    $("policiesBox").innerHTML = `
      <div class="policy-inventory">
        <div class="policy-inventory-head">
          <div>
            <div class="section-kicker">IDENTITY POLICY INVENTORY</div>
            <h2>No matching identities</h2>
            <p>Try another user, role, permission, or resource in the global search.</p>
          </div>
          <div class="policy-count">0 identities</div>
        </div>
      </div>`;
    return;
  }

  $("policiesBox").innerHTML = `
    <div class="policy-inventory">
      <div class="policy-inventory-head">
        <div>
          <div class="section-kicker">IDENTITY POLICY INVENTORY</div>
          <h2>IAM identities</h2>
          <p>Select an identity to inspect its generated policy. Policies are loaded only when requested.</p>
        </div>
        <div class="policy-count">${userIds.length} ${userIds.length === 1 ? "identity" : "identities"}</div>
      </div>
      <div class="policy-user-picker">
        ${userIds.slice(0, 100).map(userId => {
          const r = recs.find(x => x.userId === userId);
          const userRecords = recs.filter(x => x.userId === userId);
          const permissions = new Set(userRecords.map(x => x.permission).filter(Boolean));
          const risk = userRecords.some(x => x.level === "CRITICAL") ? "CRITICAL" :
            userRecords.some(x => x.level === "HIGH") ? "HIGH" :
            userRecords.some(x => x.level === "MEDIUM") ? "MEDIUM" : "LOW";
          return `<button class="policy-user-btn" data-user-id="${esc(userId)}">
            <span class="policy-user-icon">${esc((r?.user || userId).slice(0,1).toUpperCase())}</span>
            <span class="policy-user-main">
              <b>${esc(r?.user || userId)}</b>
              <span>${esc(r?.role || "IAM identity")}</span>
            </span>
            <span class="policy-user-meta">
              <span>${permissions.size} permission${permissions.size === 1 ? "" : "s"}</span>
              ${badge(risk)}
            </span>
            <span class="policy-user-arrow">→</span>
          </button>`;
        }).join("")}
      </div>
    </div>`;

  $("policiesBox").querySelectorAll(".policy-user-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      await showUserPolicy(btn.dataset.userId);
    });
  });
}

function policyObjectFromResponse(raw) {
  // The handoff defines the policy endpoint but does not prescribe one exact
  // JSON shape. Keep this adapter tolerant of common wrappers.
  const root = raw?.data && typeof raw.data === "object" ? raw.data : raw;
  return root?.policy || root?.generated_policy || root?.generatedPolicy || root?.policy_document || root?.policyDocument || root;
}

function policyEntries(raw) {
  const policyData = policyObjectFromResponse(raw);
  if (!policyData || typeof policyData !== "object") return [];

  if (Array.isArray(policyData)) {
    return policyData.map((value, index) => [`statement_${index + 1}`, value]);
  }

  // Handle IAM policy documents that contain Statement arrays.
  if (Array.isArray(policyData.Statement)) {
    return [
      ["Version", policyData.Version ?? "—"],
      ["Statement", policyData.Statement]
    ];
  }

  return Object.entries(policyData);
}

async function showUserPolicy(userId) {
  $("policiesBox").innerHTML = '<div class="empty">Loading policy…</div>';
  const raw = await loadPolicyForUser(userId);

  if (!raw) {
    $("policiesBox").innerHTML = `
      <div class="empty">
        <h3>Policy could not be loaded</h3>
        <p>Only this selected user's policy request failed. Recommendations remain available.</p>
        <button class="action" id="retryPolicy">Retry</button>
      </div>`;
    $("retryPolicy")?.addEventListener("click", () => showUserPolicy(userId));
    return;
  }

  const r = recs.find(x => x.userId === userId);
  const entries = policyEntries(raw);
  $("policiesBox").innerHTML = `
    <article class="list-card">
      <div class="policy-detail-head">
        <div>
          <small class="sub">GENERATED POLICY</small>
          <h3>${esc(r?.user || userId)}</h3>
          <div class="sub">${esc(userId)}</div>
        </div>
        <button class="action" id="backToPolicyUsers">← All identities</button>
      </div>
      ${entries.length
        ? renderPolicyEntries(entries)
        : `<pre class="api-json">${esc(JSON.stringify(raw, null, 2))}</pre>`}
    </article>`;

  $("backToPolicyUsers")?.addEventListener("click", renderPolicies);
}

async function loadPolicyForUser(userId) {
  if (!liveApi) return null;
  if (policyCache.has(userId)) return policyCache.get(userId);

  try {
    const raw = await apiFetch(`/api/v1/policies/${encodeURIComponent(userId)}`);
    policyCache.set(userId, raw);
    return raw;
  } catch (error) {
    // Do not turn one policy failure into a dashboard-wide failure.
    console.error("Policy request failed", { userId, status: error.status, body: error.body, message: error.message });
    toast(`Policy request failed for ${userId}: ${error.status ? `HTTP ${error.status}` : error.message}`);
    return null;
  }
}

async function renderPoliciesFromApi() {
  renderPolicies();
}

function renderAudit() {
  if (!audit.length) {
    $("auditBox").innerHTML =
      '<div class="empty">No Admin decisions yet. Review a pending recommendation to create an audit record.</div>';
    return;
  }

  $("auditBox").innerHTML =
    '<div class="audit-row audit-head"><div>Time</div><div>Recommendation</div><div>IAM identity</div><div>Decision</div><div>Reviewer</div></div>' +
    audit.map((x) =>
      `<div class="audit-row">
        <div>${esc(x.time)}</div>
        <div><b class="audit-id">${esc(x.rec)}</b><div class="sub">${esc(x.permission)}</div></div>
        <div>${esc(x.user)}</div><div>${badge(x.decision)}</div><div>${esc(x.admin)}</div>
      </div>`
    ).join("");
}

async function renderUsers() {
  const byUser = new Map();

  recs.forEach(r => {
    if (!r.userId || r.userId === "unknown-user") return;
    const current = byUser.get(r.userId);
    if (!current) {
      byUser.set(r.userId, {
        id: r.userId,
        name: r.user || r.userId,
        role: r.role || "—",
        risk: r.level,
        permissions: new Set(r.permission ? [r.permission] : []),
        recommendations: 1
      });
    } else {
      current.permissions.add(r.permission);
      current.recommendations += 1;
      if (current.risk === "LOW" && ["MEDIUM","HIGH","CRITICAL"].includes(r.level)) current.risk = r.level;
    }
  });

  const query = $("globalSearch").value.trim().toLowerCase();
  const users = [...byUser.values()].filter(u => !query ||
    `${u.name} ${u.id} ${u.role} ${[...u.permissions].join(" ")}`.toLowerCase().includes(query)
  );

  if (!users.length) {
    $("usersBox").innerHTML = '<div class="empty"><h3>No IAM identities available</h3><p>User records will appear after recommendation data is loaded.</p></div>';
    return;
  }

  $("usersBox").innerHTML = users.map(u =>
    `<article class="list-card">
      <div style="display:flex;align-items:center;gap:11px">
        <div class="avatar">${esc((u.name || u.id)[0])}</div>
        <div><h3>${esc(u.name)}</h3><div class="sub">${esc(u.id)} · ${esc(u.role)}</div></div>
        <span style="margin-left:auto">${u.risk ? badge(u.risk) : ""}</span>
      </div>
      <div class="tags" style="margin-top:14px">
        <span class="tag">${u.recommendations} recommendation${u.recommendations === 1 ? "" : "s"}</span>
        <span class="tag">${u.permissions.size} observed permission${u.permissions.size === 1 ? "" : "s"}</span>
      </div>
      <div class="tags" style="margin-top:9px">${[...u.permissions].map(p => `<span class="tag">${esc(p)}</span>`).join("")}</div>
    </article>`
  ).join("");
}

function renderRoles() {
  const query = $("globalSearch").value.trim().toLowerCase();
  const roles = [...new Map(recs.map(r => [r.role, r])).values()].filter(x =>
    !query || `${x.role} ${x.permission} ${x.resource}`.toLowerCase().includes(query)
  );
  $("rolesBox").innerHTML = roles.length
    ? roles.map(x =>
      `<article class="list-card">
        <h3>${esc(x.role)}</h3>
        <div class="sub">Observed through recommendation records</div>
        <div class="tags" style="margin-top:10px"><span class="tag">${esc(x.permission)}</span><span class="tag">${esc(x.resource)}</span></div>
      </article>`).join("")
    : '<div class="empty">No role data available.</div>';
}

/* Search / filters */
$("risk").onchange = renderRec;
$("status").onchange = renderRec;
$("globalSearch").oninput = () => {
  if (!$('recommendations').classList.contains('hidden')) renderRec();
  if (!$('policies').classList.contains('hidden')) renderPolicies();
  if (!$('users').classList.contains('hidden')) renderUsers();
  if (!$('roles').classList.contains('hidden')) renderRoles();
};

function toast(t) {
  const x = $("toast");
  x.textContent = t;
  x.classList.add("show");
  setTimeout(() => x.classList.remove("show"), 3000);
}

function theme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem("ig-theme", t);
  $("theme").textContent = t === "dark" ? "☾ Dark" : "☀ Light";
}

$("theme").onclick = () => theme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
theme(localStorage.getItem("ig-theme") || "dark");

if (sessionStorage.ig === "1") {
  $("loginScreen").classList.add("hidden");
  $("app").classList.remove("hidden");
  renderAll();
  refreshLiveData();
} else {
  // Do not call the backend before Admin authentication.
  setPipelineStatus(false);
}
