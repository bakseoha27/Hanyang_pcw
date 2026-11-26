/* =========================================================
   한양 pcw팀 · 상태 / Supabase 데이터 연결 / 공통 유틸
   ========================================================= */
var AUTH_KEY = 'pcw_auth_v2';          /* 로그인 세션 (사용자가 로그아웃을 누를 때만 지워짐) */
var CACHE_KEY = 'pcw_cache_v2';        /* 마지막으로 받아 둔 화면 (끊겼을 때 보여 주기) */
var BASE_WEEK = ['일', '월', '화', '수', '목', '금', '토'];
var JOB_LIST = ['배관공', '보통인부', '용접공', '품질관리자'];
var KST_MS = 9 * 3600 * 1000;

var state = {
  ready: false,
  auth: null,                 /* { personId } */
  role: 'worker',             /* worker | admin */
  teams: [],
  people: [],
  reports: [],
  polls: [],
  notices: [],
  schedules: [],
  docs: { risk: [], spec: [] },
  draft: null,
  ui: {},
  sync: { phase: 'loading', at: null, err: '' }
};

/* ---------- 기본 유틸 ---------- */
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function uuid() {
  try {
    if (window.crypto && crypto.randomUUID) { return crypto.randomUUID(); }
  } catch (e) { /* 아래로 */ }
  var b = [];
  for (var i = 0; i < 16; i++) { b.push(Math.floor(Math.random() * 256)); }
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  var h = b.map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}
function uid(p) { return (p || 'id') + '_' + Math.random().toString(36).slice(2, 8); }
function won(n) { return Number(n || 0).toLocaleString('ko-KR'); }
function num(n) { var v = parseInt(String(n).replace(/[^0-9]/g, ''), 10); return isNaN(v) ? 0 : v; }
function safeJson(v, fallback) {
  if (v === null || v === undefined) { return fallback; }
  if (typeof v !== 'string') { return v; }
  try { return JSON.parse(v); } catch (e) { return fallback; }
}

/* ---------- 날짜 · 시각 (모두 한국시간 기준) ---------- */
function kstParts(ms) {
  var k = new Date((ms === undefined ? Date.now() : ms) + KST_MS);
  return {
    y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate(),
    h: k.getUTCHours(), mi: k.getUTCMinutes(), dow: k.getUTCDay()
  };
}
function keyOf(p) { return p.y + '-' + pad2(p.m) + '-' + pad2(p.d); }
function todayKey() { return keyOf(kstParts()); }
function todayKeyAdd(n) {
  var p = kstParts();
  var t = Date.UTC(p.y, p.m - 1, p.d) + n * 86400000;
  var k = new Date(t);
  return k.getUTCFullYear() + '-' + pad2(k.getUTCMonth() + 1) + '-' + pad2(k.getUTCDate());
}
function parseKey(k) {
  var p = String(k).split('-');
  return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
}
function addDays(k, n) {
  var d = parseKey(k);
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function nowHM() { var p = kstParts(); return pad2(p.h) + ':' + pad2(p.mi); }
function wd(k) { return BASE_WEEK[parseKey(k).getDay()]; }
function shortDate(k) { var p = String(k).split('-'); return parseInt(p[1], 10) + '.' + parseInt(p[2], 10); }
function longDate(k) {
  var p = String(k).split('-');
  return p[0] + '.' + pad2(parseInt(p[1], 10)) + '.' + pad2(parseInt(p[2], 10)) + ' (' + wd(k) + ')';
}
function monthLabel(mk) { var p = String(mk).split('-'); return p[0] + '년 ' + parseInt(p[1], 10) + '월'; }
function shiftMonth(mk, n) {
  var p = String(mk).split('-');
  var y = parseInt(p[0], 10), m = parseInt(p[1], 10) + n;
  while (m < 1) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  return y + '-' + pad2(m);
}
function minFromHM(s) { var p = String(s).split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); }
function toIso(dateKey, hm) {
  if (!dateKey || !hm) { return null; }
  return dateKey + 'T' + String(hm).slice(0, 5) + ':00+09:00';
}
function kstHM(iso) {
  if (!iso) { return ''; }
  var t = Date.parse(iso);
  if (isNaN(t)) { return ''; }
  var p = kstParts(t);
  return pad2(p.h) + ':' + pad2(p.mi);
}
function kstDate(iso) {
  if (!iso) { return ''; }
  var t = Date.parse(iso);
  if (isNaN(t)) { return ''; }
  return keyOf(kstParts(t));
}
function daysUntil(k) {
  if (!k) { return null; }
  var a = parseKey(k).getTime(), b = parseKey(todayKey()).getTime();
  return Math.round((a - b) / 86400000);
}
function nextSaturday() {
  var p = kstParts();
  var add = (6 - p.dow + 7) % 7;
  if (add === 0) { add = 7; }
  return todayKeyAdd(add);
}
function fmtGs(v) { var n = Math.round((+v || 0) * 10) / 10; return (n % 1 === 0) ? String(n) : n.toFixed(1); }
/* 공수 계산 : 07:00 출근 기준, 점심 2시간 포함
   ~17:00 퇴근 1공수 · ~19:00 퇴근 1.5공수 · ~21:00 퇴근 2공수 · 휴무/미출근 0 */
function gongsuOf(a) {
  if (!a || !a.in) { return 0; }
  if (!a.out) { return 1; }
  var m = minFromHM(a.out);
  if (m >= 21 * 60) { return 2; }
  if (m >= 19 * 60) { return 1.5; }
  return 1;
}
function gongsuOn(p, k) {
  if (leaveOn(p, k)) { return 0; }
  return gongsuOf((p.attendance || {})[k]);
}
function gongsuMonth(p, mk) {
  var t = 0;
  Object.keys(p.attendance || {}).forEach(function (k) {
    if (k.slice(0, 7) === mk) { t += gongsuOn(p, k); }
  });
  return Math.round(t * 10) / 10;
}
function monthDayKeys(mk) {
  var sp = String(mk).split('-');
  var y = parseInt(sp[0], 10), m = parseInt(sp[1], 10);
  var last = new Date(y, m, 0).getDate();
  var tk = todayKey();
  var out = [];
  for (var d = 1; d <= last; d++) {
    var k = y + '-' + pad2(m) + '-' + pad2(d);
    if (k > tk) { break; }
    if (parseKey(k).getDay() === 0) { continue; }
    out.push(k);
  }
  return out.reverse();
}
function edMark(flag) { return flag ? ' <span class="ed-mark">(수정됨)</span>' : ''; }
function birthText(b) {
  if (!b) { return ''; }
  var p = String(b).split('-');
  if (p.length < 3) { return b; }
  return p[0].slice(2) + '.' + p[1] + '.' + p[2];
}
function birthFromDigits(v) {
  var d = String(v === null || v === undefined ? '' : v).replace(/[^0-9]/g, '');
  if (d.length === 6) {
    d = (parseInt(d.slice(0, 2), 10) > 30 ? '19' : '20') + d;
  } else if (d.length !== 8) {
    return '';
  }
  var y = parseInt(d.slice(0, 4), 10), m = parseInt(d.slice(4, 6), 10), day = parseInt(d.slice(6, 8), 10);
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || day < 1 || day > 31) { return ''; }
  var dt = new Date(y, m - 1, day);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== day) { return ''; }
  return y + '-' + pad2(m) + '-' + pad2(day);
}
function phoneDigits(v) { return String(v === null || v === undefined ? '' : v).replace(/[^0-9]/g, ''); }
function phonePretty(v) {
  var d = phoneDigits(v);
  if (d.length === 11) { return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7); }
  if (d.length === 10) { return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6); }
  return String(v === null || v === undefined ? '' : v).trim();
}

function toast(msg) {
  var t = $('#toast');
  if (!t) { return; }
  t.innerHTML = msg;
  t.classList.add('show');
  if (toast._t) { clearTimeout(toast._t); }
  toast._t = setTimeout(function () { t.classList.remove('show'); }, 3400);
}

function defaultCerts() {
  return ['T/L', 'TBM 리더', '유도원', '생명줄', '신호수'].map(function (n) {
    return { name: n, on: false, exp: '', custom: false };
  });
}

/* =========================================================
   DB 행 → 화면 상태
   ========================================================= */
function mapWorker(w) {
  return {
    id: w.id,
    name: w.name || '',
    birth: w.birth_date || '',
    phone: w.phone || '',
    job: w.job_type || '배관공',
    price: w.daily_rate === null || w.daily_rate === undefined ? 0 : (+w.daily_rate || 0),
    teamId: w.team_id || null,
    role: w.is_leader ? 'leader' : 'worker',
    admin: !!w.is_admin,
    status: w.status || 'active',
    resign: (w.status === 'resigned')
      ? { date: w.resign_date || '', reason: w.resign_reason || '', text: '' }
      : null,
    attendance: {},
    leaves: [],
    certs: (function () {
      var c = safeJson(w.certs_json, []);
      return Array.isArray(c) ? c : [];
    })(),
    injury: { has: !!w.injury_has, date: w.injury_date || '', note: w.injury_note || '' },
    memo: w.memo || ''
  };
}

function buildState(d) {
  var next = {
    ready: true,
    auth: state.auth,
    role: state.role,
    teams: (d.teams || []).map(function (t) { return { id: t.id, name: t.name, leaderId: t.leader_id || null }; }),
    people: (d.workers || []).map(mapWorker),
    reports: [],
    polls: [],
    notices: [],
    schedules: [],
    docs: { risk: [], spec: [] },
    draft: state.draft,
    ui: state.ui,
    sync: state.sync
  };
  var prev = state;
  state = next;

  (d.attendance || []).forEach(function (a) {
    var p = personById(a.worker_id);
    if (!p) { return; }
    p.attendance[a.work_date] = {
      in: kstHM(a.check_in), out: kstHM(a.check_out),
      inEdited: !!a.in_edited, outEdited: !!a.out_edited
    };
  });
  (d.leaves || []).forEach(function (l) {
    var p = personById(l.worker_id);
    if (!p) { return; }
    p.leaves.push({
      id: l.id, date: l.leave_date, reason: l.reason || '',
      at: kstHM(l.created_at), teamName: l.team_name || '',
      reportTo: l.report_to || '', status: l.status || 'pending'
    });
  });
  state.reports = (d.reports || []).map(function (r) {
    var names = safeJson(r.member_names_json, []);
    if (!Array.isArray(names)) { names = []; }
    var ids = names.map(function (n) {
      var q = state.people.filter(function (p) { return p.name === n; })[0];
      return q ? q.id : null;
    }).filter(Boolean);
    var wt = String(r.work_time || '');
    var parts = wt.split('~');
    return {
      id: r.id, teamId: r.team_id || null, teamName: r.team_name || '',
      date: r.report_date, authorName: r.author_name || '', authorRole: '기술인',
      memberIds: ids, memberNames: names,
      location: r.location || '',
      timeFrom: (parts[0] || '').trim(), timeTo: (parts[1] || '').trim(),
      content: r.content || '', note: r.special_note || '',
      submittedAt: kstHM(r.created_at)
    };
  });
  state.polls = (d.polls || []).map(function (p) {
    return {
      id: p.id, title: p.title, satKey: p.poll_date, deadline: p.deadline || '',
      open: !!p.is_active, createdAt: kstDate(p.created_at), votes: {}
    };
  });
  (d.responses || []).forEach(function (r) {
    var poll = state.polls.filter(function (p) { return p.id === r.poll_id; })[0];
    if (poll) { poll.votes[r.worker_id] = r.answer; }
  });
  state.notices = (d.notices || []).map(function (n) {
    return {
      id: n.id, title: n.title, body: n.body || '', author: n.author_name || '관리자',
      date: kstDate(n.created_at), pinned: !!n.is_pinned
    };
  });
  state.schedules = (d.schedules || []).map(function (s) {
    return {
      id: s.id, date: s.sched_date, title: s.title || '', time: s.time_text || '',
      memo: s.memo || '', by: s.created_by || '', at: kstHM(s.created_at)
    };
  });
  (d.documents || []).forEach(function (doc) {
    var cat = doc.doc_type === 'spec' ? 'spec' : 'risk';
    state.docs[cat].push({
      id: doc.id, name: doc.file_name || doc.title || 'PDF', title: doc.title || '',
      addedAt: kstDate(doc.created_at), url: doc.file_url || storagePublicUrl(doc.storage_path || ''),
      path: doc.storage_path || ''
    });
  });
  ['risk', 'spec'].forEach(function (c) {
    state.docs[c].sort(function (a, b) { return a.addedAt < b.addedAt ? 1 : -1; });
  });

  /* UI 기본값 · 이전 상태 유지 */
  var ui = prev.ui || {};
  state.ui = {
    workerTab: ui.workerTab || 'home',
    adminTab: ui.adminTab || 'dash',
    adminDashView: ui.adminDashView === 'gongsu' ? 'gongsu' : 'today',
    adminGsTeam: ui.adminGsTeam || 'all',
    gsMonth: ui.gsMonth || todayKey().slice(0, 7),
    adminTeamFilter: ui.adminTeamFilter || 'all',
    reportDate: ui.reportDate || todayKey(),
    pMonth: ui.pMonth || todayKey().slice(0, 7),
    schedMonth: ui.schedMonth || todayKey().slice(0, 7),
    schedDate: ui.schedDate || todayKey(),
    showArchive: !!ui.showArchive,
    timeEdit: false,
    resignOpen: !!ui.resignOpen
  };
  state.draft = prev.draft;
  /* 로그인 세션은 DB에서 사라졌다고 앱이 함부로 지우지 않는다 (부트에서만 정리) */
  if (state.role === 'admin' && !canAdmin()) { state.role = 'worker'; }
  return state;
}

/* =========================================================
   불러오기 / 새로고침
   ========================================================= */
function fetchTables() {
  var q = [
    '/rest/v1/teams?select=*&order=created_at.asc',
    '/rest/v1/workers?select=*&order=created_at.asc',
    '/rest/v1/attendance?select=*',
    '/rest/v1/leaves?select=*&order=created_at.desc',
    '/rest/v1/saturday_polls?select=*&order=created_at.desc',
    '/rest/v1/saturday_responses?select=*',
    '/rest/v1/daily_reports?select=*&order=report_date.desc',
    '/rest/v1/notices?select=*&order=created_at.desc',
    '/rest/v1/documents?select=*&order=created_at.desc',
    '/rest/v1/schedules?select=*&order=sched_date.asc'
  ];
  return Promise.all(q.map(function (path) { return apiGet(path); })).then(function (res) {
    /* schedules 는 없을 수도 있는 추가 테이블이라 실패해도 앱 전체를 멈추지 않는다 */
    var bad = res.filter(function (r, i) { return !r.ok && i !== 9; })[0];
    if (bad) {
      var e = new Error(bad.error || 'DB 연결 실패');
      e.status = bad.status;
      throw e;
    }
    return {
      teams: res[0].data || [],
      workers: res[1].data || [],
      attendance: res[2].data || [],
      leaves: res[3].data || [],
      polls: res[4].data || [],
      responses: res[5].data || [],
      reports: res[6].data || [],
      notices: res[7].data || [],
      documents: res[8].data || [],
      schedules: (res[9] && res[9].ok && Array.isArray(res[9].data)) ? res[9].data : []
    };
  });
}

function saveCache(raw) {
  try {
    /* 용량을 아끼려고 최근 90일 근태 · 최근 200건 일보만 보관 */
    var lim = todayKeyAdd(-90);
    var d = {
      teams: raw.teams || [],
      workers: raw.workers || [],
      attendance: (raw.attendance || []).filter(function (a) { return a.work_date >= lim; }),
      leaves: raw.leaves || [],
      polls: (raw.polls || []).slice(0, 20),
      responses: raw.responses || [],
      reports: (raw.reports || []).slice(0, 200),
      notices: (raw.notices || []).slice(0, 50),
      documents: raw.documents || [],
      schedules: raw.schedules || []
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: new Date().toISOString(), d: d }));
  } catch (e) { /* 저장 불가 */ }
}

async function loadData(opts) {
  opts = opts || {};
  state.sync.phase = 'loading';
  renderSync();
  try {
    var d = await fetchTables();
    state.sync = { phase: 'ok', at: new Date().toISOString(), err: '' };
    buildState(d);
    saveCache(d);
    state.sync = { phase: outboxCount() ? 'pending' : 'ok', at: state.sync.at, err: state.sync.err };
    if (state.draft && !state.draft.teamId) { state.draft = null; }
    if (!opts.silent) { render(); }
    outboxFlush();
    return true;
  } catch (e) {
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e2) { cached = null; }
    if (cached && cached.d && (cached.d.workers || []).length && !state.ready) {
      buildState(cached.d);
      state.sync = { phase: 'cache', at: cached.at, err: e.message || 'DB 연결 실패' };
      if (!opts.silent) { render(); }
      return false;
    }
    if (state.ready) {
      state.sync = { phase: 'err', at: state.sync.at, err: e.message || 'DB 연결 실패' };
      renderSync();
      if (!opts.silent) { render(); }
    } else {
      state.sync = { phase: 'err', at: null, err: e.message || 'DB 연결 실패' };
      state.ready = true;
      if (!opts.silent) { render(); }
    }
    return false;
  }
}

/* 주기적 동기화 : 다른 사람이 저장한 내용을 20초마다 받아 온다.
   입력 중이거나 시트가 열려 있으면 화면은 건드리지 않고 데이터만 갱신한다. */
var refreshTimer = null;
async function refresh(silent) {
  if (!state.auth) { return; }
  if (document.hidden) { return; }
  if (outboxCount()) { await outboxFlush(); }
  if (outboxCount()) { renderSync(); return; }
  var typing = (function () {
    var el = document.activeElement;
    if (!el) { return false; }
    var tag = (el.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  })();
  var sheetOpen = $('#sheetWrap') && $('#sheetWrap').classList.contains('open');
  if (typing || sheetOpen) {
    await loadData({ silent: true });
    renderSync();
    return;
  }
  var vals = snapshotInputs();
  await loadData({ silent: true });
  render();
  restoreInputs(vals);
}

/* 화면에 적고 있던 입력값을 살려 두기 (20초 자동 새로고침에 글이 지워지지 않게) */
function snapshotInputs() {
  var out = {};
  $$('#screen input[id], #screen select[id], #screen textarea[id]').forEach(function (el) {
    out[el.id] = el.type === 'checkbox' ? (el.checked ? '\u0001on' : '') : el.value;
  });
  return out;
}
function restoreInputs(vals) {
  Object.keys(vals || {}).forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) { return; }
    var v = vals[id];
    if (el.type === 'checkbox') { el.checked = (v === '\u0001on'); return; }
    if (v !== undefined && v !== null) { el.value = v; }
  });
}

function startAutoRefresh() {
  if (refreshTimer) { clearInterval(refreshTimer); }
  refreshTimer = setInterval(function () { refresh(true); }, 20000);
}

/* ---------- 로그인 세션 ---------- */
function sessionRead() {
  try {
    var o = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
    if (o && o.v === 2 && o.personId) { return o; }
  } catch (e) { /* 없음 */ }
  return null;
}
function sessionSave(p, role) {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify({
      v: 2, personId: p.id, name: p.name, role: role === 'admin' ? 'admin' : 'worker', at: new Date().toISOString()
    }));
  } catch (e) { /* 저장 불가 */ }
}
function sessionSetRole(r) {
  var s = sessionRead();
  if (!s) { return; }
  s.role = r === 'admin' ? 'admin' : 'worker';
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(s)); } catch (e) { /* 저장 불가 */ }
}
function sessionClear() {
  try { localStorage.removeItem(AUTH_KEY); } catch (e) { /* 없음 */ }
}
function logOut() {
  sessionClear();
  state.auth = null;
  state.role = 'worker';
  state.draft = null;
  closeSheet();
  render();
  toast('로그아웃했어요');
}

/* ---------- 조회 도우미 ---------- */
function me() {
  if (!state.auth) { return null; }
  return personById(state.auth.personId) || null;
}
function personById(id) { return state.people.filter(function (p) { return p.id === id; })[0] || null; }
function teamById(id) { return state.teams.filter(function (t) { return t.id === id; })[0] || null; }
function activePeople() { return state.people.filter(function (p) { return p.status !== 'resigned'; }); }
function resignedPeople() { return state.people.filter(function (p) { return p.status === 'resigned'; }); }
function teamMembers(tid) {
  if (!tid) { return []; }
  return activePeople().filter(function (p) { return p.teamId === tid; }).sort(function (a, b) {
    if (a.role === b.role) { return a.name.localeCompare(b.name, 'ko'); }
    return a.role === 'leader' ? -1 : 1;
  });
}
function leaderOf(tid) {
  var t = teamById(tid);
  if (!t) { return null; }
  if (t.leaderId) {
    var l = personById(t.leaderId);
    if (l && l.status !== 'resigned') { return l; }
  }
  return teamMembers(tid).filter(function (p) { return p.role === 'leader'; })[0] || null;
}
function teamLabel(tid) { var t = teamById(tid); return t ? t.name : '미배정'; }
function avgOf(list) {
  var arr = list.filter(function (p) { return p.status !== 'resigned' && (+p.price || 0) > 0; });
  if (!arr.length) { return 0; }
  var s = arr.reduce(function (a, p) { return a + (+p.price || 0); }, 0);
  return Math.round(s / arr.length);
}
function overallAvg() { return avgOf(activePeople()); }
function todayAtt(p) { return p.attendance[todayKey()] || null; }
function leaveOn(p, k) {
  return (p.leaves || []).filter(function (l) { return l.date === k; })[0] || null;
}
function statusOf(p) {
  if (p.status === 'resigned') { return '퇴사'; }
  if (leaveOn(p, todayKey())) { return '휴무'; }
  var a = todayAtt(p);
  if (a && a.in && a.out) { return '퇴근'; }
  if (a && a.in) { return '근무중'; }
  return '미출근';
}
function statusBadge(p) {
  var s = statusOf(p);
  var cls = s === '근무중' ? 'b-work' : s === '퇴근' ? 'b-out' : s === '휴무' ? 'b-off2' : s === '퇴사' ? 'b-res' : 'b-none';
  return '<span class="badge ' + cls + '">' + s + '</span>';
}
function timeText(p) {
  if (p.status === 'resigned') { return '퇴사 ' + (p.resign ? shortDate(p.resign.date) : ''); }
  var lv = leaveOn(p, todayKey());
  if (lv) { return '휴무 · ' + esc(lv.reason); }
  var a = todayAtt(p);
  if (!a || !a.in) { return '출근 기록 없음'; }
  return '<b>' + a.in + '</b>' + edMark(a.inEdited) + ' 출근' + (a.out ? ' · <i>' + a.out + ' 퇴근</i>' + edMark(a.outEdited) : ' · <i>미퇴근</i>');
}
function canAdmin() {
  var p = me();
  return !!(p && p.admin);
}
function adminName() { var p = me(); return p ? p.name : '관리자'; }
function findReport(tid, date) {
  return state.reports.filter(function (r) { return r.teamId === tid && r.date === date; })[0] || null;
}
function authorLabel(rep) {
  if (!rep) { return '-'; }
  return (rep.authorName || '알 수 없음') + ' (기술인)';
}
function pollIsOpen(poll) {
  if (!poll || !poll.open) { return false; }
  if (poll.deadline) {
    var t = Date.parse(poll.deadline);
    if (!isNaN(t) && t < Date.now()) { return false; }
  }
  return true;
}
function latestPoll() {
  if (!state.polls.length) { return null; }
  return state.polls.slice().sort(function (a, b) {
    if (pollIsOpen(a) !== pollIsOpen(b)) { return pollIsOpen(a) ? -1 : 1; }
    return String(a.satKey) < String(b.satKey) ? 1 : -1;
  })[0];
}
function pollCounts(poll) {
  var ps = activePeople();
  var yes = 0, no = 0;
  ps.forEach(function (p) {
    var v = poll.votes[p.id];
    if (v === 'yes') { yes++; } else if (v === 'no') { no++; }
  });
  return { yes: yes, no: no, none: Math.max(0, ps.length - yes - no), total: ps.length };
}
function avgByTeam() {
  return state.teams.map(function (t) {
    var m = teamMembers(t.id);
    return { id: t.id, name: t.name, count: m.length, avg: avgOf(m) };
  });
}
function fmtDeadline(iso) {
  if (!iso) { return '마감 없음'; }
  var t = Date.parse(iso);
  if (isNaN(t)) { return String(iso); }
  var p = kstParts(t);
  var k = keyOf(p);
  return shortDate(k) + '(' + wd(k) + ') ' + pad2(p.h) + ':' + pad2(p.mi);
}

/* =========================================================
   저장(쓰기) 도우미 — 실패하면 apiWrite 가 보관함에 넣고 재전송
   ========================================================= */
function patchWorker(id, fields, label) {
  return apiWrite({ m: 'PATCH', path: '/rest/v1/workers?id=' + sbEq(id), body: fields, prefer: 'return=minimal', label: label || '인원 저장' });
}
function insertWorker(p, label) {
  return apiWrite({
    m: 'POST', path: '/rest/v1/workers', prefer: 'return=minimal', label: label || '신규 인원 등록',
    body: {
      id: p.id, name: p.name, birth_date: p.birth || null, phone: p.phone || null,
      job_type: p.job || null, team_id: p.teamId || null, is_leader: p.role === 'leader',
      is_admin: !!p.admin, daily_rate: p.price || null, certs_json: p.certs || [],
      injury_has: !!p.injury.has, injury_date: p.injury.date || null, injury_note: p.injury.note || null,
      memo: p.memo || null, status: p.status || 'active'
    }
  });
}
function saveAttendance(p, dateKey, label) {
  var a = p.attendance[dateKey];
  if (!a || (!a.in && !a.out)) {
    return apiWrite({
      m: 'DELETE', label: label || '근태 삭제',
      path: '/rest/v1/attendance?worker_id=' + sbEq(p.id) + '&work_date=' + sbEq(dateKey)
    });
  }
  return apiWrite({
    m: 'POST', path: '/rest/v1/attendance?on_conflict=worker_id,work_date',
    prefer: 'resolution=merge-duplicates,return=minimal', label: label || '근태 저장',
    body: {
      worker_id: p.id, work_date: dateKey,
      check_in: a.in ? toIso(dateKey, a.in) : null,
      check_out: a.out ? toIso(dateKey, a.out) : null,
      in_edited: !!a.inEdited, out_edited: !!a.outEdited,
      gongsu: gongsuOf(a)
    }
  });
}
function insertLeave(p, l) {
  return apiWrite({
    m: 'POST', path: '/rest/v1/leaves', prefer: 'return=minimal', label: '휴무 신청',
    body: {
      id: l.id, worker_id: p.id, leave_date: l.date, reason: l.reason || null,
      team_name: l.teamName || null, report_to: l.reportTo || null, status: 'pending'
    }
  });
}
function patchLeave(l) {
  return apiWrite({
    m: 'PATCH', path: '/rest/v1/leaves?id=' + sbEq(l.id), prefer: 'return=minimal', label: '휴무 정정',
    body: { leave_date: l.date, reason: l.reason || null, team_name: l.teamName || null, report_to: l.reportTo || null }
  });
}
function deleteLeave(id) {
  return apiWrite({ m: 'DELETE', path: '/rest/v1/leaves?id=' + sbEq(id), label: '휴무 취소' });
}
function insertReport(rep) {
  return apiWrite({
    m: 'POST', path: '/rest/v1/daily_reports', prefer: 'return=minimal', label: '작업일보 제출',
    body: {
      id: rep.id, report_date: rep.date, team_id: rep.teamId || null, team_name: rep.teamName || null,
      author_name: rep.authorName || null, member_names_json: rep.memberNames || [],
      location: rep.location || null, work_time: (rep.timeFrom || '') + ' ~ ' + (rep.timeTo || ''),
      content: rep.content || null, special_note: rep.note || null
    }
  });
}
function patchReport(rep) {
  return apiWrite({
    m: 'PATCH', path: '/rest/v1/daily_reports?id=' + sbEq(rep.id), prefer: 'return=minimal', label: '작업일보 수정',
    body: {
      team_name: rep.teamName || null, author_name: rep.authorName || null,
      member_names_json: rep.memberNames || [], location: rep.location || null,
      work_time: (rep.timeFrom || '') + ' ~ ' + (rep.timeTo || ''),
      content: rep.content || null, special_note: rep.note || null
    }
  });
}
function insertNotice(n) {
  return apiWrite({
    m: 'POST', path: '/rest/v1/notices', prefer: 'return=minimal', label: '공지 등록',
    body: { id: n.id, title: n.title, body: n.body || null, author_name: n.author || null, is_pinned: !!n.pinned }
  });
}
function insertPollDb(poll) {
  return apiWrite({
    m: 'POST', path: '/rest/v1/saturday_polls', prefer: 'return=minimal', label: '토요일 조사 등록',
    body: { id: poll.id, poll_date: poll.satKey, title: poll.title, deadline: poll.deadline || null, is_active: true }
  });
}
function closePollDb(id) {
  return apiWrite({ m: 'PATCH', path: '/rest/v1/saturday_polls?id=' + sbEq(id), body: { is_active: false }, prefer: 'return=minimal', label: '조사 마감' });
}
function saveVote(pollId, workerId, answer) {
  return apiWrite({
    m: 'POST', path: '/rest/v1/saturday_responses?on_conflict=poll_id,worker_id',
    prefer: 'resolution=merge-duplicates,return=minimal', label: '토요일 응답',
    body: { poll_id: pollId, worker_id: workerId, answer: answer }
  });
}
function insertDocument(doc) {
  return apiWrite({
    m: 'POST', path: '/rest/v1/documents', prefer: 'return=minimal', label: 'PDF 등록',
    body: {
      id: doc.id, doc_type: doc.type, title: doc.title || doc.name,
      file_name: doc.name, file_url: doc.url, storage_path: doc.path, uploaded_by: doc.by || null
    }
  });
}
/* ---------- 일정 달력 ---------- */
function insertScheduleDb(s) {
  return apiWrite({
    m: 'POST', path: '/rest/v1/schedules', prefer: 'return=minimal', label: '일정 등록',
    body: { id: s.id, sched_date: s.date, title: s.title, time_text: s.time || null, memo: s.memo || null, created_by: s.by || null }
  });
}
function patchScheduleDb(s) {
  return apiWrite({
    m: 'PATCH', path: '/rest/v1/schedules?id=' + sbEq(s.id), prefer: 'return=minimal', label: '일정 수정',
    body: { sched_date: s.date, title: s.title, time_text: s.time || null, memo: s.memo || null }
  });
}
function deleteScheduleDb(id) {
  return apiWrite({ m: 'DELETE', path: '/rest/v1/schedules?id=' + sbEq(id), label: '일정 삭제' });
}
function schedulesOn(dateKey) {
  return (state.schedules || []).filter(function (s) { return s.date === dateKey; });
}
function schedMonthCount(mk) {
  return (state.schedules || []).filter(function (s) { return String(s.date).slice(0, 7) === mk; }).length;
}
function schedSort(a, b) {
  var am = /^\s*(\d{1,2}:\d{2})/.exec(a.time || ''), bm = /^\s*(\d{1,2}:\d{2})/.exec(b.time || '');
  if (am && bm && am[1] !== bm[1]) { return minFromHM(am[1]) - minFromHM(bm[1]); }
  if (am && !bm) { return -1; }
  if (!am && bm) { return 1; }
  return String(a.title).localeCompare(String(b.title), 'ko');
}
function schedById(id) {
  return (state.schedules || []).filter(function (s) { return s.id === id; })[0] || null;
}
function schedShiftMonth(n) {
  var mk = shiftMonth(state.ui.schedMonth || todayKey().slice(0, 7), n);
  var day = parseInt(String(state.ui.schedDate || todayKey()).split('-')[2], 10) || 1;
  var last = new Date(parseInt(mk.slice(0, 4), 10), parseInt(mk.slice(5, 7), 10), 0).getDate();
  state.ui.schedMonth = mk;
  state.ui.schedDate = mk + '-' + pad2(Math.min(day, last));
  render();
}
function deleteDocument(id) {
  return apiWrite({ m: 'DELETE', path: '/rest/v1/documents?id=' + sbEq(id), label: 'PDF 삭제' });
}
function insertTeam(name) {
  var t = { id: uuid(), name: name, leaderId: null };
  apiWrite({ m: 'POST', path: '/rest/v1/teams', prefer: 'return=minimal', label: '조 만들기', body: { id: t.id, name: name } });
  return t;
}
