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

window.addEventListener('online', function () {
  scheduleOutbox(300);
  if (window.pcwSyncChanged) { window.pcwSyncChanged(); }
});
window.addEventListener('offline', function () {
  if (window.pcwSyncChanged) { window.pcwSyncChanged(); }
});
