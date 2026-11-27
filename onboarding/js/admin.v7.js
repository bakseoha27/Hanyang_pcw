/* =========================================================
   관리자 페이지 — 조회 · 엑셀 취합 · ZIP 다운로드 · 입사취소 파기
   · 브라우저에는 anon 키만 있고, 실제 조회·다운로드는
     Edge Function(onboarding-admin)이 서비스롤 키로 처리합니다.
   ========================================================= */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var S = {
    auth: null,
    rows: [],
    vendors: [],
    sel: {},
    q: '',
    tab: 'active',
    fStatus: {},
    fGender: {},
    fVendor: {},
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
    return !!String(r.resign_date || '').trim() || r.status === 'resigned';
  }
  // 입사예정 / 근무중 / 퇴사 — DB status 대신 퇴사일자까지 함께 본다
  function stateOf(r) {
    if (isResigned(r)) { return 'resigned'; }
    return r.status === 'hired' ? 'working' : 'plan';
  }
  var STATE_LABEL = { plan: '입사예정', working: '근무중', resigned: '퇴사' };
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
  function tabRows() {
    if (S.tab === 'all') { return S.rows.slice(); }
    var want = S.tab === 'archived';
    return S.rows.filter(function (r) { return isArchived(r) === want; });
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
    var q = S.q.trim().toLowerCase();
    if (!q) { return rows; }
    return rows.filter(function (r) {
      return [r.name, r.phone, r.job_role, r.bank, r.referrer, vendorOf(r), notesText(r)]
        .join(' ').toLowerCase().indexOf(q) >= 0;
    });
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
    $('#fStatus').innerHTML = ['plan', 'working', 'resigned'].map(function (k) {
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

  function render() {
    var rows = filtered();
    var list = $('#list');
    var tab = tabRows();

    // 탭 인원 수 + 현재 탭 기준 통계
    var nActive = S.rows.filter(function (r) { return !isArchived(r); }).length;
    var nArchived = S.rows.filter(function (r) { return isArchived(r); }).length;
    $('#cntActive').textContent = nActive;
    $('#cntArchived').textContent = nArchived;
    $('#cntAll').textContent = S.rows.length;
    $('#statAll').textContent = tab.length;
    $('#statMiss').textContent = tab.filter(function (r) { return missingOf(r).length > 0; }).length;
    var t = new Date(); t.setHours(0, 0, 0, 0);
    $('#statToday').textContent = tab.filter(function (r) { return new Date(r.created_at) >= t; }).length;

    var arch = S.tab === 'archived';
    $('#btnArchive').style.display = arch ? 'none' : '';
    $('#btnRestore').style.display = (arch || S.tab === 'all') ? '' : 'none';
    $('#empty').textContent = arch ? '취합완료된 인원이 없습니다.'
      : (S.tab === 'all' ? '등록된 인원이 없습니다.' : '아직 제출된 서류가 없습니다.');
    renderFilters();

    if (!rows.length) {
      list.innerHTML = '';
      $('#empty').classList.remove('hide');
      $('#empty').textContent = (S.tab === 'all' && picked(S.fStatus).length + picked(S.fGender).length + picked(S.fVendor).length)
        ? '조건에 맞는 인원이 없습니다.' : $('#empty').textContent;
      $('#chkAll').checked = false;
      return;
    }
    $('#empty').classList.add('hide');

    list.innerHTML = rows.map(function (r) {
      var miss = missingOf(r);
      var tags = '';
      var st = stateOf(r);
      tags += '<span class="tag st ' + st + '">' + esc(STATE_LABEL[st]) + '</span>';
      if (isArchived(r)) { tags += '<span class="tag hired">취합완료</span>'; }
      if (miss.length) { tags += '<span class="tag miss" title="미제출: ' + esc(miss.join(', ')) + '">미비 ' + miss.length + '</span>'; }
      var vn = vendorOf(r);
      var out = vn ? '<span class="tag vendor' + (vn === '외주' ? ' out' : '') + '">' + esc(vn) + '</span>' : '';
      var notes = notesOf(r);
      var lastNote = notes.length ? String(notes[notes.length - 1].text || '') : '';
      var noteCell = notes.length
        ? '<span class="noteTag" title="' + esc(notesText(r)) + '">📝 ' + notes.length + '</span> <small style="color:#667085">' + esc(lastNote.length > 12 ? lastNote.slice(0, 12) + '…' : lastNote) + '</small>'
        : '';
      return '<tr data-id="' + r.id + '"' + (S.sel[r.id] ? ' class="sel"' : '') + '>'
        + '<td class="c-chk"><input type="checkbox" data-check="' + r.id + '" ' + (S.sel[r.id] ? 'checked' : '') + '></td>'
        + '<td class="c-name">' + out + '<b>' + esc(r.name) + '</b>' + tags + '</td>'
        + '<td>' + esc(birthText(r)) + '</td>'
        + '<td>' + esc(fmtPhone(r.phone)) + '</td>'
        + '<td>' + esc(r.hire_date || '') + '</td>'
        + '<td>' + esc(r.resign_date || '') + '</td>'
        + '<td class="num">' + esc(wageNum(r.daily_wage)) + '</td>'
        + '<td>' + esc(genderOf(r)) + '</td>'
        + '<td class="c-note">' + noteCell + '</td>'
        + '<td class="c-act">'
        + '<button type="button" data-detail="' + r.id + '">상세</button>'
        + '<button type="button" data-status="' + r.id + '">' + (r.status === 'hired' ? '확정취소' : '확정') + '</button>'
        + '<button type="button" class="del" data-del="' + r.id + '">삭제</button>'
        + '</td>'
        + '</tr>';
    }).join('');

    $('#chkAll').checked = rows.length > 0 && rows.every(function (r) { return S.sel[r.id]; });
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
      ['입사일자', r.hire_date],
      ['퇴사일자', r.resign_date],
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
      + '<div class="field"><label>입사일자</label><input type="date" data-meta="hire_date" value="' + esc(r.hire_date || '') + '"></div>'
      + '<div class="field"><label>퇴사일자</label><input type="date" data-meta="resign_date" value="' + esc(r.resign_date || '') + '">'
      + '<button type="button" class="btn sm gray" data-resign="1" style="width:100%;height:32px;font-size:11.5px;margin-top:4px;border-radius:8px">오늘 퇴사 처리</button></div>'
      + '<div class="field"><label>단가</label><input type="text" data-meta="daily_wage" value="' + esc(r.daily_wage || '') + '" placeholder="예) 180000 / 미기재"></div>'
      + '<div class="field"><label>직종</label>'
      + '<select data-meta="job_role" data-jobsel>' + jobOptions(jobText(r)) + '</select>'
      + '<input type="text" data-jobcustom value="' + esc(jobSplit(jobText(r)).custom) + '" placeholder="직종 직접 입력" maxlength="20"'
      + (jobSplit(jobText(r)).sel === '__custom' ? '' : ' style="display:none"') + '></div>'
      + '</div>'
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
      await call('update_meta', { id: id, meta: meta });
      Object.keys(meta).forEach(function (k) { r[k] = meta[k]; });
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
    var tag = document.querySelector('script[src*="js/admin.v7.js"]');
    return (tag && tag.src) ? tag.src.replace(/js\/admin\.v7\.js.*$/, '') : '';
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
    ['m_name', 'm_rrn', 'm_birth', 'm_phone', 'm_hire', 'm_resign', 'm_wage', 'm_referrer', 'm_note', 'm_job_custom'].forEach(function (k) {
      var el = $('#' + k); if (el) { el.value = ''; }
    });
    $('#m_gender').value = '';
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
      resign_date: $('#m_resign').value,
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

  /* ---------------- ZIP ---------------- */
  async function exportZip(rows) {
    if (!rows.length) { toast('내보낼 인원이 없습니다.'); return; }
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

  async function setArchived(rows, on) {
    if (!rows.length) { return; }
    var names = rows.map(function (r) { return r.name; }).join(', ');
    var ask = on
      ? '취합완료로 옮길까요?\n\n대상: ' + names + '\n\n· [취합완료] 탭으로 이동합니다. 서류는 그대로 보관됩니다.'
      : '진행중으로 되돌릴까요?\n\n대상: ' + names;
    if (!confirm(ask)) { return; }
    try {
      var d = await call(on ? 'archive' : 'unarchive', { ids: rows.map(function (r) { return r.id; }) });
      var n = (d.results || []).filter(function (x) { return x.ok; }).length;
      S.sel = {};
      await refresh(true);
      toast((on ? '취합완료로 옮겼습니다' : '진행중으로 복구했습니다') + ' (' + n + '명)');
    } catch (e) {
      toast(e.message || '변경하지 못했습니다.', 3200);
    }
  }

  async function deleteRows(rows) {
    if (!rows.length) { return; }
    var names = rows.map(function (r) { return r.name; }).join(', ');
    var ask = '입사 취소 처리합니다.\n\n대상: ' + names + '\n\n· 제출된 서류 파일과 제출 기록이 모두 영구 삭제됩니다.\n· 되돌릴 수 없습니다.\n\n계속할까요?';
    if (!confirm(ask)) { return; }
    if (!confirm('마지막 확인입니다. ' + rows.length + '명의 서류를 정말 영구 삭제할까요?')) { return; }
    try {
      var d = await call('delete_cancel', { ids: rows.map(function (r) { return r.id; }) });
      var doneIds = {};
      (d.results || []).forEach(function (x) { if (x.deleted) { doneIds[x.id] = true; } });
      S.rows = S.rows.filter(function (r) { return !doneIds[r.id]; });
      S.sel = {};
      render();
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
  $('#chkAll').addEventListener('change', function () {
    var on = this.checked;
    filtered().forEach(function (r) { if (on) { S.sel[r.id] = true; } else { delete S.sel[r.id]; } });
    render();
  });
  $('#btnExcel').addEventListener('click', function () {
    var rows = targets();
    toast(rows.length + '명 엑셀을 만드는 중…', 3000);
    exportExcel(rows).catch(function (e) { toast((e && e.message) || '엑셀을 만들지 못했습니다.', 3600); });
  });
  $('#btnZip').addEventListener('click', function () {
    var rows = targets();
    exportZip(rows).catch(function (e) { toast((e && e.message) || 'ZIP을 만들지 못했습니다.', 3600); });
  });
  $$('#tabs .tab').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = b.getAttribute('data-tab');
      S.tab = (t === 'archived' || t === 'all') ? t : 'active';
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
  $('#btnAdd').addEventListener('click', openAdd);
  $('#m_save').addEventListener('click', saveAdd);
  $('#m_job').addEventListener('change', function () { jobCustomToggle('#addModal'); });
  $('#m_phone').addEventListener('input', function () { this.value = fmtPhone(this.value); });
  $('#m_rrn').addEventListener('input', function () {
    var d = this.value.replace(/\D/g, '').slice(0, 13);
    this.value = d.length > 6 ? d.slice(0, 6) + '-' + d.slice(6) : d;
  });
  $('#btnArchive').addEventListener('click', function () {
    var rows = S.rows.filter(function (r) { return S.sel[r.id]; });
    if (!rows.length) { toast('취합완료로 옮길 사람을 먼저 체크해 주세요.', 3000); return; }
    setArchived(rows, true);
  });
  $('#btnRestore').addEventListener('click', function () {
    var rows = S.rows.filter(function (r) { return S.sel[r.id]; });
    if (!rows.length) { toast('진행중으로 복구할 사람을 먼저 체크해 주세요.', 3000); return; }
    setArchived(rows, false);
  });
  $('#btnDelete').addEventListener('click', function () {
    var rows = S.rows.filter(function (r) { return S.sel[r.id]; });
    if (!rows.length) { toast('삭제할 사람을 먼저 체크해 주세요.', 3000); return; }
    deleteRows(rows);
  });

  $('#list').addEventListener('click', function (e) {
    var t = e.target;
    var chk = t.closest('[data-check]');
    if (chk) {
      var id = chk.getAttribute('data-check');
      if (chk.checked) { S.sel[id] = true; } else { delete S.sel[id]; }
      var row = chk.closest('.srow');
      if (row) { row.classList.toggle('sel', !!S.sel[id]); }
      return;
    }
    var det = t.closest('[data-detail]');
    if (det) { openDetail(det.getAttribute('data-detail')); return; }
    var st = t.closest('[data-status]');
    if (st) { toggleStatus(st.getAttribute('data-status')); return; }
    var del = t.closest('[data-del]');
    if (del) {
      var r = rowById(del.getAttribute('data-del'));
      if (r) { deleteRows([r]); }
    }
  });

  $('#detailBody').addEventListener('click', function (e) {
    var ms = e.target.closest('[data-metasave]');
    if (ms) { e.preventDefault(); saveMeta(S.detailId); return; }
    var rs = e.target.closest('[data-resign]');
    if (rs) {
      e.preventDefault();
      var dEl = $('#detailBody [data-meta="resign_date"]');
      if (!dEl) { return; }
      var td = todayISO();
      if (!confirm('퇴사일자를 오늘(' + td + ')로 저장할까요?\n\n저장하면 목록과 [전체] 탭에서 상태가 퇴사로 표시됩니다.')) { return; }
      dEl.value = td;
      saveMeta(S.detailId);
      return;
    }
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
        showAdmin();
      }).catch(function () {
        S.auth = null;
        try { sessionStorage.removeItem(AUTH_KEY); } catch (e) {}
      });
    }
    setInterval(function () { if (S.auth && !S.busy && !document.hidden) { refresh(true); } }, 60000);
  })();
})();
