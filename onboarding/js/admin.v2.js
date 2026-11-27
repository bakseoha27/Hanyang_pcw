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
    sel: {},
    q: '',
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
    var phone = fmtPhone($('#ap').value);
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
  function filtered() {
    var q = S.q.trim().toLowerCase();
    if (!q) { return S.rows; }
    return S.rows.filter(function (r) {
      return [r.name, r.phone, r.job_role, r.bank].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }

  function render() {
    var rows = filtered();
    var list = $('#list');
    var all = S.rows;
    $('#statAll').textContent = all.length;
    $('#statMiss').textContent = all.filter(function (r) { return missingOf(r).length > 0; }).length;
    var t = new Date(); t.setHours(0, 0, 0, 0);
    $('#statToday').textContent = all.filter(function (r) { return new Date(r.created_at) >= t; }).length;

    if (!rows.length) {
      list.innerHTML = '';
      $('#empty').classList.remove('hide');
      $('#chkAll').checked = false;
      return;
    }
    $('#empty').classList.add('hide');

    list.innerHTML = rows.map(function (r) {
      var map = filesOf(r);
      var miss = missingOf(r);
      var dots = DOC_TYPES.map(function (d) {
        return '<span class="dot ' + (firstOf(map, d.key) ? 'ok' : '') + '" title="' + esc(d.label) + '">' + esc(d.label) + (map[d.key] && map[d.key].length > 1 ? ' ' + map[d.key].length : '') + '</span>';
      }).join('');
      var tags = '<span class="tag job">' + esc(r.job_role || '직종 미기재') + '</span>';
      if (r.status === 'hired') { tags += '<span class="tag hired">입사확정</span>'; }
      if (miss.length) { tags += '<span class="tag miss">미비 ' + miss.length + '</span>'; }
      return ''
        + '<div class="srow' + (S.sel[r.id] ? ' sel' : '') + '" data-id="' + r.id + '">'
        + '<input type="checkbox" data-check="' + r.id + '" ' + (S.sel[r.id] ? 'checked' : '') + '>'
        + '<div class="grow">'
        + '<div class="nm"><b>' + esc(r.name) + '</b>' + tags + '</div>'
        + '<div class="ln">' + esc(fmtPhone(r.phone)) + ' · ' + esc(dstr(r.created_at)) + '</div>'
        + (miss.length ? '<div class="ln" style="color:#B42318">미제출: ' + esc(miss.join(', ')) + '</div>' : '')
        + '<div class="dots">' + dots + '</div>'
        + '</div>'
        + '<div class="acts">'
        + '<button type="button" data-detail="' + r.id + '">상세</button>'
        + '<button type="button" data-status="' + r.id + '">' + (r.status === 'hired' ? '확정취소' : '입사확정') + '</button>'
        + '<button type="button" class="del" data-del="' + r.id + '">삭제</button>'
        + '</div>'
        + '</div>';
    }).join('');

    $('#chkAll').checked = rows.length > 0 && rows.every(function (r) { return S.sel[r.id]; });
  }

  function rowById(id) {
    for (var i = 0; i < S.rows.length; i++) { if (S.rows[i].id === id) { return S.rows[i]; } }
    return null;
  }

  function targets() {
    var ids = Object.keys(S.sel).filter(function (k) { return S.sel[k]; });
    if (!ids.length) { return S.rows.slice(); }
    return S.rows.filter(function (r) { return S.sel[r.id]; });
  }

  /* 상세 — 파일 이름 · 검진일/종류 수정 */
  var EDIT = { key: '' };

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
      ['주민등록번호', r.rrn],
      ['주소', r.address],
      ['휴대폰', fmtPhone(r.phone) + (r.phone_os ? ' (' + r.phone_os + ')' : '')],
      ['본인 명의', r.phone_self_owned],
      ['숙소', r.housing],
      ['은행 / 계좌', (r.bank || '') + ' ' + (r.account_number || '')],
      ['직종', r.job_role],
      ['단가', r.daily_wage ? Number(r.daily_wage).toLocaleString('ko-KR') + '원' : ''],
      ['총 경력', r.total_career],
      ['반도체 경력', r.semi_career],
      ['이메일', r.email],
      ['혈액형', r.blood_type],
      ['조끼 / 안전화', (r.vest_size || '') + ' / ' + (r.shoe_size || '')],
      ['보안경', r.glasses_type],
      ['보유 자격', (Array.isArray(r.certs) ? r.certs.join(', ') : '')],
      ['건강검진', examText(r, map)],
      ['제출일', dstr(r.created_at)],
      ['상태', r.status === 'hired' ? '입사확정' : '제출'],
      ['동의', '개인정보 ' + dstr(r.agreed_privacy_at) + ' · 고유식별 ' + dstr(r.agreed_unique_id_at) + ' · 민감정보 ' + dstr(r.agreed_sensitive_at)]
    ];
    var h = '<dl class="kv">';
    kv.forEach(function (p) {
      if (p[0] === '숙소' && !p[1]) { return; }
      h += '<dt>' + esc(p[0]) + '</dt><dd>' + (p[1] ? esc(p[1]) : '<span style="color:#98A2B3">—</span>') + '</dd>';
    });
    h += '</dl>';

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
          + '<button type="button" data-fedit="' + idx + '" title="파일 이름 수정">✎</button>'
          + '</div>';
        if (EDIT.key === r.id + ':' + idx) { h += editForm(r, idx, f); }
      });
    });
    h += '</div>';

    h += '<div class="toolbar" style="margin-top:14px">'
      + '<button class="btn sm gray" data-dlall="' + esc(r.id) + '" style="width:auto;padding:0 14px">📦 이 사람 서류 ZIP</button>'
      + '<button class="btn sm gray" data-status="' + esc(r.id) + '" style="width:auto;padding:0 14px">' + (r.status === 'hired' ? '입사확정 취소' : '입사확정') + '</button>'
      + '</div>';

    $('#detailTitle').textContent = r.name + ' 님 제출 정보';
    S.detailId = id;
    $('#detailBody').innerHTML = h;
    openModal('detailModal');
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
    { key: 'rrn',           w: 13.9, t: '주민번호',        a: 'center' },
    { key: 'hire_date',     w: 13.1, t: '입사일자',        a: 'center' },
    { key: 'address',       w: 52.0, t: '주소',           a: 'left' },
    { key: 'phone_os',      w: 10.4, t: '핸드폰기종',      a: 'center' },
    { key: 'phone',         w: 14.1, t: '휴대폰',          a: 'center' },
    { key: 'daily_wage',    w: 9.5,  t: '월급/일당',       a: 'right' },
    { key: 'bank',          w: 11.0, t: '은행명',          a: 'center' },
    { key: 'account_number',w: 18.9, t: '계좌번호',        a: 'center' },
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
    /* ↓ 여기부터 서류 제출 현황 (온보딩에서 추가) */
    { key: 'd_idcard',      w: 8.0,  t: '신분증',          a: 'center' },
    { key: 'd_edu',         w: 9.0,  t: '기초이수증',       a: 'center' },
    { key: 'd_bank',        w: 9.0,  t: '통장사본',         a: 'center' },
    { key: 'd_photo',       w: 9.0,  t: '증명사진',         a: 'center' },
    { key: 'd_health',      w: 9.0,  t: '건강검진',         a: 'center' },
    { key: 'd_opinion',     w: 8.0,  t: '소견서',          a: 'center' },
    { key: 'd_medicine',    w: 8.0,  t: '약봉투',          a: 'center' },
    { key: 'd_career',      w: 10.0, t: '경력증명서',       a: 'center' },
    { key: 'exam',          w: 12.0, t: '검진일 / 종류',    a: 'center' },
    { key: 'created',       w: 17.0, t: '제출일',          a: 'center' },
    { key: 'status',        w: 10.0, t: '상태',           a: 'center' },
    { key: 'ag1',           w: 17.0, t: '개인정보 동의',    a: 'center' },
    { key: 'ag2',           w: 17.0, t: '고유식별 동의',    a: 'center' },
    { key: 'ag3',           w: 17.0, t: '민감정보 동의',    a: 'center' }
  ];

  function rowValues(r, i) {
    var map = filesOf(r);
    var yn = function (k) { return map[k] ? 'O' : 'X'; };
    return {
      no: i + 1,
      name: r.name || '',
      rrn: r.rrn || '',
      hire_date: '',
      address: r.address || '',
      phone_os: r.phone_os || '',
      phone: fmtPhone(r.phone),
      daily_wage: r.daily_wage ? Number(r.daily_wage) : null,
      bank: r.bank || '',
      account_number: r.account_number || '',
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
      d_idcard: yn('idcard'), d_edu: yn('edu'), d_bank: yn('bank'), d_photo: yn('photo'),
      d_health: yn('health'), d_opinion: yn('opinion'), d_medicine: yn('medicine'), d_career: yn('career'),
      exam: examText(r, map),
      created: dstr(r.created_at),
      status: r.status === 'hired' ? '입사확정' : '제출',
      ag1: dstr(r.agreed_privacy_at),
      ag2: dstr(r.agreed_unique_id_at),
      ag3: dstr(r.agreed_sensitive_at)
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
      row.height = 18;
      row.eachCell({ includeEmpty: true }, function (cell, col) {
        var c = COLS[col - 1];
        cell.border = border;
        cell.font = bodyFont;
        cell.alignment = { horizontal: c.a, vertical: 'middle', wrapText: c.key === 'address' || c.key === 'certs' };
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
        showAdmin();
      }).catch(function () {
        S.auth = null;
        try { sessionStorage.removeItem(AUTH_KEY); } catch (e) {}
      });
    }
    setInterval(function () { if (S.auth && !S.busy && !document.hidden) { refresh(true); } }, 60000);
  })();
})();
