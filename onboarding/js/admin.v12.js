/* =========================================================
   관리자 페이지 — 조회 · 엑셀 취합 · ZIP 다운로드 · 입사취소 파기
   · 브라우저에는 anon 키만 있고, 실제 조회·다운로드는
     Edge Function(onboarding-admin)이 서비스롤 키로 처리합니다.
   · v9 (2026-11-27): PC 최적화 · [보류] 탭 분리 · [선택한 인원 처리] 드롭다운
   · v10 (2026-11-27): 한양교육일자/홍채등록일자 분리 · 상태·단가 바로 수정 ·
     단가 변경 이력 · 취합완료 배지 숨김 · P5 PH1 명단 엑셀
   · v11 (2026-11-27): 상단 탭 6개 부제 문구 제거 (이름·카운트 배지는 유지)
   · v12 (2026-11-27): 탭 순서 퇴사↔전체 맞바꿈(전체가 맨 끝) · 선택 탭 flex-grow 확장 애니메이션
   ========================================================= */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var S = {
    auth: null,
    rows: [],
    vendors: [],
    irisMiss: [],
    sel: {},
    q: '',
    tab: 'active',
    fStatus: {},
    fGender: {},
    fVendor: {},
    sort: { key: '', dir: 0 },
    dateField: '',
    dateVal: '',
    busy: false,
    detailId: null
  };
  var AUTH_KEY = 'ob_admin_auth_v1';
  var DOC_LABEL = {};
  DOC_TYPES.forEach(function (d) { DOC_LABEL[d.key] = d.label; });

  function toast(msg, ms) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, ms || 2600);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtPhone(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.length === 11) { return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7); }
    if (d.length === 10) { return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6); }
    return v || '';
  }
  function maskRRN(v) {
    var s = String(v || '');
    if (s.length < 8) { return s; }
    return s.slice(0, 8) + '******';
  }
  function dstr(iso) {
    if (!iso) { return ''; }
    var d = new Date(iso);
    if (isNaN(d)) { return iso; }
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function dnum(iso) {
    if (!iso) { return ''; }
    var d = new Date(iso);
    return isNaN(d) ? '' : d;
  }
  function isNum(v) { return v != null && String(v).trim() !== '' && !isNaN(Number(String(v).replace(/,/g, ''))); }
  function vendorOf(r) {
    var v = String(r.outsource_company || '').trim();
    if (v) { return v; }
    return r.is_outsource ? '외주' : '';
  }
  function isResigned(r) {
    return !!String(r.resign_date || '').trim() || r.status === 'resigned' || !!String(r.resigned_at || '').trim();
  }
  // 입사예정 / 근무중 / 입사보류 / 퇴사 — DB status 대신 퇴사일자까지 함께 본다 (v8)
  function stateOf(r) {
    if (isResigned(r)) { return 'resigned'; }
    if (r.status === 'hold') { return 'hold'; }
    return r.status === 'hired' ? 'working' : 'plan';
  }
  var STATE_LABEL = { plan: '입사예정', working: '근무중', hold: '입사보류', resigned: '퇴사' };
  var STATE_ORDER = ['plan', 'working', 'hold', 'resigned'];
  function stateText(r) { return STATE_LABEL[stateOf(r)] || ''; }
  function notesOf(r) { return Array.isArray(r.admin_notes) ? r.admin_notes : []; }
  function notesText(r) {
    return notesOf(r).map(function (n) {
      return (n && n.by ? n.by + ': ' : '') + String((n && n.text) || '');
    }).filter(Boolean).join('\n');
  }
  function noteTime(iso) {
    if (!iso) { return ''; }
    var d = new Date(iso);
    if (isNaN(d)) { return ''; }
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function todayISO() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function statusText(r) {
    if (isArchived(r)) { return '취합완료'; }
    if (isResigned(r)) { return '퇴사'; }
    if (r.status === 'hold') { return '입사보류'; }
    return r.status === 'hired' ? '입사확정' : '제출';
  }
  function wageText(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) { return ''; }
    return isNum(s) ? Number(String(s).replace(/,/g, '')).toLocaleString('ko-KR') + '원' : s;
  }
  function genderDig(r) {
    var dg = String(r.rrn || '').replace(/\D/g, '');
    return dg.length >= 7 ? dg.charAt(6) : '';
  }
  function genderOf(r) {
    if (r.gender === '여' || r.gender === '남') { return r.gender; }
    var g = genderDig(r);
    if ('13579'.indexOf(g) >= 0 && g) { return '남'; }
    if ('24680'.indexOf(g) >= 0 && g) { return '여'; }
    return '';
  }
  function birthText(r) {
    var b6 = String(r.birth6 || '').replace(/\D/g, '');
    if (b6.length < 6) {
      var dg = String(r.rrn || '').replace(/\D/g, '');
      if (dg.length >= 6) { b6 = dg.slice(0, 6); }
    }
    if (b6.length < 6) { return ''; }
    var g = genderDig(r);
    var yy = Number(b6.slice(0, 2));
    var nowYY = new Date().getFullYear() % 100;
    var century = '19';
    if (g === '3' || g === '4' || g === '7' || g === '8') { century = '20'; }
    else if (g === '9' || g === '0') { century = '18'; }
    else if (!g) { century = (yy <= nowYY) ? '20' : '19'; }
    return century + b6.slice(0, 2) + '-' + b6.slice(2, 4) + '-' + b6.slice(4, 6);
  }
  function wageNum(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) { return ''; }
    return isNum(s) ? Number(String(s).replace(/,/g, '')).toLocaleString('ko-KR') : s;
  }
  // 단가 원문(숫자만) — 인라인 수정칸 초기값
  function wageRaw(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) { return ''; }
    return isNum(s) ? String(Number(String(s).replace(/,/g, '').replace(/[^\d.-]/g, ''))) : s;
  }
  // '150000' → '150,000원' / '18' → '18만원' (만원 단위로 적은 값) / 비면 '미기재'
  function wonText(v, empty) {
    var s = String(v == null ? '' : v).trim();
    if (!s) { return empty || '미기재'; }
    var n = Number(String(s).replace(/[,\s]/g, ''));
    if (!isFinite(n)) { return s; }
    if (n > 0 && n < 1000) { return n.toLocaleString('ko-KR') + '만원'; }
    return n.toLocaleString('ko-KR') + '원';
  }
  function wageAtText(iso) {
    if (!iso) { return ''; }
    var d = new Date(iso);
    if (isNaN(d)) { return String(iso); }
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function wageHistoryOf(r) {
    return Array.isArray(r && r.wage_history) ? r.wage_history : [];
  }
  // 2026-12-07 → 261207
  function ymd6(v) {
    var s = String(v || '').replace(/\D/g, '');
    if (s.length === 8) { return s.slice(2); }
    return s.length === 6 ? s : '';
  }
  // 2026-12-07 → 26.12.07
  function dotDate(v) {
    var s = ymd6(v);
    return s ? s.slice(0, 2) + '.' + s.slice(2, 4) + '.' + s.slice(4, 6) : '';
  }
  // 2026-12-07 → 12.07
  function mdDot(v) {
    var s = ymd6(v);
    return s ? s.slice(2, 4) + '.' + s.slice(4, 6) : '';
  }

  /* 직종 — 미정 / 보통인부 · 배관공 · 용접공 · 품질관리자 / 직접입력 (v7) */
  var JOB_LIST = ['보통인부', '배관공', '용접공', '품질관리자'];
  function jobSplit(cur) {
    var c = String(cur == null ? '' : cur).trim();
    if (!c) { return { sel: '', custom: '' }; }
    if (JOB_LIST.indexOf(c) >= 0) { return { sel: c, custom: '' }; }
    return { sel: '__custom', custom: c };
  }
  function jobOptions(cur) {
    var j = jobSplit(cur);
    var h = '<option value=""' + (j.sel === '' ? ' selected' : '') + '>미정</option>';
    h += JOB_LIST.map(function (v) {
      return '<option value="' + v + '"' + (j.sel === v ? ' selected' : '') + '>' + v + '</option>';
    }).join('');
    h += '<option value="__custom"' + (j.sel === '__custom' ? ' selected' : '') + '>직접입력</option>';
    return h;
  }
  function jobText(r) {
    var c = String((r && r.job_role) || '').trim();
    return c;
  }

  /* P5 PH1 자격 (v10) — 상세에서 켜고 끄면 보유 자격(certs)에 저장되고,
     [📋 P5 PH1 명단] 엑셀 2번째 시트(자격자 명단)로 나간다. */
  var P5_QUALS = [
    { key: 'tbm', label: 'TBM 리더', icon: '🎯', cert: 'TBM 리더' },
    { key: 'drive', label: 'TL 운전원', icon: '🚚', cert: 'TL 운전원' },
    { key: 'guide', label: 'TL 유도원', icon: '🚩', cert: 'TL 유도원' }
  ];
  function qualList(r) {
    var certs = Array.isArray(r && r.certs) ? r.certs.map(function (c) { return String(c || ''); }) : [];
    var out = [];
    var add = function (k) { if (out.indexOf(k) < 0) { out.push(k); } };
    certs.forEach(function (c) {
      var s = c.replace(/\s+/g, '');
      if (!s) { return; }
      if (/TBM/i.test(s)) { add('tbm'); }
      else if (/유도|신호수/.test(s)) { add('guide'); }
      else if (/TL|운전|굴절/i.test(s)) { add('drive'); }
    });
    return { keys: out, certs: certs };
  }
  function qualOf(r) { return qualList(r).keys; }
  function certIsQual(c, key) {
    var s = String(c || '').replace(/\s+/g, '');
    if (!s) { return false; }
    if (key === 'tbm') { return /TBM/i.test(s); }
    if (key === 'guide') { return /유도|신호수/.test(s) && !/TBM/i.test(s); }
    return /TL|운전|굴절/i.test(s) && !/유도|신호수/.test(s) && !/TBM/i.test(s);
  }

  function filesOf(row) {
    var arr = Array.isArray(row.files_json) ? row.files_json : [];
    var map = {};
    arr.forEach(function (f) {
      if (!f || !f.type) { return; }
      (map[f.type] = map[f.type] || []).push(f);
    });
    return map;
  }
  function firstOf(map, key) {
    return (map[key] && map[key][0]) || null;
  }
  function missingOf(row) {
    var map = filesOf(row);
    return DOC_TYPES.filter(function (d) { return d.required && !firstOf(map, d.key); }).map(function (d) { return d.label; });
  }
  function saveFile(blob, name) {
    var a = document.createElement('a');
    var u = URL.createObjectURL(blob);
    a.href = u; a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 1500);
  }
  function todayStr() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }

  /* ---------------- 인증 ---------------- */
  async function call(action, extra) {
    var body = {
      action: action,
      name: S.auth.name,
      phone: S.auth.phone,
      passcode: S.auth.passcode
    };
    if (extra) { Object.keys(extra).forEach(function (k) { body[k] = extra[k]; }); }
    var res = await fetch(CFG.url + CFG.adminFn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CFG.anon, Authorization: 'Bearer ' + CFG.anon },
      body: JSON.stringify(body)
    });
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (res.status === 401 || res.status === 403) {
      var err = new Error((data && data.error) || '권한이 없습니다.');
      err.auth = true;
      throw err;
    }
    if (!res.ok || !data || data.ok !== true) {
      throw new Error((data && data.error) || ('요청 실패 (' + res.status + ')'));
    }
    return data;
  }

  async function login() {
    var name = $('#an').value.trim();
    var phone = fmtPhone($('#ap').value);   // 하이픈 유무와 무관하게 숫자로 비교된다
    var pass = $('#ac').value;
    var err = $('#loginErr');
    err.classList.remove('on');
    if (!name || !phone || !pass) { err.textContent = '이름·전화번호·관리자 암호를 모두 입력해 주세요.'; err.classList.add('on'); return; }
    var btn = $('#loginBtn');
    btn.disabled = true; btn.textContent = '확인하는 중…';
    S.auth = { name: name, phone: phone, passcode: pass };
    try {
      var d = await call('list');
      S.rows = d.rows || [];
      S.vendors = Array.isArray(d.vendors) ? d.vendors : [];
      S.irisMiss = Array.isArray(d.unregistered_iris) ? d.unregistered_iris : [];
      try { sessionStorage.setItem(AUTH_KEY, JSON.stringify(S.auth)); } catch (e) {}
      showAdmin();
      toast('환영합니다, ' + name + ' 님');
    } catch (e) {
      S.auth = null;
      err.textContent = e.message || '들어갈 수 없습니다.';
      err.classList.add('on');
      if (e.auth) { err.textContent = e.message + ' (지정된 관리자 이름·전화번호와 관리자 암호를 확인해 주세요.)'; }
    } finally {
      btn.disabled = false; btn.textContent = '들어가기';
    }
  }

  function showAdmin() {
    $('#loginView').classList.add('hide');
    $('#adminView').classList.remove('hide');
    $('#whoami').textContent = S.auth.name;
    render();
  }

  function logout() {
    S.auth = null; S.rows = []; S.sel = {};
    try { sessionStorage.removeItem(AUTH_KEY); } catch (e) {}
    $('#adminView').classList.add('hide');
    $('#loginView').classList.remove('hide');
    $('#ac').value = '';
  }

  async function refresh(quiet) {
    if (!S.auth) { return; }
    try {
      var d = await call('list');
      S.rows = d.rows || [];
      S.vendors = Array.isArray(d.vendors) ? d.vendors : [];
      S.irisMiss = Array.isArray(d.unregistered_iris) ? d.unregistered_iris : [];
      var keep = S.sel;
      S.sel = {};
      S.rows.forEach(function (r) { if (keep[r.id]) { S.sel[r.id] = true; } });
      render();
      if (!quiet) { toast('최신 현황으로 새로고침했습니다.'); }
    } catch (e) {
      if (e.auth) { logout(); toast('다시 로그인해 주세요.'); return; }
      toast(e.message || '불러오지 못했습니다.', 3200);
    }
  }

  /* ---------------- 렌더 ---------------- */
  function isArchived(r) { return !!r.archived_at; }

  /* 탭 분류 (v10) — 한 사람은 반드시 한 탭에만 들어간다
     · 퇴사    : status='resigned' 또는 퇴사일/퇴사처리일이 있음
     · 보류    : 입사보류(hold)
     · 확정    : 근무중(hired)
     · 취합완료: 입사예정(submitted) + 취합완료(archived_at)
     · 진행중  : 입사예정(submitted) + 취합 전
     · 전체    : 모두 */
  function tabOf(r) {
    if (isResigned(r)) { return 'resigned'; }
    if (r.status === 'hold') { return 'hold'; }
    if (r.status === 'hired') { return 'hired'; }
    return isArchived(r) ? 'archived' : 'active';
  }
  function tabRows() {
    if (S.tab === 'all') { return S.rows.slice(); }
    return S.rows.filter(function (r) { return tabOf(r) === S.tab; });
  }
  function picked(obj) { return Object.keys(obj).filter(function (k) { return obj[k]; }); }
  // 필터 그룹 사이는 AND, 그룹 안의 여러 체크는 OR (입사예정+근무중 → 둘 다)
  function matchesFilters(r) {
    var st = picked(S.fStatus);
    if (st.length && st.indexOf(stateOf(r)) < 0) { return false; }
    var gd = picked(S.fGender);
    if (gd.length && gd.indexOf(genderOf(r)) < 0) { return false; }
    var vd = picked(S.fVendor);
    if (vd.length && vd.indexOf(vendorOf(r)) < 0) { return false; }
    return true;
  }
  function filtered() {
    var rows = tabRows();
    if (S.tab === 'all') { rows = rows.filter(matchesFilters); }
    // 특정 일자만 골라 보기 (v10)
    if (S.dateField && S.dateVal) {
      rows = rows.filter(function (r) { return dateValOf(r, S.dateField) === S.dateVal; });
    }
    var q = S.q.trim().toLowerCase();
    if (q) {
      rows = rows.filter(function (r) {
        return [r.name, r.phone, r.job_role, r.bank, r.referrer, vendorOf(r), notesText(r)]
          .join(' ').toLowerCase().indexOf(q) >= 0;
      });
    }
    return applySort(rows);
  }

  /* ---------------- 날짜 정렬 (v10) — 기본 → 최신순(↓) → 오래된순(↑) ---------------- */
  var SORT_LABEL = { hire: '한양교육일자', iris: '홍채등록일자', resign: '퇴사일자' };
  function dateValOf(r, key) {
    if (key === 'hire') { return String(r.hire_date || ''); }
    if (key === 'iris') { return String(r.iris_date || ''); }
    if (key === 'resign') { return String(r.resign_date || ''); }
    return '';
  }
  function applySort(rows) {
    var s = S.sort;
    if (!s || !s.key || !s.dir) { return rows; }
    var has = [], none = [];
    rows.forEach(function (r) { (dateValOf(r, s.key) ? has : none).push(r); });
    has.sort(function (a, b) {
      var x = dateValOf(a, s.key);
      var y = dateValOf(b, s.key);
      if (x === y) { return 0; }
      return s.dir > 0 ? (x < y ? 1 : -1) : (x < y ? -1 : 1);
    });
    return has.concat(none);   // 날짜가 없는 사람은 항상 뒤로
  }
  function renderSortMarks() {
    $$('.tbl thead th[data-sort]').forEach(function (th) {
      var k = th.getAttribute('data-sort');
      var on = S.sort.key === k && S.sort.dir !== 0;
      th.classList.toggle('sorted', on);
      var ar = th.querySelector('.sar');
      if (ar) { ar.textContent = on ? (S.sort.dir > 0 ? ' ↓' : ' ↑') : ''; }
      th.title = SORT_LABEL[k] + ' 정렬 (' + (on ? (S.sort.dir > 0 ? '최신순' : '오래된순') : '누를 때마다 기본→최신순→오래된순') + ')';
    });
    var sel = $('#sortSel');
    if (sel) {
      var v = S.sort.key && S.sort.dir ? (S.sort.key + ':' + S.sort.dir) : '';
      sel.value = v;
    }
  }
  function cycleSort(key) {
    if (!key) { return; }
    if (S.sort.key !== key) { S.sort = { key: key, dir: 1 }; }
    else if (S.sort.dir === 1) { S.sort = { key: key, dir: -1 }; }
    else { S.sort = { key: '', dir: 0 }; }
    render();
  }

  // 필터 칩(상태·성별·업체) 다시 그리기 — 인원 수는 [전체] 탭 기준
  function chipHtml(attr, value, label, count, on) {
    return '<label><input type="checkbox" ' + attr + '="' + esc(value) + '"' + (on ? ' checked' : '')
      + '><span>' + esc(label) + ' <b style="opacity:.7">' + count + '</b></span></label>';
  }
  function renderFilters() {
    var panel = $('#filterPanel');
    if (!panel) { return; }
    panel.classList.toggle('hide', S.tab !== 'all');
    if (S.tab !== 'all') { return; }
    var rows = S.rows;
    var cnt = function (f) { return rows.filter(f).length; };
    $('#fStatus').innerHTML = STATE_ORDER.map(function (k) {
      return chipHtml('data-fst', k, STATE_LABEL[k], cnt(function (r) { return stateOf(r) === k; }), !!S.fStatus[k]);
    }).join('');
    $('#fGender').innerHTML = ['남', '여'].map(function (k) {
      return chipHtml('data-fgd', k, k === '남' ? '남자' : '여자', cnt(function (r) { return genderOf(r) === k; }), !!S.fGender[k]);
    }).join('');
    var vendors = S.vendors.slice();
    rows.forEach(function (r) {
      var v = vendorOf(r);
      if (v && vendors.indexOf(v) < 0) { vendors.push(v); }
    });
    $('#fVendor').innerHTML = vendors.map(function (k) {
      return chipHtml('data-fvd', k, k, cnt(function (r) { return vendorOf(r) === k; }), !!S.fVendor[k]);
    }).join('');
    var n = filtered().length;
    $('#fSum').textContent = (picked(S.fStatus).length + picked(S.fGender).length + picked(S.fVendor).length)
      ? '필터 ' + n + '명 / 전체 ' + rows.length + '명'
      : '전체 ' + rows.length + '명 · 칩을 눌러 걸러 볼 수 있습니다.';
  }

  /* ⚠️ 홍채등록일 지남 · 앱(한양 pcw팀) 미가입 (v10) */
  var IRIS_OPEN = false;
  function renderIris() {
    var panel = $('#irisPanel');
    if (!panel) { return; }
    var list = Array.isArray(S.irisMiss) ? S.irisMiss : [];
    panel.classList.toggle('hide', list.length === 0);
    if (!list.length) {
      IRIS_OPEN = false;
      $('#irisCount').textContent = '0';
      if ($('#irisList')) { $('#irisList').classList.add('hide'); $('#irisList').innerHTML = ''; }
      return;
    }
    $('#irisCount').textContent = list.length;
    var today = todayISO();
    var t0 = new Date(today + 'T00:00:00').getTime();
    $('#irisList').innerHTML = list.map(function (x) {
      var d0 = new Date(String(x.iris_date) + 'T00:00:00').getTime();
      var late = isNaN(d0) ? 0 : Math.round((t0 - d0) / 86400000);
      var st = x.status === 'hired' ? 'working' : 'plan';
      return '<button type="button" class="iriitem" data-iri-detail="' + esc(x.id) + '">'
        + '<b>' + esc(x.name) + '</b>'
        + '<span class="tag st ' + st + '">' + esc(STATE_LABEL[st]) + '</span>'
        + (x.outsource_company ? '<span class="tag vendor">' + esc(x.outsource_company) + '</span>' : '')
        + '<span class="irl">홍채 ' + esc(x.iris_date) + (late > 0 ? ' · <b>' + late + '일 지남</b>' : ' · 오늘') + '</span>'
        + '<span class="go">상세 ›</span>'
        + '</button>';
    }).join('');
    $('#irisList').classList.toggle('hide', !IRIS_OPEN);
    $('#irisArrow').textContent = IRIS_OPEN ? '▴' : '▾';
  }

  function render() {
    var rows = filtered();
    var list = $('#list');
    var tab = tabRows();

    // 탭 인원 수 (v12: 진행중 · 취합완료 · 보류 · 확정 · 퇴사 · 전체)
    var cnt = { active: 0, archived: 0, hold: 0, hired: 0, resigned: 0 };
    S.rows.forEach(function (r) {
      var k = tabOf(r);
      cnt[k] = (cnt[k] || 0) + 1;
    });
    $('#cntActive').textContent = cnt.active;
    $('#cntArchived').textContent = cnt.archived;
    $('#cntHold').textContent = cnt.hold;
    $('#cntHired').textContent = cnt.hired;
    $('#cntResigned').textContent = cnt.resigned;
    $('#cntAll').textContent = S.rows.length;
    $('#statAll').textContent = tab.length;
    $('#statMiss').textContent = tab.filter(function (r) { return missingOf(r).length > 0; }).length;
    var t = new Date(); t.setHours(0, 0, 0, 0);
    $('#statToday').textContent = tab.filter(function (r) { return new Date(r.created_at) >= t; }).length;

    $('#empty').textContent = S.tab === 'archived' ? '취합완료된 인원이 없습니다.'
      : (S.tab === 'hold' ? '입사보류 인원이 없습니다.'
        : (S.tab === 'hired' ? '확정(근무중) 인원이 없습니다.'
          : (S.tab === 'resigned' ? '퇴사자가 없습니다.'
            : (S.tab === 'all' ? '등록된 인원이 없습니다.' : '입사예정인 인원이 없습니다.'))));
    // 퇴사 탭에서만 표의 특이사항 열을 보여 준다 (v10)
    var tbl = $('.tbl');
    if (tbl) { tbl.classList.toggle('show-notes', S.tab === 'resigned'); }
    renderFilters();
    renderIris();
    renderSortMarks();
    var dfb = $('#dfilter');
    if (dfb) {
      var act = !!(S.dateField && S.dateVal);
      dfb.classList.toggle('on', act);
      var dl = dfb.querySelector('.dl');
      if (dl) { dl.textContent = act ? (SORT_LABEL[S.dateField] + ' ' + S.dateVal + ' · ' + rows.length + '명') : '날짜 검색'; }
    }

    if (!rows.length) {
      list.innerHTML = '';
      $('#empty').classList.remove('hide');
      if ((S.tab === 'all' && picked(S.fStatus).length + picked(S.fGender).length + picked(S.fVendor).length)
        || (S.dateField && S.dateVal)) {
        $('#empty').textContent = '조건에 맞는 인원이 없습니다.';
      }
      $('#chkAll').checked = false;
      syncBulk();
      return;
    }
    $('#empty').classList.add('hide');

    list.innerHTML = rows.map(function (r) {
      var miss = missingOf(r);
      var tags = '';
      var st = stateOf(r);
      // 상태 배지 = 클릭하면 5가지(근무중·입사예정·입사보류·입사취소·퇴사) 드롭다운 (v10)
      tags += '<button type="button" class="tag st ' + st + ' stbtn" data-st-edit="' + r.id + '" title="상태 바꾸기">'
        + esc(STATE_LABEL[st]) + ' ▾</button>';
      if (miss.length) { tags += '<span class="tag miss" title="미제출: ' + esc(miss.join(', ')) + '">미비 ' + miss.length + '</span>'; }
      var vn = vendorOf(r);
      var out = '<button type="button" class="tag vendor vbtn' + (vn === '외주' ? ' out' : '') + (vn ? '' : ' none')
        + '" data-vendor-edit="' + r.id + '" title="업체 바로 바꾸기">' + esc(vn || '업체') + ' ▾</button>';
      return '<tr data-id="' + r.id + '"' + (S.sel[r.id] ? ' class="sel"' : '') + '>'
        + '<td class="c-chk"><input type="checkbox" data-check="' + r.id + '" ' + (S.sel[r.id] ? 'checked' : '') + '></td>'
        + '<td class="c-name">' + out + '<b>' + esc(r.name) + '</b>' + tags + '</td>'
        + '<td>' + esc(birthText(r)) + '</td>'
        + '<td>' + esc(fmtPhone(r.phone)) + '</td>'
        + '<td class="c-date"><button type="button" class="dbtn' + (r.hire_date ? '' : ' none')
        + '" data-hire-edit="' + r.id + '" title="한양교육일자 바로 고치기">' + esc(r.hire_date || '—') + '</button></td>'
        + '<td class="c-date"><button type="button" class="dbtn iris' + (r.iris_date ? '' : ' none')
        + '" data-iris-edit="' + r.id + '" title="홍채등록일자 바로 고치기">' + esc(r.iris_date || '—') + '</button></td>'
        + '<td>' + esc(r.resign_date || '') + '</td>'
        + '<td class="num c-wage"><button type="button" class="wbtn' + (r.daily_wage ? '' : ' none')
        + '" data-wage-edit="' + r.id + '" title="단가 바로 고치기">' + esc(wageNum(r.daily_wage) || '—') + '</button></td>'
        + '<td class="c-gender">' + esc(genderOf(r)) + '</td>'
        + '<td class="c-note">' + (notesOf(r).length
          ? '<span class="nsum" title="' + esc(notesText(r)) + '">' + esc(notesText(r).split('\n')[0]) + '</span>'
          : '<span style="color:#98A2B3">—</span>') + '</td>'
        + '<td class="c-act">'
        + '<button type="button" data-detail="' + r.id + '">상세</button>'
        + '<button type="button" class="del" data-del="' + r.id + '">삭제</button>'
        + '</td>'
        + '</tr>';
    }).join('');

    $('#chkAll').checked = rows.length > 0 && rows.every(function (r) { return S.sel[r.id]; });
    syncBulk();
  }

  function rowById(id) {
    for (var i = 0; i < S.rows.length; i++) { if (S.rows[i].id === id) { return S.rows[i]; } }
    return null;
  }

  function targets() {
    var rows = filtered();
    var ids = Object.keys(S.sel).filter(function (k) { return S.sel[k]; });
    if (!ids.length) { return rows; }
    return rows.filter(function (r) { return S.sel[r.id]; });
  }

  /* ---------------- 선택한 인원 처리 (드롭다운, v9) ---------------- */
  function selRows() {
    return S.rows.filter(function (r) { return !!S.sel[r.id]; });
  }
  function syncBulk() {
    var sel = $('#bulkSel');
    if (!sel) { return; }
    var n = selRows().length;
    sel.disabled = n === 0;
    sel.classList.toggle('armed', n > 0);
    if (sel.options[0]) {
      sel.options[0].textContent = n ? '선택한 인원 처리 ▾ (' + n + '명)' : '선택한 인원 처리 ▾';
    }
    var nt = $('#listNotice');
    if (nt) {
      nt.innerHTML = n
        ? '선택한 <b>' + n + '명</b>에게 할 일을 오른쪽 드롭다운에서 고르세요.'
        : '인원을 체크하면 오른쪽 <b>[선택한 인원 처리]</b>가 열립니다. (엑셀·ZIP은 체크가 없으면 이 탭 전체)';
    }
  }

  async function bulkHold(rows) {
    if (!rows.length) { return; }
    var names = rows.map(function (r) { return r.name; }).join(', ');
    if (!confirm('선택한 인원을 입사보류로 옮길까요?\n\n대상(' + rows.length + '명): ' + names
      + '\n\n· [보류] 탭으로 이동합니다. 서류는 그대로 보관됩니다.')) { return; }
    try {
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r.status !== 'hold') {
          await call('set_status', { id: r.id, status: 'hold' });
          r.status = 'hold';
        }
        if (String(r.resign_date || '').trim()) {
          await call('update_meta', { id: r.id, meta: { resign_date: '' } });
          r.resign_date = '';
        }
      }
      S.sel = {};
      await refresh(true);
      toast(rows.length + '명을 입사보류로 옮겼습니다. [보류] 탭에서 볼 수 있습니다.', 3200);
    } catch (e) {
      toast(e.message || '입사보류로 옮기지 못했습니다.', 3200);
    }
  }

  async function bulkPlan(rows) {
    if (!rows.length) { return; }
    var names = rows.map(function (r) { return r.name; }).join(', ');
    if (!confirm('선택한 인원을 입사예정(진행중)으로 되돌릴까요?\n\n대상(' + rows.length + '명): ' + names
      + '\n\n· 입사보류를 풀고 [진행중] 탭으로 옮깁니다.')) { return; }
    try {
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r.status !== 'submitted') {
          await call('set_status', { id: r.id, status: 'submitted' });
          r.status = 'submitted';
        }
        if (String(r.resign_date || '').trim()) {
          await call('update_meta', { id: r.id, meta: { resign_date: '' } });
          r.resign_date = '';
        }
      }
      var archIds = rows.filter(isArchived).map(function (r) { return r.id; });
      if (archIds.length) {
        await call('unarchive', { ids: archIds });
        archIds.forEach(function (id) { var x = rowById(id); if (x) { x.archived_at = null; } });
      }
      S.sel = {};
      await refresh(true);
      toast(rows.length + '명을 입사예정(진행중)으로 되돌렸습니다.', 3200);
    } catch (e) {
      toast(e.message || '입사예정으로 되돌리지 못했습니다.', 3200);
    }
  }

  function runBulk(act) {
    var rows = selRows();
    if (!rows.length) { toast('처리할 인원을 먼저 체크해 주세요.', 2600); syncBulk(); return; }
    if (act === 'hired') { bulkHired(rows); return; }
    if (act === 'archive') { setArchived(rows, true); return; }
    if (act === 'hold') { bulkHold(rows); return; }
    if (act === 'plan') { bulkPlan(rows); return; }
    if (act === 'resigned') { bulkResign(rows); return; }
    if (act === 'delete') { deleteRows(rows); return; }
  }

  /* ✅ 확정(근무중) — 고른 인원을 한 번에 근무중으로 (v10) */
  async function bulkHired(rows) {
    var names = rows.map(function (r) { return r.name; }).join(', ');
    if (!confirm('선택한 인원을 확정(근무중)으로 바꿈까요?\n\n대상(' + rows.length + '명): ' + names
      + '\n\n· [확정] 탭으로 이동합니다.')) { return; }
    try {
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        await call('set_status', { id: r.id, status: 'hired' });
        r.status = 'hired';
        if (String(r.resign_date || '').trim()) {
          await call('update_meta', { id: r.id, meta: { resign_date: '' } });
          r.resign_date = '';
        }
      }
      S.sel = {};
      await refresh(true);
      toast(rows.length + '명을 확정(근무중)으로 바꿈었습니다.', 3200);
    } catch (e) {
      toast(e.message || '확정으로 바꾸지 못했습니다.', 3200);
    }
  }

  /* 🚪 퇴사 처리 — 퇴사일이 비어 있으면 오늘(KST) (v10) */
  async function bulkResign(rows) {
    var names = rows.map(function (r) { return r.name; }).join(', ');
    if (!confirm('선택한 인원을 퇴사 처리할까요?\n\n대상(' + rows.length + '명): ' + names
      + '\n\n· 퇴사일이 비어 있으면 오늘로 저장하고 [퇴사] 탭으로 이동합니다.')) { return; }
    try {
      for (var i = 0; i < rows.length; i++) {
        var d = await call('set_status', { id: rows[i].id, status: 'resigned' });
        var p = (d && d.patch) || {};
        rows[i].status = 'resigned';
        if ('resign_date' in p) { rows[i].resign_date = p.resign_date || ''; }
        if ('resigned_at' in p) { rows[i].resigned_at = p.resigned_at || ''; }
      }
      S.sel = {};
      await refresh(true);
      toast(rows.length + '명을 퇴사 처리했습니다.', 3200);
    } catch (e) {
      toast(e.message || '퇴사 처리하지 못했습니다.', 3200);
    }
  }

  /* ---------------- 목록에서 바로 고치기 (v9) — 업체 · 입사일자 ---------------- */
  function vendorListFor(cur) {
    var list = S.vendors.slice();
    if (cur && list.indexOf(cur) < 0) { list.push(cur); }
    if (list.indexOf('외주') < 0) { list.push('외주'); }
    return list;
  }
  function openVendorEditor(id) {
    var r = rowById(id);
    if (!r) { return; }
    var cell = $('[data-vendor-edit="' + id + '"]');
    if (!cell || cell.tagName === 'SELECT') { return; }
    var cur = vendorOf(r);
    var list = vendorListFor(cur);
    var h = '<select class="vsel" data-vendor-sel="' + id + '" title="업체 선택">'
      + '<option value="">미지정</option>'
      + list.map(function (v) {
        return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>';
      }).join('')
      + '</select>';
    cell.outerHTML = h;
    var sel = $('[data-vendor-sel="' + id + '"]');
    if (sel) { sel.value = cur; sel.focus(); }
  }
  async function saveVendor(id, val) {
    var r = rowById(id);
    if (!r) { return; }
    var v = String(val || '').trim().slice(0, 60);
    if (v === vendorOf(r)) { render(); return; }
    try {
      await call('update_meta', { id: id, meta: { outsource_company: v } });
      r.outsource_company = v;
      r.is_outsource = !!v;
      if (v && S.vendors.indexOf(v) < 0) { S.vendors.push(v); }
      render();
      if ($('#detailModal').classList.contains('open') && S.detailId === id) { openDetail(id); }
      toast(v ? r.name + ' 님 업체를 ' + v + '(으)로 저장했습니다.' : r.name + ' 님 업체를 미지정으로 저장했습니다.', 3000);
    } catch (e) {
      render();
      toast(e.message || '업체를 저장하지 못했습니다.', 3200);
    }
  }
  function openHireEditor(id) {
    var r = rowById(id);
    if (!r) { return; }
    var cell = $('[data-hire-edit="' + id + '"]');
    if (!cell || cell.tagName === 'INPUT') { return; }
    cell.outerHTML = '<span class="dinline"><input type="date" class="dsel" data-hire-sel="' + id
      + '" value="' + esc(r.hire_date || '') + '" title="입사일자 선택">'
      + '<button type="button" class="dclear" data-hire-clear="' + id + '" title="입사일자 지우기">✕</button></span>';
    var inp = $('[data-hire-sel="' + id + '"]');
    if (inp) {
      inp.focus();
      try { inp.showPicker(); } catch (e) { /* 일부 브라우저는 showPicker 를 막아 둔다 */ }
    }
  }
  async function saveHire(id, val) {
    var r = rowById(id);
    if (!r) { return; }
    var v = String(val || '').trim();
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { toast('날짜를 다시 골라 주세요.'); return; }
    if (v === String(r.hire_date || '')) { render(); return; }
    try {
      await call('update_meta', { id: id, meta: { hire_date: v } });
      r.hire_date = v;
      render();
      if ($('#detailModal').classList.contains('open') && S.detailId === id) { openDetail(id); }
      toast(v ? r.name + ' 님 한양교육일자를 ' + v + '로 저장했습니다.' : r.name + ' 님 한양교육일자를 지웠습니다.', 3000);
    } catch (e) {
      render();
      toast(e.message || '한양교육일자를 저장하지 못했습니다.', 3200);
    }
  }

  /* 목록에서 홍채등록일자 바로 고치기 (v10) */
  function openIrisEditor(id) {
    var r = rowById(id);
    if (!r) { return; }
    var cell = $('[data-iris-edit="' + id + '"]');
    if (!cell || cell.tagName === 'INPUT') { return; }
    cell.outerHTML = '<span class="dinline"><input type="date" class="dsel" data-iris-sel="' + id
      + '" value="' + esc(r.iris_date || '') + '" title="홍채등록일자 선택">'
      + '<button type="button" class="dclear" data-iris-clear="' + id + '" title="홍채등록일자 지우기">✕</button></span>';
    var inp = $('[data-iris-sel="' + id + '"]');
    if (inp) {
      inp.focus();
      try { inp.showPicker(); } catch (e) { /* 일부 브라우저는 showPicker 를 막아 둔다 */ }
    }
  }
  async function saveIris(id, val) {
    var r = rowById(id);
    if (!r) { return; }
    var v = String(val || '').trim();
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { toast('날짜를 다시 골라 주세요.'); return; }
    if (v === String(r.iris_date || '')) { render(); return; }
    try {
      await call('update_meta', { id: id, meta: { iris_date: v } });
      r.iris_date = v;
      await refresh(true);
      if ($('#detailModal').classList.contains('open') && S.detailId === id) { openDetail(id); }
      toast(v ? r.name + ' 님 홍채등록일자를 ' + v + '로 저장했습니다.' : r.name + ' 님 홍채등록일자를 지웠습니다.', 3000);
    } catch (e) {
      render();
      toast(e.message || '홍채등록일자를 저장하지 못했습니다.', 3200);
    }
  }

  /* ---------------------------------------------------------
     목록에서 상태 배지 클릭 → 근무중 / 입사예정 / 입사보류 / 입사취소 / 퇴사 (v10)
     --------------------------------------------------------- */
  var ST_STATES = ['working', 'plan', 'hold', 'cancel', 'resigned'];
  var ST_TEXT = { working: '근무중', plan: '입사예정', hold: '입사보류', cancel: '입사취소', resigned: '퇴사' };

  function openStateEditor(id) {
    var r = rowById(id);
    if (!r) { return; }
    var cell = $('[data-st-edit="' + id + '"]');
    if (!cell || cell.tagName === 'SELECT') { return; }
    var cur = stateOf(r);
    var h = '<select class="stsel2 st-' + cur + '" data-st-sel="' + id + '" title="상태 바꾸기">'
      + ST_STATES.map(function (k) {
        return '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + ST_TEXT[k] + '</option>';
      }).join('')
      + '</select>';
    cell.outerHTML = h;
    var sel = $('[data-st-sel="' + id + '"]');
    if (sel) { sel.value = cur; sel.focus(); }
  }

  async function applyState(id, target) {
    var r = rowById(id);
    if (!r) { return; }
    var cur = stateOf(r);
    if (!target || target === cur) { render(); return; }

    if (target === 'cancel') {
      if (!confirm('정말 입사취소(삭제)하시겠습니까?')) { render(); return; }
      await deleteRows([r], '정말 입사취소(삭제)하시겠습니까?');
      return;
    }

    try {
      if (target === 'resigned') {
        var d = await call('set_status', { id: id, status: 'resigned' });
        r.status = 'resigned';
        var p = (d && d.patch) || {};
        if ('resign_date' in p) { r.resign_date = p.resign_date || ''; }
        if ('resigned_at' in p) { r.resigned_at = p.resigned_at || ''; }
      } else {
        var st = target === 'working' ? 'hired' : (target === 'hold' ? 'hold' : 'submitted');
        await call('set_status', { id: id, status: st });
        r.status = st;
        r.resigned_at = '';
        // 퇴사일자가 남아 있으면 계속 퇴사로 보이므로 같이 지운다
        if (String(r.resign_date || '').trim()) {
          await call('update_meta', { id: id, meta: { resign_date: '' } });
          r.resign_date = '';
        }
      }
      await refresh(true);
      if ($('#detailModal').classList.contains('open') && S.detailId === id) { openDetail(id); }
      toast(r.name + ' 님 상태를 ' + ST_TEXT[target] + '(으)로 바꿨습니다.', 3000);
    } catch (e) {
      render();
      toast(e.message || '상태를 바꾸지 못했습니다.', 3200);
    }
  }

  /* 목록에서 단가 클릭 → 인라인 수정 + 확인창 → update_meta (서버가 이력 기록) (v10) */
  function openWageEditor(id) {
    var r = rowById(id);
    if (!r) { return; }
    var cell = $('[data-wage-edit="' + id + '"]');
    if (!cell || cell.tagName === 'INPUT') { return; }
    cell.outerHTML = '<span class="winline">'
      + '<input type="text" inputmode="numeric" class="wsel" data-wage-sel="' + id + '" value="' + esc(wageRaw(r.daily_wage))
      + '" title="단가 수정 (엔터로 저장)">'
      + '<button type="button" class="wok" data-wage-save="' + id + '" title="저장">✓</button>'
      + '<button type="button" class="wxx" data-wage-cancel="' + id + '" title="취소">✕</button></span>';
    var inp = $('[data-wage-sel="' + id + '"]');
    if (inp) { inp.focus(); inp.select(); }
  }
  async function saveWage(id, val) {
    var r = rowById(id);
    if (!r) { return; }
    var v = String(val == null ? '' : val).replace(/[,\s원]/g, '').trim();
    if (v && !/^\d+$/.test(v)) { toast('단가는 숫자로 적어 주세요. (예: 200000)', 3200); render(); return; }
    var prev = String(r.daily_wage == null ? '' : r.daily_wage).replace(/[,\s원]/g, '').trim();
    if (v === prev) { render(); return; }
    var ask = '정말로 수정하시겠습니까?\n이전 단가: ' + wonText(prev) + ' → 변경 후 단가: ' + wonText(v);
    if (!confirm(ask)) { render(); return; }
    try {
      var d = await call('update_meta', { id: id, meta: { daily_wage: v } });
      r.daily_wage = v;
      if (d && Array.isArray(d.wage_history)) { r.wage_history = d.wage_history; }
      render();
      if ($('#detailModal').classList.contains('open') && S.detailId === id) { openDetail(id); }
      toast(r.name + ' 님 단가를 ' + wonText(v) + '로 바꿨습니다.', 3000);
    } catch (e) {
      render();
      toast(e.message || '단가를 저장하지 못했습니다.', 3200);
    }
  }

  /* 상세 — 파일 이름 · 검진일/종류 수정 */
  var EDIT = { key: '' };
  var UP = { id: null, items: [] };   // 상세 시트에서 올릴 서류(대기 목록)

  function examText(row, map) {
    var arr = map.health || [];
    if (!arr.length) { return (row.health_exam_date || '') + (row.health_exam_type ? ' ' + row.health_exam_type : ''); }
    var txt = arr.map(function (f) {
      var d = f.exam_date || '';
      var t = f.exam_type || '';
      return d || t ? (d + ' ' + t).trim() : '';
    }).filter(Boolean).join(' / ');
    var d2 = arr.some(function (f) { return !!f.d2; });
    return txt + (d2 ? ' (D2)' : '');
  }

  function editForm(r, idx, f) {
    var isH = f.type === 'health';
    var types = ['', '일반', '배치전', '특수'];
    var h = '<div class="feditform" data-fidx="' + idx + '">'
      + '<label>파일 이름</label>'
      + '<input type="text" data-fname value="' + esc(f.name || '') + '">';
    if (isH) {
      h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px">'
        + '<div><label>검진일자</label><input type="date" data-fdate value="' + esc(f.exam_date || '') + '"></div>'
        + '<div><label>검진 종류</label><select data-ftype>' + types.map(function (t) {
          return '<option value="' + t + '"' + ((f.exam_type || '') === t ? ' selected' : '') + '>' + (t || '선택') + '</option>';
        }).join('') + '</select></div>'
        + '</div>';
    }
    h += '<div style="display:flex;gap:6px;margin-top:8px">'
      + '<button type="button" class="btn sm" data-fsave style="width:auto;padding:0 14px;height:38px">저장</button>'
      + '<button type="button" class="btn sm gray" data-fcancel style="width:auto;padding:0 14px;height:38px">취소</button>'
      + '</div></div>';
    return h;
  }

  async function saveFileEdit(id, idx) {
    var r = rowById(id);
    if (!r) { return; }
    var form = $('.feditform[data-fidx="' + idx + '"]');
    if (!form) { return; }
    var all = (Array.isArray(r.files_json) ? r.files_json : []).slice();
    var f = all[idx];
    if (!f) { return; }
    var nameEl = form.querySelector('[data-fname]');
    var nm = nameEl ? String(nameEl.value || '').replace(/\s+/g, ' ').trim() : '';
    if (!nm) { toast('파일 이름을 적어 주세요.'); return; }
    var next = {
      type: f.type, path: f.path, name: nm, size: f.size, mime: f.mime
    };
    if (f.type === 'health') {
      next.d2 = !!f.d2;
      var dEl = form.querySelector('[data-fdate]');
      var tEl = form.querySelector('[data-ftype]');
      next.exam_date = dEl ? dEl.value : (f.exam_date || '');
      next.exam_type = tEl ? tEl.value : (f.exam_type || '');
      if (!next.exam_date || !next.exam_type) { toast('검진일자와 종류를 모두 골라 주세요.'); return; }
    }
    all[idx] = next;
    try {
      await call('update_files', { id: id, files: all });
      r.files_json = all;
      var h0 = all.filter(function (x) { return x.type === 'health'; })[0];
      r.health_exam_date = (h0 && h0.exam_date) || '';
      r.health_exam_type = (h0 && h0.exam_type) || '';
      EDIT.key = '';
      render();
      openDetail(id);
      toast('파일 정보를 수정했습니다.');
    } catch (e) {
      toast(e.message || '수정하지 못했습니다.', 3200);
    }
  }

  /* ---------------- 상세 ---------------- */
  async function openDetail(id) {
    var r = rowById(id);
    if (!r) { return; }
    var map = filesOf(r);
    var allFiles = Array.isArray(r.files_json) ? r.files_json : [];
    var kv = [
      ['성명', r.name],
      ['업체구분', vendorOf(r)],
      ['주민등록번호', r.rrn],
      ['주소', r.address],
      ['휴대폰', fmtPhone(r.phone) + (r.phone_os ? ' (' + r.phone_os + ')' : '')],
      ['본인 명의', r.phone_self_owned],
      ['숙소', r.housing],
      ['은행 / 계좌', (r.bank || '') + ' ' + (r.account_number || '')],
      ['입금자명(예금주)', r.account_holder],
      ['직종', jobText(r)],
      ['단가', wageText(r.daily_wage)],
      ['총 경력', r.total_career],
      ['반도체 경력', r.semi_career],
      ['이메일', r.email],
      ['혈액형', r.blood_type],
      ['조끼 / 안전화', (r.vest_size || '') + ' / ' + (r.shoe_size || '')],
      ['보안경', r.glasses_type],
      ['보유 자격', (Array.isArray(r.certs) ? r.certs.join(', ') : '')],
      ['소개자', r.referrer],
      ['한양교육일자', r.hire_date],
      ['홍채등록일자', r.iris_date],
      ['퇴사일자', r.resign_date],
      ['근로자번호', r.worker_no],
      ['리더팀장', r.leader_name],
      ['성별', genderOf(r)],
      ['건강검진', examText(r, map)],
      ['제출일', dstr(r.created_at)],
      ['취합완료', r.archived_at ? dstr(r.archived_at) : ''],
      ['상태', statusText(r)],
      ['동의', '개인정보 ' + dstr(r.agreed_privacy_at) + ' · 고유식별 ' + dstr(r.agreed_unique_id_at) + ' · 민감정보 ' + dstr(r.agreed_sensitive_at)]
    ];
    var h = '<dl class="kv">';
    kv.forEach(function (p) {
      if (p[0] === '숙소' && !p[1]) { return; }
      h += '<dt>' + esc(p[0]) + '</dt><dd>' + (p[1] ? esc(p[1]) : '<span style="color:#98A2B3">—</span>') + '</dd>';
    });
    h += '</dl>';

    /* 상태 — 한 번 누르면 바로 바뀐다. ⏸️ 입사보류를 다시 누르면 해제(v8) */
    var curSt = stateOf(r);
    h += '<div class="stsel">'
      + '<div class="sh"><b>상태</b><span>' + esc(STATE_LABEL[curSt] || '')
      + (curSt === 'hold' ? ' · ⏸️ 입사보류를 한 번 더 누르면 해제됩니다' : '') + '</span></div>'
      + '<div class="stbtns">'
      + STATE_ORDER.map(function (k) {
        var lbl = k === 'working' ? '입사확정(근무중)' : (k === 'hold' ? '⏸️ 입사보류' : STATE_LABEL[k]);
        return '<button type="button" data-setstate="' + k + '"' + (curSt === k ? ' class="on"' : '') + '>' + esc(lbl) + '</button>';
      }).join('')
      + '<button type="button" class="stcancel" data-stcancel="1">🗑️ 입사취소</button>'
      + '</div></div>';

    var genOpt = ['', '여', '남'].map(function (g) {
      var cur = genderOf(r);
      return '<option value="' + g + '"' + (cur === g ? ' selected' : '') + '>' + (g || '선택') + '</option>';
    }).join('');
    var vOf = vendorOf(r);
    var vendorList = S.vendors.slice();
    if (vOf && vendorList.indexOf(vOf) < 0) { vendorList.push(vOf); }
    var venOpt = '<option value="">없음</option>' + vendorList.map(function (v) {
      return '<option value="' + esc(v) + '"' + (vOf === v ? ' selected' : '') + '>' + esc(v) + '</option>';
    }).join('');
    h += '<div class="metaform">'
      + '<div class="field"><label>업체구분</label><select data-meta="outsource_company">' + venOpt + '</select></div>'
      + '<div class="field"><label>성별</label><select data-meta="gender">' + genOpt + '</select></div>'
      + '<div class="field"><label>한양교육일자</label><input type="date" data-meta="hire_date" value="' + esc(r.hire_date || '') + '"></div>'
      + '<div class="field"><label>홍채등록일자</label><input type="date" data-meta="iris_date" value="' + esc(r.iris_date || '') + '"></div>'
      + '<div class="field"><label>퇴사일자</label><input type="date" data-meta="resign_date" value="' + esc(r.resign_date || '') + '"></div>'
      + '<div class="field"><label>단가</label><input type="text" data-meta="daily_wage" value="' + esc(r.daily_wage || '') + '" placeholder="예) 180000 / 미기재" inputmode="numeric"></div>'
      + '<div class="field"><label>직종</label>'
      + '<select data-meta="job_role" data-jobsel>' + jobOptions(jobText(r)) + '</select>'
      + '<input type="text" data-jobcustom value="' + esc(jobSplit(jobText(r)).custom) + '" placeholder="직종 직접 입력" maxlength="20"'
      + (jobSplit(jobText(r)).sel === '__custom' ? '' : ' style="display:none"') + '></div>'
      + '<div class="field"><label>근로자번호 <span style="color:#98A2B3;font-weight:700">P5</span></label>'
      + '<input type="text" data-meta="worker_no" value="' + esc(r.worker_no || '') + '" placeholder="예) 25165593" inputmode="numeric"></div>'
      + '<div class="field"><label>리더팀장 <span style="color:#98A2B3;font-weight:700">P5</span></label>'
      + '<input type="text" data-meta="leader_name" value="' + esc(r.leader_name || '') + '" placeholder="예) 황준태"></div>'
      + '</div>'
      + '<div class="p5qbox"><div class="qh"><b>🧰 P5 자격</b><span>P5 PH1 명단 2번째 시트(자격자 명단)에 들어갑니다</span></div>'
      + '<div class="qchips">' + P5_QUALS.map(function (q) {
        var on = qualOf(r).indexOf(q.key) >= 0;
        return '<button type="button" class="qchip' + (on ? ' on' : '') + '" data-qual="' + q.key + '">'
          + esc(q.icon + ' ' + q.label) + '</button>';
      }).join('') + '</div></div>'
      + '<button type="button" class="btn sm gray" data-metasave style="width:auto;padding:0 16px;height:38px;margin:2px 0 12px">기본 정보 저장</button>';

    /* 특이사항 — 적은 관리자 이름이 자동으로 붙는다 */
    var notes = notesOf(r);
    h += '<div class="notebox">'
      + '<div class="nh"><b>📝 특이사항</b><span>적은 관리자 이름이 자동으로 붙어 저장됩니다</span></div>'
      + (notes.length
        ? '<div class="nlist">' + notes.map(function (n, i) {
          var own = String((n && n.by) || '') === String(S.auth ? S.auth.name : '');
          return '<div class="nitem"><span class="nby">' + esc((n && n.by) || '') + '</span>'
            + '<span class="ntx">' + esc((n && n.text) || '') + '</span>'
            + '<span class="ndt">' + esc(noteTime((n && n.at) || '')) + '</span>'
            + (own ? '<button type="button" class="ndel" data-ndel="' + i + '" title="내가 적은 메모 지우기">✕</button>' : '')
            + '</div>';
        }).join('') + '</div>'
        : '<div class="nempty">아직 적어 둔 특이사항이 없습니다.</div>')
      + '<div class="nadd"><input type="text" id="noteInput" maxlength="300" placeholder="예) 12/1 첫 출근, 안전교육 이수"><button type="button" data-noteadd="1">추가</button></div>'
      + '</div>';

    /* 💰 단가 변경 이력 — 서버가 update_meta 때마다 남긴다 (v10) */
    var wh = wageHistoryOf(r);
    h += '<div class="wagebox">'
      + '<div class="wh"><b>💰 단가 변경 이력</b><span>'
      + (wh.length ? wh.length + '건' : '아직 변경 없음') + '</span></div>'
      + (wh.length
        ? '<div class="wlist">' + wh.slice().reverse().map(function (w) {
          var at = wageAtText((w && w.at) || '');
          return '<div class="witem"><span class="wdt">' + esc(at) + '</span>'
            + '<span class="wtx">' + esc(wonText(w && w.prev, '(빈값)')) + ' → <b>' + esc(wonText(w && w.next, '(빈값)')) + '</b></span>'
            + '<span class="wby">' + esc((w && w.by) || '') + '</span></div>';
        }).join('') + '</div>'
        : '<div class="wempty">단가를 바꾸면 날짜·이전값·바꾼 사람이 여기에 남습니다.</div>')
      + '</div>';

    h += '<div class="files">';
    DOC_TYPES.forEach(function (d) {
      var arr = map[d.key] || [];
      if (!arr.length) {
        h += '<a class="miss" href="javascript:void(0)"><span class="ic">' + d.icon + '</span><span style="flex:1">' + esc(d.label) + ' — 미제출</span></a>';
        return;
      }
      arr.forEach(function (f) {
        var idx = allFiles.indexOf(f);
        var when = '';
        if (d.key === 'health' && (f.exam_date || f.exam_type)) {
          when = '<span class="fwhen"> · ' + esc((f.exam_date || '') + ' ' + (f.exam_type || '')) + '</span>';
        }
        h += '<div class="fline">'
          + '<a href="#" data-dl="' + esc(f.path) + '" data-dlname="' + esc(f.name) + '" data-id="' + esc(r.id) + '">'
          + '<span class="ic">' + d.icon + '</span><span style="flex:1;min-width:0;word-break:break-all">' + esc(f.name) + when + '</span><span>⬇</span></a>'
          + '<button type="button" class="fview" data-fview="' + idx + '" title="보기">👁️</button>'
          + '<button type="button" data-fedit="' + idx + '" title="파일 이름 수정">✎</button>'
          + '</div>';
        if (EDIT.key === r.id + ':' + idx) { h += editForm(r, idx, f); }
      });
    });
    h += '</div>';

    /* 서류 추가 · 교체 (관리자 직접 업로드) */
    var otherDocs = DOC_TYPES.filter(function (d) { return d.key !== 'health'; });
    h += '<div class="upbox">'
      + '<div class="uh"><b>📤 서류 추가 · 교체</b><span>같은 종류는 새 파일로 바뀝니다</span></div>'
      + '<div class="upbtns">'
      + '<button type="button" class="btn sm gray" data-uphealth="1">+ 검진 PDF 추가</button>'
      + '<button type="button" class="btn sm gray" data-upother="1">+ 다른 서류 올리기</button>'
      + '</div>'
      + '<div class="upform hide" id="upOtherForm">'
      + '<select id="upType">' + otherDocs.map(function (d) {
        return '<option value="' + d.key + '">' + esc(d.icon + ' ' + d.label) + '</option>';
      }).join('') + '</select>'
      + '<button type="button" class="btn sm" data-uppick="1">파일 선택</button>'
      + '</div>'
      + '<div class="uplist" id="upList"></div>'
      + '<button type="button" class="btn" id="upGo" data-upgo="1" style="display:none">올리기</button>'
      + '<input type="file" id="upHealthIn" accept="application/pdf,.pdf" multiple hidden>'
      + '<input type="file" id="upOtherIn" accept="application/pdf,.pdf,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" hidden>'
      + '</div>';

    h += '<div class="toolbar" style="margin-top:14px">'
      + '<button class="btn sm gray" data-dlall="' + esc(r.id) + '" style="width:auto;padding:0 14px">📦 이 사람 서류 ZIP</button>'
      + '<button class="btn sm gray" data-status="' + esc(r.id) + '" style="width:auto;padding:0 14px">' + (r.status === 'hired' ? '입사확정 취소' : '입사확정') + '</button>'
      + '</div>';

    $('#detailTitle').textContent = r.name + ' 님 제출 정보';
    S.detailId = id;
    if (UP.id !== id) { UP = { id: id, items: [] }; }
    $('#detailBody').innerHTML = h;
    /* 직종 [직접입력] 을 고르면 입력칸이 열린다 */
    var jobSel = $('#detailBody [data-jobsel]');
    if (jobSel) {
      jobSel.addEventListener('change', function () { jobCustomToggle('#detailBody'); });
    }
    renderUpList();
    openModal('detailModal');
  }

  function jobCustomToggle(scope) {
    var sel = $(scope + ' [data-jobsel]');
    var inp = $(scope + ' [data-jobcustom]');
    if (!sel || !inp) { return; }
    var on = sel.value === '__custom';
    inp.style.display = on ? '' : 'none';
    if (on) { inp.focus(); }
  }

  /* 선택값 + 직접입력값 → 저장할 직종 한 줄 */
  function jobPick(scope) {
    var sel = $(scope + ' [data-jobsel]');
    var inp = $(scope + ' [data-jobcustom]');
    if (!sel) { return ''; }
    if (sel.value !== '__custom') { return sel.value; }
    return String((inp && inp.value) || '').replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20);
  }

  async function saveMeta(id) {
    var r = rowById(id);
    if (!r) { return; }
    var meta = {};
    $$('#detailBody [data-meta]').forEach(function (el) {
      var k = el.getAttribute('data-meta');
      if (k === 'job_role') { return; }
      meta[k] = (el.type === 'checkbox') ? el.checked : String(el.value || '').trim();
    });
    meta.job_role = jobPick('#detailBody');
    try {
      var d = await call('update_meta', { id: id, meta: meta });
      Object.keys(meta).forEach(function (k) { r[k] = meta[k]; });
      if (d && 'wage_history' in d) { r.wage_history = Array.isArray(d.wage_history) ? d.wage_history : wageHistoryOf(r); }
      if ('outsource_company' in meta) {
        var v = String(meta.outsource_company || '').trim();
        r.is_outsource = !!v;
        if (v && S.vendors.indexOf(v) < 0) { S.vendors.push(v); }
      }
      render();
      openDetail(id);
      toast(meta.resign_date ? '저장했습니다. 퇴사일자가 있어 상태가 퇴사로 표시됩니다.' : '기본 정보를 저장했습니다.');
    } catch (e) {
      toast(e.message || '저장하지 못했습니다.', 3200);
    }
  }

  /* =========================================================
     서류 보기 (👁️) — 서명 URL 로 모달 안에서 바로 본다
     ========================================================= */
  function extOf(f) {
    var n = String((f && f.name) || (f && f.path) || '').toLowerCase();
    var m = /\.([a-z0-9]+)$/.exec(n);
    var e = m ? m[1] : '';
    if (e === 'jpeg') { e = 'jpg'; }
    if (!e) {
      var t = String((f && f.type) || '');
      if (t === 'application/pdf') { e = 'pdf'; }
      else if (t === 'image/png') { e = 'png'; }
      else if (t === 'image/webp') { e = 'webp'; }
      else if (t === 'image/jpeg') { e = 'jpg'; }
    }
    return e;
  }
  function mimeOf(ext) {
    if (ext === 'pdf') { return 'application/pdf'; }
    if (ext === 'png') { return 'image/png'; }
    if (ext === 'webp') { return 'image/webp'; }
    return 'image/jpeg';
  }
  function kb(n) {
    var v = Number(n || 0);
    if (v >= 1024 * 1024) { return (v / 1024 / 1024).toFixed(1) + 'MB'; }
    return Math.max(1, Math.round(v / 1024)) + 'KB';
  }
  function basePath() {
    var tag = document.querySelector('script[src*="js/admin.v"]');
    return (tag && tag.src) ? tag.src.replace(/js\/admin\.v\d+\.js.*$/, '') : './';
  }

  async function openView(id, idx) {
    var r = rowById(id);
    var all = Array.isArray(r && r.files_json) ? r.files_json : [];
    var f = all[idx];
    if (!f) { return; }
    $('#viewTitle').textContent = f.name || '서류 보기';
    $('#viewOpen').href = '#';
    $('#viewBody').innerHTML = '<div class="vload">불러오는 중…</div>';
    openModal('viewModal');
    try {
      var d = await call('sign', { items: [{ id: id, path: f.path, name: f.name }], inline: true });
      var it = (d.items || [])[0];
      if (!it || !it.url) { throw new Error('파일을 열 수 없습니다.'); }
      var url = it.url;
      $('#viewOpen').href = url;
      var ext = extOf(f);
      var body = $('#viewBody');
      if (['jpg', 'png', 'webp', 'gif'].indexOf(ext) >= 0) {
        body.innerHTML = '';
        var img = document.createElement('img');
        img.className = 'vimg';
        img.alt = f.name || '서류';
        img.src = url;
        body.appendChild(img);
      } else if (ext === 'pdf') {
        body.innerHTML = '<div class="vpdf" id="vpdf"></div>';
        renderPdf(url, $('#vpdf'));
      } else {
        body.innerHTML = '<div class="vload">미리보기를 지원하지 않는 형식입니다.</div>';
      }
    } catch (e) {
      $('#viewBody').innerHTML = '<div class="vload">' + esc(e.message || '파일을 열지 못했습니다.') + '</div>';
    }
  }

  /* PDF 첫 쪽부터 캔버스로 그린다 (PDF.js 로컬 번들) */
  async function renderPdf(url, box) {
    if (!box) { return; }
    try {
      if (!window.pdfjsLib) { throw new Error('PDF 뷰어를 불러오지 못했습니다.'); }
      var base = basePath();
      try {
        if (window.pdfjsLib.GlobalWorkerOptions && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'vendor/pdfjs/pdf.worker.min.js';
        }
      } catch (e0) { /* 무시 */ }
      var doc = await window.pdfjsLib.getDocument({
        url: url,
        cMapUrl: base + 'vendor/pdfjs/cmaps/',
        cMapPacked: true,
        isEvalSupported: false
      }).promise;
      box.innerHTML = '';
      var max = Math.min(doc.numPages || 1, 30);
      for (var p = 1; p <= max; p++) {
        var page = await doc.getPage(p);
        var v1 = page.getViewport({ scale: 1 });
        var scale = Math.min(3, ((box.clientWidth || 340) * (window.devicePixelRatio || 1)) / v1.width);
        var vp = page.getViewport({ scale: scale });
        var cv = document.createElement('canvas');
        cv.className = 'vcanvas';
        cv.width = Math.round(vp.width);
        cv.height = Math.round(vp.height);
        box.appendChild(cv);
        await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        try { page.cleanup(); } catch (e1) { /* 무시 */ }
      }
      if (doc.numPages > max) {
        var more = document.createElement('div');
        more.className = 'vmore';
        more.textContent = doc.numPages + '쪽 중 ' + max + '쪽까지 보여 줍니다. 전체는 [새 창]으로 보세요.';
        box.appendChild(more);
      }
    } catch (e) {
      box.innerHTML = '<div class="vload">PDF를 화면에 그리지 못했습니다.<br>위 [새 창]으로 열어 보세요.</div>';
    }
  }

  /* =========================================================
     서류 추가 · 교체 — 관리자가 직접 업로드 (sign_upload)
     ========================================================= */
  function docName(r, type, ext, extra) {
    var n = String((r && r.name) || '').trim();
    var b6 = String((r && r.birth6) || String((r && r.rrn) || '').replace(/\D/g, '').slice(0, 6));
    if (type === 'idcard') { return '신분증(' + n + ').' + ext; }
    if (type === 'edu') { return '기초이수증(' + n + ').' + ext; }
    if (type === 'bank') { return '통장사본(' + n + ').' + ext; }
    if (type === 'photo') { return n + '_' + b6 + '.' + (ext || 'jpg'); }
    if (type === 'opinion') { return n + ' 소견서.pdf'; }
    if (type === 'medicine') { return n + ' 약봉투.' + ext; }
    if (type === 'career') { return n + ' 경력증명서' + ((r && r.job_role) ? '(' + r.job_role + ')' : '') + '.pdf'; }
    if (type === 'health') {
      if (window.ExamPDF && window.ExamPDF.fileName) {
        return window.ExamPDF.fileName(n, extra && extra.date, extra && extra.typeSel);
      }
      return String((extra && extra.date) || '').replace(/-/g, '').slice(2) + '_' + n + ' ' + ((extra && extra.typeSel) || '') + '.pdf';
    }
    return n + '_' + type + '.' + ext;
  }

  var UPLOAD_EXT = ['pdf', 'jpg', 'png', 'webp'];

  async function addPending(type, files) {
    var r = rowById(UP.id);
    if (!r || !files || !files.length) { return; }
    var maxMB = Number((window.CFG && CFG.maxFileMB) || 25);
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var ext = extOf({ name: f.name, type: f.type });
      if (f.size > maxMB * 1024 * 1024) { toast(f.name + ' — ' + maxMB + 'MB가 넘습니다.', 3600); continue; }
      if (type === 'health' && ext !== 'pdf') { toast('건강검진은 PDF만 올릴 수 있습니다.', 3600); continue; }
      if ((type === 'opinion' || type === 'career') && ext !== 'pdf') { toast(DOC_LABEL[type] + '은(는) PDF만 올릴 수 있습니다.', 3600); continue; }
      if (type === 'photo' && ext === 'pdf') { toast('증명사진은 사진(JPG·PNG·WEBP)만 올릴 수 있습니다.', 3600); continue; }
      if (UPLOAD_EXT.indexOf(ext) < 0) { toast('PDF · JPG · PNG · WEBP 만 올릴 수 있습니다.', 3600); continue; }
      var it = { type: type, file: f, ext: ext, date: '', typeSel: '', d2: false, src: '' };
      if (type === 'health' && window.ExamPDF && window.ExamPDF.ready) {
        try {
          var txt = await window.ExamPDF.extractText(f, 2);
          var p = window.ExamPDF.parseExam(txt, f.name);
          it.date = p.date || '';
          it.typeSel = p.type || '';
          it.d2 = !!p.d2;
          it.src = [p.dateSrc, p.typeSrc].filter(Boolean).join('/');
        } catch (e) { it.src = ''; }
      }
      UP.items.push(it);
    }
    renderUpList();
  }

  function renderUpList() {
    var box = $('#upList');
    if (!box) { return; }
    var r = rowById(UP.id);
    var go = $('#upGo');
    if (!UP.items.length) {
      box.innerHTML = '';
      if (go) { go.style.display = 'none'; go.disabled = false; }
      return;
    }
    box.innerHTML = UP.items.map(function (it, i) {
      var nm = docName(r, it.type, it.ext, it);
      var need = it.type === 'health' && (!it.date || !it.typeSel);
      var extra = '';
      if (it.type === 'health') {
        extra = '<div class="upfields">'
          + '<input type="date" data-upfield="date" data-i="' + i + '" value="' + esc(it.date) + '">'
          + '<select data-upfield="type" data-i="' + i + '">'
          + ['', '일반', '배치전', '특수'].map(function (t) {
            return '<option value="' + t + '"' + (it.typeSel === t ? ' selected' : '') + '>' + (t || '종류 선택') + '</option>';
          }).join('')
          + '</select></div>'
          + (need
            ? '<small class="uwarn">⚠️ 검진일자·종류를 골라 주세요' + (it.src ? '' : ' (PDF에서 읽지 못했습니다)') + '</small>'
            : '<small class="uok">' + (it.src ? 'PDF에서 읽음 · ' : '') + esc(it.date + ' ' + it.typeSel) + (it.d2 ? ' · D2' : '') + '</small>');
      }
      return '<div class="upitem' + (need ? ' warn' : '') + '">'
        + '<div class="upmain"><b>' + esc(nm) + '</b>'
        + '<small>' + esc((DOC_LABEL[it.type] || it.type) + ' · ' + kb(it.file.size)) + '</small>'
        + extra + '</div>'
        + '<button type="button" data-updel="' + i + '" title="빼기">✕</button>'
        + '</div>';
    }).join('');
    if (go) { go.style.display = ''; go.disabled = false; go.textContent = '올리기 (' + UP.items.length + ')'; }
  }

  async function uploadPending() {
    var r = rowById(UP.id);
    if (!r || !UP.items.length) { return; }
    for (var i = 0; i < UP.items.length; i++) {
      var it0 = UP.items[i];
      if (it0.type === 'health' && (!it0.date || !it0.typeSel)) {
        toast('검진일자·종류를 골라 주세요. (' + it0.file.name + ')', 3600);
        return;
      }
    }
    var go = $('#upGo');
    if (go) { go.disabled = true; go.textContent = '올리는 중…'; }
    var added = [];
    try {
      for (var j = 0; j < UP.items.length; j++) {
        var item = UP.items[j];
        if (go) { go.textContent = '올리는 중… (' + (j + 1) + '/' + UP.items.length + ')'; }
        var nm = docName(r, item.type, item.ext, item);
        var sd = await call('sign_upload', { id: r.id, type: item.type, ext: item.ext });
        var put = await fetch(sd.url, {
          method: 'PUT',
          headers: { 'Content-Type': mimeOf(item.ext), 'cache-control': '3600' },
          body: item.file
        });
        if (!put.ok) { throw new Error(nm + ' 업로드 실패 (' + put.status + ')'); }
        var info = { type: item.type, path: sd.path, name: nm, size: item.file.size, mime: mimeOf(item.ext) };
        if (item.type === 'health') { info.exam_date = item.date; info.exam_type = item.typeSel; info.d2 = !!item.d2; }
        added.push(info);
      }
      var all = (Array.isArray(r.files_json) ? r.files_json.slice() : []);
      added.forEach(function (info) {
        if (info.type !== 'health') {
          all = all.filter(function (x) { return String((x && x.type) || '') !== info.type; });
        }
        all.push(info);
      });
      var res = await call('update_files', { id: r.id, files: all });
      r.files_json = (res && res.files) || all;
      var h0 = r.files_json.filter(function (x) { return x && x.type === 'health'; })[0] || null;
      r.health_exam_date = h0 ? (h0.exam_date || '') : '';
      r.health_exam_type = h0 ? (h0.exam_type || '') : '';
      UP.items = [];
      render();
      openDetail(r.id);
      toast(added.length + '건 올렸습니다.' + (res && res.dropped ? ' (이전 파일 ' + res.dropped + '개 정리)' : ''));
    } catch (e) {
      toast(e.message || '서류를 올리지 못했습니다.', 4000);
      renderUpList();
    }
  }

  /* 특이사항 — 서버가 로그인한 관리자 이름을 붙여 저장한다 */
  async function addNote(id) {
    var el = $('#noteInput');
    if (!el) { return; }
    var text = String(el.value || '').replace(/\s+/g, ' ').trim();
    if (!text) { toast('특이사항 내용을 적어 주세요.'); el.focus(); return; }
    var btn = $('#detailBody [data-noteadd]');
    if (btn) { btn.disabled = true; }
    try {
      var d = await call('add_note', { id: id, text: text });
      var r = rowById(id);
      if (r) { r.admin_notes = d.notes || []; }
      render();
      openDetail(id);
      toast(S.auth.name + ': ' + text + ' — 특이사항을 저장했습니다.', 3200);
    } catch (e) {
      toast(e.message || '특이사항을 저장하지 못했습니다.', 3200);
    } finally {
      if (btn) { btn.disabled = false; }
    }
  }

  async function delNote(id, idx) {
    var r = rowById(id);
    var n = r && notesOf(r)[idx];
    if (!n) { return; }
    if (!confirm('이 특이사항을 지울까요?\n\n' + (n.by || '') + ': ' + (n.text || ''))) { return; }
    try {
      var d = await call('del_note', { id: id, index: idx });
      if (r) { r.admin_notes = d.notes || []; }
      render();
      openDetail(id);
      toast('특이사항을 지웠습니다.');
    } catch (e) {
      toast(e.message || '지우지 못했습니다.', 3200);
    }
  }

  /* ---------------- 신규자 직접 추가 ---------------- */
  function vendorOptions(cur) {
    var list = S.vendors.slice();
    if (cur && list.indexOf(cur) < 0) { list.push(cur); }
    return '<option value="">해당 없음</option>' + list.map(function (v) {
      return '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(v) + '</option>';
    }).join('');
  }

  function openAdd() {
    ['m_name', 'm_rrn', 'm_birth', 'm_phone', 'm_hire', 'm_iris', 'm_resign', 'm_wage', 'm_worker_no', 'm_leader', 'm_referrer', 'm_note', 'm_job_custom'].forEach(function (k) {
      var el = $('#' + k); if (el) { el.value = ''; }
    });
    $('#m_gender').value = '';
    $('#m_status').value = 'submitted';
    $('#m_vendor').innerHTML = vendorOptions('');
    $('#m_job').innerHTML = jobOptions('');
    jobCustomToggle('#addModal');
    openModal('addModal');
  }

  async function saveAdd() {
    var name = $('#m_name').value.trim();
    if (!name) { toast('성명을 입력해 주세요.'); return; }
    var vendor = $('#m_vendor').value;
    var row = {
      name: name,
      rrn: $('#m_rrn').value,
      birth_date: $('#m_birth').value,
      gender: $('#m_gender').value,
      phone: $('#m_phone').value,
      hire_date: $('#m_hire').value,
      iris_date: $('#m_iris').value,
      resign_date: $('#m_resign').value,
      worker_no: $('#m_worker_no').value,
      leader_name: $('#m_leader').value,
      status: $('#m_status').value,
      daily_wage: $('#m_wage').value,
      job_role: jobPick('#addModal'),
      outsource_company: vendor,
      is_outsource: !!vendor,
      referrer: $('#m_referrer').value,
      note: $('#m_note').value
    };
    var btn = $('#m_save');
    btn.disabled = true; btn.textContent = '등록하는 중…';
    try {
      var d = await call('create_manual', { row: row });
      closeModal('addModal');
      S.tab = 'all';
      $$('#tabs .tab').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-tab') === 'all'); });
      await refresh(true);
      toast(((d.row && d.row.name) || name) + ' 님을 추가했습니다.');
    } catch (e) {
      toast(e.message || '추가하지 못했습니다.', 3600);
    } finally {
      btn.disabled = false; btn.textContent = '등록';
    }
  }

  /* P5 자격 켜기/끄기 — 보유 자격(certs)에 저장 (v10) */
  async function toggleQual(id, key) {
    var r = rowById(id);
    if (!r) { return; }
    var q = P5_QUALS.filter(function (x) { return x.key === key; })[0];
    if (!q) { return; }
    var list = qualList(r).certs.slice();
    var on = qualOf(r).indexOf(key) >= 0;
    if (on) {
      list = list.filter(function (c) { return !certIsQual(c, key); });
    } else if (list.indexOf(q.cert) < 0) {
      list.push(q.cert);
    }
    try {
      await call('update_meta', { id: id, meta: { certs: list } });
      r.certs = list;
      render();
      openDetail(id);
      toast(r.name + ' 님 ' + q.label + (on ? ' 자격을 껐습니다.' : ' 자격을 켰습니다. (P5 명단 2번째 시트에 들어갑니다)'), 3200);
    } catch (e) {
      toast(e.message || '자격을 저장하지 못했습니다.', 3200);
    }
  }

  function openModal(id) {
    var m = document.getElementById(id);
    if (m) { m.classList.add('open'); document.body.style.overflow = 'hidden'; }
  }
  function closeModal(id) {
    var m = document.getElementById(id);
    if (m) { m.classList.remove('open'); }
    if (!$('.modal.open')) { document.body.style.overflow = ''; }
  }

  /* 사진/PDF 미리보기 대신 내려받기 (서명 URL) */
  async function downloadSigned(items, fallbackName) {
    var d = await call('sign', { items: items });
    var got = 0, fail = 0;
    for (var i = 0; i < d.items.length; i++) {
      var it = d.items[i];
      if (!it.url) { fail++; continue; }
      if (items.length === 1) {
        window.open(it.url, '_blank');
        got++;
      } else {
        var a = document.createElement('a');
        a.href = it.url; a.download = it.name || fallbackName; a.target = '_blank';
        document.body.appendChild(a); a.click(); a.remove();
        got++;
        await new Promise(function (r) { setTimeout(r, 400); });
      }
    }
    return { got: got, fail: fail };
  }

  /* ---------------- 엑셀 (서하 님 실제 양식 기준) ---------------- */
  var COLS = [
    { key: 'no',            w: 6.0,  t: 'No.',           a: 'center' },
    { key: 'name',          w: 13.0, t: '성명',           a: 'center' },
    { key: 'is_outsource',  w: 7.0,  t: '외주',           a: 'center' },
    { key: 'vendor',        w: 11.0, t: '업체구분',        a: 'center' },
    { key: 'rrn',           w: 13.9, t: '주민번호',        a: 'center' },
    { key: 'gender',        w: 6.5,  t: '성별',           a: 'center' },
    { key: 'hire_date',     w: 12.0, t: '입사일자',        a: 'center' },
    { key: 'resign_date',   w: 12.0, t: '퇴사일자',        a: 'center' },
    { key: 'address',       w: 52.0, t: '주소',           a: 'left' },
    { key: 'phone_os',      w: 10.4, t: '핸드폰기종',      a: 'center' },
    { key: 'phone',         w: 14.1, t: '휴대폰',          a: 'center' },
    { key: 'daily_wage',    w: 9.5,  t: '월급/일당',       a: 'right' },
    { key: 'bank',          w: 11.0, t: '은행명',          a: 'center' },
    { key: 'account_number',w: 18.9, t: '계좌번호',        a: 'center' },
    { key: 'account_holder',w: 13.0, t: '입금자명',       a: 'center' },
    { key: 'job_role',      w: 13.0, t: '직종',           a: 'center' },
    { key: 'housing',       w: 12.5, t: '숙소',           a: 'center' },
    { key: 'total_career',  w: 10.4, t: '총경력',          a: 'center' },
    { key: 'semi_career',   w: 13.6, t: '반도체경력',       a: 'center' },
    { key: 'email',         w: 26.1, t: '이메일',          a: 'left' },
    { key: 'blood_type',    w: 10.4, t: '혈액형',          a: 'center' },
    { key: 'vest_size',     w: 10.4, t: '조끼 사이즈',      a: 'center' },
    { key: 'shoe_size',     w: 12.4, t: '안전화 사이즈',    a: 'center' },
    { key: 'glasses_type',  w: 16.1, t: '보안경(일반/안경)', a: 'center' },
    { key: 'certs',         w: 24.3, t: '보유 자격 현황',   a: 'left' },
    { key: 'referrer',      w: 14.0, t: '소개자',          a: 'center' },
    /* ↓ 여기부터 서류 제출 현황 (온보딩에서 추가) */
    { key: 'd_idcard',      w: 8.0,  t: '신분증',          a: 'center' },
    { key: 'd_edu',         w: 9.0,  t: '기초이수증',       a: 'center' },
    { key: 'd_bank',        w: 9.0,  t: '통장사본',         a: 'center' },
    { key: 'd_photo',       w: 9.0,  t: '증명사진',         a: 'center' },
    { key: 'd_health',      w: 9.0,  t: '건강검진',         a: 'center' },
    { key: 'd_opinion',     w: 8.0,  t: '소견서',          a: 'center' },
    { key: 'd_medicine',    w: 8.0,  t: '약봉투',          a: 'center' },
    { key: 'd_career',      w: 10.0, t: '경력증명서',       a: 'center' },
    { key: 'exam',          w: 26.0, t: '검진일 / 종류',    a: 'center' },
    { key: 'created',       w: 17.0, t: '제출일',          a: 'center' },
    { key: 'status',        w: 10.0, t: '상태',           a: 'center' },
    { key: 'ag1',           w: 17.0, t: '개인정보 동의',    a: 'center' },
    { key: 'ag2',           w: 17.0, t: '고유식별 동의',    a: 'center' },
    { key: 'ag3',           w: 17.0, t: '민감정보 동의',    a: 'center' },
    { key: 'notes',         w: 40.0, t: '특이사항',        a: 'left' }
  ];

  function rowValues(r, i) {
    var map = filesOf(r);
    var yn = function (k) { return map[k] ? 'O' : 'X'; };
    return {
      no: i + 1,
      name: r.name || '',
      rrn: r.rrn || '',
      is_outsource: r.is_outsource ? 'O' : '',
      vendor: vendorOf(r),
      gender: genderOf(r),
      hire_date: r.hire_date || '',
      resign_date: r.resign_date || '',
      address: r.address || '',
      phone_os: r.phone_os || '',
      phone: fmtPhone(r.phone),
      daily_wage: isNum(r.daily_wage) ? Number(String(r.daily_wage).replace(/,/g, '')) : (r.daily_wage || ''),
      bank: r.bank || '',
      account_number: r.account_number || '',
      account_holder: r.account_holder || '',
      job_role: r.job_role || '',
      housing: r.housing || '',
      total_career: r.total_career || '',
      semi_career: r.semi_career || '',
      email: r.email || '',
      blood_type: r.blood_type || '',
      vest_size: r.vest_size || '',
      shoe_size: r.shoe_size ? Number(r.shoe_size) : null,
      glasses_type: r.glasses_type || '',
      certs: Array.isArray(r.certs) ? r.certs.join(', ') : '',
      referrer: r.referrer || '',
      d_idcard: yn('idcard'), d_edu: yn('edu'), d_bank: yn('bank'), d_photo: yn('photo'),
      d_health: yn('health'), d_opinion: yn('opinion'), d_medicine: yn('medicine'), d_career: yn('career'),
      exam: examText(r, map),
      created: dstr(r.created_at),
      status: statusText(r),
      ag1: dstr(r.agreed_privacy_at),
      ag2: dstr(r.agreed_unique_id_at),
      ag3: dstr(r.agreed_sensitive_at),
      notes: notesText(r)
    };
  }

  async function exportExcel(rows) {
    if (!rows.length) { toast('내보낼 인원이 없습니다.'); return; }
    if (!window.ExcelJS) { toast('엑셀 라이브러리를 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.', 3600); return; }

    var wb = new ExcelJS.Workbook();
    wb.creator = '한양 pcw팀';
    wb.created = new Date();
    var ws = wb.addWorksheet('신규근로자명단', {
      views: [{ state: 'frozen', ySplit: 1 }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });

    ws.columns = COLS.map(function (c) { return { width: c.w }; });

    var thin = { style: 'thin', color: { argb: 'FFBFBFBF' } };
    var border = { top: thin, left: thin, bottom: thin, right: thin };
    var headFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4E81BD' } };
    var headFont = { name: '굴림체', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    var bodyFont = { name: '굴림체', size: 9, color: { argb: 'FF000000' } };

    var head = ws.addRow(COLS.map(function (c) { return c.t; }));
    head.height = 22;
    head.eachCell(function (cell, col) {
      cell.fill = headFill;
      cell.font = headFont;
      cell.border = border;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });

    rows.forEach(function (r, i) {
      var v = rowValues(r, i);
      var vals = COLS.map(function (c) { return v[c.key] === undefined ? '' : v[c.key]; });
      var row = ws.addRow(vals);
      row.height = (String(v.exam || '').length > 26 || String(v.notes || '').length > 45) ? 30 : 18;
      row.eachCell({ includeEmpty: true }, function (cell, col) {
        var c = COLS[col - 1];
        cell.border = border;
        cell.font = bodyFont;
        cell.alignment = { horizontal: c.a, vertical: 'middle', wrapText: c.key === 'address' || c.key === 'certs' || c.key === 'exam' || c.key === 'notes' };
        if (c.key === 'daily_wage') { cell.numFmt = '#,##0'; }
        if (c.key === 'shoe_size') { cell.numFmt = '0'; }
        if (c.key === 'rrn' || c.key === 'account_number' || c.key === 'phone') { cell.numFmt = '@'; }
      });
    });

    if (rows.length) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLS.length } };
    }

    var buf = await wb.xlsx.writeBuffer();
    saveFile(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      '신규입사자_서류취합_' + todayStr() + '.xlsx');
    toast(rows.length + '명 엑셀을 만들었습니다.');
  }

  /* =========================================================
     P5 PH1 명단 엑셀 (v10) — 서하 님이 보내 준 실제 양식
       · 1시트 : P5 PH1 근로자 명단 (근무중) + 아래 P5 PH1 퇴사자 명단 (퇴사)
       · 2시트 : TBM리더 및 TL 운전 및 유도 (자격자)
     ========================================================= */
  var P5_HEAD = ['성명', '성별', '생년월일', '근로자번호', '직종', '홍채 등록일자', '리더팀장', '특이사항'];
  var P5_HEAD_OUT = ['성명', '성별', '생년월일', '근로자번호', '직종', '신규홍채 등록일자', '리더팀장', '특이사항'];
  var P5_JOBS = ['공사관리자', '품질관리자', '배관공', '용접공', '보통인부'];

  function p5Birth(r) {
    var b6 = String(r.birth6 || '').replace(/\D/g, '');
    if (b6.length >= 6) { return b6.slice(0, 6); }
    var bt = birthText(r).replace(/\D/g, '');
    return bt.length === 8 ? bt.slice(2) : '';
  }
  // 특이사항 — 한양교육일자/홍채일자 + 관리자 메모 (예: '260904 한양교육/ 0914 홍채 등록예정')
  function p5Note(r) {
    var parts = [];
    var hire = ymd6(r.hire_date);
    var iris = ymd6(r.iris_date);
    if (hire) { parts.push(hire + ' 한양교육'); }
    if (iris) { parts.push(iris.slice(2) + ' 홍채 등록' + (String(r.iris_date) >= todayISO() ? '예정' : '')); }
    if (isResigned(r) && r.resign_date) { parts.push(dotDate(r.resign_date) + ' 퇴사'); }
    var head = parts.join('/ ');
    var notes = notesText(r);
    return [head, notes].filter(Boolean).join('\n');
  }

  async function exportP5() {
    if (!window.ExcelJS) { toast('엑셀 라이브러리를 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.', 3600); return; }
    var workers = S.rows.filter(function (r) { return stateOf(r) === 'working'; });
    var resigned = S.rows.filter(function (r) { return stateOf(r) === 'resigned'; });
    if (!workers.length && !resigned.length) {
      toast('근무중·퇴사 인원이 없습니다. 상태를 먼저 바꿔 주세요.', 3600);
      return;
    }

    var wb = new ExcelJS.Workbook();
    wb.creator = '한양 pcw팀';
    wb.created = new Date();

    var thin = { style: 'thin', color: { argb: 'FFBFBFBF' } };
    var border = { top: thin, left: thin, bottom: thin, right: thin };
    var headFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F8' } };
    var titleFont = { name: '맑은 고딕', size: 16, bold: true, color: { argb: 'FF14213D' } };
    var subFont = { name: '맑은 고딕', size: 12, bold: true, color: { argb: 'FF14213D' } };
    var headFont = { name: '맑은 고딕', size: 10.5, bold: true };
    var bodyFont = { name: '맑은 고딕', size: 10.5 };

    /* ---------------- 1시트 ---------------- */
    var ws = wb.addWorksheet('P5 PH1 근로자 명단', {
      views: [{ state: 'frozen', ySplit: 7 }],
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });
    ws.columns = [
      { width: 3.5 }, { width: 13.4 }, { width: 8.5 }, { width: 11.6 }, { width: 12.6 },
      { width: 13.0, style: { numFmt: '@' } }, { width: 17.2 }, { width: 16.0 }, { width: 52.7 }
    ];

    function put(row, col, val, opt) {
      var cell = ws.getCell(row, col);
      cell.value = (val === '' || val === null || val === undefined) ? null : val;
      if (opt && opt.font) { cell.font = opt.font; }
      if (opt && opt.fill) { cell.fill = opt.fill; }
      if (opt && opt.align) { cell.alignment = { horizontal: opt.align, vertical: 'middle', wrapText: !!opt.wrap }; }
      if (opt && opt.border) { cell.border = opt.border; }
      return cell;
    }

    // 상단 수정일
    put(1, 8, '수정일:', { font: { name: '맑은 고딕', size: 10, bold: true }, align: 'right' });
    put(1, 9, todayISO(), { font: { name: '맑은 고딕', size: 10 }, align: 'center' });

    // 제목 (B5:I6 병합)
    ws.mergeCells(5, 2, 6, 9);
    put(5, 2, 'P5 PH1 근로자 명단', { font: titleFont, align: 'center' });
    ws.getRow(5).height = 22;
    ws.getRow(6).height = 10;

    // 머리글
    var hrow = 7;
    P5_HEAD.forEach(function (t, i) {
      put(hrow, 2 + i, t, { font: headFont, fill: headFill, align: 'center', wrap: true, border: border });
    });
    ws.getRow(hrow).height = 24;

    // 근무중 인원
    var r0 = hrow + 1;
    workers.forEach(function (r, i) {
      var row = r0 + i;
      put(row, 2, r.name || '', { font: bodyFont, align: 'center', border: border });
      put(row, 3, genderOf(r), { font: bodyFont, align: 'center', border: border });
      put(row, 4, p5Birth(r), { font: bodyFont, align: 'center', border: border });
      put(row, 5, String(r.worker_no || ''), { font: bodyFont, align: 'center', border: border });
      put(row, 6, r.job_role || '', { font: bodyFont, align: 'center', border: border });
      put(row, 7, dotDate(r.iris_date), { font: bodyFont, align: 'center', border: border });
      put(row, 8, r.leader_name || '', { font: bodyFont, align: 'center', border: border });
      put(row, 9, p5Note(r), { font: bodyFont, align: 'left', wrap: true, border: border });
      ws.getRow(row).height = String(p5Note(r)).length > 30 ? 28 : 18;
    });
    var lastData = r0 + Math.max(workers.length, 1) - 1;

    // 직종별 인원 · 현장 총원
    var cntRow = lastData + 2;
    var countOf = function (job) {
      return workers.filter(function (r) { return String(r.job_role || '').trim() === job; }).length;
    };
    P5_JOBS.forEach(function (job, i) {
      var row = cntRow + i;
      put(row, 2, job, { font: bodyFont, fill: headFill, align: 'center', border: border });
      ws.mergeCells(row, 3, row, 5);
      put(row, 3, countOf(job), { font: bodyFont, align: 'center', border: border });
      ws.getCell(row, 4).border = border;
      ws.getCell(row, 5).border = border;
    });
    var totRow = cntRow + P5_JOBS.length;
    put(totRow, 2, '현장 총원', { font: { name: '맑은 고딕', size: 10.5, bold: true }, fill: headFill, align: 'center', border: border });
    ws.mergeCells(totRow, 3, totRow, 5);
    put(totRow, 3, workers.length, { font: { name: '맑은 고딕', size: 10.5, bold: true }, align: 'center', border: border });
    ws.getCell(totRow, 4).border = border;
    ws.getCell(totRow, 5).border = border;

    // 퇴사자 명단 (아래)
    var t1 = totRow + 3;
    ws.mergeCells(t1, 2, t1 + 1, 9);
    put(t1, 2, 'P5 PH1 퇴사자 명단', { font: subFont, align: 'center' });
    ws.getRow(t1).height = 20;
    var th = t1 + 3;
    P5_HEAD_OUT.forEach(function (t, i) {
      put(th, 2 + i, t, { font: headFont, fill: headFill, align: 'center', wrap: true, border: border });
    });
    ws.getRow(th).height = 24;
    resigned.forEach(function (r, i) {
      var row = th + 1 + i;
      put(row, 2, r.name || '', { font: bodyFont, align: 'center', border: border });
      put(row, 3, genderOf(r), { font: bodyFont, align: 'center', border: border });
      put(row, 4, p5Birth(r), { font: bodyFont, align: 'center', border: border });
      put(row, 5, String(r.worker_no || ''), { font: bodyFont, align: 'center', border: border });
      put(row, 6, r.job_role || '', { font: bodyFont, align: 'center', border: border });
      put(row, 7, dotDate(r.iris_date), { font: bodyFont, align: 'center', border: border });
      put(row, 8, r.leader_name || '', { font: bodyFont, align: 'center', border: border });
      put(row, 9, p5Note(r), { font: bodyFont, align: 'left', wrap: true, border: border });
      ws.getRow(row).height = String(p5Note(r)).length > 30 ? 28 : 18;
    });

    /* ---------------- 2시트 — TBM리더 및 TL 운전 및 유도 ---------------- */
    var ws2 = wb.addWorksheet('TBM리더 및 TL 운전 및 유도', {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });
    ws2.columns = [{ width: 3.0 }, { width: 14.1 }, { width: 14.6 }, { width: 14.6 }, { width: 3.0 }];
    var put2 = function (row, col, val, opt) {
      var cell = ws2.getCell(row, col);
      cell.value = (val === '' || val === null || val === undefined) ? null : val;
      if (opt && opt.font) { cell.font = opt.font; }
      if (opt && opt.fill) { cell.fill = opt.fill; }
      if (opt && opt.align) { cell.alignment = { horizontal: opt.align, vertical: 'middle', wrapText: !!opt.wrap }; }
      if (opt && opt.border) { cell.border = opt.border; }
      return cell;
    };
    put2(2, 2, todayISO(), { font: { name: '맑은 고딕', size: 10 }, align: 'center' });
    ws2.mergeCells(4, 2, 5, 5);
    put2(4, 2, '각 종 자격자 명단', { font: subFont, align: 'center' });
    put2(7, 3, 'P5 PH1(일반배관)', { font: headFont, align: 'center' });
    ['NO', 'TBM 리더', 'TL 운전원', 'TL 유도원'].forEach(function (t, i) {
      put2(8, 2 + i, t, { font: headFont, fill: headFill, align: 'center', border: border });
    });
    var tbm = [], drive = [], guide = [];
    workers.forEach(function (r) {
      var q = qualOf(r);
      if (q.indexOf('tbm') >= 0) { tbm.push(r.name); }
      if (q.indexOf('drive') >= 0) { drive.push(r.name); }
      if (q.indexOf('guide') >= 0) { guide.push(r.name); }
    });
    var qn = Math.max(tbm.length, drive.length, guide.length);
    for (var i = 0; i < qn; i++) {
      var row = 9 + i;
      put2(row, 2, i + 1, { font: bodyFont, align: 'center', border: border });
      put2(row, 3, tbm[i] || '', { font: bodyFont, align: 'center', border: border });
      put2(row, 4, drive[i] || '', { font: bodyFont, align: 'center', border: border });
      put2(row, 5, guide[i] || '', { font: bodyFont, align: 'center', border: border });
    }
    var sumRow = 9 + Math.max(qn, 1);
    put2(sumRow, 2, '계', { font: { name: '맑은 고딕', size: 10.5, bold: true }, fill: headFill, align: 'center', border: border });
    put2(sumRow, 3, tbm.length, { font: bodyFont, align: 'center', border: border });
    put2(sumRow, 4, drive.length, { font: bodyFont, align: 'center', border: border });
    put2(sumRow, 5, guide.length, { font: bodyFont, align: 'center', border: border });

    var buf = await wb.xlsx.writeBuffer();
    saveFile(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      'P5_PH1_근로자_퇴사자_명단_' + todayStr() + '.xlsx');
    toast('근무중 ' + workers.length + '명 · 퇴사 ' + resigned.length + '명 P5 PH1 명단 엑셀을 만들었습니다.', 3600);
  }

  /* ---------------- ZIP ---------------- */
  async function exportZip(rows) {    if (!rows.length) { toast('내보낼 인원이 없습니다.'); return; }
    if (!window.JSZip) { toast('압축 라이브러리를 불러오지 못했어요.', 3200); return; }
    var zip = new JSZip();
    var items = [];
    var nameCount = {};
    rows.forEach(function (r) {
      var map = filesOf(r);
      var base = r.name || '이름없음';
      nameCount[base] = (nameCount[base] || 0) + 1;
      var folder = nameCount[base] === 1 ? base : base + '(' + nameCount[base] + ')';
      DOC_TYPES.forEach(function (d) {
        var arr = map[d.key] || [];
        arr.forEach(function (f) {
          if (f && f.path) { items.push({ id: r.id, path: f.path, name: f.name, person: folder }); }
        });
      });
    });
    if (!items.length) { toast('내려받을 서류가 없습니다.'); return; }

    toast('서류 주소를 준비하는 중…', 4000);
    var signed = [];
    for (var i = 0; i < items.length; i += 100) {
      var chunk = items.slice(i, i + 100).map(function (it) { return { id: it.id, path: it.path, name: it.name }; });
      var d = await call('sign', { items: chunk });
      (d.items || []).forEach(function (x, k) { signed.push({ url: x.url, name: x.name, person: items[i + k].person }); });
    }

    var ok = 0, fail = 0;
    for (var j = 0; j < signed.length; j++) {
      var s = signed[j];
      if (!s.url) { fail++; continue; }
      try {
        var res = await fetch(s.url);
        if (!res.ok) { throw new Error('HTTP ' + res.status); }
        var blob = await res.blob();
        zip.file(s.person + '/' + s.name, blob);
        ok++;
      } catch (e) { fail++; }
      if ((j + 1) % 5 === 0) { toast('서류 받는 중… ' + (j + 1) + '/' + signed.length, 3000); }
    }

    if (!ok) { toast('파일을 내려받지 못했습니다. 잠시 뒤 다시 시도해 주세요.', 3600); return; }
    toast('ZIP 만드는 중…', 4000);
    var out = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, function (m) {
      if (m && m.percent) { /* 진행률 */ }
    });
    saveFile(out, '신규입사자_서류_' + todayStr() + '.zip');
    toast(ok + '개 파일을 ZIP으로 만들었습니다.' + (fail ? ' (' + fail + '개 실패)' : ''), 3600);
  }

  /* ---------------- 상태 변경 / 삭제 ---------------- */
  async function toggleStatus(id) {
    var r = rowById(id);
    if (!r) { return; }
    var next = r.status === 'hired' ? 'submitted' : 'hired';
    try {
      await call('set_status', { id: id, status: next });
      r.status = next;
      render();
      if ($('#detailModal').classList.contains('open')) { openDetail(id); }
      toast(next === 'hired' ? r.name + ' 님을 입사확정으로 표시했습니다.' : '입사확정을 취소했습니다.');
    } catch (e) { toast(e.message || '변경하지 못했습니다.', 3000); }
  }

  async function setState(id, target) {
    var r = rowById(id);
    if (!r) { return; }
    var cur = stateOf(r);
    var next = target;
    if (next === 'hold' && cur === 'hold') { next = 'plan'; }   // ⏸️ 다시 누르면 해제
    if (next === cur) { toast('이미 ' + STATE_LABEL[cur] + ' 상태입니다.'); return; }
    var labels = { plan: '입사예정', working: '입사확정(근무중)', hold: '입사보류', resigned: '퇴사' };
    try {
      if (next === 'resigned') {
        var td = todayISO();
        if (!confirm(r.name + ' 님을 퇴사 처리할까요?\n\n· 퇴사일자를 오늘(' + td + ')로 저장합니다.')) { return; }
        var d2 = await call('set_status', { id: id, status: 'resigned' });
        var p2 = (d2 && d2.patch) || {};
        r.status = 'resigned';
        r.resign_date = ('resign_date' in p2) ? (p2.resign_date || '') : (r.resign_date || td);
        if ('resigned_at' in p2) { r.resigned_at = p2.resigned_at || ''; }
      } else {
        var status = next === 'working' ? 'hired' : (next === 'hold' ? 'hold' : 'submitted');
        await call('set_status', { id: id, status: status });
        r.status = status;
        r.resigned_at = '';
        // 퇴사일자가 남아 있으면 목록에서는 계속 퇴사로 보이므로 같이 지운다
        if (String(r.resign_date || '').trim()) {
          await call('update_meta', { id: id, meta: { resign_date: '' } });
          r.resign_date = '';
        }
      }
      render();
      openDetail(id);
      toast(r.name + ' 님 상태를 ' + labels[next] + '로 바꿨습니다.');
    } catch (e) {
      toast(e.message || '상태를 바꾸지 못했습니다.', 3200);
    }
  }

  async function setArchived(rows, on) {
    if (!rows.length) { return; }
    var names = rows.map(function (r) { return r.name; }).join(', ');
    var ask = on
      ? '취합완료로 옮길까요?\n\n대상: ' + names + '\n\n· [취합완료] 탭으로 이동합니다. 서류는 그대로 보관됩니다.'
      : '진행중으로 되돌릴까요?\n\n대상: ' + names;
    if (!confirm(ask)) { return; }
    try {
      // 취합완료 = 서류접수완료 이므로 상태도 입사예정(submitted)으로 맞춤춥니다 (v10)
      if (on) {
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].status !== 'submitted') {
            await call('set_status', { id: rows[i].id, status: 'submitted' });
            rows[i].status = 'submitted';
          }
        }
      }
      var d = await call(on ? 'archive' : 'unarchive', { ids: rows.map(function (r) { return r.id; }) });
      var n = (d.results || []).filter(function (x) { return x.ok; }).length;
      S.sel = {};
      await refresh(true);
      toast((on ? '취합완료로 옮겼습니다' : '진행중으로 복구했습니다') + ' (' + n + '명)');
    } catch (e) {
      toast(e.message || '변경하지 못했습니다.', 3200);
    }
  }

  async function deleteRows(rows, askText) {
    if (!rows.length) { return; }
    var names = rows.map(function (r) { return r.name; }).join(', ');
    if (askText) {
      if (!confirm(askText + '\n\n대상: ' + names + '\n· 제출된 서류 파일과 기록이 함께 영구 삭제됩니다.')) { render(); return; }
    } else {
      var ask = '입사 취소 처리합니다.\n\n대상: ' + names + '\n\n· 제출된 서류 파일과 제출 기록이 모두 영구 삭제됩니다.\n· 되돌릴 수 없습니다.\n\n계속할까요?';
      if (!confirm(ask)) { return; }
      if (!confirm('마지막 확인입니다. ' + rows.length + '명의 서류를 정말 영구 삭제할까요?')) { return; }
    }
    try {
      var d = await call('delete_cancel', { ids: rows.map(function (r) { return r.id; }) });
      var doneIds = {};
      (d.results || []).forEach(function (x) { if (x.deleted) { doneIds[x.id] = true; } });
      S.rows = S.rows.filter(function (r) { return !doneIds[r.id]; });
      S.irisMiss = (S.irisMiss || []).filter(function (x) { return !doneIds[x.id]; });
      S.sel = {};
      render();
      if ($('#detailModal').classList.contains('open') && doneIds[S.detailId]) { closeModal('detailModal'); S.detailId = null; }
      toast(Object.keys(doneIds).length + '명의 서류와 기록을 삭제했습니다.');
    } catch (e) {
      toast(e.message || '삭제하지 못했습니다.', 3600);
    }
  }

  /* ---------------- 외주 업체 추가 ---------------- */
  async function addVendor() {
    var raw = prompt('추가할 외주 업체 이름을 적어 주세요.\n예) 한양, OO업체');
    if (raw === null) { return; }
    var name = String(raw).replace(/\s+/g, ' ').trim();
    if (!name) { toast('업체 이름을 입력해 주세요.'); return; }
    try {
      var d = await call('add_vendor', { vendor: name });
      S.vendors = Array.isArray(d.vendors) ? d.vendors : S.vendors;
      render();
      toast('업체 "' + name + '"을(를) 추가했습니다. 상세·직접추가 선택지에도 나옵니다.', 3200);
    } catch (e) {
      toast(e.message || '업체를 추가하지 못했습니다.', 3200);
    }
  }

  /* ---------------- 이벤트 ---------------- */
  $('#loginBtn').addEventListener('click', login);
  $('#ac').addEventListener('keydown', function (e) { if (e.key === 'Enter') { login(); } });
  $('#ap').addEventListener('input', function () { this.value = fmtPhone(this.value); });
  $('#logoutBtn').addEventListener('click', logout);
  $('#btnRefresh').addEventListener('click', function () { refresh(false); });
  $('#q').addEventListener('input', function () { S.q = this.value; render(); });
  /* 날짜 정렬 (v10) — 헤더 클릭 · 모바일 드롭다운 */
  $$('.tbl thead th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () { cycleSort(th.getAttribute('data-sort')); });
  });
  var ssort = $('#sortSel');
  if (ssort) {
    ssort.addEventListener('change', function () {
      var v = this.value;
      if (!v) { S.sort = { key: '', dir: 0 }; } else {
        var p = v.split(':');
        S.sort = { key: p[0], dir: Number(p[1]) || 1 };
      }
      render();
    });
  }
  /* 날짜만 골라 보기 (v10) */
  var dff = $('#dfField');
  if (dff) { dff.addEventListener('change', function () { S.dateField = this.value; render(); }); }
  var dfd = $('#dfDate');
  if (dfd) { dfd.addEventListener('change', function () { S.dateVal = this.value; render(); }); }
  var dfc = $('#dfClear');
  if (dfc) {
    dfc.addEventListener('click', function () {
      S.dateField = ''; S.dateVal = '';
      if (dff) { dff.value = ''; }
      if (dfd) { dfd.value = ''; }
      render();
    });
  }
  $('#chkAll').addEventListener('change', function () {
    var on = this.checked;
    filtered().forEach(function (r) { if (on) { S.sel[r.id] = true; } else { delete S.sel[r.id]; } });
    render();
  });
  /* [선택한 인원 처리 ▾] — 고르면 확인 후 바로 실행, 선택은 자동 해제 (v9) */
  $('#bulkSel').addEventListener('change', function () {
    var v = this.value;
    this.selectedIndex = 0;
    if (!v) { syncBulk(); return; }
    runBulk(v);
  });

  $('#list').addEventListener('click', function (e) {
    var t = e.target;
    var ve = t.closest('[data-vendor-edit]');
    if (ve) {
      e.stopPropagation(); e.preventDefault();
      openVendorEditor(ve.getAttribute('data-vendor-edit'));
      return;
    }
    var he = t.closest('[data-hire-edit]');
    if (he) {
      e.stopPropagation(); e.preventDefault();
      openHireEditor(he.getAttribute('data-hire-edit'));
      return;
    }
    var hc = t.closest('[data-hire-clear]');
    if (hc) {
      e.stopPropagation(); e.preventDefault();
      saveHire(hc.getAttribute('data-hire-clear'), '');
      return;
    }
    var ie = t.closest('[data-iris-edit]');
    if (ie) {
      e.stopPropagation(); e.preventDefault();
      openIrisEditor(ie.getAttribute('data-iris-edit'));
      return;
    }
    var ic = t.closest('[data-iris-clear]');
    if (ic) {
      e.stopPropagation(); e.preventDefault();
      saveIris(ic.getAttribute('data-iris-clear'), '');
      return;
    }
    var se = t.closest('[data-st-edit]');
    if (se) {
      e.stopPropagation(); e.preventDefault();
      openStateEditor(se.getAttribute('data-st-edit'));
      return;
    }
    var we = t.closest('[data-wage-edit]');
    if (we) {
      e.stopPropagation(); e.preventDefault();
      openWageEditor(we.getAttribute('data-wage-edit'));
      return;
    }
    var ws = t.closest('[data-wage-save]');
    if (ws) {
      e.stopPropagation(); e.preventDefault();
      var wid = ws.getAttribute('data-wage-save');
      var win = $('[data-wage-sel="' + wid + '"]');
      saveWage(wid, win ? win.value : '');
      return;
    }
    var wx = t.closest('[data-wage-cancel]');
    if (wx) { e.stopPropagation(); e.preventDefault(); render(); return; }
    var chk = t.closest('[data-check]');
    if (chk) {
      e.stopPropagation();
      var id = chk.getAttribute('data-check');
      if (chk.checked) { S.sel[id] = true; } else { delete S.sel[id]; }
      var row = chk.closest('tr');
      if (row) { row.classList.toggle('sel', !!S.sel[id]); }
      syncBulk();
      return;
    }
    var det = t.closest('[data-detail]');
    if (det) { e.stopPropagation(); openDetail(det.getAttribute('data-detail')); return; }
    var st = t.closest('[data-status]');
    if (st) { e.stopPropagation(); toggleStatus(st.getAttribute('data-status')); return; }
    var del = t.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      var r = rowById(del.getAttribute('data-del'));
      if (r) { deleteRows([r]); }
    }
  });

  /* 목록에서 바로 고치기 — 업체(select) · 입사일자(date) (v9) */
  $('#list').addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute) { return; }
    e.stopPropagation();
    var vs = t.getAttribute('data-vendor-sel');
    if (vs) { saveVendor(vs, t.value); return; }
    var hs = t.getAttribute('data-hire-sel');
    if (hs) { saveHire(hs, t.value); return; }
    var is = t.getAttribute('data-iris-sel');
    if (is) { saveIris(is, t.value); return; }
    var ss = t.getAttribute('data-st-sel');
    if (ss) { applyState(ss, t.value); return; }
  });
  $('#list').addEventListener('keydown', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute) { return; }
    var vs = t.getAttribute('data-vendor-sel');
    var hs = t.getAttribute('data-hire-sel');
    var is = t.getAttribute('data-iris-sel');
    var ss = t.getAttribute('data-st-sel');
    var ws = t.getAttribute('data-wage-sel');
    if (!vs && !hs && !is && !ss && !ws) { return; }
    if (e.key === 'Escape') { e.preventDefault(); render(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (vs) { saveVendor(vs, t.value); }
      else if (hs) { saveHire(hs, t.value); }
      else if (is) { saveIris(is, t.value); }
      else if (ss) { applyState(ss, t.value); }
      else { saveWage(ws, t.value); }
    }
  });
  /* 그냥 닫으면 저장하지 않고 원래 값으로 돌린다 */
  $('#list').addEventListener('blur', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute) { return; }
    if (!t.getAttribute('data-vendor-sel') && !t.getAttribute('data-hire-sel')
      && !t.getAttribute('data-iris-sel') && !t.getAttribute('data-st-sel') && !t.getAttribute('data-wage-sel')) { return; }
    setTimeout(function () {
      var a = document.activeElement;
      if (a && (a.getAttribute('data-vendor-sel') || a.getAttribute('data-hire-sel') || a.getAttribute('data-iris-sel')
        || a.getAttribute('data-st-sel') || a.getAttribute('data-wage-sel')
        || (a.closest && a.closest('.dinline,.winline')))) { return; }
      if (document.querySelector('[data-vendor-sel],[data-hire-sel],[data-iris-sel],[data-st-sel],[data-wage-sel]')) { render(); }
    }, 220);
  }, true);

  $('#btnExcel').addEventListener('click', function () {
    var rows = targets();
    toast(rows.length + '명 엑셀을 만드는 중…', 3000);
    exportExcel(rows).catch(function (e) { toast((e && e.message) || '엑셀을 만들지 못했습니다.', 3600); });
  });
  $('#btnP5').addEventListener('click', function () {
    exportP5().catch(function (e) { toast((e && e.message) || 'P5 PH1 명단 엑셀을 만들지 못했습니다.', 3600); });
  });
  $('#btnZip').addEventListener('click', function () {
    var rows = targets();
    exportZip(rows).catch(function (e) { toast((e && e.message) || 'ZIP을 만들지 못했습니다.', 3600); });
  });
  $$('#tabs .tab').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = b.getAttribute('data-tab');
      S.tab = ['archived', 'hold', 'hired', 'all', 'resigned'].indexOf(t) >= 0 ? t : 'active';
      S.sel = {};
      $$('#tabs .tab').forEach(function (x) { x.classList.toggle('on', x === b); });
      render();
    });
  });
  $('#filterPanel').addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute) { return; }
    if (t.getAttribute('data-fst')) { S.fStatus[t.getAttribute('data-fst')] = t.checked; }
    else if (t.getAttribute('data-fgd')) { S.fGender[t.getAttribute('data-fgd')] = t.checked; }
    else if (t.getAttribute('data-fvd')) { S.fVendor[t.getAttribute('data-fvd')] = t.checked; }
    else { return; }
    render();
  });
  $('#btnAddVendor').addEventListener('click', addVendor);
  $('#irisToggle').addEventListener('click', function () { IRIS_OPEN = !IRIS_OPEN; renderIris(); });
  $('#irisPanel').addEventListener('click', function (e) {
    var it = e.target.closest('[data-iri-detail]');
    if (it) { e.preventDefault(); openDetail(it.getAttribute('data-iri-detail')); }
  });
  $('#btnAdd').addEventListener('click', openAdd);
  $('#m_save').addEventListener('click', saveAdd);
  $('#m_job').addEventListener('change', function () { jobCustomToggle('#addModal'); });
  $('#m_phone').addEventListener('input', function () { this.value = fmtPhone(this.value); });
  $('#m_rrn').addEventListener('input', function () {
    var d = this.value.replace(/\D/g, '').slice(0, 13);
    this.value = d.length > 6 ? d.slice(0, 6) + '-' + d.slice(6) : d;
  });
  $('#detailBody').addEventListener('click', function (e) {
    var ms = e.target.closest('[data-metasave]');
    if (ms) { e.preventDefault(); saveMeta(S.detailId); return; }
    var ss = e.target.closest('[data-setstate]');
    if (ss) { e.preventDefault(); setState(S.detailId, ss.getAttribute('data-setstate')); return; }
    var qb = e.target.closest('[data-qual]');
    if (qb) { e.preventDefault(); toggleQual(S.detailId, qb.getAttribute('data-qual')); return; }
    var sc = e.target.closest('[data-stcancel]');
    if (sc) { e.preventDefault(); applyState(S.detailId, 'cancel'); return; }
    var na = e.target.closest('[data-noteadd]');
    if (na) { e.preventDefault(); addNote(S.detailId); return; }
    var nd = e.target.closest('[data-ndel]');
    if (nd) { e.preventDefault(); delNote(S.detailId, Number(nd.getAttribute('data-ndel'))); return; }
    var ed = e.target.closest('[data-fedit]');
    if (ed) {
      e.preventDefault();
      var key = S.detailId + ':' + ed.getAttribute('data-fedit');
      EDIT.key = (EDIT.key === key) ? '' : key;
      openDetail(S.detailId);
      return;
    }
    var sv = e.target.closest('[data-fsave]');
    if (sv) {
      e.preventDefault();
      var form = sv.closest('.feditform');
      if (form) { saveFileEdit(S.detailId, form.getAttribute('data-fidx')); }
      return;
    }
    var cx = e.target.closest('[data-fcancel]');
    if (cx) { e.preventDefault(); EDIT.key = ''; openDetail(S.detailId); return; }

    var fv = e.target.closest('[data-fview]');
    if (fv) { e.preventDefault(); openView(S.detailId, Number(fv.getAttribute('data-fview'))); return; }
    var uh = e.target.closest('[data-uphealth]');
    if (uh) {
      e.preventDefault();
      var hi = $('#upHealthIn');
      if (hi) { hi.value = ''; hi.click(); }
      return;
    }
    var uo = e.target.closest('[data-upother]');
    if (uo) {
      e.preventDefault();
      var f0 = $('#upOtherForm');
      if (f0) { f0.classList.toggle('hide'); }
      return;
    }
    var up = e.target.closest('[data-uppick]');
    if (up) {
      e.preventDefault();
      var oi = $('#upOtherIn');
      if (oi) { oi.value = ''; oi.click(); }
      return;
    }
    var ud = e.target.closest('[data-updel]');
    if (ud) {
      e.preventDefault();
      var di = Number(ud.getAttribute('data-updel'));
      UP.items.splice(di, 1);
      renderUpList();
      return;
    }
    if (e.target.closest('[data-upgo]')) { e.preventDefault(); uploadPending(); return; }

    var a = e.target.closest('[data-dl]');
    if (a) {
      e.preventDefault();
      var it = [{ id: a.getAttribute('data-id'), path: a.getAttribute('data-dl'), name: a.getAttribute('data-dlname') }];
      downloadSigned(it, a.getAttribute('data-dlname')).catch(function (err) { toast(err.message || '내려받지 못했습니다.', 3200); });
      return;
    }
    var all = e.target.closest('[data-dlall]');
    if (all) {
      var r = rowById(all.getAttribute('data-dlall'));
      if (r) { exportZip([r]).catch(function (err) { toast(err.message || '실패', 3200); }); }
      return;
    }
    var st = e.target.closest('[data-status]');
    if (st) { toggleStatus(st.getAttribute('data-status')); }
  });

  $$('.modal').forEach(function (m) {
    m.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]') || e.target.classList.contains('bg')) { closeModal(m.id); }
    });
  });

  // 특이사항 입력칸에서 Enter → 바로 추가
  $('#detailBody').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.id === 'noteInput') {
      e.preventDefault();
      addNote(S.detailId);
    }
  });

  /* 서류 추가 — 파일 선택 · 검진일자/종류 수정 */
  $('#detailBody').addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute) { return; }
    if (t.id === 'upHealthIn') {
      var hf = Array.prototype.slice.call(t.files || []);
      if (hf.length) { addPending('health', hf); }
      t.value = '';
      return;
    }
    if (t.id === 'upOtherIn') {
      var of = Array.prototype.slice.call(t.files || []);
      var sel = $('#upType');
      if (of.length) { addPending((sel && sel.value) || 'idcard', of); }
      t.value = '';
      return;
    }
    var fld = t.getAttribute('data-upfield');
    if (fld) {
      var i = Number(t.getAttribute('data-i'));
      var item = UP.items[i];
      if (!item) { return; }
      if (fld === 'date') { item.date = String(t.value || ''); }
      if (fld === 'type') { item.typeSel = String(t.value || ''); }
      renderUpList();
    }
  });

  /* 👁️ 보기 모달 — 닫을 때 PDF 캔버스 비우기 */
  (function () {
    var vm = document.getElementById('viewModal');
    if (!vm) { return; }
    var clear = function () {
      var b = document.getElementById('viewBody');
      if (b) { b.innerHTML = ''; }
    };
    vm.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]') || e.target.classList.contains('bg')) { clear(); }
    });
  })();

  /* ---------------- 시작 ---------------- */
  (function boot() {
    var saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(AUTH_KEY) || 'null'); } catch (e) { saved = null; }
    if (saved && saved.name && saved.phone && saved.passcode) {
      S.auth = saved;
      $('#an').value = saved.name;
      $('#ap').value = saved.phone;
      call('list').then(function (d) {
        S.rows = d.rows || [];
        S.vendors = Array.isArray(d.vendors) ? d.vendors : [];
        S.irisMiss = Array.isArray(d.unregistered_iris) ? d.unregistered_iris : [];
        showAdmin();
      }).catch(function () {
        S.auth = null;
        try { sessionStorage.removeItem(AUTH_KEY); } catch (e) {}
      });
    }
    setInterval(function () { if (S.auth && !S.busy && !document.hidden) { refresh(true); } }, 60000);
  })();
})();
