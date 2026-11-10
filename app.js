/* 50인 마피아 웹앱 — 화면만 그린다. 모든 판정과 정보 제한은 서버(api 함수)가 한다. */
(function () {
"use strict";
const cfg = window.MAFIA_CONFIG || {};
const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
const EMAIL_RE = /^(24|25|26)\d{3}@sshs\.hs\.kr$/i;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ko = (a, b) => a.localeCompare(b, "ko-KR");
let V = null, TAB = "home", ADMIN = null, CAM = null, lastLoad = 0;
// 가리기: 앱을 열거나 다른 앱에 다녀오면 직업·개인 정보가 가려진다
let REVEAL = false, lastTouch = Date.now();
const HIDE_AFTER_MS = 3 * 60 * 1000;
function lockHTML(what) {
  return `<div class="card lock" style="text-align:center;align-items:center"><p class="big" aria-hidden="true">🔒</p><p>${what}</p><button class="btn full" type="button" data-reveal="1">눌러서 보기</button><p class="small muted">주변에 다른 사람이 없을 때 여세요. 3분 동안 손대지 않거나 다른 앱에 다녀오면 다시 가려집니다.</p></div>`;
}
function setReveal(on) { REVEAL = on; lastTouch = Date.now(); if (!(CAM && CAM.session)) render(); }

const DEFAULT_COMPOSITION = { "보스": 1, "암살자": 1, "추적자": 1, "마담": 1, "스파이": 1, "조작범": 1, "청부업자": 1, "교주": 1, "광신도": 1, "경찰": 3, "수사관": 1, "기자": 1, "목격자": 1, "점쟁이": 1, "관찰자": 1, "의사": 2, "경호원": 1, "군인": 1, "은둔자": 1, "사제": 2, "영매": 1, "이단심판관": 2, "교도관": 1, "선도부장": 1, "사냥꾼": 1, "시장": 1, "변호사": 1, "우체부": 1, "연인": 2, "동료": 15 };
const DESC = {
  police: "1명이 마피아인지 조사합니다. 결과는 내일 07:30에 옵니다.",
  seer: "2명을 골라 둘 중에 마피아가 있는지 봅니다. 보스도 걸립니다.",
  observer: "1명을 지켜보고, 오늘 그 사람에게 능력을 쓴 사람 명단을 받습니다.",
  spy: "1명의 직업을 알아냅니다. 소속은 나오지 않습니다.",
  convert: "1명을 포섭합니다. 결과는 성공/실패로만 옵니다.",
  inquisitor: "1명을 지목합니다. 교단 팀이면 처단됩니다.",
  contract: "시민 3명의 직업을 적습니다. 모두 맞으면 3명이 죽습니다. 동료는 적을 수 없습니다.",
  reporter: "1명의 직업을 내일 아침 전체에 공개합니다.",
  medium: "마피아 킬로 죽은 사람 1명을 되살립니다. 교주와 실종자는 안 됩니다.",
  assassin: "오늘 팀이 이 사람을 찍으면 모든 보호를 무시하고 죽입니다.",
  tracker: "1명을 골라, 그 사람이 오늘 능력이나 킬 사진을 쓴 대상을 알아냅니다.",
  doctor: "내일 이 사람을 마피아 킬에서 1번 지킵니다. 같은 사람 연속 불가.",
  guard: "내일 이 사람이 공격받으면 내가 대신 죽습니다.",
  madam: "내일 이 사람의 능력을 봉인합니다. 같은 사람 연속 불가.",
  jailer: "내일 이 사람의 능력과 킬 사진을 막습니다.",
  silencer: "내일 이 사람이 투표하지 못하게 합니다. 같은 사람 연속 불가.",
  priest: "내일 이 사람이 포섭되지 않게 합니다.",
  framer: "내일 이 사람의 조사 결과(경찰·점쟁이)를 뒤집습니다.",
  hide: "내일 하루 숨습니다. 킬과 포섭을 피하지만 투표는 못 합니다.",
  lawyer: "오늘 이 사람이 처형되면 막습니다. 쓰는 순간 정체가 공개됩니다.",
  letter: "1명에게 익명 메시지를 보냅니다 (하루 1번, 100자).",
  heir: "교주가 처음 죽을 때 교주를 이을 사람입니다.",
  hunter: "내가 죽을 때 함께 데려갈 사람입니다. 언제든 바꿀 수 있습니다.",
  deadchat: "카카오톡 오픈채팅으로 사망자방을 만들고 링크를 넣으세요. 이미 죽은 사람과 앞으로 죽는 사람에게 앱이 자동으로 링크를 보냅니다.",
  mayor: "정체를 공개하면 모두에게 시장 표시가 뜨고, 그때부터 투표권이 2표가 됩니다. 대신 의사 보호를 못 받습니다.",
};
const CAUSE = { mafia: "마피아 킬", vote: "투표 처형", inquisitor: "이단 심판", contract: "청부", witness: "목격자 연쇄", hunter: "사냥꾼", admin: "운영자 판정" };

// ------------------------------------------------------------------ 공통
async function api(op, data = {}) {
  const { data: res, error } = await sb.functions.invoke("api", { body: { op, ...data } });
  if (error) {
    let msg = "요청에 실패했습니다.";
    try { const j = await error.context.json(); if (j.error) msg = j.error; } catch (e) {}
    throw new Error(msg);
  }
  if (res && res.error) throw new Error(res.error);
  return res;
}
function toast(t, ms = 2800) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (el.hidden = true), ms); }
function confirmBox(text, okLabel = "확인") {
  return new Promise((res) => {
    $("modalBox").innerHTML = `<p>${esc(text)}</p><div class="row" style="justify-content:flex-end"><button class="btn ghost" id="mNo" type="button">취소</button><button class="btn" id="mOk" type="button">${esc(okLabel)}</button></div>`;
    $("modal").hidden = false;
    $("mNo").onclick = () => { $("modal").hidden = true; res(false); };
    $("mOk").onclick = () => { $("modal").hidden = true; res(true); };
  });
}
const kst = (ms) => { const d = new Date(ms + 9 * 3600e3); const p = (n) => String(n).padStart(2, "0"); return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`; };
const shortTime = (iso) => kst(Date.parse(iso)).slice(5, 16);
const teamCls = (t) => (t === "마피아" ? "m" : t === "교단" ? "c" : "t");
const nameOf = (sid) => { const p = V && V.everyone && V.everyone.find((x) => x.sid === sid); return p ? p.name : ""; };
const opt = (list, sel) => list.map((p) => `<option value="${esc(p.sid)}"${p.sid === sel ? " selected" : ""}>${esc(p.name)}</option>`).join("");
const aliveOthers = () => V.everyone.filter((x) => x.alive && x.sid !== V.me.sid);
const aliveAll = () => V.everyone.filter((x) => x.alive);

// ------------------------------------------------------------------ 로그인
async function boot() {
  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR-PROJECT")) {
    $("main").innerHTML = `<div class="center"><p class="big">설정이 필요합니다</p><p class="muted">web/config.js에 Supabase 주소와 anon 키를 넣으세요.</p></div>`; return;
  }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return renderLogin();
  const email = session.user.email || "";
  await refresh(true, email);
}
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") renderLogin(); });

function renderLogin(msg) {
  $("tabs").hidden = true; $("hday").textContent = ""; $("hname").textContent = "";
  $("main").innerHTML = `<div class="center">
    <p class="big">50인 마피아</p>
    <p class="muted">학교 Google 계정(학번@sshs.hs.kr)으로 로그인하세요.</p>
    ${msg ? `<p class="warn">${esc(msg)}</p>` : ""}
    <button class="btn full" id="loginBtn" type="button">학교 계정으로 로그인</button>
    ${cfg.RULEBOOK_URL ? `<a class="small" href="${esc(cfg.RULEBOOK_URL)}">규칙서 보기</a>` : ""}
  </div>`;
  $("loginBtn").onclick = () => sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname, queryParams: { hd: "sshs.hs.kr", prompt: "select_account" } } });
}
async function logout() { stopCam(); await sb.auth.signOut(); renderLogin(); }

async function refresh(first, email) {
  try {
    V = await api("me"); lastLoad = Date.now(); V.skew = (V.now || Date.now()) - Date.now();
    if (!V.admin && email && !EMAIL_RE.test(email)) { await sb.auth.signOut(); return renderLogin("학교 계정이 아닙니다."); }
    render();
  } catch (e) {
    if (first) { await sb.auth.signOut(); return renderLogin(e.message); }
    toast(e.message);
  }
}

// ------------------------------------------------------------------ 화면 틀
function render() {
  const info = V.info || {};
  const head = V.status === "none" ? "" : info.phase === "before" ? "시작 전" : info.phase === "ended" || V.status === "ended" ? "게임 종료" : `${info.day}일차 · ${info.phase === "night" ? "07:30 발표 전" : info.weekday ? "평일" : "주말 휴전"}`;
  $("hday").textContent = head;
  const canHide = V.me && V.me.job;
  $("hname").innerHTML = `${canHide ? `<button type="button" id="hideBtn" class="btn ghost small" style="padding:4px 10px">${REVEAL ? "🔒 가리기" : "👁 보기"}</button> ` : ""}${esc(V.me ? V.me.name || "" : V.email || "")} · <a href="#" id="lo" class="muted">로그아웃</a>`;
  $("lo").onclick = (e) => { e.preventDefault(); logout(); };
  const hb = $("hideBtn"); if (hb) hb.onclick = () => setReveal(!REVEAL);
  const tabs = [["home", "🏠", "홈"]];
  if (V.me && V.me.job) tabs.push(["act", "✅", "행동"], ["people", "👥", "사람들"], ["cam", "📷", "카메라"]);
  if (V.me && V.me.job) tabs.push(["photos", "🖼️", "사진"]);
  if (V.admin) tabs.push(["admin", "🛠️", "관리"]);
  if (!tabs.some((t) => t[0] === TAB)) TAB = "home";
  $("tabs").hidden = tabs.length < 2;
  const todo = V.adminTodo ? V.adminTodo.questions + V.adminTodo.missions : 0;
  $("tabsIn").innerHTML = tabs.map(([k, i, l]) => `<button type="button" data-tab="${k}"${k === TAB ? ' aria-current="page"' : ""}><span class="i" style="position:relative">${i}${k === "admin" && todo ? `<span class="badge" aria-label="처리할 일 ${todo}개">${todo > 99 ? "99+" : todo}</span>` : ""}</span>${l}</button>`).join("");
  $("tabsIn").querySelectorAll("button").forEach((b) => (b.onclick = () => { if (TAB === "cam") stopCam(); TAB = b.dataset.tab; render(); window.scrollTo(0, 0); }));
  const m = $("main");
  if (TAB === "home") m.innerHTML = homeHTML();
  const locked = !REVEAL && V.me && V.me.job;
  if (TAB === "act") m.innerHTML = locked ? lockHTML("내 행동 화면이 가려져 있습니다.") : actHTML();
  if (TAB === "people") m.innerHTML = locked ? lockHTML("내가 아는 사람과 메모가 가려져 있습니다.") : peopleHTML();
  if (TAB === "cam") m.innerHTML = locked ? lockHTML("카메라 화면이 가려져 있습니다.") : camHTML();
  if (TAB === "photos") {
    if (locked) m.innerHTML = lockHTML("사진 화면이 가려져 있습니다.");
    else if (!V.canSeePhotos) m.innerHTML = `<div class="card"><h3>킬 사진</h3><p class="small muted">킬 사진은 수사관과 사망자만 볼 수 있습니다.</p></div>`;
    else { m.innerHTML = `<div class="card"><p class="muted">불러오는 중…</p></div>`; loadPhotos(); }
  }
  if (TAB === "admin") { m.innerHTML = `<div class="card"><p class="muted">불러오는 중…</p></div>`; loadAdmin(); }
  bind();
}

// ------------------------------------------------------------------ 홈
function homeHTML() {
  if (V.status === "none") return `<div class="card"><h2>아직 게임이 만들어지지 않았습니다</h2><p class="muted">운영자가 게임을 만들면 여기서 내 직업을 볼 수 있습니다.</p>${cfg.RULEBOOK_URL ? `<a href="${esc(cfg.RULEBOOK_URL)}">규칙서 보기</a>` : ""}</div>`;
  if (V.spectator) return `<div class="card"><h2>운영자 계정</h2><p class="muted">참가자가 아니라서 직업이 없습니다. 관리 탭을 쓰세요.</p></div>` + qaCardHTML();
  const me = V.me, info = V.info, cls = teamCls(me.team);
  let h = "";
  if (V.status === "ended" || info.phase === "ended") h += `<div class="card accent ${V.winner === "mafia" ? "m" : V.winner === "cult" ? "c" : "t"}"><h2>🏁 게임 종료 — ${V.winner === "draw" ? "무승부" : ({ town: "시민", mafia: "마피아", cult: "교단" }[V.winner] || "") + " 승리"}</h2></div>`;
  const sub = [];
  sub.push(`${me.team} 팀`);
  if (me.team === "마피아") sub.push(me.connected ? "접선됨" : "접선 대기");
  if (me.disciple === "일반") sub.push("일반 신도 · 교단 머릿수에 포함");
  if (me.group) sub.push(`동료 ${me.group}조`);
  if (me.armor) sub.push("방탄 1회 남음");
  if (me.mayor) sub.push("시장 공개함 · 2표");
  let priv = "";
  priv += `<div class="rolecard ${cls}"><div class="lbl">내 직업</div><div class="job">${esc(me.job)}</div><div class="lbl">${esc(sub.join(" · "))}</div></div>`;
  if (me.job === "자유신도") priv += `<p class="note c small">원래 직업은 ${esc(me.origJob)}였습니다. 다른 사람에게는 원래 직업으로 보입니다.</p>`;
  if (!me.alive) priv += `<div class="card accent n"><h3>${me.missing ? "실종되었습니다" : "사망했습니다"}</h3><p class="small muted">${me.deathDay ? `${me.deathDay}일차 · ${CAUSE[me.deathCause] || ""}` : ""}${me.missing ? " · 사망자방에 들어갈 수 없고 부활할 수 없습니다." : " · 전체방에서는 말할 수 없습니다. 내 세력이 이기면 함께 승리합니다."}</p>${!me.missing ? (V.deadChatLink ? `<a class="btn ghost" href="${esc(V.deadChatLink)}">사망자방 들어가기</a>${V.deadChatCode ? `<p class="small">참여코드 <b class="mono">${esc(V.deadChatCode)}</b></p>` : ""}` : `<p class="small muted">수사관이 아직 사망자방을 열지 않았습니다. 열리면 알림으로 링크가 옵니다.</p>`) : ""}</div>`;
  if (me.pending) priv += `<div class="card accent c"><div class="between"><h3>🕯️ 교단에 포섭되었습니다</h3><span class="count small" data-deadline="${me.pending.deadline}"></span></div>
    <button class="opt c" type="button" data-choice="자유"><b>자유신도</b><span class="small">교단 팀이 됩니다. 교단 명단을 받고 교단과 함께 이기지만, 능력을 잃습니다.</span></button>
    <button class="opt t" type="button" data-choice="일반"><b>일반 신도</b><span class="small">시민 팀으로 남고 능력도 지킵니다. 대신 교단 머릿수에 들어갑니다.</span></button>
    <p class="small muted">12:00까지 고르지 않으면 일반 신도가 됩니다. 한 번 고르면 바꿀 수 없습니다.</p></div>`;
  const b = me.blocked || {}, bl = [];
  if (b.sealed) bl.push("💋 봉인: 오늘 능력을 쓸 수 없습니다.");
  if (b.jailed) bl.push("🔐 수감: 오늘 능력과 킬 사진을 쓸 수 없습니다.");
  if (b.silenced) bl.push("🤐 오늘 투표할 수 없습니다.");
  if (b.hidden) bl.push("🏚️ 오늘 숨어 있습니다. 투표할 수 없습니다.");
  if (bl.length && me.alive) priv += `<div class="card accent m">${bl.map((x) => `<p class="small">${x}</p>`).join("")}</div>`;
  if (info.day && me.alive) priv += `<div class="card">
    <div class="between"><span class="small muted">내 투표권</span><b>${me.voteWeight}표</b></div>
    ${V.mission && me.job === "동료" ? `<p class="small"><b>오늘의 조 미션</b> ${esc(V.mission)} <span class="muted">· ${V.groupMissionDone ? "우리 조 인증 완료 (+1표)" : "조원 중 한 명이 카메라 탭에서 인증하면 조 전원 +1표"}</span></p>` : ""}</div>`;
  if (info.day) h += `<div class="card"><div class="between"><span class="small muted">오늘의 코드</span><span class="mono big">${esc(V.code || "")}</span></div></div>`;
  h += REVEAL ? priv : lockHTML("내 직업과 개인 정보가 가려져 있습니다.");
  if (info.phase === "before") h += `<p class="note small">게임은 ${esc(V.info.date || "")} 07:30부터 시작합니다.</p>`;
  if (info.phase === "night") h += `<p class="note small">00:00~07:30에는 행동할 수 없습니다. 어젯밤 결과는 07:30에 발표됩니다.</p>`;
  h += `<div class="card"><div class="between"><h3>알림</h3><button class="btn ghost small" type="button" id="reload">새로고침</button></div><div class="feed">${REVEAL ? "" : `<p class="small muted">🔒 나에게만 온 알림은 가려져 있습니다.</p>`}${(V.events || []).filter((e) => REVEAL || !e.mine).map((e) => `<div class="ev${e.mine ? " mine" : ""}"><div class="meta">${shortTime(e.at)}${e.mine ? " · 나에게만" : ""}</div>${esc(e.text)}</div>`).join("") || `<p class="muted small">아직 알림이 없습니다.</p>`}</div></div>`;
  h += qaCardHTML();
  if (cfg.RULEBOOK_URL) h += `<a class="small muted" href="${esc(cfg.RULEBOOK_URL)}" style="text-align:center">규칙서 보기</a>`;
  return h;
}
let QA = null;
function qaCardHTML() {
  return `<div class="card"><div class="between"><h3>익명 질문</h3><button class="btn ghost small" type="button" id="qaLoad">${QA ? "새로고침" : "답변 보기"}</button></div>
    <p class="small muted">규칙이 헷갈리면 운영자에게 물어보세요. 이름은 남지 않지만, <b>질문과 답변은 전체에 공개됩니다.</b> 직업이 드러나는 내용은 조심하세요. 하루 3번까지 할 수 있습니다.</p>
    <textarea id="qaText" maxlength="300" placeholder="예: 일반 신도도 교단 머릿수에 들어가나요?"></textarea>
    <button class="btn full" type="button" id="qaSend">익명으로 질문하기</button>
    ${QA ? (QA.length ? QA.map((q) => `<div class="ev"><div class="meta">${shortTime(q.answered_at)}</div><b>Q.</b> ${esc(q.text)}\n<b>A.</b> ${esc(q.answer)}</div>`).join("") : `<p class="small muted">아직 답변된 질문이 없습니다.</p>`) : ""}</div>`;
}
async function qaLoad() { try { QA = (await api("qa_list")).questions; render(); } catch (e) { toast(e.message); } }
async function qaSend() {
  const t = $("qaText").value.trim(); if (!t) return toast("질문을 적으세요.");
  if (!(await confirmBox("이 질문을 보낼까요? 운영자가 답하면 질문과 답이 전체에 공개됩니다.", "보내기"))) return;
  try { const r = await api("qa_ask", { text: t }); $("qaText").value = ""; toast(r.message, 3500); } catch (e) { toast(e.message); }
}

// ------------------------------------------------------------------ 행동
function abilityForm(a) {
  const k = a.kind, me = V.me, today = (V.today || {})[k];
  const sel = (id, list, cur) => `<select id="${id}"><option value="">고르세요</option>${opt(list, cur)}</select>`;
  let inner = "", cur = today && today.target;
  const others = aliveOthers(), all = aliveAll();
  if (k === "seer") inner = `<div class="field"><label>첫째</label>${sel(`f_${k}_a`, others, today && today.a)}</div><div class="field"><label>둘째</label>${sel(`f_${k}_b`, others, today && today.b)}</div>`;
  else if (k === "contract") inner = [0, 1, 2].map((i) => `<div class="row"><div class="field" style="flex:1"><label>${i + 1}번 사람</label>${sel(`f_ct_t${i}`, others)}</div><div class="field" style="flex:1"><label>직업</label><select id="f_ct_j${i}"><option value="">고르세요</option>${V.jobs.map((j) => `<option>${esc(j)}</option>`).join("")}</select></div></div>`).join("");
  else if (k === "medium") inner = `<div class="field"><label>되살릴 사람</label>${sel(`f_${k}`, V.everyone.filter((x) => !x.alive && !x.missing), cur)}</div>`;
  else if (k === "heir") inner = `<div class="field"><label>후계자</label>${sel(`f_${k}`, V.people.filter((x) => ["광신도", "자유신도"].includes(x.label) && x.alive), me.heir)}</div>`;
  else if (k === "hunter") inner = `<div class="field"><label>데려갈 사람</label>${sel(`f_${k}`, others, me.hunterTarget)}</div>`;
  else if (k === "letter") inner = `<div class="field"><label>받는 사람</label>${sel(`f_${k}`, others)}</div><div class="field"><label>내용 (100자)</label><textarea id="f_letter_body" maxlength="100"></textarea></div>`;
  else if (k === "deadchat") inner = `<div class="field"><label>오픈채팅 링크</label><input type="text" id="f_dc_link" inputmode="url" placeholder="https://open.kakao.com/o/..." value="${esc(V.deadChatLink || "")}"></div><div class="field"><label>참여코드 (설정했다면)</label><input type="text" id="f_dc_code" maxlength="20" value="${esc(V.deadChatCode || "")}"></div>`;
  else if (k === "mayor" || k === "hide") inner = "";
  else {
    const self = ["doctor", "priest", "framer", "lawyer"].includes(k);
    let list = self ? all : others;
    if (k === "doctor") list = list.filter((x) => !(x.badges || []).includes("시장"));
    if (k === "convert") list = list.filter((x) => !V.people.some((p) => p.sid === x.sid && ["광신도", "자유신도", "교주"].includes(p.label)));
    inner = `<div class="field"><label>대상</label>${sel(`f_${k}`, list, cur)}</div>`;
  }
  const done = k === "deadchat" ? (V.deadChatLink ? "저장됨 · 사망자에게 전송 중" : "") : k === "heir" ? (me.heir ? `현재: ${nameOf(me.heir)}` : "") : k === "hunter" ? (me.hunterTarget ? `현재: ${nameOf(me.hunterTarget)}` : "") :
    today ? `제출함: ${k === "seer" ? nameOf(today.a) + ", " + nameOf(today.b) : k === "contract" ? "청부 3명" : k === "hide" ? "내일 숨기" : nameOf(today.target)} (23:59까지 바꿀 수 있음)` : "";
  const left = a.left != null ? `남은 횟수 ${a.left}` : a.when === "tomorrow" ? "내일 적용" : a.when === "setting" ? "설정" : "오늘";
  const btn = k === "mayor" ? (me.mayor ? "" : `<button class="btn full" type="button" data-sub="${k}">시장임을 공개하기</button>`) : k === "hide" ? `<button class="btn full" type="button" data-sub="${k}">내일 숨기</button>` : `<button class="btn full" type="button" data-sub="${k}">${k === "letter" ? "보내기" : k === "heir" || k === "hunter" || k === "deadchat" ? "저장" : "제출"}</button>`;
  return `<div class="card"><div class="between"><h3>${esc(a.label)}</h3><span class="small muted mono">${left}</span></div><p class="small muted">${esc(DESC[k] || "")}</p>${inner}${done ? `<p class="ok">${esc(done)}</p>` : ""}${btn}</div>`;
}
function actHTML() {
  const me = V.me, info = V.info;
  if (V.status !== "running") return `<div class="card"><p class="muted">게임이 진행 중이 아닙니다.</p></div>`;
  if (info.phase !== "open") return `<div class="card"><p class="muted">${info.phase === "night" ? "07:30부터 행동할 수 있습니다." : "아직 게임이 시작되지 않았습니다."}</p></div>`;
  if (!me.alive) {
    return V.canDispute ? `<div class="card"><h3>이의 제기</h3><p class="small muted">찍힐 때 자고 있었다면 이의를 낼 수 있습니다. 수사관이 사진을 보고 판정합니다. 한 번만 낼 수 있습니다.</p><textarea id="f_dispute" maxlength="200" placeholder="상황을 적어 주세요"></textarea><button class="btn full" type="button" data-sub="dispute">이의 제기 보내기</button>${(V.today || {}).dispute ? `<p class="ok">이의를 보냈습니다.</p>` : ""}</div>` : `<div class="card"><p class="muted">사망한 사람은 행동할 수 없습니다.</p></div>`;
  }
  let h = "";
  const vt = (V.today || {}).vote;
  h += `<div class="card"><div class="between"><h3>투표</h3><span class="small muted">23:59 마감 · 내 표 ${me.voteWeight}</span></div>
    <p class="small muted">최다 득표가 5표 이상이고 동률이 아니면 처형됩니다.</p>
    <select id="f_vote"><option value="__skip">스킵</option>${opt(aliveAll(), vt && vt.target)}</select>
    ${vt ? `<p class="ok">투표함: ${vt.target ? esc(nameOf(vt.target)) : "스킵"}</p>` : ""}
    <button class="btn full" type="button" data-sub="vote"${me.blocked.silenced || me.blocked.hidden ? " disabled" : ""}>투표하기</button></div>`;
  if (V.canKill) {
    h += `<div class="card accent m"><div class="between"><h3>오늘 마피아 킬</h3><span class="small muted mono">${V.teamKillsToday || 0}번 시도</span></div><p class="small muted">킬은 카메라 탭에서 찍습니다. 기본 2번이고, 접선 시도는 2번까지 횟수에서 빠집니다.</p>
      ${(V.teamKills || []).map((k) => `<p class="small">${shortTime(k.at)} · ${esc(k.by)} → ${esc(k.target)}</p>`).join("")}</div>`;
  }
  const abil = (V.abilities || []).filter((a) => (a.kind !== "mayor" || !me.mayor) && a.kind !== "inspect");
  if (me.job === "수사관") h += `<div class="card accent t"><h3>킬 사진 판정</h3><p class="small muted">사진 탭에서 가장 최근 밤의 킬 사진을 보고, 자는 중이었거나 얼굴을 알아볼 수 없으면 무효로 판정합니다. 하루 1번이고, 판정하면 바로 전체에 공개됩니다.</p></div>`;
  if (!abil.length && !V.canKill) h += `<div class="card"><p class="small muted">${me.job === "동료" ? "동료는 특수 능력이 없습니다. 같은 조와 정보를 나누고, 미션으로 표를 늘리세요." : "쓸 수 있는 능력이 없습니다."}</p></div>`;
  abil.forEach((a) => (h += abilityForm(a)));
  return h;
}
function payloadFor(k) {
  const v = (id) => { const e = $(id); return e ? e.value : ""; };
  if (k === "vote") { const t = v("f_vote"); return { target: t === "__skip" ? null : t }; }
  if (k === "seer") return { a: v(`f_${k}_a`), b: v(`f_${k}_b`) };
  if (k === "contract") return { picks: [0, 1, 2].map((i) => ({ target: v(`f_ct_t${i}`), job: v(`f_ct_j${i}`) })) };
  if (k === "letter") return { target: v("f_letter"), body: v("f_letter_body") };
  if (k === "dispute") return { note: v("f_dispute") };
  if (k === "deadchat") return { link: v("f_dc_link"), code: v("f_dc_code") };
  if (k === "mayor" || k === "hide") return {};
  return { target: v(`f_${k}`) };
}
async function submit(k) {
  if (k === "mayor" && !(await confirmBox("시장임을 공개할까요? 모두에게 시장 표시가 뜨고, 다시 숨길 수 없습니다.", "공개"))) return;
  if (k === "contract" && !(await confirmBox("청부를 제출할까요? 자정에 처리되면 기회가 1번 줄어듭니다.", "제출"))) return;
  try {
    const r = await api("act", { kind: k, payload: payloadFor(k) });
    V = { ...V, ...r.view, skew: (r.view.now || Date.now()) - Date.now() }; render(); toast("저장했습니다.");
  } catch (e) { toast(e.message); }
}

// ------------------------------------------------------------------ 메모 (이 휴대폰에만 저장)
const MEMO_JOBS = [
  ["시민 쪽", ["시민 (직업 모름)", "경찰", "점쟁이", "관찰자", "수사관", "기자", "목격자", "의사", "경호원", "군인", "은둔자", "사제", "영매", "이단심판관", "교도관", "선도부장", "사냥꾼", "시장", "변호사", "우체부", "연인", "동료"]],
  ["마피아 쪽", ["마피아 (직업 모름)", "보스", "암살자", "추적자", "마담", "스파이", "조작범", "청부업자"]],
  ["교단 쪽", ["교단 (직업 모름)", "교주", "광신도", "자유신도", "일반 신도"]],
];
const memoTeam = (job) => { for (const [g, l] of MEMO_JOBS) if (l.includes(job)) return g === "마피아 쪽" ? "m" : g === "교단 쪽" ? "c" : "t"; return "n"; };
const memoKey = () => `m50memo:${V && V.me ? V.me.sid : "x"}`;
function memoLoad() { try { return JSON.parse(localStorage.getItem(memoKey()) || "{}"); } catch (e) { return {}; } }
function memoSave(m) { try { localStorage.setItem(memoKey(), JSON.stringify(m)); return true; } catch (e) { toast("이 브라우저에서는 메모를 저장할 수 없습니다."); return false; } }
let MEMO_ONLY = false;
function openMemo(sid) {
  const m = memoLoad(), cur = m[sid] || {};
  $("modalBox").innerHTML = `<h3>${esc(nameOf(sid))} 메모</h3>
    <div class="field"><label>의심되는 직업</label><select id="mm_job"><option value="">정하지 않음</option>${MEMO_JOBS.map(([g, l]) => `<optgroup label="${g}">${l.map((j) => `<option${j === cur.job ? " selected" : ""}>${esc(j)}</option>`).join("")}</optgroup>`).join("")}</select></div>
    <div class="field"><label>메모</label><textarea id="mm_txt" maxlength="300" placeholder="예: 3일차에 경찰이라고 주장함">${esc(cur.text || "")}</textarea></div>
    <p class="small muted">이 휴대폰에만 저장되고 아무에게도 보이지 않습니다.</p>
    <div class="row" style="justify-content:space-between"><button class="btn ghost" type="button" id="mm_del">지우기</button><div class="row"><button class="btn ghost" type="button" id="mm_no">닫기</button><button class="btn" type="button" id="mm_ok">저장</button></div></div>`;
  $("modal").hidden = false;
  const close = () => { $("modal").hidden = true; };
  $("mm_no").onclick = close;
  $("mm_del").onclick = () => { const mm = memoLoad(); delete mm[sid]; memoSave(mm); close(); render(); };
  $("mm_ok").onclick = () => {
    const mm = memoLoad(), job = $("mm_job").value, text = $("mm_txt").value.trim();
    if (job || text) mm[sid] = { job, text, at: Date.now() }; else delete mm[sid];
    if (memoSave(mm)) { close(); render(); }
  };
}

// ------------------------------------------------------------------ 사람들
function peopleHTML() {
  let h = "";
  if (V.people.length) h += `<div class="card"><h3>내가 아는 사람</h3>${V.people.map((p) => `<div class="person${p.alive ? "" : " dead"}"><span class="nm">${esc(p.name)}</span><span class="small muted">${esc(p.label)}</span></div>`).join("")}</div>`;
  else h += `<div class="card"><h3>내가 아는 사람</h3><p class="small muted">${V.me.team === "마피아" && !V.me.connected ? "아직 접선하지 못했습니다. 킬 팀이 나를 지목하거나 평일 5일이 지나면 마피아 명단이 열립니다." : "처음부터 아는 사람이 없습니다."}</p></div>`;
  const alive = V.everyone.filter((x) => x.alive).length;
  const memo = memoLoad();
  const list = V.everyone.filter((p) => !MEMO_ONLY || memo[p.sid]);
  h += `<div class="card"><div class="between"><h3>전체 명단</h3><span class="small muted">생존 ${alive} / ${V.everyone.length}</span></div>
    <div class="between"><span class="small muted">이름을 누르면 의심 직업과 메모를 적을 수 있습니다.</span><button class="btn ghost small" type="button" id="memoOnly">${MEMO_ONLY ? "전체 보기" : "메모한 사람만"}</button></div>
    ${list.map((p) => { const mm = memo[p.sid]; return `<div class="person${p.alive ? "" : " dead"}" data-memo="${esc(p.sid)}" role="button" tabindex="0" style="cursor:pointer"><span><span class="nm">${esc(p.name)}${p.sid === V.me.sid ? ' <span class="small muted">(나)</span>' : ""}</span>${mm && mm.text ? `<br><span class="small muted">${esc(mm.text.length > 40 ? mm.text.slice(0, 40) + "…" : mm.text)}</span>` : ""}</span><span class="chips">${mm && mm.job ? `<span class="pill ${memoTeam(mm.job)}">${esc(mm.job)}?</span>` : ""}${p.badges.map((b) => `<span class="pill t">${esc(b)}</span>`).join("")}${p.alive ? "" : `<span class="pill n">${p.missing ? "실종" : "사망"}</span>`}</span></div>`; }).join("") || `<p class="small muted">메모한 사람이 없습니다.</p>`}</div>`;
  return h;
}

// ------------------------------------------------------------------ 카메라
function camHTML() {
  const me = V.me, info = V.info;
  if (!me.alive || V.status !== "running" || info.phase !== "open") return `<div class="card"><p class="muted">지금은 촬영할 수 없습니다.</p></div>`;
  const purposes = [];
  if (V.canKill && info.weekday) purposes.push(["kill", "킬 촬영"]);
  if (info.weekday) purposes.push(["counter", "반격 (나를 찍은 사람)"]);
  if (me.job === "동료" && !V.groupMissionDone) purposes.push(["mission", "조 미션 인증"]);
  if (!purposes.length) return `<div class="card"><p class="muted">오늘은 촬영할 일이 없습니다.</p></div>`;
  const known = new Set(V.people.map((p) => p.sid));
  const pur = (CAM && CAM.purpose) || purposes[0][0];
  const targets = pur === "kill" ? aliveOthers().filter((x) => !(known.has(x.sid) && V.people.find((p) => p.sid === x.sid).label !== "연인")) : aliveOthers();
  let h = `<div class="card"><div class="field"><label>무엇을 찍나요</label><select id="c_purpose">${purposes.map(([k, l]) => `<option value="${k}"${k === pur ? " selected" : ""}>${l}</option>`).join("")}</select></div>`;
  if (pur !== "mission") h += `<div class="field"><label>${pur === "kill" ? "대상" : "나를 찍은 사람"}</label><select id="c_target"><option value="">고르세요</option>${opt(targets, CAM && CAM.target)}</select></div>`;
  h += `<p class="small muted">${pur === "kill" ? "얼굴을 알아볼 수 있게, 깨어 있는 사람만 찍으세요. 화장실·탈의실·샤워실과 옷 갈아입는 사람은 절대 찍지 않습니다(실격)." : pur === "counter" ? "찍힌 뒤 2분 안에 그 사람 얼굴을 찍으세요. 반격은 하루 1번입니다." : V.mission ? "오늘의 조 미션: " + esc(V.mission) + " · 조원 중 한 명만 올리면 됩니다." : ""}</p>`;
  if (!CAM || !CAM.session) h += `<button class="btn full" type="button" id="c_start">카메라 열기</button><p class="small muted">카메라를 연 뒤 60초 안에 찍고 보내야 합니다. 갤러리 사진은 쓸 수 없습니다.</p>`;
  else if (!CAM.shot) h += `<div class="camwrap"><video id="c_video" playsinline autoplay muted></video><div class="stamp" id="c_stamp"></div></div><div class="row"><button class="btn" style="flex:1" type="button" id="c_shoot">촬영</button><button class="btn ghost" type="button" id="c_flip">전환</button><span class="count" id="c_count"></span></div>`;
  else h += `<img class="ph" id="c_prev" alt="촬영한 사진" src="${CAM.shot}"><div class="row"><button class="btn" style="flex:1" type="button" id="c_send">보내기</button><button class="btn ghost" type="button" id="c_retake">다시 찍기</button><span class="count" id="c_count"></span></div>`;
  h += `</div>`;
  if ((V.myPhotos || []).length) h += `<div class="card"><h3>오늘 보낸 사진</h3>${V.myPhotos.map((p) => `<p class="small">${shortTime(p.at)} · ${{ kill: "킬", counter: "반격", mission: "미션" }[p.kind]}${p.target ? " · " + esc(nameOf(p.target)) : ""}</p>`).join("")}</div>`;
  return h;
}
async function camStart() {
  const purpose = $("c_purpose").value, target = $("c_target") ? $("c_target").value : null;
  if (purpose !== "mission" && !target) return toast("대상을 고르세요.");
  try {
    const r = await api("capture", { step: "start", purpose, target });
    CAM = { purpose, target, session: r.session, serverTime: r.serverTime, t0: performance.now(), code: r.code, limit: r.limitMs, facing: "environment" };
    render(); await openStream();
  } catch (e) { toast(e.message); }
}
async function openStream() {
  try {
    if (CAM.stream) CAM.stream.getTracks().forEach((t) => t.stop());
    CAM.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: CAM.facing, width: { ideal: 1920 } }, audio: false });
    const v = $("c_video"); if (v) { v.srcObject = CAM.stream; await v.play().catch(() => {}); }
  } catch (e) { toast("카메라를 열 수 없습니다. 브라우저의 카메라 권한을 허용하세요."); }
}
function stopCam() { if (CAM && CAM.stream) CAM.stream.getTracks().forEach((t) => t.stop()); CAM = null; }
const camNow = () => CAM.serverTime + (performance.now() - CAM.t0);
function stampText() { return `${kst(camNow())} · ${CAM.code}`; }
function shoot() {
  const v = $("c_video"); if (!v || !v.videoWidth) return toast("카메라가 아직 준비되지 않았습니다.");
  const scale = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
  const W = Math.round(v.videoWidth * scale), H = Math.round(v.videoHeight * scale);
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const x = cv.getContext("2d"); x.drawImage(v, 0, 0, W, H);
  const bh = Math.max(36, Math.round(W * 0.06));
  x.fillStyle = "rgba(0,0,0,.6)"; x.fillRect(0, H - bh, W, bh);
  x.fillStyle = "#fff"; x.font = `500 ${Math.round(bh * 0.42)}px monospace`; x.textBaseline = "middle";
  x.fillText(stampText(), Math.round(bh * 0.3), H - bh / 2);
  CAM.shot = cv.toDataURL("image/jpeg", 0.75);
  if (CAM.stream) CAM.stream.getTracks().forEach((t) => t.stop()); CAM.stream = null;
  render();
}
async function camSend() {
  try {
    const r = await api("capture", { step: "finish", session: CAM.session, image: CAM.shot });
    stopCam(); toast(r.message, 4000); await refresh();
  } catch (e) { toast(e.message, 4000); stopCam(); render(); }
}
setInterval(() => {
  document.querySelectorAll("[data-deadline]").forEach((el) => {
    const left = Number(el.dataset.deadline) - (Date.now() + ((V && V.skew) || 0));
    el.textContent = left > 0 ? `${Math.floor(left / 3600e3)}시간 ${Math.floor((left % 3600e3) / 60e3)}분 남음` : "마감";
  });
  if (CAM && CAM.session) {
    const left = Math.max(0, Math.ceil((CAM.limit - (performance.now() - CAM.t0)) / 1000));
    const c = $("c_count"); if (c) c.textContent = `${left}초`;
    const s = $("c_stamp"); if (s) s.textContent = stampText();
    if (left === 0 && !CAM.expired) { CAM.expired = true; toast("60초가 지났습니다. 카메라를 다시 여세요."); stopCam(); render(); }
  }
}, 500);

// ------------------------------------------------------------------ 사진 (수사관·사망자)
const CRITERIA_HTML = `<details><summary class="small"><b>킬 사진 인정 기준</b> (애매하면 유효)</summary>
  <p class="small"><b>둘 다 만족해야 유효</b>: ① 아는 친구가 보면 바로 누군지 알 수 있다 ② 깨어 있었다</p>
  <table><tr><th>상황</th><th>판정</th></tr>
  <tr><td>마스크를 썼지만 눈·머리 모양으로 알아봄</td><td>유효</td></tr>
  <tr><td>뒷모습, 정수리만 보임</td><td>무효</td></tr>
  <tr><td>멀리서 확대, 흐릿하지만 누군지 앎</td><td>유효</td></tr>
  <tr><td>너무 흐려서 누군지 모름</td><td>무효</td></tr>
  <tr><td>책상에 엎드려 얼굴이 안 보임</td><td>무효</td></tr>
  <tr><td>의자에 기대 눈 감고 졸고 있음</td><td>무효</td></tr>
  <tr><td>걷거나 웃다가 눈을 감은 순간</td><td>유효</td></tr>
  <tr><td>화면·인쇄한 사진을 다시 찍음</td><td>무효</td></tr>
  <tr><td>거울에 비친 모습</td><td>알아보면 유효</td></tr></table>
  <p class="small warn">화장실·탈의실·샤워실, 옷 갈아입는 사람을 찍은 사진은 판정하지 말고 운영자에게 알리세요. 찍은 사람은 실격입니다.</p></details>`;
async function loadPhotos() {
  try {
    const r = await api("photos");
    $("main").innerHTML = `<div class="card"><h3>킬 사진</h3><p class="small muted">누가 찍었는지는 나오지 않습니다.</p>${CRITERIA_HTML}</div>` +
      (r.photos.length ? r.photos.map((p) => {
        const dead = !(V.everyone.find((x) => x.sid === p.sid) || {}).alive;
        const can = V.me.job === "수사관" && V.me.alive && V.info.phase === "open" && p.day === V.lastKillDay && dead;
        return `<div class="card"><div class="between"><b>${esc(p.target)}</b><span class="small muted">${p.day}일차${dead ? "" : " · 판정으로 부활"}</span></div><img class="ph" loading="lazy" alt="${esc(p.target)} 킬 사진" src="${esc(p.url)}">${can ? `<button class="btn ghost full" type="button" data-inspect="${esc(p.sid)}">이 킬을 무효로 판정</button>` : ""}</div>`;
      }).join("") : `<div class="card"><p class="muted small">아직 사진이 없습니다.</p></div>`);
    document.querySelectorAll("[data-inspect]").forEach((b) => (b.onclick = async () => {
      const nm = nameOf(b.dataset.inspect);
      if (!(await confirmBox(`${nm} 님의 킬을 무효로 판정할까요? ${nm} 님이 되살아나고, 전체에 공개됩니다. 하루 1번만 할 수 있습니다.`, "무효 판정"))) return;
      try { const res = await api("act", { kind: "inspect", payload: { target: b.dataset.inspect } }); V = { ...V, ...res.view }; toast("판정했습니다."); loadPhotos(); } catch (e) { toast(e.message); }
    }));
  } catch (e) { $("main").innerHTML = `<div class="card"><p class="warn">${esc(e.message)}</p></div>`; }
}

// ------------------------------------------------------------------ 관리자
function nextMonday() { const d = new Date(Date.now() + 9 * 3600e3); const add = ((8 - d.getUTCDay()) % 7) || 7; d.setUTCDate(d.getUTCDate() + add); return d.toISOString().slice(0, 10); }
async function loadAdmin() {
  try {
    const [ov, qa] = await Promise.all([api("admin_overview"), api("admin_qa").catch(() => ({ pending: [], answered: [] }))]);
    ADMIN = ov; ADMIN.qa = qa; $("main").innerHTML = adminHTML(); bindAdmin();
  }
  catch (e) { $("main").innerHTML = `<div class="card"><p class="warn">${esc(e.message)}</p></div>`; }
}
function adminHTML() {
  const G = ADMIN.game;
  const startForm = `<div class="card"><h3>게임 만들기</h3>
    <p class="small muted">직업은 무작위로 배정되고, 관리자도 볼 수 없습니다.</p>
    <div class="field"><label>시작일 (어느 요일이든 가능, 평일 추천)</label><input type="date" id="a_start" value="${nextMonday()}"></div>
    <details><summary class="small">직업 구성 바꾸기 (합이 참가자 수와 같아야 함)</summary><textarea id="a_comp" style="min-height:140px;font-family:var(--font-mono);font-size:.8rem">${esc(JSON.stringify(DEFAULT_COMPOSITION, null, 1))}</textarea></details>
    <button class="btn full" type="button" id="a_go">${G ? "새 게임으로 다시 만들기 (기존 기록 삭제)" : "게임 만들기"}</button></div>`;
  if (!G) return startForm;
  const info = ADMIN.info, P = ADMIN.players || [];
  const qn = ((ADMIN.qa && ADMIN.qa.pending) || []).length, mn = (ADMIN.missions || []).filter((m) => !m.reviewed).length;
  let h = qn + mn ? `<div class="card accent m"><h3>처리할 일 ${qn + mn}개</h3><p class="small">${qn ? `답변 대기 질문 ${qn}개` : ""}${qn && mn ? " · " : ""}${mn ? `확인 대기 미션 ${mn}개` : ""}</p></div>` : `<p class="small muted">처리할 일이 없습니다.</p>`;
  h += `<div class="card"><div class="between"><h3>진행 상태</h3><span class="pill ${G.status === "running" ? "t" : "n"}">${G.status === "running" ? "진행 중" : G.status === "paused" ? "일시 정지" : G.status === "ended" ? "종료" : G.status}</span></div>
    <p class="small">${info.day}일차 · ${info.phase === "night" ? "발표 전" : info.phase === "open" ? "진행" : info.phase} · 자정 처리 완료 ${G.resolvedThrough}일차 · 앱 시각 ${kst(ADMIN.now)}</p>
    <p class="small muted">생존 ${P.filter((p) => p.alive).length} / ${P.length}${G.winner ? " · 승자 " + G.winner : ""}</p>
    <div class="row"><button class="btn ghost" type="button" id="a_pause">${G.status === "paused" ? "재개" : "일시 정지"}</button><button class="btn ghost" type="button" id="a_reload">새로고침</button></div></div>`;
  const ms = [...(ADMIN.missions || [])].sort((a, b) => (a.reviewed === b.reviewed ? b.id - a.id : a.reviewed ? 1 : -1));
  const msTodo = ms.filter((m) => !m.reviewed).length;
  h += `<div class="card${msTodo ? " accent m" : ""}"><div class="between"><h3>미션 인증 확인</h3><span class="small ${msTodo ? "warn" : "muted"}">확인 대기 ${msTodo}</span></div><p class="small muted">누가 올렸는지는 보이지 않습니다. 맞으면 <b>확인</b>, 미션과 맞지 않으면 <b>반려</b>를 누르세요. 반려하면 그 조의 +1표가 취소됩니다.</p>
    ${ms.length ? ms.map((m) => `<div class="card"><div class="between"><span class="small">${m.day}일차 · ${esc(m.mission)}${m.rejected ? " · <b>반려됨</b>" : m.reviewed ? " · 확인함" : ""}</span>${m.reviewed ? "" : `<span class="row"><button class="btn small" type="button" data-approve="${m.id}">확인</button><button class="btn ghost small" type="button" data-reject="${m.id}">반려</button></span>`}</div><img class="ph" loading="lazy" alt="미션 사진" src="${esc(m.url)}"></div>`).join("") : `<p class="small muted">최근 이틀 동안 올라온 미션 사진이 없습니다.</p>`}</div>`;
  const qp = (ADMIN.qa && ADMIN.qa.pending) || [];
  h += `<div class="card${qp.length ? " accent m" : ""}"><div class="between"><h3>익명 질문</h3><span class="small ${qp.length ? "warn" : "muted"}">답변 대기 ${qp.length}</span></div>
    <p class="small muted">질문자 이름은 저장되지 않습니다. 답하면 질문과 답이 전체 알림으로 공개됩니다. 게임 정보를 흘리려는 질문이나 장난은 지우세요.</p>
    ${qp.length ? qp.map((q) => `<div class="card"><p class="small muted">${shortTime(q.created_at)}</p><p>${esc(q.text)}</p><textarea id="qa_a_${q.id}" placeholder="답변"></textarea><div class="row"><button class="btn" style="flex:1" type="button" data-qa-answer="${q.id}">답하고 공개</button><button class="btn ghost" type="button" data-qa-del="${q.id}">지우기</button></div></div>`).join("") : `<p class="small muted">대기 중인 질문이 없습니다.</p>`}</div>`;
  h += `<div class="card"><h3>전체 공지</h3><textarea id="a_ann"></textarea><button class="btn full" type="button" id="a_annb">공지 보내기</button></div>`;
  h += `<div class="card"><h3>설정</h3>
    <div class="field"><label>테스트용 시계 이동 (분, 실제 게임에서는 0)</label><input type="number" id="a_off" value="${G.clockOffsetMin || 0}"></div>
    <div class="row"><button class="btn ghost" type="button" data-off="60">+1시간</button><button class="btn ghost" type="button" data-off="1440">+1일</button><button class="btn ghost" type="button" data-off="reset">0으로</button></div>
    <button class="btn full" type="button" id="a_save">설정 저장</button></div>`;
  h += `<div class="card"><h3>참가자 (공개 정보만)</h3><p class="small muted">사고가 났을 때만 쓰세요. 부활·제외는 전체에 공지됩니다.</p>${P.map((p) => `<div class="person${p.alive ? "" : " dead"}"><span class="nm">${esc(p.name)}</span><span class="chips">${p.badges.map((b) => `<span class="pill t">${esc(b)}</span>`).join("")}${p.alive ? `<button class="btn ghost small" type="button" data-kill="${p.sid}">제외</button>` : `<button class="btn ghost small" type="button" data-revive="${p.sid}">부활</button>`}</span></div>`).join("")}</div>`;
  h += `<div class="card"><h3>공개 알림 기록</h3><div class="feed">${(ADMIN.events || []).map((e) => `<div class="ev"><div class="meta">${shortTime(e.visible_at)}</div>${esc(e.text)}</div>`).join("")}</div></div>`;
  h += startForm;
  h += `<div class="card accent m"><h3>초기화</h3><p class="small muted">게임 상태와 모든 기록을 지웁니다. 확인란에 "초기화"를 적으세요.</p><input type="text" id="a_rst"><button class="btn danger full" type="button" id="a_rstb">초기화</button></div>`;
  return h;
}
function bindAdmin() {
  const on = (id, fn) => { const e = $(id); if (e) e.onclick = fn; };
  const run = async (op, data, msg) => { try { await api(op, data); toast(msg || "완료"); await refresh(); } catch (e) { toast(e.message); } };
  on("a_go", async () => {
    let comp; try { comp = JSON.parse($("a_comp").value); } catch { return toast("직업 구성 JSON이 올바르지 않습니다."); }
    if (!(await confirmBox(`${$("a_start").value}에 시작하는 게임을 만들고 직업을 무작위로 배정할까요?${ADMIN.game ? " 기존 기록은 모두 지워집니다." : ""}`, "만들기"))) return;
    run("admin_start", { startDate: $("a_start").value, composition: comp, force: true }, "게임을 만들었습니다.");
  });
  on("a_reload", () => loadAdmin());
  on("a_pause", () => run("admin_set", { status: ADMIN.game.status === "paused" ? "running" : "paused" }));
  on("a_save", () => run("admin_set", { clockOffsetMin: Number($("a_off").value) || 0 }, "저장했습니다."));
  document.querySelectorAll("[data-off]").forEach((b) => (b.onclick = () => { const o = $("a_off"); o.value = b.dataset.off === "reset" ? 0 : (Number(o.value) || 0) + Number(b.dataset.off); }));
  on("a_annb", () => run("admin_announce", { text: $("a_ann").value }, "공지를 보냈습니다."));
  on("a_rstb", async () => { if (await confirmBox("정말 초기화할까요?", "초기화")) run("admin_reset", { confirm: $("a_rst").value }, "초기화했습니다."); });
  const pn = (sid) => (ADMIN.players.find((p) => p.sid === sid) || {}).name || sid;
  document.querySelectorAll("[data-revive]").forEach((b) => (b.onclick = async () => { if (await confirmBox(`${pn(b.dataset.revive)} 님을 되살릴까요? 전체에 공지됩니다.`, "되살리기")) run("admin_player", { sid: b.dataset.revive, action: "revive" }); }));
  document.querySelectorAll("[data-kill]").forEach((b) => (b.onclick = async () => { if (await confirmBox(`${pn(b.dataset.kill)} 님을 게임에서 제외할까요? 전체에 공지됩니다.`, "제외")) run("admin_player", { sid: b.dataset.kill, action: "kill" }); }));
  document.querySelectorAll("[data-qa-answer]").forEach((b) => (b.onclick = async () => {
    const a = $("qa_a_" + b.dataset.qaAnswer).value.trim(); if (!a) return toast("답변을 적으세요.");
    try { await api("admin_qa_answer", { id: Number(b.dataset.qaAnswer), answer: a }); toast("답하고 공개했습니다."); await refresh(); } catch (e) { toast(e.message); }
  }));
  document.querySelectorAll("[data-qa-del]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox("이 질문을 지울까요? 공개되지 않습니다.", "지우기"))) return;
    try { await api("admin_qa_delete", { id: Number(b.dataset.qaDel) }); toast("지웠습니다."); await refresh(); } catch (e) { toast(e.message); }
  }));
  document.querySelectorAll("[data-reject]").forEach((b) => (b.onclick = async () => { try { await api("admin_reject_photo", { id: Number(b.dataset.reject) }); toast("반려했습니다."); await refresh(); } catch (e) { toast(e.message); } }));
  document.querySelectorAll("[data-approve]").forEach((b) => (b.onclick = async () => { try { await api("admin_approve_photo", { id: Number(b.dataset.approve) }); toast("확인했습니다."); await refresh(); } catch (e) { toast(e.message); } }));
}

// ------------------------------------------------------------------ 이벤트 연결
function bind() {
  const r = $("reload"); if (r) r.onclick = () => refresh();
  document.querySelectorAll("[data-reveal]").forEach((b) => (b.onclick = () => setReveal(true)));
  document.querySelectorAll("[data-memo]").forEach((el) => { el.onclick = () => openMemo(el.dataset.memo); el.onkeydown = (e) => { if (e.key === "Enter") openMemo(el.dataset.memo); }; });
  const mo = $("memoOnly"); if (mo) mo.onclick = () => { MEMO_ONLY = !MEMO_ONLY; render(); };
  const ql = $("qaLoad"); if (ql) ql.onclick = qaLoad;
  const qs = $("qaSend"); if (qs) qs.onclick = qaSend;
  document.querySelectorAll("[data-sub]").forEach((b) => (b.onclick = () => submit(b.dataset.sub)));
  document.querySelectorAll("[data-choice]").forEach((b) => (b.onclick = async () => {
    const c = b.dataset.choice;
    if (!(await confirmBox(c === "자유" ? "자유신도가 되면 교단 팀이 되고 능력을 잃습니다. 바꿀 수 없습니다." : "일반 신도로 남으면 시민 팀이고 능력도 그대로지만, 교단 머릿수에 들어갑니다. 바꿀 수 없습니다.", c === "자유" ? "자유신도" : "일반 신도"))) return;
    try { const res = await api("act", { kind: "choice", payload: { choice: c } }); V = { ...V, ...res.view }; render(); toast("선택했습니다."); } catch (e) { toast(e.message); }
  }));
  const p = $("c_purpose"); if (p) p.onchange = () => { stopCam(); CAM = { purpose: p.value }; render(); };
  const t = $("c_target"); if (t) t.onchange = () => { CAM = { ...(CAM || {}), purpose: $("c_purpose").value, target: t.value }; };
  const s = $("c_start"); if (s) s.onclick = camStart;
  const sh = $("c_shoot"); if (sh) sh.onclick = shoot;
  const fl = $("c_flip"); if (fl) fl.onclick = () => { CAM.facing = CAM.facing === "environment" ? "user" : "environment"; openStream(); };
  const se = $("c_send"); if (se) se.onclick = camSend;
  const re = $("c_retake"); if (re) re.onclick = async () => { CAM.shot = null; render(); await openStream(); };
  if (TAB === "cam" && CAM && CAM.session && !CAM.shot && CAM.stream) { const v = $("c_video"); if (v && !v.srcObject) { v.srcObject = CAM.stream; v.play().catch(() => {}); } }
}

document.addEventListener("visibilitychange", () => { if (document.hidden && REVEAL) { REVEAL = false; if (V && !(CAM && CAM.session)) render(); } });
["pointerdown", "keydown", "scroll"].forEach((t) => document.addEventListener(t, () => { lastTouch = Date.now(); }, { passive: true }));
setInterval(() => { if (REVEAL && V && !(CAM && CAM.session) && Date.now() - lastTouch > HIDE_AFTER_MS) { REVEAL = false; render(); } }, 10000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && V && TAB !== "cam" && TAB !== "admin" && Date.now() - lastLoad > 20000) refresh(); });
setInterval(() => { if (!document.hidden && V && V.status && TAB !== "cam" && TAB !== "admin" && Date.now() - lastLoad > 60000) refresh(); }, 15000);
boot();
})();
