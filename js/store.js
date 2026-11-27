/* =========================================================
   한양 pcw팀 · 상태 / Supabase 데이터 연결 / 공통 유틸
   ========================================================= */
var AUTH_KEY = 'pcw_auth_v2';          /* 로그인 세션 (사용자가 로그아웃을 누를 때만 지워짐) */
var CACHE_KEY = 'pcw_cache_v2';        /* 마지막으로 받아 둔 화면 (끊겼을 때 보여 주기) */
var BASE_WEEK = ['일', '월', '화', '수', '목', '금', '토'];
var JOB_LIST = ['배관공', '보통인부', '용접공', '품질관리자'];
var PRIVACY_VERSION = '2026-11-26-v1';   /* 개인정보 수집·이용 동의서 버전 (동의 기록에 같이 저장) */
var KST_MS = 9 * 3600 * 1000;

var state = {
  ready: false,
  auth: null,                 /* { personId } */
  role: 'worker',             /* worker | manager | admin  (지금 보고 있는 화면 역할) */
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
function fmtGs(v) {
  var n = Math.round((+v || 0) * 1000) / 1000;
  if (n % 1 === 0) { return String(n); }
  return n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
/* 공수 계산 · 공용 규칙 (2026-11-26 통일)
   - 출근: 분이 있으면 다음 정각으로 올림 (07:01 → 08:00)
   - 퇴근: 분이 있으면 그 시각의 정각으로 내림 (17:40 → 17:00)
   - 점심 11:00~13:00(2시간)은 근무시간에서 제외
   - 실근무 H: H <= 8 → H * 0.125 / H > 8 → 1.0 + (H - 8) * 0.25
     예) 07:00~17:00 = 8h → 1.0 · 07:01~17:00 = 7h → 0.875 · 13:00~19:00 = 6h → 0.75
         07:00~19:00 = 10h → 1.5 · 07:00~21:00 = 12h → 2.0 · 휴무/미출근 0        */
function calcGongsu(inHM, outHM) {
  if (!inHM || !outHM) { return 0; }
  var a = minFromHM(inHM), b = minFromHM(outHM);
  if (isNaN(a) || isNaN(b)) { return 0; }
  var s = (a % 60 === 0) ? a : Math.ceil(a / 60) * 60;      /* 출근 올림 */
  var e = (b % 60 === 0) ? b : Math.floor(b / 60) * 60;     /* 퇴근 정각(내림) */
  if (e <= s) { return 0; }
  var span = (e - s) / 60;
  var lunch = Math.max(0, Math.min(e, 13 * 60) - Math.max(s, 11 * 60)) / 60;   /* 11:00~13:00 겹침 제외 */
  var H = span - lunch;
  if (H <= 0) { return 0; }
  var g = (H <= 8) ? H * 0.125 : 1 + (H - 8) * 0.25;
  return Math.round(g * 1000) / 1000;
}
function gongsuOf(a) {
  if (!a || !a.in) { return 0; }
  if (!a.out) { return 1; }        /* 출근만 찍힌 날은 기존과 같이 1공수 */
  return calcGongsu(a.in, a.out);
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
  return Math.round(t * 1000) / 1000;
}
/* 관리자·팀장 전체 화면용 : 오늘 이후(미래) 날짜는 더하지 않는다
   (기술인이 개인 공수표에서 미리 넣어 둔 미래 공수는 본인 화면에만 보인다) */
function gongsuMonthUpTo(p, mk) {
  var tk = todayKey();
  var t = 0;
  Object.keys(p.attendance || {}).forEach(function (k) {
    if (k.slice(0, 7) === mk && k <= tk) { t += gongsuOn(p, k); }
  });
  return Math.round(t * 1000) / 1000;
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
    hireDate: w.hire_date || '',
    status: w.status || 'active',
    resign: (w.status === 'resigned')
      ? { date: w.resign_date || '', reason: w.resign_reason || '', text: '' }
      : null,
    attendance: {},
    leaves: [],
    earlyLeaves: [],
    certs: (function () {
      var c = safeJson(w.certs_json, []);
      return Array.isArray(c) ? c : [];
    })(),
    injury: { has: !!w.injury_has, date: w.injury_date || '', note: w.injury_note || '' },
    memo: w.memo || '',
    privacyAgreedAt: w.privacy_agreed_at || '',
    privacyVersion: w.privacy_version || '',
    sensitiveAgreedAt: w.sensitive_agreed_at || ''
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
      reportTo: l.report_to || '', status: l.status || 'pending',
      ackAt: l.ack_at || '', ackBy: l.ack_by || '',
      decidedAt: l.decided_at || '', decidedBy: l.decided_by || '',
      rejectReason: l.reject_reason || ''
    });
  });
  (d.earlyLeaves || []).forEach(function (e) {
    var p = personById(e.worker_id);
    if (!p) { return; }
    p.earlyLeaves.push({
      id: e.id, date: e.work_date, start: e.start_time || '', end: e.end_time || '',
      gongsu: (e.gongsu === null || e.gongsu === undefined) ? 0 : (+e.gongsu || 0),
      reason: e.reason || '', reportTo: e.reported_to || '',
      status: e.status || 'pending', at: kstHM(e.created_at),
      ackAt: e.ack_at || '', ackBy: e.ack_by || '',
      decidedAt: e.decided_at || '', decidedBy: e.decided_by || '', rejectReason: e.reject_reason || ''
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
    personOpen: ui.personOpen || '',
    q_dash: ui.q_dash || '', q_gongsu: ui.q_gongsu || '', q_teams: ui.q_teams || '',
    myGsMonth: ui.myGsMonth || todayKey().slice(0, 7),
    hcDate: /^\d{4}-\d{2}-\d{2}$/.test(String(ui.hcDate || '')) ? ui.hcDate : todayKey(),
    hcMonth: ui.hcMonth || todayKey().slice(0, 7),
    bulkDate: ui.bulkDate || todayKey(),
    bulkOpen: !!ui.bulkOpen,
    certFilter: ui.certFilter || '',
    certPanel: !!ui.certPanel,
    dashRoleFilter: Array.isArray(ui.dashRoleFilter) ? ui.dashRoleFilter : [],
    dashRolePanel: !!ui.dashRolePanel,
    timeEdit: false,
    pollExpand: ui.pollExpand || '',
    resignOpen: !!ui.resignOpen
  };
  state.draft = prev.draft;
  /* 로그인 세션은 DB에서 사라졌다고 앱이 함부로 지우지 않는다 (부트에서만 정리) */
  if (state.role === 'admin' && !canAdmin()) { state.role = canManage() ? 'manager' : 'worker'; }
  if (state.role === 'manager' && !canManage()) { state.role = 'worker'; }
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
    '/rest/v1/schedules?select=*&order=sched_date.asc',
    '/rest/v1/early_leaves?select=*&order=work_date.desc,created_at.desc'
  ];
  return Promise.all(q.map(function (path) { return apiGet(path); })).then(function (res) {
    /* schedules 는 없을 수도 있는 추가 테이블이라 실패해도 앱 전체를 멈추지 않는다 */
    var bad = res.filter(function (r, i) { return !r.ok && i !== 9 && i !== 10; })[0];
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
      schedules: (res[9] && res[9].ok && Array.isArray(res[9].data)) ? res[9].data : [],
      earlyLeaves: (res[10] && res[10].ok && Array.isArray(res[10].data)) ? res[10].data : []
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
      schedules: raw.schedules || [],
      earlyLeaves: raw.earlyLeaves || []
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
    /* 알람 팝업이 떠 있는 중에 새 보고가 올라오면 목록에 바로 더한다 */
    if (sheetOpen && $('#sheetWrap') && $('#sheetWrap').classList.contains('alarm-open')) {
      try { maybeShowLeaveAlarm(); } catch (e) { /* 알람 실패가 새로고침을 막지 않게 */ }
    }
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
      v: 2, personId: p.id, name: p.name,
      role: role === 'admin' ? 'admin' : (role === 'manager' ? 'manager' : 'worker'),
      at: new Date().toISOString()
    }));
  } catch (e) { /* 저장 불가 */ }
}
function sessionSetRole(r) {
  var s = sessionRead();
  if (!s) { return; }
  s.role = r === 'admin' ? 'admin' : (r === 'manager' ? 'manager' : 'worker');
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(s)); } catch (e) { /* 저장 불가 */ }
}
function sessionClear() {
  try { localStorage.removeItem(AUTH_KEY); } catch (e) { /* 없음 */ }
}
function logOut() {
  pushClearToken();          /* 이 휴대폰의 푸시 토큰 연결을 끊는다 */
  sessionClear();
  state.auth = null;
  state.role = 'worker';
  state.draft = null;
  state.ui.privacyChecked = false;
  state.ui.sensitiveChecked = false;
  state.ui.schedSheet = false;
  state.ui.schedBackToCal = false;
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

/* ---------- 자격 필터 · 직종별 인원 (팀·조 화면) ----------
   자격 데이터는 workers.certs_json = [{name, on, exp, custom}, …] 하나뿐이다(별도 cert_tbm_exp 컬럼 없음).
   · on = 보유 체크 · exp = 만료일(YYYY-MM-DD, 빈 값이면 미입력) · T/L 은 만료 없음(certRowHTML 과 같은 규칙)
   · 만료일이 지난 자격은 "보유"로 치지 않는다 (인원 상세의 `만료` 배지와 같은 기준) */
var CERT_BASE = ['T/L', 'TBM 리더', '유도원', '생명줄', '신호수'];
function certHasExp(name) { return name !== 'T/L'; }
function certHeldOf(p, name) {
  if (!p || !name) { return false; }
  var list = p.certs || [];
  for (var i = 0; i < list.length; i++) {
    var c = list[i];
    if (!c || c.name !== name || !c.on) { continue; }
    if (certHasExp(name) && c.exp) {
      var du = daysUntil(c.exp);
      if (du !== null && du < 0) { continue; }
    }
    return true;
  }
  return false;
}
/* 자격 선택 목록 — 기본 5개 + 실제 데이터에 있는 기타 자격(커스텀)을 이름순으로 뒤에 */
function certNameList() {
  var names = CERT_BASE.slice();
  activePeople().forEach(function (p) {
    (p.certs || []).forEach(function (c) {
      if (c && c.name && names.indexOf(c.name) < 0) { names.push(c.name); }
    });
  });
  return names;
}
function certHolders(name) {
  if (!name) { return []; }
  return activePeople().filter(function (p) { return certHeldOf(p, name); });
}
/* 직종별 인원 표기 — 배관공·용접공·보통인부는 0명이어도 항상, 품질관리자·기타 직종은 1명 이상일 때만 */
function jobCountIn(list, job) {
  return (list || []).filter(function (p) { return ((p && p.job) || '') === job; }).length;
}
function jobBreakdownOf(list) {
  var parts = ['배관공', '용접공', '보통인부'].map(function (j) {
    return j + ' ' + jobCountIn(list, j) + '명';
  });
  if (jobCountIn(list, '품질관리자') > 0) { parts.push('품질관리자 ' + jobCountIn(list, '품질관리자') + '명'); }
  var others = [];
  (list || []).forEach(function (p) {
    var j = (p && p.job) || '';
    if (!j || j === '품질관리자' || ['배관공', '용접공', '보통인부'].indexOf(j) >= 0) { return; }
    if (others.indexOf(j) < 0) { others.push(j); }
  });
  others.sort(function (a, b) { return a.localeCompare(b, 'ko'); });
  others.forEach(function (j) { parts.push(j + ' ' + jobCountIn(list, j) + '명'); });
  return parts.join(' ');
}
/* 그 날짜 휴무 — 반려(rejected)된 신청은 휴무로 치지 않는다 (0공수 · 명단 · 집계에서 제외) */
function leaveOn(p, k) {
  return (p.leaves || []).filter(function (l) { return l.date === k && l.status !== 'rejected'; })[0] || null;
}
/* 상태와 상관없이 그 날짜에 올라온 신청 (관리자 휴무 관리 목록용) */
function leaveAnyOn(p, k) {
  return (p.leaves || []).filter(function (l) { return l.date === k; })[0] || null;
}
/* 휴무 상태 라벨 */
function leaveStatusLabel(st) {
  return st === 'approved' ? '승인' : st === 'rejected' ? '반려' : '대기';
}
/* 오늘 퇴근 판정 : 입력된 퇴근 시각이 지금보다 미리(미래)면 아직 근무 중
   (예: 06:27~17:00 을 미리 넣어 두고 14:00 에 보면 → 출근/근무중, 표기는 '17:00 예정')
   과거 날짜는 항상 퇴근 */
function isFutureOut(a) {
  if (!a || !a.in || !a.out) { return false; }
  return minFromHM(a.out) > minFromHM(nowHM());
}
function isClockedOutToday(p) {
  var a = todayAtt(p);
  if (!a || !a.in || !a.out) { return false; }
  return !isFutureOut(a);
}
function statusOf(p) {
  if (p.status === 'resigned') { return '퇴사'; }
  if (leaveOn(p, todayKey())) { return '휴무'; }
  var a = todayAtt(p);
  if (a && a.in && isFutureOut(a)) { return '출근'; }
  if (a && a.in && a.out) { return '퇴근'; }
  if (a && a.in) { return '근무중'; }
  return '미출근';
}
function statusBadge(p) {
  var s = statusOf(p);
  var cls = (s === '근무중' || s === '출근') ? 'b-work' : s === '퇴근' ? 'b-out' : s === '휴무' ? 'b-off2' : s === '퇴사' ? 'b-res' : 'b-none';
  return '<span class="badge ' + cls + '">' + s + '</span>';
}
function timeText(p) {
  if (p.status === 'resigned') { return '퇴사 ' + (p.resign ? shortDate(p.resign.date) : ''); }
  var lv = leaveOn(p, todayKey());
  if (lv) { return '휴무 · ' + esc(lv.reason); }
  var a = todayAtt(p);
  if (!a || !a.in) { return '출근 기록 없음'; }
  if (!a.out) { return '<b>' + a.in + '</b>' + edMark(a.inEdited) + ' 출근 · <i>미퇴근</i>'; }
  if (isFutureOut(a)) {
    return '<b>' + a.in + '</b>' + edMark(a.inEdited) + ' 출근 · <i>' + a.out + ' 예정</i>' + edMark(a.outEdited);
  }
  return '<b>' + a.in + '</b>' + edMark(a.inEdited) + ' 출근 · <i>' + a.out + ' 퇴근</i>' + edMark(a.outEdited);
}
function canAdmin() {
  var p = me();
  return !!(p && p.admin);
}
/* 화면 기준 — 지금 관리자 화면을 보고 있는지 (계정 권한 canAdmin 과 다르다)
   관리자가 상단에서 팀장 · 기술인으로 전환하면 state.role 이 바뀌어 false 가 되고,
   단가 · 관리자 권한 부여 · 암호 변경 · 공지/자료/일괄등록 같은 관리자 전용 요소는
   한 건도 그려지지 않는다. 다시 관리자로 돌아오면 true 로 복귀한다. */
function isAdminView() {
  return state.role === 'admin' && canAdmin();
}
/* 팀장(반장) — is_admin 또는 is_leader 면 관리자/팀장 공용 화면을 쓸 수 있다
   단, 팀장만인 경우 단가·관리자 권한 부여·관리자 암호는 보이지 않는다 */
function canManage() {
  var p = me();
  return !!(p && (p.admin || p.role === 'leader'));
}
function isLeaderOnly() {
  var p = me();
  return !!(p && !p.admin && p.role === 'leader');
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
/* 토요일 투표 — 조(팀)별 현황 : 조마다 출근/미출근/미응답 인원과 명단 */
function pollTeamGroups(poll) {
  var map = {}, out = [];
  activePeople().forEach(function (p) {
    var tid = (p.teamId && teamById(p.teamId)) ? p.teamId : '';
    if (!map[tid]) {
      map[tid] = { id: tid, name: tid ? teamLabel(tid) : '미배정', list: [], yes: 0, no: 0, none: 0 };
      out.push(map[tid]);
    }
    var v = (poll && poll.votes) ? (poll.votes[p.id] || '') : '';
    if (v !== 'yes' && v !== 'no') { v = ''; }
    map[tid].list.push({ p: p, vote: v });
    if (v === 'yes') { map[tid].yes++; } else if (v === 'no') { map[tid].no++; } else { map[tid].none++; }
  });
  var order = {};
  state.teams.forEach(function (t, i) { order[t.id] = i; });
  out.sort(function (a, b) {
    var oa = a.id ? (order[a.id] === undefined ? 90 : order[a.id]) : 99;
    var ob = b.id ? (order[b.id] === undefined ? 90 : order[b.id]) : 99;
    return oa - ob;
  });
  return out;
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
/* [필수] 개인정보 동의 기록 : 화면 상태 + DB(workers.privacy_agreed_at / privacy_version) */
function markPrivacyAgree(p) {
  if (!p) { return ''; }
  var at = new Date().toISOString();
  p.privacyAgreedAt = at;
  p.privacyVersion = PRIVACY_VERSION;
  patchWorker(p.id, { privacy_agreed_at: at, privacy_version: PRIVACY_VERSION }, '개인정보 동의 저장');
  return at;
}
/* [선택] 민감정보(현장 부상 이력) 동의 기록 : workers.sensitive_agreed_at */
function markSensitiveAgree(p) {
  if (!p) { return ''; }
  var at = new Date().toISOString();
  p.sensitiveAgreedAt = at;
  patchWorker(p.id, { sensitive_agreed_at: at }, '민감정보 동의 저장');
  return at;
}
function insertWorker(p, label) {
  return apiWrite({
    m: 'POST', path: '/rest/v1/workers', prefer: 'return=minimal', label: label || '신규 인원 등록',
    body: {
      id: p.id, name: p.name, birth_date: p.birth || null, phone: p.phone || null,
      hire_date: p.hireDate || null,
      job_type: p.job || null, team_id: p.teamId || null, is_leader: p.role === 'leader',
      is_admin: !!p.admin, daily_rate: p.price || null, certs_json: p.certs || [],
      injury_has: !!p.injury.has, injury_date: p.injury.date || null, injury_note: p.injury.note || null,
      memo: p.memo || null, status: p.status || 'active',
      privacy_agreed_at: p.privacyAgreedAt || null, privacy_version: p.privacyVersion || null,
      sensitive_agreed_at: p.sensitiveAgreedAt || null
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
/* 여러 인원 근태를 한 번에 upsert (관리자·팀장 공수 일괄 적용 · 200명도 요청 1회) */
function saveAttendanceBulk(rows, label) {
  if (!rows || !rows.length) { return Promise.resolve({ ok: true }); }
  return apiWrite({
    m: 'POST', path: '/rest/v1/attendance?on_conflict=worker_id,work_date',
    prefer: 'resolution=merge-duplicates,return=minimal', label: label || '공수 일괄 적용',
    body: rows
  });
}
/* 일괄 적용 프리셋 (관리자·팀장 인원별 출퇴근) */
var BULK_PRESETS = {
  early: { in: '05:00', out: '15:00', label: '조출(05:00~15:00)' },
  '1': { in: '07:00', out: '17:00', label: '1공수(07:00~17:00)' },
  '1.5': { in: '07:00', out: '19:00', label: '1.5공수(07:00~19:00)' },
  '2': { in: '07:00', out: '21:00', label: '2공수(07:00~21:00)' },
  earlyout: { in: '07:00', out: '11:00', label: '조퇴(07:00~11:00)' }
};
/* 일괄 적용 체크 선택 (id → 1) · 새로고침해도 유지 */
var bulkSel = {};
function leaveWriteBody(p, l) {
  var st = l.status || 'pending';
  var body = {
    id: l.id, worker_id: p.id, leave_date: l.date, reason: l.reason || null,
    team_name: l.teamName || null, report_to: l.reportTo || null, status: st
  };
  if (st !== 'pending') {
    body.decided_at = l.decidedAt || new Date().toISOString();
    body.decided_by = l.decidedBy || null;
  }
  if (st === 'rejected') { body.reject_reason = l.rejectReason || null; }
  if (l.ackAt) { body.ack_at = l.ackAt; }
  if (l.ackBy) { body.ack_by = l.ackBy; }
  return body;
}
function insertLeave(p, l, label) {
  return apiWrite({
    m: 'POST', path: '/rest/v1/leaves', prefer: 'return=minimal', label: label || '휴무 신청',
    body: leaveWriteBody(p, l)
  });
}
/* 여러 인원 휴무(0공수) 한 번에 등록 (공수 일괄 적용 · 휴무) */
function insertLeaveBulk(items) {
  if (!items || !items.length) { return Promise.resolve({ ok: true }); }
  var at = new Date().toISOString();
  return apiWrite({
    m: 'POST', path: '/rest/v1/leaves', prefer: 'return=minimal', label: '휴무 일괄 등록',
    body: items.map(function (x) {
      return {
        id: x.id, worker_id: x.workerId, leave_date: x.date, reason: x.reason || null,
        team_name: x.teamName || null, report_to: x.reportTo || null, status: 'approved',
        /* 관리자가 직접 만든 휴무는 바로 승인된 것 → 휴무 보고 알람이 다시 뜨지 않게 */
        ack_at: x.ackAt || at, ack_by: x.ackBy || null,
        decided_at: at, decided_by: x.ackBy || null
      };
    })
  });
}
/* 여러 인원 그 날짜 근태 한 번에 삭제 (휴무로 바꿀 때) */
function deleteAttendanceBulk(ids, dateKey) {
  if (!ids || !ids.length) { return Promise.resolve({ ok: true }); }
  return apiWrite({
    m: 'DELETE', label: '근태 일괄 삭제',
    path: '/rest/v1/attendance?work_date=' + sbEq(dateKey) + '&worker_id=in.(' + ids.join(',') + ')'
  });
}
function patchLeave(l) {
  var body = {
    leave_date: l.date, reason: l.reason || null, team_name: l.teamName || null, report_to: l.reportTo || null,
    status: l.status || 'pending'
  };
  if (l.status === 'pending') {
    body.decided_at = null; body.decided_by = null; body.reject_reason = null;   /* 정정해 다시 올린 신청은 대기로 */
  } else {
    body.decided_at = l.decidedAt || null;
    body.decided_by = l.decidedBy || null;
    body.reject_reason = l.status === 'rejected' ? (l.rejectReason || null) : null;
  }
  return apiWrite({
    m: 'PATCH', path: '/rest/v1/leaves?id=' + sbEq(l.id), prefer: 'return=minimal', label: '휴무 정정',
    body: body
  });
}
function deleteLeave(id) {
  return apiWrite({ m: 'DELETE', path: '/rest/v1/leaves?id=' + sbEq(id), label: '휴무 취소' });
}
/* 휴무 승인 / 반려 — 화면 상태 + DB(leaves.status·decided_at·decided_by·reject_reason) */
function decideLeave(l, status, byId, reason) {
  var at = new Date().toISOString();
  l.status = status === 'rejected' ? 'rejected' : 'approved';
  l.decidedAt = at;
  l.decidedBy = byId || '';
  l.rejectReason = l.status === 'rejected' ? (reason || '') : '';
  return apiWrite({
    m: 'PATCH', path: '/rest/v1/leaves?id=' + sbEq(l.id), prefer: 'return=minimal',
    label: l.status === 'approved' ? '휴무 승인' : '휴무 반려',
    body: {
      status: l.status, decided_at: at, decided_by: byId || null,
      reject_reason: l.status === 'rejected' ? (reason || null) : null
    }
  });
}

/* ---------- 조퇴 신청 (early_leaves · 2026-11-26 추가 · 날짜 선택 2026-11-27) ----------
   휴무(0공수)와 섞이지 않도록 별도 테이블. 신청하면 그 날 근태를 start~end 로 바꿔
   공수를 반영하고, 관리자가 반려하면 신청 전 상태(out 비움)로 되돌린다. */
function earlyLeaveById(p, id) {
  return (p.earlyLeaves || []).filter(function (e) { return e.id === id; })[0] || null;
}
function earlyLeaveOn(p, k) {
  return (p.earlyLeaves || []).filter(function (e) { return e.date === k && e.status !== 'rejected'; })[0] || null;
}
function earlyHours(inHM, outHM) {
  if (!inHM || !outHM) { return 0; }
  var a = minFromHM(inHM), b = minFromHM(outHM);
  if (isNaN(a) || isNaN(b) || b <= a) { return 0; }
  var lunch = Math.max(0, Math.min(b, 13 * 60) - Math.max(a, 11 * 60)) / 60;
  var h = (b - a) / 60 - lunch;
  return Math.round(h * 100) / 100;
}
function earlyHoursLabel(inHM, outHM) {
  var h = earlyHours(inHM, outHM);
  var n = Math.round(h * 10) / 10;
  return (n % 1 === 0 ? String(n) : n.toFixed(1)) + '시간';
}
function earlyLeaveWriteBody(p, e) {
  var st = e.status || 'pending';
  var body = {
    id: e.id, worker_id: p.id, work_date: e.date,
    start_time: e.start, end_time: e.end,
    gongsu: (e.gongsu === null || e.gongsu === undefined) ? calcGongsu(e.start, e.end) : e.gongsu,
    reason: e.reason || null, reported_to: e.reportTo || null, status: st
  };
  if (st !== 'pending') {
    body.decided_at = e.decidedAt || new Date().toISOString();
    body.decided_by = e.decidedBy || null;
  }
  if (st === 'rejected') { body.reject_reason = e.rejectReason || null; }
  if (e.ackAt) { body.ack_at = e.ackAt; }
  if (e.ackBy) { body.ack_by = e.ackBy; }
  return body;
}
function insertEarlyLeave(p, e, label) {
  return apiWrite({
    m: 'POST', path: '/rest/v1/early_leaves', prefer: 'return=minimal', label: label || '조퇴 신청',
    body: earlyLeaveWriteBody(p, e)
  });
}
function patchEarlyLeave(p, e, label) {
  return apiWrite({
    m: 'PATCH', path: '/rest/v1/early_leaves?id=' + sbEq(e.id), prefer: 'return=minimal',
    label: label || '조퇴 신청 수정', body: earlyLeaveWriteBody(p, e)
  });
}
function deleteEarlyLeave(id) {
  return apiWrite({ m: 'DELETE', path: '/rest/v1/early_leaves?id=' + sbEq(id), label: '조퇴 신청 취소' });
}
/* 조퇴 신청 → 오늘 근태 반영 : 출근은 실제 찍은 시각(없으면 신청 시작), 퇴근은 신청 종료 */
function applyEarlyLeaveAttendance(p, e) {
  var k = e.date;
  var a = (p.attendance || {})[k];
  var inHM = (a && a.in) ? a.in : e.start;
  p.attendance[k] = { in: inHM, out: e.end, inEdited: !!(a && a.inEdited), outEdited: !!(a && a.outEdited) };
  return saveAttendance(p, k, '조퇴 근태 반영');
}
/* 반려·취소 → 근태 원복 : 신청이 넣은 퇴근 시각이면 비운다 (그 사이 실제 퇴근했으면 그대로 둔다) */
function revertEarlyLeaveAttendance(p, e) {
  var k = e.date;
  var a = (p.attendance || {})[k];
  if (!a || !a.in || !a.out) { return null; }
  if (a.out !== e.end) { return null; }
  a.out = '';
  a.outEdited = false;
  return saveAttendance(p, k, '조퇴 취소로 근태 원복');
}
/* 승인 / 반려 — 화면 상태 + DB(early_leaves.status·decided_at·decided_by·reject_reason) */
function decideEarlyLeave(p, e, status, byId, reason) {
  var at = new Date().toISOString();
  e.status = status === 'rejected' ? 'rejected' : 'approved';
  e.decidedAt = at;
  e.decidedBy = byId || '';
  e.rejectReason = e.status === 'rejected' ? (reason || '') : '';
  if (e.status === 'rejected') { revertEarlyLeaveAttendance(p, e); }
  else { applyEarlyLeaveAttendance(p, e); }
  return apiWrite({
    m: 'PATCH', path: '/rest/v1/early_leaves?id=' + sbEq(e.id), prefer: 'return=minimal',
    label: e.status === 'approved' ? '조퇴 승인' : '조퇴 반려',
    body: {
      status: e.status, decided_at: at, decided_by: byId || null,
      reject_reason: e.status === 'rejected' ? (reason || null) : null
    }
  });
}
/* 관리자 확인 완료 — early_leaves.ack_at / ack_by */
function ackEarlyLeaves(ids, byId) {
  if (!ids || !ids.length) { return null; }
  var at = new Date().toISOString();
  ids.forEach(function (id) {
    state.people.forEach(function (p) {
      (p.earlyLeaves || []).forEach(function (e) {
        if (e.id === id) { e.ackAt = at; e.ackBy = byId || ''; }
      });
    });
    leaveAlarm.dismissed[id] = 1;
  });
  return apiWrite({
    m: 'PATCH', path: '/rest/v1/early_leaves?id=in.(' + ids.join(',') + ')',
    prefer: 'return=minimal', label: '조퇴 확인',
    body: { ack_at: at, ack_by: byId || null }
  });
}

/* ---------- 휴무 보고 알람 (관리자) ----------
   leaves.ack_at 이 비어 있는 행 = 관리자가 아직 확인하지 않은 휴무 보고
   - dismissed : 이번 세션에서 닫아 둔 행 (새 행이 올라오면 다시 뜨다)
   - notified  : OS 알림을 이미 보낸 행                                             */
var leaveAlarm = { dismissed: {}, notified: {} };
var leaveAlarmOpenIds = null;

function unackedLeaves() {
  var out = [];
  state.people.forEach(function (p) {
    (p.leaves || []).forEach(function (l) {
      if (l.ackAt) { return; }
      if (l.status === 'approved' || l.status === 'rejected') { return; }   /* 이미 승인·반려된 건은 알람에서 뺀다 */
      out.push({
        kind: 'leave',
        id: l.id, name: p.name, workerId: p.id, date: l.date,
        status: l.status || 'pending',
        teamName: l.teamName || (p.teamId ? teamLabel(p.teamId) : '미배정'),
        reason: l.reason || '', reportTo: l.reportTo || '', at: l.at || ''
      });
    });
  });
  out.sort(function (a, b) {
    if (a.date !== b.date) { return a.date < b.date ? -1 : 1; }
    return a.name.localeCompare(b.name, 'ko');
  });
  return out;
}

/* 미확인 조퇴 보고 (early_leaves.ack_at IS NULL · 승인/반려된 건 제외) */
function unackedEarlyLeaves() {
  var out = [];
  state.people.forEach(function (p) {
    (p.earlyLeaves || []).forEach(function (e) {
      if (e.ackAt) { return; }
      if (e.status === 'approved' || e.status === 'rejected') { return; }
      out.push({
        kind: 'early',
        id: e.id, name: p.name, workerId: p.id, date: e.date,
        status: e.status || 'pending',
        teamName: p.teamId ? teamLabel(p.teamId) : '미배정',
        start: e.start, end: e.end,
        hours: earlyHoursLabel(e.start, e.end),
        gongsu: (e.gongsu === null || e.gongsu === undefined) ? calcGongsu(e.start, e.end) : (+e.gongsu || 0),
        reason: e.reason || '', reportTo: e.reportTo || '', at: e.at || ''
      });
    });
  });
  return out;
}
/* 알람에 한 번에 띄울 휴무 + 조퇴 (날짜 → 이름 순) */
function unackedReports() {
  var all = unackedLeaves().concat(unackedEarlyLeaves());
  all.sort(function (a, b) {
    if (a.date !== b.date) { return a.date < b.date ? -1 : 1; }
    if ((a.kind || '') !== (b.kind || '')) { return a.kind === 'leave' ? -1 : 1; }
    return a.name.localeCompare(b.name, 'ko');
  });
  return all;
}

/* 관리자 확인 완료 — leaves.ack_at / ack_by 저장 + 화면 상태도 갱신 */
function ackLeaves(ids, byId) {
  if (!ids || !ids.length) { return null; }
  var at = new Date().toISOString();
  ids.forEach(function (id) {
    state.people.forEach(function (p) {
      (p.leaves || []).forEach(function (l) {
        if (l.id === id) { l.ackAt = at; l.ackBy = byId || ''; }
      });
    });
    leaveAlarm.dismissed[id] = 1;
  });
  return apiWrite({
    m: 'PATCH', path: '/rest/v1/leaves?id=in.(' + ids.join(',') + ')',
    prefer: 'return=minimal', label: '휴무 확인',
    body: { ack_at: at, ack_by: byId || null }
  });
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
  if (state.ui.schedSheet) { openSchedSheet(); return; }
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
