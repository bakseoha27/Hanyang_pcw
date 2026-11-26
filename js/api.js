/* =========================================================
   Supabase REST / Storage 연동 (외부 CDN 없음 · fetch 만 사용)
   ========================================================= */
var DB = {
  url: 'https://vmsqlnmetmxpgrjnhmml.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtc3Fsbm1ldG14cGdyam5obW1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2MjY2MzMsImV4cCI6MjExMTIwMjYzM30.Ut8WFZ9Qmbw6Z0YIa7x8Q9NsAMVAVGFkn8-dtkrzkJA',
  bucket: 'site-docs'
};

var OUTBOX_KEY = 'pcw_outbox_v2';

function sbHeaders(extra) {
  var h = { apikey: DB.key, Authorization: 'Bearer ' + DB.key };
  if (extra) { Object.keys(extra).forEach(function (k) { h[k] = extra[k]; }); }
  return h;
}

/* 요청 1건 실행. spec = { m, path, body, prefer, raw, headers, label } */
async function rawFetch(spec) {
  var opt = { method: spec.m || 'GET', headers: sbHeaders(spec.headers) };
  if (spec.body !== undefined && spec.body !== null) {
    if (spec.raw) {
      opt.body = spec.body;
    } else {
      opt.body = JSON.stringify(spec.body);
      opt.headers['Content-Type'] = 'application/json';
    }
  }
  if (spec.prefer) { opt.headers['Prefer'] = spec.prefer; }
  try {
    var res = await fetch(DB.url + spec.path, opt);
    var text = '';
    try { text = await res.text(); } catch (e) { text = ''; }
    var data = null;
    if (text) { try { data = JSON.parse(text); } catch (e2) { data = text; } }
    if (!res.ok) {
      var msg = (data && (data.message || data.error || data.msg || data.hint)) || ('HTTP ' + res.status);
      return {
        ok: false, status: res.status, data: data, error: String(msg),
        retry: res.status >= 500 || res.status === 429 || res.status === 408
      };
    }
    return { ok: true, status: res.status, data: data };
  } catch (e) {
    return { ok: false, status: 0, error: (e && e.message) || '네트워크 오류', retry: true, network: true };
  }
}

/* ---------- 보내지 못한 저장 요청 보관함 (지하 현장 · 끊긴 와이파이 대비) ---------- */
function outboxLoad() {
  try {
    var raw = localStorage.getItem(OUTBOX_KEY);
    var a = raw ? JSON.parse(raw) : [];
    return Array.isArray(a) ? a : [];
  } catch (e) { return []; }
}
function outboxSave(a) {
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(a)); } catch (e) { /* 저장 불가 */ }
  if (window.pcwSyncChanged) { window.pcwSyncChanged(); }
}
function outboxCount() { return outboxLoad().length; }

var outboxTimer = null;
function scheduleOutbox(delay) {
  if (outboxTimer) { return; }
  outboxTimer = setTimeout(function () { outboxTimer = null; outboxFlush(); }, delay || 4000);
}

var outboxBusy = false;
async function outboxFlush() {
  if (outboxBusy) { return; }
  var q = outboxLoad();
  if (!q.length) { return; }
  outboxBusy = true;
  var moved = 0;
  while (q.length) {
    var r = await rawFetch(q[0]);
    if (!r.ok && (r.retry || r.network)) { break; }   /* 아직 끊김 → 다음 기회에 */
    if (!r.ok) {
      /* 형식 · 권한 오류는 계속 쌓이지 않게 버리고 기록만 남긴다 */
      if (window.pcwSyncError) { window.pcwSyncError(q[0].label + ' · ' + r.error); }
    } else {
      moved++;
    }
    q.shift();
    outboxSave(q);
  }
  outboxBusy = false;
  if (moved && window.pcwAfterFlush) { window.pcwAfterFlush(moved); }
}

/* 저장 요청: 실패하면 보관함에 넣고 다음 접속 · 다음 동기화 때 다시 보낸다 */
async function apiWrite(spec) {
  spec.id = spec.id || uid('op');
  spec.at = spec.at || new Date().toISOString();
  var r = await rawFetch(spec);
  if (!r.ok && (r.retry || r.network)) {
    var q = outboxLoad();
    q.push(spec);
    outboxSave(q);
    scheduleOutbox(2000);
  } else if (!r.ok && window.pcwSyncError) {
    window.pcwSyncError(spec.label + ' · ' + r.error);
  }
  return r;
}

async function apiGet(path) { return rawFetch({ m: 'GET', path: path }); }

/* ---------- 관리자 암호 (DB 함수로만 검증 · 앱에는 평문을 두지 않음) ---------- */
async function verifyAdminPasscode(code) {
  var r = await rawFetch({ m: 'POST', path: '/rest/v1/rpc/verify_admin_passcode', body: { input_code: String(code || '') } });
  if (!r.ok) { return { ok: false, error: r.error }; }
  return { ok: true, pass: r.data === true };
}
async function updateAdminPasscode(oldCode, newCode) {
  var r = await rawFetch({
    m: 'POST', path: '/rest/v1/rpc/update_admin_passcode',
    body: { old_code: String(oldCode || ''), new_code: String(newCode || '') }
  });
  if (!r.ok) { return { ok: false, error: r.error }; }
  return { ok: true, pass: r.data === true };
}

/* ---------- Storage ---------- */
function storagePublicUrl(path) {
  return DB.url + '/storage/v1/object/public/' + DB.bucket + '/' + path.split('/').map(encodeURIComponent).join('/');
}
async function storageUpload(path, blob, mime) {
  var enc = path.split('/').map(encodeURIComponent).join('/');
  return rawFetch({
    m: 'POST',
    path: '/storage/v1/object/' + DB.bucket + '/' + enc,
    body: blob,
    raw: true,
    headers: { 'Content-Type': mime || 'application/pdf', 'x-upsert': 'true' }
  });
}
async function storageRemove(path) {
  var enc = path.split('/').map(encodeURIComponent).join('/');
  return rawFetch({ m: 'DELETE', path: '/storage/v1/object/' + DB.bucket + '/' + enc });
}

/* ---------- 값 도우미 ---------- */
function sbEq(v) {                       /* ?col=eq.값  (uuid · 날짜 · 숫자) */
  return 'eq.' + encodeURIComponent(String(v));
}

/* =========================================================
   휴대폰 상단 알림(FCM) — 안드로이드 앱과의 연결
   · 로그인한 재직 기술인이면 관리자·팀장 여부와 관계없이 토큰을 등록한다.
   · 발송 대상(휴무·조퇴는 관리자·팀장, 전체 공지는 전원)은 서버에서 고른다.
   ========================================================= */
var ADMIN_CODE_KEY = 'pcw_admin_code';
function adminCodeGet() { try { return sessionStorage.getItem(ADMIN_CODE_KEY) || ''; } catch (e) { return ''; } }
function adminCodeSet(c) { try { if (c) { sessionStorage.setItem(ADMIN_CODE_KEY, c); } } catch (e) { /* 저장 불가 */ } }
function adminCodeClear() { try { sessionStorage.removeItem(ADMIN_CODE_KEY); } catch (e) { /* 없음 */ } }

function pushBridge() {
  return (window.AndroidPush && typeof window.AndroidPush.syncToken === 'function') ? window.AndroidPush : null;
}

function pushSyncToken() {
  var b = pushBridge();
  if (!b) { return; }
  try {
    var p = (typeof me === 'function') ? me() : null;
    if (!p || p.status === 'resigned') { b.clearToken(); return; }
    b.syncToken(String(p.id), p.name || '');
  } catch (e) { /* 앱이 아니면 무시 */ }
}

function pushClearToken() {
  var b = pushBridge();
  if (!b) { return; }
  try { b.clearToken(); } catch (e) { /* 무시 */ }
}

/* 기술인 전체 알림 — Edge Function broadcast-push (관리자 암호로 확인) */
async function sendPushBroadcast(payload) {
  return rawFetch({ m: 'POST', path: '/functions/v1/broadcast-push', body: payload, label: '전체 알림' });
}

window.addEventListener('online', function () {
  scheduleOutbox(300);
  if (window.pcwSyncChanged) { window.pcwSyncChanged(); }
});
window.addEventListener('offline', function () {
  if (window.pcwSyncChanged) { window.pcwSyncChanged(); }
});
