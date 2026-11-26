/* =========================================================
   화면 렌더링
   ========================================================= */
var ADMIN_TABS = [['dash', '전체 현황', '📊'], ['teams', '팀·조', '🧩'], ['reports', '작업일보함', '📥'], ['docs', '현장자료', '📁']];
var TABS = {
  worker: [['home', '근태', '🕒'], ['report', '작업일보', '📝']],
  admin: ADMIN_TABS,
  manager: ADMIN_TABS
};

function render() {
  if (!state.ready) {
    $('#topbar').innerHTML = '<div class="tb-row">' + topBrandHTML() + '</div>';
    $('#screen').innerHTML = '<div class="card" style="margin:14px 0"><div class="empty"><span class="e-ic">⏳</span>현장 데이터를 불러오는 중입니다…</div></div>';
    $('#tabbar').innerHTML = '';
    renderSync();
    return;
  }
  if (!state.auth || !me()) {
    renderLoginTop();
    $('#screen').innerHTML = loginView();
    $('#tabbar').innerHTML = '';
    renderSync();
    resetScrollOnce('login');
    return;
  }
  if (state.role === 'admin' && !canAdmin()) { state.role = canManage() ? 'manager' : 'worker'; }
  if (state.role === 'manager' && !canManage()) { state.role = 'worker'; }

  renderTop();
  var key = state.role === 'worker' ? 'workerTab' : 'adminTab';
  var valid = TABS[state.role].map(function (t) { return t[0]; });
  if (valid.indexOf(state.ui[key]) < 0) { state.ui[key] = valid[0]; }
  var html = state.role === 'worker' ? workerView() : adminView();
  $('#screen').innerHTML = html;
  renderTabs();
  renderSync();
  applyNameFilters();
  resetScrollOnce(state.role + ':' + state.ui[key]);
  /* 관리자·팀장 : 아직 확인하지 않은 휴무 보고가 있으면 알람 시트를 띄운다 (진입 · 20초 자동 새로고침 공통) */
  if (state.role !== 'worker' && canManage()) { setTimeout(maybeShowLeaveAlarm, 120); }
}

var lastViewKey = null;
function resetScrollOnce(k) {
  if (lastViewKey === k) { return; }
  lastViewKey = k;
  try { window.scrollTo(0, 0); } catch (e) { /* noop */ }
}

/* ---------- 연결 상태 줄 ---------- */
function renderSync() {
  var el = $('#syncbar');
  if (!el) { return; }
  var n = outboxCount();
  var s = state.sync || {};
  var cls = 'syncbar';
  var text = '';
  if (s.phase === 'loading') { cls += ' load'; text = '☁️ Supabase 연결 중…'; }
  else if (s.phase === 'cache') { cls += ' warn'; text = '⚠️ 연결 끊김 · 저장된 화면 (' + (n ? '저장 대기 ' + n + '건' : '전송 대기 없음') + ')'; }
  else if (s.phase === 'err') { cls += ' bad'; text = '⚠️ 서버에 저장하지 못했어요 · 다시 시도 중 (' + (n ? n + '건 대기' : s.err || '') + ')'; }
  else if (n) { cls += ' warn'; text = '📤 저장 대기 ' + n + '건 · 연결되면 자동 전송됩니다'; }
  else { cls += ' ok'; text = '☁️ Supabase 연결됨' + (s.at ? ' · ' + kstHM(s.at) + ' 동기화' : ''); }
  el.className = cls;
  el.innerHTML = '<button class="sync-btn" data-act="refreshNow">' + text + ' <span class="sync-ic">⟳</span></button>';
}

function topBrandHTML() {
  return '<div class="brand"><div class="brand-mark">한</div><div>' +
    '<div class="brand-title">한양 pcw팀</div>' +
    '<div class="brand-sub">한양이엔지(주) PCW · ' + shortDate(todayKey()) + ' (' + wd(todayKey()) + ')</div>' +
    '</div></div>';
}

function renderLoginTop() {
  $('#topbar').innerHTML = '<div class="tb-row">' + topBrandHTML() + '</div>';
}

function renderTop() {
  var p = me();
  if (!p) { renderLoginTop(); return; }
  /* 역할 전환 : 헤더 우측(⚙️ 왼쪽)의 컴팩트 버튼 한 개 + 선택 메뉴
     - 관리자 계정 : 관리자 | 팀장 | 기술인
     - 실제 팀장   : 팀장 | 기술인
     - 일반 기술인 : 버튼 없음 */
  var pairs = roleChoices(p);
  var roleChip = '';
  if (pairs.length > 1) {
    var cur = pairs.filter(function (x) { return x[0] === state.role; })[0] || pairs[0];
    roleChip = '<button class="role-chip" data-act="roleMenu" aria-label="화면 전환 · 지금 ' + cur[1] + '">' +
      '<span class="rc-lab">' + cur[1] + '</span><span class="rc-car">▾</span></button>';
  }
  $('#topbar').innerHTML =
    '<div class="tb-row">' +
    topBrandHTML() +
    '<div class="tb-btns">' +
    roleChip +
    '<button class="tb-ic" data-act="openSettings" title="내 정보" aria-label="내 정보">⚙️</button>' +
    '</div>' +
    '</div>';
}

/* 지금 계정이 고를 수 있는 화면 목록 [역할키, 표시이름, 설명] */
function roleChoices(p) {
  if (!p) { return []; }
  if (p.admin) {
    return [['admin', '관리자', '모든 기능 · 단가 · 권한 · 암호'],
      ['manager', '팀장', '현황 · 일보 · 일정 · 공수표 (단가 제외)'],
      ['worker', '기술인', '내 근태 · 작업일보 · 내 정보']];
  }
  if (p.role === 'leader') {
    return [['manager', '팀장', '현황 · 일보 · 일정 · 공수표 (단가 제외)'],
      ['worker', '기술인', '내 근태 · 작업일보 · 내 정보']];
  }
  return [];
}

function openRoleMenu() {
  var p = me();
  var list = roleChoices(p);
  if (list.length < 2) { return; }
  var body = '<div class="muted" style="margin:-4px 0 10px">보고 싶은 화면을 골라 주세요. 고른 화면은 앱을 다시 열어도 유지됩니다.</div>' +
    '<div class="role-list">' + list.map(function (x) {
      var on = state.role === x[0];
      return '<button class="role-opt' + (on ? ' on' : '') + '" data-act="role" data-role="' + x[0] + '">' +
        '<span class="ro-main"><span class="ro-t">' + x[1] + '</span><span class="ro-s">' + x[2] + '</span></span>' +
        '<span class="ro-ck">' + (on ? '✓' : '') + '</span></button>';
    }).join('') + '</div>';
  openSheet('화면 전환', body, '<button class="btn btn-ghost" data-act="closeSheet">닫기</button>');
}

function renderTabs() {
  var list = TABS[state.role];
  var key = state.role === 'worker' ? 'workerTab' : 'adminTab';
  var cur = state.ui[key];
  $('#tabbar').innerHTML = list.map(function (t) {
    var on = cur === t[0] ? ' active' : '';
    return '<button class="tab' + on + '" data-act="tab" data-tab="' + t[0] + '">' +
      '<span class="ic">' + t[2] + '</span><span class="lb">' + t[1] + '</span></button>';
  }).join('');
}

/* =========================================================
   이름 검색 · 공수 일괄 적용 (관리자·팀장 200명 규모)
   ========================================================= */
var NAME_LISTS = ['dash', 'gongsu', 'teams'];
function normNameQ(s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); }
function nameQuery(key) { return normNameQ(state.ui['q_' + key]); }
function nameSearchHTML(key, ph) {
  var v = state.ui['q_' + key] || '';
  return '<div class="name-search">' +
    '<span class="ns-ic">🔍</span>' +
    '<input class="ns-in" data-search="' + key + '" value="' + esc(v) + '" placeholder="' +
    (ph || '이름 검색...') + '" autocomplete="off" inputmode="search" aria-label="이름 검색">' +
    '<button class="ns-clr' + (v ? '' : ' hide') + '" data-act="searchClear" data-search="' + key + '" aria-label="검색어 지우기">×</button>' +
    '</div>';
}
function applyNameFilters() {
  NAME_LISTS.forEach(function (key) {
    var q = nameQuery(key);
    var box = document.querySelector('[data-list="' + key + '"]');
    if (!box) { return; }
    var items = box.querySelectorAll('[data-name]');
    var shown = 0;
    Array.prototype.forEach.call(items, function (el) {
      var hit = !q || normNameQ(el.getAttribute('data-name')).indexOf(q) >= 0;
      el.classList.toggle('q-hide', !hit);
      if (hit) { shown++; }
    });
    /* 팀·조 카드 : 조원이 모두 걸러지면 카드도 숨김 */
    var cards = box.querySelectorAll('[data-teamcard]');
    Array.prototype.forEach.call(cards, function (card) {
      var chips = card.querySelectorAll('.chips [data-name]');
      if (!chips.length) { return; }
      var any = Array.prototype.some.call(chips, function (c) { return !c.classList.contains('q-hide'); });
      card.classList.toggle('q-hide', !!q && !any);
    });
    /* 한달 공수표 : 이름 열만 남기고 계(합계) 다시 계산 */
    var table = box.querySelector('table.gs-table');
    if (table) { filterGsTable(table, q); shown = table.querySelectorAll('thead th[data-name]:not(.q-hide)').length || (q ? 0 : items.length); }
    var empty = box.querySelector('.q-empty');
    if (empty) { empty.classList.toggle('hide', !q || shown > 0); }
    var cnt = document.querySelector('[data-count="' + key + '"]');
    if (cnt) { cnt.textContent = q ? shown + '명 표시 / 전체 ' + items.length + '명' : items.length + '명'; }
  });
  syncBulkUI();
}
function filterGsTable(table, q) {
  var head = table.querySelector('thead tr');
  if (!head) { return; }
  var ths = Array.prototype.slice.call(head.querySelectorAll('th[data-name]'));
  var show = ths.map(function (th) { return !q || normNameQ(th.getAttribute('data-name')).indexOf(q) >= 0; });
  ths.forEach(function (th, i) { th.classList.toggle('q-hide', !show[i]); });
  var rows = table.querySelectorAll('tbody tr');
  Array.prototype.forEach.call(rows, function (tr) {
    var cells = tr.children;
    show.forEach(function (on, i) { if (cells[i + 1]) { cells[i + 1].classList.toggle('q-hide', !on); } });
    var last = cells[cells.length - 1];
    if (!last) { return; }
    var sum = 0, any = false;
    for (var i = 1; i < cells.length - 1; i++) {
      if (cells[i].classList.contains('q-hide')) { continue; }
      var v = parseFloat(cells[i].getAttribute('data-v'));
      if (!isNaN(v)) { sum += v; any = true; }
    }
    if (any) { last.textContent = sum ? fmtGs(Math.round(sum * 1000) / 1000) : '·'; }
  });
}
function syncBulkUI() {
  var n = Object.keys(bulkSel).length;
  var c = document.getElementById('bulkCnt');
  if (c) { c.textContent = n + '명 선택'; }
  var b = document.getElementById('bulkAllBtn');
  if (!b) { return; }
  var box = document.querySelector('[data-list="dash"]');
  var chks = box ? box.querySelectorAll('.bulk-chk') : [];
  var vis = Array.prototype.filter.call(chks, function (x) {
    var row = x.closest('.p-row');
    return row && !row.classList.contains('q-hide');
  });
  var allOn = vis.length > 0 && vis.every(function (x) { return x.checked; });
  b.textContent = allOn ? '선택 해제' : '전체 선택';
}
function bulkChecksVisible() {
  var box = document.querySelector('[data-list="dash"]');
  var chks = box ? box.querySelectorAll('.bulk-chk') : [];
  return Array.prototype.filter.call(chks, function (x) {
    var row = x.closest('.p-row');
    return row && !row.classList.contains('q-hide') && !row.classList.contains('q-off');
  });
}

/* 공수 일괄 적용 — 시간 선택창 항목
   값 형식: "p:시작|종료" (프리셋) · "leave" (휴무 0공수) · "custom" (직접 입력) */
function bulkGsOptionsHTML() {
  var list = [
    ['p:07:00|11:00', '0.5공수 · 조퇴 (07:00~11:00)'],
    ['p:07:00|17:00', '1공수 (07:00~17:00)'],
    ['p:07:00|19:00', '1.5공수 (07:00~19:00)'],
    ['p:07:00|21:00', '2공수 (07:00~21:00)'],
    ['p:05:00|15:00', '조출 (05:00~15:00 · 1공수)'],
    ['leave', '휴무 (0공수)'],
    ['custom', '직접 입력 (시간 → 자동 공수계산)']
  ];
  return list.map(function (x) {
    return '<option value="' + x[0] + '"' + (x[0] === 'p:07:00|17:00' ? ' selected' : '') + '>' + x[1] + '</option>';
  }).join('');
}

/* =========================================================
   로그인
   ========================================================= */
function jobOptionsHTML(sel) {
  var list = JOB_LIST.slice();
  /* 목록에 없는 직종(예: '관리자')이 이미 저장돼 있으면 그 값을 맨 위에 그대로 보여 준다 */
  if (sel && list.indexOf(sel) < 0) { list = [sel].concat(list); }
  return list.map(function (j) {
    return '<option value="' + j + '"' + (sel === j ? ' selected' : '') + '>' + j + '</option>';
  }).join('');
}

/* 로그인 화면 전용 : 직종 + 맨 아래 [관리자] 선택칸 */
var LOGIN_ADMIN_LABEL = '관리자';
var LOGIN_MANAGER_LABEL = '팀장';
function loginJobOptionsHTML(sel) {
  return jobOptionsHTML(sel) +
    '<option value="' + LOGIN_MANAGER_LABEL + '"' + (sel === LOGIN_MANAGER_LABEL ? ' selected' : '') + '>' + LOGIN_MANAGER_LABEL + '</option>' +
    '<option value="' + LOGIN_ADMIN_LABEL + '"' + (sel === LOGIN_ADMIN_LABEL ? ' selected' : '') + '>' + LOGIN_ADMIN_LABEL + '</option>';
}

function teamOptionsHTML(sel) {
  return '<option value="">미배정</option>' + state.teams.map(function (t) {
    return '<option value="' + t.id + '"' + (sel === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>';
  }).join('');
}

function loginView() {
  var err = '';
  if (state.sync.phase === 'err' && state.sync.err) {
    err = '<div class="banner bad" style="margin-bottom:10px">서버에 연결하지 못했어요 · ' + esc(state.sync.err) +
      '<br>전화 · 와이파이 상태를 확인하고 다시 시도해 주세요.</div>';
  }
  var agreed = !!(state.ui && state.ui.privacyChecked);
  var sensitive = !!(state.ui && state.ui.sensitiveChecked);
  return '<div class="login-brand card">' +
    '<div class="lb-mark">한</div>' +
    '<div class="lb-t">한양 pcw팀 로그인</div>' +
    '<div class="lb-s">한양이엔지(주) PCW · 처음이면 입력한 정보로 자동 등록됩니다</div>' +
    '</div>' +
    '<div class="card">' + err +
    '<label class="field"><span>이름</span><input id="li_name" placeholder="예) 김기종" autocomplete="name"></label>' +
    '<label class="field"><span>생년월일</span><input id="li_birth" type="text" inputmode="numeric" placeholder="예) 961228 또는 19961228" autocomplete="bday"></label>' +
    '<label class="field"><span>전화번호</span><input id="li_phone" type="tel" inputmode="numeric" placeholder="010-0000-0000" autocomplete="tel"></label>' +
    '<label class="field"><span>직종</span><select id="li_job">' + loginJobOptionsHTML('배관공') + '</select></label>' +
    '<label class="field"><span>입사일자 <span class="muted">(처음 등록할 때만 저장)</span></span><input id="li_hire" type="date" value="' + todayKey() + '"></label>' +
    '<label class="field hide" id="li_pass_wrap"><span>🔐 관리자 암호</span>' +
    '<input id="li_pass" type="password" autocomplete="current-password" placeholder="관리자 암호를 입력하세요"></label>' +
    '<div class="privacy-box">' +
    '<div class="privacy-row">' +
    '<label class="privacy-agree"><input type="checkbox" id="li_privacy"' + (agreed ? ' checked' : '') + '>' +
    '<span class="privacy-txt"><b>[필수]</b> 개인정보 수집·이용에 동의합니다</span></label>' +
    '<button type="button" class="privacy-view" data-act="openPrivacy" data-from="login">내용 보기</button>' +
    '</div>' +
    '<div class="privacy-row">' +
    '<label class="privacy-agree"><input type="checkbox" id="li_sensitive"' + (sensitive ? ' checked' : '') + '>' +
    '<span class="privacy-txt"><b class="opt">[선택]</b> 민감정보(현장 부상 이력) 수집·이용에 동의합니다</span></label>' +
    '<button type="button" class="privacy-view" data-act="openSensitive" data-from="login">내용 보기</button>' +
    '</div>' +
    '</div>' +
    '<button class="btn btn-primary block" style="margin-top:12px" data-act="loginSubmit">로그인</button>' +
    '<div class="hint">등록된 <b>이름 · 생년월일 · 전화번호</b>가 같으면 바로 로그인됩니다. 처음이면 기술인으로 자동 등록돼요.</div>' +
    '<div class="hint"><b>팀장</b>은 팀장 권한을, <b>관리자</b>는 관리자 권한을 등록받은 분만 선택할 수 있습니다.<br>팀장은 관리자 암호 없이, 관리자 계정은 관리자 암호를 한 번 더 넣고 로그인합니다.</div>' +
    '<div class="hint">로그인은 이 휴대폰에 저장돼 <b>앱을 닫아도 풀리지 않습니다</b>. 로그아웃은 <b>⚙️ 내 정보</b>에서 직접 눌러야 해요.</div>' +
    '</div>' +
    '<div class="foot-note">한양 pcw팀<br>입력한 정보는 현장 Supabase DB에 저장됩니다</div>';
}

/* =========================================================
   개인정보 수집·이용 동의서
   ========================================================= */
function privacyDocHTML() {
  return '<div class="pdoc">' +
    '<div class="lead">한양이엔지(주) PCW팀은 「개인정보 보호법」 제15조에 따라 아래와 같이 개인정보를 수집·이용합니다. 내용을 확인하신 뒤 동의 여부를 결정해 주세요.</div>' +

    '<h3>1. 개인정보처리자</h3>' +
    '<p>· 상호: 한양이엔지(주) PCW팀</p>' +
    '<p>· 개인정보 관리자: 박서하</p>' +
    '<p>· 문의: 현장 관리자(박서하)에게 직접 연락</p>' +
    '<p>· 보관 장소: 현장 앱 클라우드 데이터베이스(Supabase · 서울 리전)</p>' +

    '<h3>2. 수집·이용 목적</h3>' +
    '<p>· 현장 인원·근태·공수 관리</p>' +
    '<p>· 작업일보 취합</p>' +
    '<p>· 안전교육 및 자격 만료 관리</p>' +
    '<p>· 현장 공지 및 비상 연락</p>' +

    '<h3>3. 수집·이용하는 개인정보 항목 <span class="must">(필수)</span></h3>' +
    '<p>· 성명, 생년월일, 휴대전화번호, 직종, 소속 팀/조</p>' +
    '<p>· 출퇴근·공수·휴무·퇴사 정보(사직서 작성·TBM카드 반납 확인 포함)</p>' +
    '<p>· 작업일보</p>' +
    '<p>· 자격 정보(TBM·유도원 등)</p>' +
    '<p>· 업무 알림 발송용 기기 식별 토큰(FCM) — 휴무·조퇴·공지 등 휴대폰 상단 알림(푸시) 발송 목적으로만 사용</p>' +
    '<p>· 현장 부상 이력 등 민감정보는 이 동의서에 포함하지 않으며, 아래 <b>[선택] 민감정보 수집·이용 동의서</b>로 따로 동의를 받습니다.</p>' +

    '<h3>4. 보유 및 이용 기간</h3>' +
    '<p>· 근무 기간 중 보유하며, 퇴사 및 목적 달성 후 지체 없이 파기합니다.</p>' +
    '<p>· 단, 근로기준법 등 관계 법령에 따라 보존 의무가 있는 경우에는 해당 법정 기간 동안 보관합니다.</p>' +

    '<h3>5. 동의를 거부할 권리 및 불이익</h3>' +
    '<p>· 동의를 거부할 권리가 있습니다.</p>' +
    '<p>· 다만 필수 항목에 대한 동의를 거부하시면 「한양 pcw팀」 앱 로그인 및 현장 근태·작업일보 서비스 이용이 제한됩니다.</p>' +

    '<h3>6. 동의 기록</h3>' +
    '<p>· 로그인할 때 동의 사실과 동의 일시가 앱 데이터베이스에 자동으로 기록됩니다. (동의서 버전 ' + esc(PRIVACY_VERSION) + ')</p>' +
    '<div class="meta">시행일 2026년 11월 26일 · 이 동의서는 「내 정보」에서 언제든 다시 볼 수 있습니다.</div>' +
    '</div>';
}

function openPrivacySheet(from) {
  var footer = (from === 'settings'
    ? '<button class="btn btn-line" data-act="openSettings">내 정보로</button>' : '') +
    '<button class="btn btn-ghost" data-act="closeSheet">닫기</button>';
  openSheet('개인정보 수집·이용 동의서', privacyDocHTML(), footer);
}

/* =========================================================
   민감정보(현장 부상 이력) 별도 동의서 — 개인정보 보호법 제23조
   ========================================================= */
var SENSITIVE_DOC_VERSION = '2026-11-26-v1';
function sensitiveDocHTML() {
  return '<div class="pdoc">' +
    '<div class="lead">한양이엔지(주) PCW팀은 「개인정보 보호법」 제23조(민감정보의 처리 제한)에 따라 아래 민감정보를 별도로 수집·이용합니다. 이 동의는 <b>선택</b>이며, 동의하지 않아도 앱 로그인과 기본 근태·작업일보 이용에는 제한이 없습니다. (같은 법 제16조 제3항에 따라 다른 동의와 구분하여 받습니다.)</div>' +

    '<h3>1. 근거</h3>' +
    '<p>· 「개인정보 보호법」 제23조(민감정보의 처리 제한)</p>' +

    '<h3>2. 수집·이용 목적</h3>' +
    '<p>· 현장 안전관리 및 산업재해·부상 발생 시 응급 대응</p>' +
    '<p>· 업무 배치 참고</p>' +

    '<h3>3. 수집 항목 <span class="must">(선택)</span></h3>' +
    '<p>· 현장 부상 이력 및 안전 특이사항(관리자 열람·기록 전용)</p>' +

    '<h3>4. 보유 및 이용 기간</h3>' +
    '<p>· 현장 투입 종료·퇴사 시 지체 없이 파기</p>' +
    '<p>· 단, 산업안전보건법·근로기준법 등 법정 보존 필요 시 해당 기간 보관</p>' +

    '<h3>5. 동의 거부 권리 및 불이익</h3>' +
    '<p>· 민감정보 수집·이용 동의를 거부할 수 있습니다.</p>' +
    '<p>· 거부하더라도 앱 로그인 및 기본 근태·작업일보 이용에는 제한이 없습니다.</p>' +

    '<h3>6. 동의 기록</h3>' +
    '<p>· 동의한 경우에만 동의 일시가 앱 데이터베이스에 자동으로 기록됩니다. (동의서 버전 ' + esc(SENSITIVE_DOC_VERSION) + ')</p>' +
    '<div class="meta">시행일 2026년 11월 26일 · 이 동의서는 「내 정보」에서 언제든 다시 볼 수 있습니다.</div>' +
    '</div>';
}

function openSensitiveSheet(from) {
  var footer = (from === 'settings'
    ? '<button class="btn btn-line" data-act="openSettings">내 정보로</button>' : '') +
    '<button class="btn btn-ghost" data-act="closeSheet">닫기</button>';
  openSheet('민감정보 수집·이용 동의서', sensitiveDocHTML(), footer);
}

/* =========================================================
   🔔 관리자 휴무 보고 알람
   ========================================================= */
function mdLabel(k) {
  var p = String(k || '').split('-');
  if (p.length < 3) { return String(k || ''); }
  return parseInt(p[1], 10) + '월 ' + parseInt(p[2], 10) + '일';
}

function leaveAlarmRowHTML(l) {
  var isEarly = l.kind === 'early';
  var sub = isEarly
    ? esc(mdLabel(l.date)) + ' · ' + esc(l.start + '~' + l.end) + ' · ' + fmtGs(l.gongsu) + '공수 · ' + esc(l.teamName || '미배정')
    : esc(mdLabel(l.date)) + ' · ' + esc(l.teamName || '미배정');
  return '<div class="la-row">' +
    '<span class="la-av' + (isEarly ? ' em' : '') + '">' + esc(String(l.name || '?').slice(0, 1)) + '</span>' +
    '<span class="la-main">' +
    '<span class="la-name">' + esc(l.name) + (isEarly ? ' <em class="la-kind">조퇴</em>' : '') + '</span>' +
    '<span class="la-sub">' + sub + '</span>' +
    '</span>' +
    '<span class="la-right">' +
    '<span class="la-reason">' + (l.reason ? esc(l.reason) : '사유 없음') + '</span>' +
    '<span class="la-to">보고 ' + esc(l.reportTo || '관리자') + '</span>' +
    '<span class="la-acts">' +
    (isEarly
      ? (canManage() ? '<button class="lv-btn cp" data-act="copyEarlyReport" data-id="' + l.id + '" title="[조퇴보고] 양식 복사">복사</button>' : '') +
        '<button class="lv-btn ok" data-act="earlyApprove" data-id="' + l.id + '">승인</button>' +
        '<button class="lv-btn del" data-act="earlyRejectOpen" data-id="' + l.id + '">반려</button>'
      : '<button class="lv-btn ok" data-act="leaveApprove" data-id="' + l.id + '">승인</button>' +
        '<button class="lv-btn del" data-act="leaveRejectOpen" data-id="' + l.id + '">반려</button>') +
    '</span></div></div>';
}

function leaveAlarmHTML(list) {
  var rows = list.map(leaveAlarmRowHTML).join('');
  var nEarly = list.filter(function (l) { return l.kind === 'early'; }).length;
  var nLeave = list.length - nEarly;
  return '<div class="la-sum">🔔 확인이 필요합니다 · <b>' + list.length + '건</b>' +
    ' <span class="la-sum-d">(휴무 ' + nLeave + (nEarly ? ' · 조퇴 ' + nEarly : '') + ')</span></div>' +
    '<div class="la-note">휴무는 [승인]하면 0공수, [반려]하면 집계에서 빠집니다. 조퇴는 [승인]하면 신청한 근무시간 그대로, [반려]하면 신청 전으로 돌아갑니다. 조퇴는 [복사]로 [조퇴보고] 양식을 바로 복사합니다. 확인 완료를 누르면 이 알람은 다시 뜨지 않습니다.</div>' +
    rows;
}

function openLeaveAlarmSheet(list) {
  list = list || unackedReports();
  if (!list.length) { return; }
  leaveAlarmOpenIds = list.map(function (l) { return l.id; });
  openSheet('🔔 새 휴무/조퇴 보고가 올라왔어요 (' + list.length + '건)', leaveAlarmHTML(list),
    '<button class="btn btn-line" data-act="leaveAlarmList">휴무·조퇴 관리</button>' +
    '<button class="btn btn-primary" data-act="leaveAlarmAck">확인 완료</button>',
    { alarm: true });
  try { if (navigator.vibrate) { navigator.vibrate([90, 60, 90]); } } catch (e) { /* 진동 미지원 */ }
}

/* =========================================================
   관리자·팀장 휴무 관리 (승인 · 반려 · 대리 등록)
   ========================================================= */
function adminLeaveAllRows() {
  var rows = [];
  state.people.forEach(function (p) {
    (p.leaves || []).forEach(function (l) { rows.push({ p: p, l: l }); });
  });
  return rows;
}
function adminLeaveRowHTML(x, withActs) {
  var p = x.p, l = x.l, st = l.status || 'pending';
  return '<div class="lv-row">' +
    '<div class="lv-main">' +
    '<div class="lv-date">' + esc(p.name) + ' · ' + mdLabel(l.date) + ' <em class="lvm-wd">' + wd(l.date) + '</em> ' +
    '<span class="badge ' + leaveBadgeCls(st) + '">' + leaveStatusLabel(st) + '</span></div>' +
    '<div class="lv-sub">' + esc(l.reason || '사유 없음') + ' · ' + esc(l.teamName || teamLabel(p.teamId)) +
    ' · 보고 ' + esc(leaveReportLabel(l.reportTo)) + '</div>' +
    (st === 'rejected' && l.rejectReason ? '<div class="lv-sub lv-rej">반려 사유 · ' + esc(l.rejectReason) + '</div>' : '') +
    '</div>' +
    (withActs ? '<span class="lv-acts">' +
      '<button class="lv-btn ok" data-act="leaveApprove" data-id="' + l.id + '">승인</button>' +
      '<button class="lv-btn del" data-act="leaveRejectOpen" data-id="' + l.id + '">반려</button></span>' : '') +
    '</div>';
}
/* ---- 조퇴 신청 행 (관리자·팀장) ---- */
function adminEarlyAllRows() {
  var rows = [];
  state.people.forEach(function (p) {
    (p.earlyLeaves || []).forEach(function (e) { rows.push({ p: p, e: e }); });
  });
  return rows;
}
function adminEarlyRowHTML(x, withActs) {
  var p = x.p, e = x.e, st = e.status || 'pending';
  var gs = (e.gongsu === null || e.gongsu === undefined) ? calcGongsu(e.start, e.end) : (+e.gongsu || 0);
  var copyBtn = canManage()
    ? '<button class="lv-btn cp" data-act="copyEarlyReport" data-id="' + e.id + '" title="[조퇴보고] 양식 복사">복사</button>' : '';
  return '<div class="lv-row">' +
    '<div class="lv-main">' +
    '<div class="lv-date">' + esc(p.name) + ' · ' + mdLabel(e.date) + ' <em class="lvm-wd">' + wd(e.date) + '</em> ' +
    '<span class="badge ' + leaveBadgeCls(st) + '">' + leaveStatusLabel(st) + '</span></div>' +
    '<div class="lv-sub">🏃 ' + esc(e.start) + ' ~ ' + esc(e.end) + ' · ' + earlyHoursLabel(e.start, e.end) + ' · <b>' + fmtGs(gs) + '공수</b>' +
    ' · ' + esc(e.reason || '사유 없음') + '</div>' +
    '<div class="lv-sub">보고 ' + esc(leaveReportLabel(e.reportTo)) + (p.teamId ? ' · ' + esc(teamLabel(p.teamId)) : '') + '</div>' +
    (st === 'rejected' && e.rejectReason ? '<div class="lv-sub lv-rej">반려 사유 · ' + esc(e.rejectReason) + '</div>' : '') +
    '</div>' +
    '<span class="lv-acts">' + copyBtn +
    (withActs ? '<button class="lv-btn ok" data-act="earlyApprove" data-id="' + e.id + '">승인</button>' +
      '<button class="lv-btn del" data-act="earlyRejectOpen" data-id="' + e.id + '">반려</button>' : '') +
    '</span>' +
    '</div>';
}
function adminLeaveManageHTML() {
  var rows = adminLeaveAllRows();
  var pend = rows.filter(function (x) { return (x.l.status || 'pending') === 'pending'; })
    .sort(function (a, b) { return a.l.date === b.l.date ? a.p.name.localeCompare(b.p.name, 'ko') : (a.l.date < b.l.date ? -1 : 1); });
  var done = rows.filter(function (x) { return (x.l.status || 'pending') !== 'pending'; })
    .sort(function (a, b) { return a.l.date === b.l.date ? a.p.name.localeCompare(b.p.name, 'ko') : (a.l.date > b.l.date ? -1 : 1); })
    .slice(0, 30);
  var eRows = adminEarlyAllRows();
  var ePend = eRows.filter(function (x) { return (x.e.status || 'pending') === 'pending'; })
    .sort(function (a, b) { return a.e.date === b.e.date ? a.p.name.localeCompare(b.p.name, 'ko') : (a.e.date < b.e.date ? -1 : 1); });
  var eDone = eRows.filter(function (x) { return (x.e.status || 'pending') !== 'pending'; })
    .sort(function (a, b) { return a.e.date === b.e.date ? a.p.name.localeCompare(b.p.name, 'ko') : (a.e.date > b.e.date ? -1 : 1); })
    .slice(0, 30);
  var html = '<div class="muted" style="margin:-4px 0 8px">휴무를 <b>승인</b>하면 0공수, <b>반려</b>하면 집계에서 빠집니다. 조퇴는 <b>승인</b>하면 신청한 근무시간 그대로, <b>반려</b>하면 신청 전 근태로 되돌립니다.</div>' +
    '<button class="btn btn-line sm block" data-act="leaveProxyOpen">＋ 휴무 대리 등록</button>' +
    '<div class="divider"></div>' +
    '<div class="lvm-t">🏃 조퇴 · 대기 <b>' + ePend.length + '건</b></div>' +
    (ePend.length ? ePend.map(function (x) { return adminEarlyRowHTML(x, true); }).join('')
      : '<div class="empty" style="padding:14px 4px">대기 중인 조퇴 보고가 없습니다.</div>') +
    '<div class="divider"></div>' +
    '<div class="lvm-t">🏖️ 휴무 · 대기 <b>' + pend.length + '건</b></div>' +
    (pend.length ? pend.map(function (x) { return adminLeaveRowHTML(x, true); }).join('')
      : '<div class="empty" style="padding:14px 4px">대기 중인 휴무 신청이 없습니다.</div>') +
    '<div class="divider"></div>' +
    '<div class="lvm-t">처리된 내역 <b>' + (done.length + eDone.length) + '건</b></div>' +
    (done.length || eDone.length
      ? done.map(function (x) { return adminLeaveRowHTML(x, false); }).join('') +
        eDone.map(function (x) { return adminEarlyRowHTML(x, false); }).join('')
      : '<div class="empty" style="padding:14px 4px">아직 승인·반려한 내역이 없습니다.</div>');
  return html;
}
function openLeaveManageSheet() {
  openSheet('🏖️ 휴무·조퇴 관리 · 승인 / 반려', '<div id="leaveMgrBox">' + adminLeaveManageHTML() + '</div>',
    '<button class="btn btn-ghost" data-act="closeSheet">닫기</button>');
}

function osNotifyLeave(n, first) {
  try {
    if (!window.Notification || Notification.permission !== 'granted') { return; }
    var title = '🔔 새 휴무/조퇴 보고 ' + n + '건';
    var body = first ? (first.name + ' · ' + mdLabel(first.date) + ' · ' + (first.kind === 'early' ? '조퇴 ' + first.start + '~' + first.end : (first.reason || '사유 없음'))) : '관리자 화면에서 확인해 주세요.';
    var opt = { body: body, tag: 'pcw-leave-' + (first ? first.id : n), renotify: false };
    try { new Notification(title, opt); } catch (e) { /* 아이콘 없는 환경 */ }
  } catch (e) { /* 알림 미지원 */ }
}

/* 관리자 화면에 그려질 때마다 호출 — 새 행이 있으면 팝업 · OS 알림
   - 창이 닫혀 있으면: 아직 닫지 않은 새 보고가 있을 때 즉시 다시 팝업
   - 알람창이 떠 있으면: 그 사이 새로 올라온 건이 있으면 목록을 다시 그린다
   - 다른 시트를 보는 중이면 양보 (closeSheet 에서 다시 확인) */
function maybeShowLeaveAlarm() {
  try {
    if (!state.ready || !state.auth || state.role === 'worker' || !canManage()) { return; }
    var wrap = document.getElementById('sheetWrap');
    var list = unackedReports();
    if (!list.length) { return; }
    if (wrap && wrap.classList.contains('open')) {
      if (wrap.classList.contains('alarm-open') && leaveAlarmOpenIds) {
        var extra = list.filter(function (l) { return leaveAlarmOpenIds.indexOf(l.id) < 0; });
        if (extra.length) {
          openLeaveAlarmSheet(list);
          extra.forEach(function (l) { leaveAlarm.notified[l.id] = 1; });
          osNotifyLeave(extra.length, extra[0]);
        }
      }
      return;
    }
    var fresh = list.filter(function (l) { return !leaveAlarm.dismissed[l.id]; });
    if (!fresh.length) { return; }
    openLeaveAlarmSheet(list);
    var newOnes = list.filter(function (l) { return !leaveAlarm.notified[l.id]; });
    if (newOnes.length) {
      newOnes.forEach(function (l) { leaveAlarm.notified[l.id] = 1; });
      osNotifyLeave(newOnes.length, newOnes[0]);
    }
  } catch (e) { /* 알람 실패가 화면을 막지 않게 */ }
}

function readLoginForm() {
  var name = ($('#li_name') ? $('#li_name').value : '').trim();
  var birthRaw = ($('#li_birth') ? $('#li_birth').value : '').trim();
  var phoneRaw = ($('#li_phone') ? $('#li_phone').value : '').trim();
  var job = $('#li_job') ? $('#li_job').value : '배관공';
  if (!name) { return { err: '이름을 입력해 주세요.' }; }
  if (!birthRaw) { return { err: '생년월일을 입력해 주세요.<br>예) 961228 또는 19961228' }; }
  var birth = birthFromDigits(birthRaw);
  if (!birth) { return { err: '생년월일은 숫자 6자리(예: 961228) 또는 8자리(예: 19961228)로 입력해 주세요.' }; }
  var pd = phoneDigits(phoneRaw);
  if (pd.length < 9 || pd.length > 11) { return { err: '전화번호를 정확히 입력해 주세요.<br>예) 010-1234-5678' }; }
  return { name: name, birth: birth, birthRaw: birthRaw, phone: phonePretty(phoneRaw), pd: pd, job: job };
}

/* =========================================================
   내 정보 · 설정
   ========================================================= */
function leaveReportLabel(v) { return v ? String(v) : '관리자'; }
function leaveBadgeCls(st) { return st === 'approved' ? 'b-work' : st === 'rejected' ? 'b-res' : 'b-warn'; }

function myLeaveRowsHTML(p) {
  var leaves = (p.leaves || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  if (!leaves.length) {
    return '<div class="empty" style="padding:16px 4px">신청한 휴무가 없습니다.</div>';
  }
  return leaves.map(function (l) {
    var du = daysUntil(l.date);
    var st = l.status || 'pending';
    var badge = du > 0 ? '<span class="badge b-warn">D-' + du + '</span>'
      : du === 0 ? '<span class="badge b-work">오늘</span>'
        : '<span class="badge b-res">지난 휴무</span>';
    var stBadge = '<span class="badge ' + leaveBadgeCls(st) + '">' + leaveStatusLabel(st) + '</span>';
    var acts = '';
    if (du >= 0) {
      acts = '<span class="lv-acts">' +
        (du > 0 ? '<button class="lv-btn" data-act="editLeave" data-id="' + l.id + '">정정</button>' : '') +
        '<button class="lv-btn del" data-act="askCancelLeave" data-id="' + l.id + '">취소</button></span>';
    }
    return '<div class="lv-row">' +
      '<div class="lv-main"><div class="lv-date">' + longDate(l.date) + ' ' + badge + ' ' + stBadge + '</div>' +
      '<div class="lv-sub">' + esc(l.reason) + ' · ' + esc(l.teamName || teamLabel(p.teamId)) + ' · 보고 ' + esc(leaveReportLabel(l.reportTo)) + '</div>' +
      (st === 'rejected' && l.rejectReason ? '<div class="lv-sub lv-rej">반려 사유 · ' + esc(l.rejectReason) + '</div>' : '') +
      '</div>' + acts + '</div>';
  }).join('');
}

/* 기술인 홈 · 조퇴 신청 내역 */
function myEarlyRowsHTML(p) {
  var list = (p.earlyLeaves || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  if (!list.length) {
    return '<div class="empty" style="padding:16px 4px">신청한 조퇴가 없습니다.</div>';
  }
  return list.map(function (e) {
    var st = e.status || 'pending';
    var du = daysUntil(e.date);
    var gs = (e.gongsu === null || e.gongsu === undefined) ? calcGongsu(e.start, e.end) : (+e.gongsu || 0);
    var badge = du === 0 ? '<span class="badge b-work">오늘</span>'
      : du > 0 ? '<span class="badge b-warn">D-' + du + '</span>'
        : '<span class="badge b-res">지난 조퇴</span>';
    var stBadge = '<span class="badge ' + leaveBadgeCls(st) + '">' + leaveStatusLabel(st) + '</span>';
    var acts = (st !== 'rejected' && du >= 0)
      ? '<span class="lv-acts"><button class="lv-btn del" data-act="askCancelEarly" data-id="' + e.id + '">취소</button></span>' : '';
    return '<div class="lv-row">' +
      '<div class="lv-main"><div class="lv-date">🏃 ' + mdLabel(e.date) + ' ' + wd(e.date) + ' · ' + esc(e.start) + '~' + esc(e.end) + ' ' + badge + ' ' + stBadge + '</div>' +
      '<div class="lv-sub">' + earlyHoursLabel(e.start, e.end) + ' · <b>' + fmtGs(gs) + '공수</b> · ' + esc(e.reason) + ' · 보고 ' + esc(leaveReportLabel(e.reportTo)) + '</div>' +
      (st === 'rejected' && e.rejectReason ? '<div class="lv-sub lv-rej">반려 사유 · ' + esc(e.rejectReason) + '</div>' : '') +
      '</div>' + acts + '</div>';
  }).join('');
}

/* 설정 시트의 메뉴 한 줄 (아이콘 · 제목 · 설명 · ›) */
function setRowHTML(act, ic, title, sub) {
  return '<button class="set-row" data-act="' + act + '">' +
    '<span class="set-ic">' + ic + '</span>' +
    '<span class="set-main"><span class="set-t">' + title + '</span>' +
    '<span class="set-s">' + sub + '</span></span>' +
    '<span class="set-go">›</span></button>';
}

function openSettings(p) {
  if (!p) { return; }
  var passSect = '';
  if (isAdminView() && p.admin) {
    passSect =
      '<div class="sect">' +
      '<div class="sect-t">🔐 관리자 암호 변경</div>' +
      '<div class="muted">관리자 화면과 관리자 계정 로그인에 쓰는 암호입니다.</div>' +
      '<label class="field"><span>현재 암호</span><input id="pw_old" type="password" autocomplete="current-password" placeholder="지금 쓰는 암호"></label>' +
      '<div class="grid2">' +
      '<label class="field"><span>새 암호</span><input id="pw_new" type="password" autocomplete="new-password" placeholder="6자 이상"></label>' +
      '<label class="field"><span>새 암호 확인</span><input id="pw_new2" type="password" autocomplete="new-password" placeholder="한 번 더"></label>' +
      '</div>' +
      '<button class="btn btn-line sm block" style="margin-top:9px" data-act="changeAdminPass">암호 변경</button>' +
      '<div class="hint">현재 암호가 맞아야 새 암호로 바뀝니다. 잊어버리면 앱에서 바꿀 수 없으니 꼭 기억해 두세요.</div>' +
      '</div>';
  }
  var mk0 = todayKey().slice(0, 7);
  var mGs = gongsuMonth(p, mk0);
  var mDays = 0;
  Object.keys(p.attendance || {}).forEach(function (k) {
    if (k.slice(0, 7) !== mk0) { return; }
    if (p.attendance[k] && p.attendance[k].in && !leaveOn(p, k)) { mDays++; }
  });
  var leaves = (p.leaves || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  var nextLv = leaves.filter(function (l) { return l.date >= todayKey(); })[0];
  var leaveSub = !leaves.length ? '신청한 휴무 없음'
    : (leaves.length + '건 신청' + (nextLv ? ' · 다음 휴무 ' + shortDate(nextLv.date) + '(' + wd(nextLv.date) + ')' : ''));

  var body =
    '<div class="sheet-head">' +
    '<span class="av lg">' + esc(p.name.slice(0, 1)) + '</span>' +
    '<div style="flex:1"><div class="sheet-name">' + esc(p.name) + ' <span class="tag tag-job">' +
    (p.admin ? '관리자' : p.role === 'leader' ? '팀장' : '기술인') + '</span></div>' +
    '<div class="muted">' + teamLabel(p.teamId) + ' · ' + esc(p.job) + ' · ' + birthText(p.birth) + '생' +
    (p.hireDate ? ' · 입사 ' + shortDate(p.hireDate) : '') + '</div></div>' +
    '</div>' +

    '<div class="set-list">' +
    setRowHTML('myInfoEdit', '👤', '개인정보 수정', esc(p.name) + ' · ' + esc(p.job) + ' · ' + esc(p.phone)) +
    setRowHTML('myLeavesOpen', '🏖️', '휴무신청내역', leaveSub) +
    setRowHTML('myGsOpen', '📅', '공수표 확인', monthLabel(mk0) + ' · ' + fmtGs(mGs) + '공수 · 출근 ' + mDays + '일') +
    '</div>' +

    '<div class="sect">' +
    '<div class="sect-t">개인정보 · 민감정보 동의</div>' +
    '<div class="kv"><span>개인정보 수집·이용 동의</span><b>' + (p.privacyAgreedAt
      ? kstDate(p.privacyAgreedAt) + ' ' + kstHM(p.privacyAgreedAt)
      : '기록 없음 (다음 로그인 시 기록)') + '</b></div>' +
    '<div class="kv"><span>동의서 버전</span><b>' + esc(p.privacyVersion || PRIVACY_VERSION) + '</b></div>' +
    '<button class="btn btn-line blue sm block" style="margin-top:9px" data-act="openPrivacy" data-from="settings">개인정보 수집·이용 동의서 보기</button>' +
    '<div class="kv" style="margin-top:11px"><span>민감정보 동의</span><b>' + (p.sensitiveAgreedAt
      ? '동의함(' + kstDate(p.sensitiveAgreedAt) + ' ' + kstHM(p.sensitiveAgreedAt) + ')'
      : '미동의') + '</b></div>' +
    '<button class="btn btn-line blue sm block" style="margin-top:6px" data-act="openSensitive" data-from="settings">민감정보 동의서 보기</button>' +
    '<div class="hint">로그인할 때 동의 일시가 자동으로 기록됩니다. 민감정보(현장 부상 이력)는 <b>[선택]</b> 동의로 따로 받습니다.</div>' +
    '</div>' +

    passSect +

    '<div class="sect">' +
    '<div class="sect-t">계정</div>' +
    '<div class="kv"><span>로그인 계정</span><b>' + esc(p.name) + ' · ' + esc(p.phone) + '</b></div>' +
    '<div class="kv"><span>관리자 권한</span><b>' + (p.admin ? '있음' : '없음') + '</b></div>' +
    '<div class="kv"><span>DB 연결</span><b>' + (state.sync.phase === 'ok' ? '정상' : (state.sync.phase === 'loading' ? '연결 중' : '끊김 · 재전송 대기')) + '</b></div>' +
    '<button class="btn btn-ghost sm block" style="margin-top:10px" data-act="logout">로그아웃</button>' +
    '<div class="hint">로그인은 이 휴대폰에 저장돼 <b>앱을 닫아도 풀리지 않습니다</b>. 위 <b>로그아웃</b>을 직접 눌렀을 때만 로그아웃돼요.</div>' +
    '</div>';

  openSheet('내 정보', body, '<button class="btn btn-ghost" data-act="closeSheet">닫기</button>');
}

/* 내 정보 → 개인정보 수정 (접힌 서브시트) */
function openMyInfoEdit(p) {
  if (!p) { return; }
  var body =
    '<div class="grid2">' +
    '<label class="field"><span>이름</span><input id="mi_name" value="' + esc(p.name) + '"></label>' +
    '<label class="field"><span>생년월일</span><input id="mi_birth" type="text" inputmode="numeric" value="' + esc(p.birth) + '" placeholder="예) 961228 또는 19961228"></label>' +
    '<label class="field"><span>전화번호</span><input id="mi_phone" type="tel" value="' + esc(p.phone) + '"></label>' +
    '<label class="field"><span>직종</span><select id="mi_job">' + jobOptionsHTML(p.job) + '</select></label>' +
    '<label class="field"><span>입사일자</span><input id="mi_hire" type="date" value="' + esc(p.hireDate || '') + '"></label>' +
    '</div>' +
    '<div class="hint">이름 · 직종 · 연락처 · 생년월일 · 입사일자는 관리자 인원 목록에도 바로 반영됩니다. 생년월일은 <b>숫자 6자리(961228)</b> 또는 <b>8자리(19961228)</b>로 적어 주세요.</div>' +
    '<button class="btn btn-line sm block" style="margin-top:9px" data-act="saveMyInfo" data-id="' + p.id + '">개인정보 저장</button>';
  openSheet('개인정보 수정', body,
    '<button class="btn btn-ghost" data-act="myGsToSettings">설정으로</button>');
}

/* 내 정보 → 휴무신청내역 (서브시트) */
function openMyLeavesSheet(p) {
  if (!p) { return; }
  var body = '<div class="muted" style="margin:-4px 0 8px">내일 이후 휴무는 앱에서 바로 정정 · 취소할 수 있습니다.</div>' +
    '<div id="myLeaveList">' + myLeaveRowsHTML(p) + '</div>';
  openSheet('휴무신청내역', body,
    '<button class="btn btn-ghost" data-act="myGsToSettings">설정으로</button>' +
    '<button class="btn btn-primary" data-act="closeSheet">닫기</button>');
}

/* =========================================================
   공지사항
   ========================================================= */
function noticeSorted() {
  return state.notices.slice().sort(function (a, b) {
    if (!!a.pinned !== !!b.pinned) { return a.pinned ? -1 : 1; }
    if (a.date !== b.date) { return a.date < b.date ? 1 : -1; }
    return String(a.id) < String(b.id) ? 1 : -1;
  });
}

function noticePreview(body) {
  var s = String(body || '').replace(/\s+/g, ' ').trim();
  return s.length > 48 ? s.slice(0, 48) + '…' : s;
}

/* 📢 공지사항 맨 위 — 토요일 출근 조사 (2026-11-26 : 단독 카드에서 이리로 통합)
   · 진행 중 : 출근(예) / 미출근(아니오) 바로 응답 · 관리자·팀장은 조별 현황 · 조사 종료
   · 종료 후 : `[종료] 11월 28일 토요일 출근조사 여부` 한 줄 (관리자·팀장은 눌러서 결과 보기) */
function pollOpenNow() {
  var poll = latestPoll();
  return !!(poll && pollIsOpen(poll));
}
function noticePollHTML(who) {
  var poll = latestPoll();
  var mgr = canManage() && state.role !== 'worker';
  if (!poll) { return ''; }
  if (!pollIsOpen(poll)) {
    var line = '[종료] ' + mdLabel(poll.satKey) + ' 토요일 출근조사 여부';
    var lineHTML = '<span class="pm-t">' + esc(line) + '</span>';
    return mgr
      ? '<button class="poll-mini tap" data-act="pollAdmin" data-id="' + poll.id + '">' + lineHTML + '<em>결과 ›</em></button>'
      : '<div class="poll-mini">' + lineHTML + '</div>';
  }
  var c = pollCounts(poll);
  var p0 = me();
  var myVote = p0 ? poll.votes[p0.id] : null;
  /* 이미 투표했으면 큰 투표 박스를 접고 `[투표완료] …` 한 줄 (누르면 다시 열려 수정) */
  if (myVote && state.ui.pollExpand !== poll.id) {
    return '<button class="poll-mini done" data-act="pollExpand" data-id="' + poll.id + '">' +
      '<span class="pm-t">' + esc('[투표완료] ' + mdLabel(poll.satKey) + ' 토요일 출근조사 여부') + '</span>' +
      '<em>' + (myVote === 'yes' ? '출근' : '미출근') + ' ›</em></button>';
  }
  return '<div class="poll-inline">' +
    '<div class="pi-top"><span class="pi-flag">📅 토요일 출근 조사</span><span class="badge b-warn">응답 중</span></div>' +
    '<div class="poll-title">' + esc(poll.title) + '</div>' +
    '<div class="muted" style="margin-top:2px">마감 ' + esc(fmtDeadline(poll.deadline)) + ' · 응답 ' + (c.yes + c.no) + '/' + c.total + '명</div>' +
    '<div class="vote-row">' +
    '<button class="btn vote-btn yes' + (myVote === 'yes' ? ' on' : '') + '" data-act="vote" data-v="yes">출근(예)</button>' +
    '<button class="btn vote-btn no' + (myVote === 'no' ? ' on' : '') + '" data-act="vote" data-v="no">미출근(아니오)</button>' +
    '</div>' +
    (myVote
      ? '<div class="hint">내 응답 · <b>' + (myVote === 'yes' ? '출근(예)' : '미출근(아니오)') + '</b> · 다시 눌러 변경할 수 있어요</div>'
      : '<div class="hint">토요일 출근이 가능한지 선택해 주세요.</div>') +
    (mgr ? '<div class="btn-row" style="margin-top:8px">' +
      '<button class="btn btn-line sm" data-act="pollAdmin" data-id="' + poll.id + '">조별 현황 · 변경</button>' +
      '<button class="btn btn-line sm" data-act="pollPush" data-id="' + poll.id + '">📢 전체 알림</button>' +
      '<button class="btn btn-ghost sm" data-act="closePoll" data-id="' + poll.id + '">조사 종료</button></div>' : '') +
    '</div>';
}

function noticeBannerHTML(who) {
  var ns = noticeSorted();
  var canNotice = who === 'admin' && isAdminView();
  var addBtn = canNotice ? '<button class="link-btn" data-act="noticeNew">＋ 새 공지 올리기</button>' : '';
  var pollBtn = (canNotice && !pollOpenNow()) ? '<button class="link-btn" data-act="newPoll">＋ 토요일 조사</button>' : '';
  var pollBlock = noticePollHTML(who);
  var footExtra = (addBtn || pollBtn) ? '<span class="nf-acts">' + addBtn + pollBtn + '</span>' : '';
  if (!ns.length) {
    return '<div class="card notice-card">' +
      pollBlock +
      '<div class="notice-head"><span class="notice-flag">📢 공지사항</span>' +
      '<span class="notice-meta">' + longDate(todayKey()) + '</span></div>' +
      '<div class="notice-empty">등록된 공지가 없습니다.</div>' +
      (canNotice ? '<div class="notice-foot">' + footExtra + '</div>' : '') +
      '</div>';
  }
  var n = ns[0];
  var rest = ns.length - 1;
  return '<div class="card notice-card">' +
    pollBlock +
    '<div class="notice-head">' +
    '<span class="notice-flag' + (n.pinned ? ' pin' : '') + '">' + (n.pinned ? '📌 필독 공지' : '📢 공지사항') + '</span>' +
    '<span class="notice-meta">' + shortDate(n.date) + ' (' + wd(n.date) + ') · ' + esc(n.author || '관리자') + '</span>' +
    '</div>' +
    '<button class="notice-body" data-act="openNotice" data-id="' + esc(n.id) + '">' +
    '<span class="notice-title">' + esc(n.title) + '</span>' +
    '<span class="notice-prev">' + esc(noticePreview(n.body)) + '</span>' +
    '<span class="notice-more">자세히 보기 ›</span>' +
    '</button>' +
    (rest > 0 || canNotice
      ? '<div class="notice-foot">' +
        (rest > 0 ? '<button class="link-btn" data-act="openNoticeList">공지 ' + ns.length + '건 전체 보기</button>' : '<span></span>') +
        (canNotice ? '<button class="link-btn" data-act="noticePush" data-id="' + esc(n.id) + '">📢 전체 알림</button>' : '') +
        footExtra + '</div>'
      : '') +
    '</div>';
}

function openNoticeDetail(id) {
  var n = state.notices.filter(function (x) { return x.id === id; })[0];
  if (!n) { toast('공지를 찾을 수 없어요.'); return; }
  var body = '<div class="notice-detail">' +
    '<div class="nd-top">' + (n.pinned ? '<span class="badge b-warn">필독</span>' : '<span class="badge b-out">공지</span>') + '</div>' +
    '<div class="nd-title">' + esc(n.title) + '</div>' +
    '<div class="nd-meta"><span>작성자 <b>' + esc(n.author || '관리자') + '</b></span>' +
    '<span>작성일 <b>' + longDate(n.date) + '</b></span></div>' +
    '<div class="nd-body">' + esc(n.body || '').replace(/\n/g, '<br>') + '</div>' +
    '</div>';
  openSheet('공지사항', body,
    '<button class="btn btn-ghost" data-act="closeSheet">닫기</button>' +
    (isAdminView() ? '<button class="btn btn-line" data-act="noticePush" data-id="' + esc(n.id) + '">📢 전체 알림</button>' : '') +
    (isAdminView() ? '<button class="btn btn-line" data-act="noticeNew">새 공지 올리기</button>' : ''));
}

function openNoticeList() {
  var ns = noticeSorted();
  var body = ns.length ? ns.map(function (n) {
    return '<div class="p-row" data-act="openNotice" data-id="' + esc(n.id) + '">' +
      '<span class="av' + (n.pinned ? '' : ' green') + '">' + (n.pinned ? '📌' : '📢') + '</span>' +
      '<span class="p-main"><span class="p-name">' + esc(n.title) + '</span>' +
      '<span class="p-sub">' + shortDate(n.date) + ' (' + wd(n.date) + ') · ' + esc(n.author || '관리자') + '</span></span>' +
      '<span class="p-right"><span class="notice-date">자세히 ›</span></span></div>';
  }).join('') : '<div class="empty">등록된 공지가 없습니다.</div>';
  openSheet('공지사항 목록', body, '<button class="btn btn-ghost" data-act="closeSheet">닫기</button>');
}

function openAddNotice() {
  var body = '<label class="field"><span>공지 제목</span><input id="nv_title" placeholder="예) [안전] 11/27(금) 정기 안전교육 안내"></label>' +
    '<label class="field"><span>내용</span><textarea id="nv_body" rows="5" placeholder="현장 인원에게 전달할 내용을 적어 주세요"></textarea></label>' +
    '<label class="chk" style="margin-top:12px"><input type="checkbox" id="nv_pin"> 상단에 고정 (필독)</label>' +
    '<label class="chk" style="margin-top:6px"><input type="checkbox" id="nv_push" checked> 올리면서 기술인 전체에게 <b>팝업·알람</b> 보내기</label>' +
    '<div class="banner">올리면 기술인 홈 <b>맨 위 공지 카드</b>에 바로 표시됩니다.</div>';
  openSheet('새 공지 올리기', body,
    '<button class="btn btn-ghost" data-act="closeSheet">취소</button>' +
    '<button class="btn btn-primary" data-act="createNotice">공지 올리기</button>');
}

/* =========================================================
   📢 기술인 전체 알림 (공지사항 · 토요일 출근 조사)
   — 관리자 암호로 확인한 뒤 Edge Function(broadcast-push)이
     재직 중인 기술인 전원의 휴대폰에 팝업·소리 알림을 보낸다.
   ========================================================= */
function openPushBroadcast(kind, id, title, body) {
  if (!isAdminView()) { toast('관리자만 전체 알림을 보낼 수 있습니다.'); return; }
  state.ui.pushBroadcast = { kind: kind, id: id, title: title, body: body };
  var code = adminCodeGet();
  var html = '<div class="banner">재직 중인 <b>기술인 전체</b>의 휴대폰에 팝업·소리 알림이 울립니다.<br>알림을 받은 사람이 누르면 앱이 열립니다.</div>' +
    '<div class="sect"><div class="sect-t">보낼 알림</div>' +
    '<div class="kv"><span>제목</span><b>' + esc(title) + '</b></div>' +
    '<div class="kv"><span>내용</span><b style="white-space:pre-wrap">' + esc(body || '') + '</b></div></div>' +
    '<label class="field" style="margin-top:8px"><span>🔐 관리자 암호</span>' +
    '<input id="bc_code" type="password" value="' + esc(code) + '" placeholder="관리자 암호를 입력하세요"></label>' +
    '<div class="hint">보낸 뒤에는 취소할 수 없어요. 내용을 확인하고 눌러 주세요.</div>';
  openSheet('📢 기술인 전체 알림', html,
    '<button class="btn btn-ghost" data-act="closeSheet">취소</button>' +
    '<button class="btn btn-primary" data-act="broadcastSend">전체에게 보내기</button>');
}

/* =========================================================
   기술인 화면
   ========================================================= */
function workerView() {
  var p = me();
  if (!p) { return ''; }
  if (p.status === 'resigned') { return resignedWorkerView(p); }
  if (state.ui.workerTab === 'report') { return teamReport(p); }
  return workerHome(p);
}

function resignedWorkerView(p) {
  return '<div class="hello"><span class="av lg">' + esc(p.name.slice(0, 1)) + '</span><div>' +
    '<div class="h-name">' + esc(p.name) + ' 님</div>' +
    '<div class="muted">' + teamLabel(p.teamId) + ' · 퇴사 처리됨</div></div></div>' +
    '<div class="card">' +
    '<div class="sec-t">퇴사 처리 완료</div>' +
    '<div class="kv"><span>퇴사일</span><b>' + (p.resign ? longDate(p.resign.date) : '-') + '</b></div>' +
    '<div class="kv"><span>퇴사 사유</span><b>' + (p.resign ? esc(p.resign.reason) + (p.resign.text ? ' · ' + esc(p.resign.text) : '') : '-') + '</b></div>' +
    '<div class="hint">퇴사자는 출근 대상 · 조 편성 · 평균단가 계산에서 자동으로 제외되고, 관리자 <b>퇴사자 보관함</b>에 보관됩니다.</div>' +
    '</div>' +
    '<div class="foot-note">다시 일하게 되면 관리자에게 <b>복직 처리</b>를 요청해 주세요</div>';
}

function workerHome(p) {
  var a = todayAtt(p);
  var edit = !!state.ui.timeEdit;

  var attInner;
  if (edit) {
    attInner =
      '<div class="grid2 att-edit">' +
      '<label class="field"><span>출근 시각</span><input type="time" id="te_in" value="' + (a && a.in ? a.in : '') + '"></label>' +
      '<label class="field"><span>퇴근 시각</span><input type="time" id="te_out" value="' + (a && a.out ? a.out : '') + '"></label>' +
      '</div>' +
      '<div class="btn-row">' +
      '<button class="btn btn-ghost" data-act="timeEditCancel">취소</button>' +
      '<button class="btn btn-primary" data-act="saveTimeEdit">시간 저장</button>' +
      '</div>' +
      '<div class="hint">늦게 찍었을 때 실제 시각으로 고쳐 주세요. 저장하면 관리자 <b>전체 현황</b> · <b>한달 공수표</b>에 <b>(수정됨)</b>으로 바로 반영됩니다.</div>';
  } else {
    attInner =
      '<div class="atttimes">' +
      '<div class="attbox' + (a && a.in ? ' on' : '') + '"><div class="lab">출근</div><div class="val' + (a && a.in ? '' : ' dim') + '">' +
      (a && a.in ? a.in + edMark(a.inEdited) : '미등록') + '</div></div>' +
      '<div class="attbox' + (a && a.out ? ' out' : '') + '"><div class="lab">퇴근</div><div class="val' + (a && a.out ? '' : ' dim') + '">' +
      (a && a.out ? a.out + edMark(a.outEdited) + (isFutureOut(a) ? ' <span class="muted">예정</span>' : '') : '미등록') + '</div></div>' +
      '</div>' +
      '<div class="btn-row">' +
      '<button class="btn btn-in" data-act="clockIn"' + (a && a.in ? ' disabled' : '') + '>출근하기</button>' +
      '<button class="btn btn-out" data-act="clockOut"' + (a && a.in && !a.out ? '' : ' disabled') + '>퇴근하기</button>' +
      '</div>' +
      (a && a.in ? '<button class="btn btn-line sm block time-edit-btn" data-act="timeEditOpen">🕘 시간 수정' + (a.out ? ' · 출근 / 퇴근' : ' · 출근만 기록됨') + '</button>' : '') +
      '<button class="btn btn-line sm block" style="margin-top:8px" data-act="earlyLeaveOpen">🏃 조퇴 신청</button>' +
      (a && a.in && a.out ? '<div class="done-line">오늘 근무 완료 · ' + a.in + ' ~ ' + a.out + ' · ' + fmtGs(gongsuOf(a)) + '공수</div>' : '') +
      (a && a.in && !a.out ? '<div class="small-note">퇴근할 때 <b>퇴근하기</b>를 눌러 주세요. 누른 시각이 관리자 화면에 바로 표시됩니다.</div>' : '');
  }

  var attCard =
    '<div class="card">' +
    '<div class="card-head"><div><div class="sec-t">오늘 근태</div><div class="muted">' + longDate(todayKey()) + '</div></div>' +
    '<div class="clock" id="liveClock">' + nowHM() + '</div></div>' +
    attInner +
    '</div>';

  var leaveCard =
    '<div class="card">' +
    '<div class="sec-t">휴무 신청</div>' +
    '<div class="muted" style="margin-top:2px">휴무 날짜와 사유를 남기면 관리자 현황에 바로 반영됩니다.</div>' +
    '<div class="grid2">' +
    '<label class="field"><span>휴무 날짜</span><input type="date" id="leaveDate" value="' + todayKeyAdd(1) + '"></label>' +
    '<label class="field"><span>사유</span><input id="leaveReason" placeholder="예) 병원 진료"></label>' +
    '</div>' +
    '<label class="field"><span>소속 팀</span><select id="leaveTeam">' + teamOptionsHTML(p.teamId) + '</select></label>' +
    '<label class="field"><span>보고 대상</span><input id="leaveReport" type="text" placeholder="예) 박서하 관리자 또는 현장 리더 이름"></label>' +
    '<div class="hint" style="margin-top:5px">보고한 사람 이름을 직접 적어 주세요. 비워 두면 <b>관리자</b>로 기록됩니다.</div>' +
    '<button class="btn btn-ghost sm block" style="margin-top:10px" data-act="applyLeave">휴무 신청하기</button>' +
    '<div class="divider"></div>' +
    '<div class="muted" style="font-weight:800;color:#475467">신청 내역</div>' +
    '<div id="homeLeaveList">' + myLeaveRowsHTML(p) + '</div>' +
    '<div class="hint">신청한 휴무는 여기서 바로 <b>취소</b>할 수 있습니다. 내일 이후 날짜는 <b>정정</b>도 됩니다. (지난 날짜는 관리자에게)</div>' +
    '</div>';

  var earlyCard =
    '<div class="card">' +
    '<div class="card-head"><div><div class="sec-t">🏃 조퇴 신청</div>' +
    '<div class="muted">신청한 날짜의 조퇴 근무 시간이 공수에 바로 반영됩니다</div></div>' +
    '<button class="btn btn-line sm" data-act="earlyLeaveOpen">신청</button></div>' +
    '<div id="homeEarlyList">' + myEarlyRowsHTML(p) + '</div>' +
    '<div class="hint">신청하면 그 날짜 근태가 신청한 시간으로 바뀌고 관리자·팀장에게 <b>보고</b>됩니다. 오늘뿐 아니라 다른 날짜(과거·미래)도 신청할 수 있습니다. 승인되면 확정되고, 반려·취소하면 신청 전 근태로 돌아갑니다.</div>' +
    '</div>';

  var openResign = !!state.ui.resignOpen;
  var resignCard =
    '<div class="card">' +
    '<div class="card-head" style="cursor:pointer" data-act="toggleResign">' +
    '<div style="text-align:left"><div class="sec-t" style="color:#B42318">퇴사 신청</div><div class="muted">제출하면 퇴사자 보관함으로 이동합니다</div></div>' +
    '<span class="badge b-res">' + (openResign ? '접기' : '펼치기') + '</span></div>' +
    (openResign ?
      '<div class="resign-checks">' +
      '<label class="chk"><input type="checkbox" id="resignPaper"><span>사직서 작성 여부</span></label>' +
      '<label class="chk"><input type="checkbox" id="resignTbm"><span>TBM카드 반납 여부</span></label>' +
      '</div>' +
      '<div class="grid2" style="margin-top:4px">' +
      '<label class="field"><span>퇴사일자</span><input type="date" id="resignDate" value="' + todayKeyAdd(7) + '"></label>' +
      '<label class="field"><span>퇴사사유</span><select id="resignReason">' +
      '<option value="개인사유(직접입력)">개인사유(직접입력)</option>' +
      '<option value="부상(다쳐서)">부상(다쳐서)</option>' +
      '<option value="타현장 이동">타현장 이동</option>' +
      '<option value="계약만료">계약만료</option>' +
      '</select></label>' +
      '</div>' +
      '<label class="field" id="resignEtcWrap"><span>개인사유 내용</span><input id="resignEtc" placeholder="예) 가족 간호"></label>' +
      '<div class="banner">퇴사 처리되면 <b>출근 대상 · 조 편성 · 평균단가 계산에서 자동 제외</b>되고 퇴사자 보관함에 보관됩니다.</div>' +
      '<button class="btn btn-danger sm block" style="margin-top:10px" data-act="askResign">퇴사 신청 제출</button>'
      : '') +
    '</div>';

  return noticeBannerHTML('worker') + schedSummaryHTML() +
    '<div class="hello"><span class="av lg">' + esc(p.name.slice(0, 1)) + '</span><div>' +
    '<div class="h-name">' + esc(p.name) + ' 님</div>' +
    '<div class="muted">' + teamLabel(p.teamId) + ' · ' + esc(p.job) + ' · 한양이엔지(주) PCW</div></div></div>' +
    attCard + leaveCard + earlyCard + pdfQuickHTML() + resignCard +
    '<div class="foot-note">한양 pcw팀 · Supabase 실시간 저장</div>';
}

/* =========================================================
   작업일보 (기술인)
   ========================================================= */
function ensureDraft(tid) {
  if (!state.draft || state.draft.teamId !== tid) {
    state.draft = {
      teamId: tid,
      memberIds: teamMembers(tid).map(function (p) { return p.id; }),
      location: '',
      timeFrom: '08:00',
      timeTo: '17:00',
      content: 'RD 용접 FINAL 0P\nRD 서포트 0EA',
      note: ''
    };
  }
  if (state.draft.note === undefined) { state.draft.note = ''; }
  return state.draft;
}

function recentReportsHTML(tid) {
  var list = state.reports.filter(function (r) { return r.teamId === tid; })
    .sort(function (a, b) {
      if (a.date !== b.date) { return a.date < b.date ? 1 : -1; }
      return (a.submittedAt || '') < (b.submittedAt || '') ? 1 : -1;
    }).slice(0, 3);
  if (!list.length) { return ''; }
  return '<div class="card">' +
    '<div class="card-head"><div class="sec-t">최근 제출</div><span class="muted">최근 ' + list.length + '건</span></div>' +
    list.map(function (r) {
      var day = parseInt(String(r.date).split('-')[2], 10);
      return '<div class="p-row" data-act="reportDetail" data-id="' + r.id + '">' +
        '<span class="av' + (r.date === todayKey() ? '' : ' green') + '">' + pad2(day) + '</span>' +
        '<span class="p-main"><span class="p-name">' + shortDate(r.date) + ' (' + wd(r.date) + ') · ' + esc(r.location || '-') + '</span>' +
        '<span class="p-sub">작성자 ' + esc(authorLabel(r)) + ' · 제출 ' + esc(r.submittedAt || '-') + '</span></span>' +
        '<span class="p-right"><span class="badge b-ok">제출</span></span></div>';
    }).join('') +
    '<div class="hint">누르면 작업일보 전체 내용을 볼 수 있어요.</div></div>';
}

function teamReport(p) {
  var tid = p.teamId;
  if (!tid) {
    return '<div class="card"><div class="card-head"><div class="sec-t">작업일보</div><span class="badge b-none">조 미배정</span></div>' +
      '<div class="empty"><span class="e-ic">🧩</span>아직 소속 조가 없습니다.<br>관리자 <b>팀·조</b>에서 조를 배정하면<br>작업일보를 작성할 수 있어요.</div></div>' +
      '<div class="foot-note">조 배정은 관리자(박서하)에게 요청해 주세요</div>';
  }
  var t = teamById(tid);
  var rep = findReport(tid, todayKey());
  if (rep && state.ui.reportRewrite === rep.id) { rep = null; }   /* 다시 제출 중 */
  var d = ensureDraft(tid);
  var memNames = d.memberIds.map(function (id) { var q = personById(id); return q ? q.name : ''; }).filter(Boolean);

  var head = '<div class="card"><div class="card-head"><div><div class="sec-t">작업일보</div>' +
    '<div class="muted">' + (t ? esc(t.name) : '') + ' · ' + longDate(todayKey()) + ' · 마감 18:00</div></div>' +
    (rep ? '<span class="badge b-ok">제출완료 ' + rep.submittedAt + '</span>' : '<span class="badge b-bad">미제출</span>') + '</div>' +
    '<div class="hint" style="margin-top:0">우리 조 작업일보입니다. 현장에서 바로 적어 제출하면 관리자 <b>작업일보함</b>에 전달됩니다.</div>' +
    '</div>';

  if (rep) {
    return head +
      '<div class="card">' +
      '<div class="kv"><span>작성자</span><b>' + esc(authorLabel(rep)) + '</b></div>' +
      '<div class="kv"><span>작업위치</span><b>' + esc(rep.location) + '</b></div>' +
      '<div class="kv"><span>작업시간</span><b>' + esc(rep.timeFrom) + ' ~ ' + esc(rep.timeTo) + '</b></div>' +
      '<div class="kv"><span>투입 인원</span><b>' + (rep.memberNames || []).length + '명</b></div>' +
      '<div class="rep-content">' + esc(rep.content) + '</div>' +
      (rep.note ? '<div class="rep-note"><b>특이사항</b>' + esc(rep.note).replace(/\n/g, '<br>') + '</div>' : '') +
      '<div class="hint">제출 시각 ' + rep.submittedAt + ' · 관리자 작업일보함에 등록되었습니다.</div>' +
      '<button class="btn btn-line sm block" style="margin-top:12px" data-act="reportRewrite">내용 고쳐서 다시 제출</button>' +
      '</div>' + recentReportsHTML(tid);
  }

  return head +
    '<div class="card">' +
    '<label class="field"><span>팀명</span><input value="' + (t ? esc(t.name) : '') + '" readonly></label>' +
    '<div class="field"><span>작업자 명단 · <b>' + d.memberIds.length + '명</b></span>' +
    '<div class="btn-row" style="margin:2px 0 4px">' +
    '<button class="btn btn-line sm" data-act="loadPrev">이전 명단 불러오기</button>' +
    '<button class="btn btn-line sm" data-act="loadPrevReport">이전 일보 불러오기</button>' +
    '</div>' +
    '<div class="chips">' +
    d.memberIds.map(function (id) {
      var q = personById(id);
      return q ? '<span class="chip">' + esc(q.name) + ' <i data-act="draftRemove" data-id="' + id + '">×</i></span>' : '';
    }).join('') +
    '<button class="chip add" data-act="draftAdd">＋ 추가</button>' +
    '</div></div>' +
    '<div class="grid2">' +
    '<label class="field"><span>작업위치</span><input data-draft="location" value="' + esc(d.location) + '" placeholder="P5 4F A-B 49-50"></label>' +
    '<label class="field"><span>작업시간</span><div class="time-row">' +
    '<input data-draft="timeFrom" value="' + esc(d.timeFrom) + '" inputmode="numeric">' +
    '<span>~</span>' +
    '<input data-draft="timeTo" value="' + esc(d.timeTo) + '" inputmode="numeric">' +
    '</div></label>' +
    '</div>' +
    '<div class="banner">물량이 없더라도 반드시 아래 양식을 포함해 주세요 · <b>서포트는 완전 설치 시 카운트</b></div>' +
    '<label class="field"><span>작업내용</span>' +
    '<textarea class="mono rep-input" rows="6" data-draft="content">' + esc(d.content) + '</textarea></label>' +
    '<div class="hint">기본 양식이 미리 채워져 있어요. 수량(P / EA)만 고쳐 주세요.</div>' +
    '<label class="field"><span>특이사항</span>' +
    '<textarea rows="2" id="repNote" data-draft="note" placeholder="예)10:00~11:00정기교육으로 출문">' + esc(d.note || '') + '</textarea></label>' +
    '<div class="hint">교육 · 시험 · 자재 지연 등 전달할 내용을 적어 주세요. 없으면 비워 두셔도 됩니다.</div>' +
    '<button class="btn btn-primary block" style="margin-top:11px" data-act="submitReport">작업일보 제출</button>' +
    '</div>' +
    recentReportsHTML(tid) +
    '<div class="foot-note">제출하면 관리자 <b>작업일보함</b>에 즉시 등록됩니다</div>';
}

/* =========================================================
   현장 자료 (PDF)
   ========================================================= */
var DOC_CATS = [
  { key: 'risk', label: '위험성평가', btn: '위험성평가 확인하기', ic: '⚠️' },
  { key: 'spec', label: '시방서', btn: '시방서 확인하기', ic: '📘' }
];

function pdfQuickHTML() {
  var r = (state.docs.risk || [])[0];
  var s = (state.docs.spec || [])[0];
  return '<div class="card">' +
    '<div class="card-head"><div><div class="sec-t">현장 자료</div>' +
    '<div class="muted">위험성평가 · 시방서 PDF를 바로 열어 볼 수 있어요</div></div>' +
    '<span class="badge b-work">PDF</span></div>' +
    '<div class="btn-row">' +
    '<button class="btn btn-line sm" data-act="openPdf" data-id="' + (r ? r.id : '') + '"' + (r ? '' : ' disabled') + '>위험성평가 확인하기</button>' +
    '<button class="btn btn-line sm" data-act="openPdf" data-id="' + (s ? s.id : '') + '"' + (s ? '' : ' disabled') + '>시방서 확인하기</button>' +
    '</div></div>';
}

function pdfById(id) {
  var all = (state.docs.risk || []).concat(state.docs.spec || []);
  return all.filter(function (f) { return f.id === id; })[0] || null;
}

var pdfPreviewOpen = false;

function openPdf(id, keepPreview) {
  var f = pdfById(id);
  if (!f) { toast('등록된 PDF가 없어요.'); return; }
  if (!keepPreview) { pdfPreviewOpen = false; }
  var body =
    '<div class="pdf-cover">' +
    '<span class="pdf-cover-ic">PDF</span>' +
    '<div class="pdf-cover-main"><div class="pdf-cover-name">' + esc(f.name) + '</div>' +
    '<div class="pdf-cover-sub">' + (f.addedAt ? shortDate(f.addedAt) + ' 등록' : '등록됨') + '</div></div>' +
    '</div>' +
    '<div class="btn-row" style="margin-top:12px">' +
    '<a class="btn btn-ghost sm" href="' + esc(f.url) + '" target="_blank" rel="noopener">다운로드</a>' +
    '<a class="btn btn-primary sm" href="' + esc(f.url) + '" target="_blank" rel="noopener">PDF 열기</a>' +
    '</div>' +
    '<button class="btn btn-line sm block" style="margin-top:8px" data-act="pdfPreviewToggle" data-id="' + f.id + '">' +
    (pdfPreviewOpen ? '미리보기 접기' : '여기서 미리보기') + '</button>' +
    (pdfPreviewOpen
      ? '<div class="pdf-view"><iframe class="pdf-frame" src="' + esc(f.url) + '" title="' + esc(f.name) + '"></iframe></div>'
      : '') +
    '<div class="hint"><b>PDF 열기</b>를 누르면 휴대폰 PDF 뷰어로 바로 열립니다.<br>열리지 않으면 <b>다운로드</b>를 눌러 주세요.</div>';
  openSheet('PDF', body, '<button class="btn btn-ghost" data-act="closeSheet">닫기</button>');
}

function pdfRowHTML(cat, f, isAdmin) {
  return '<div class="pdf-row">' +
    '<span class="pdf-ic">PDF</span>' +
    '<span class="pdf-main"><span class="pdf-name">' + esc(f.name) + '</span>' +
    '<span class="pdf-sub">' + (f.addedAt ? shortDate(f.addedAt) + ' 등록' : '') + '</span></span>' +
    '<button class="pdf-open" data-act="openPdf" data-id="' + f.id + '">열기</button>' +
    (isAdmin ? '<button class="doc-del" data-act="delPdf" data-id="' + f.id + '" data-cat="' + cat + '">삭제</button>' : '') +
    '</div>';
}

function docsViewerHTML(who) {
  var isAdmin = who === 'admin' && isAdminView();
  return DOC_CATS.map(function (c) {
    var files = state.docs[c.key] || [];
    var latest = files[0];
    var list = files.length
      ? files.map(function (f) { return pdfRowHTML(c.key, f, isAdmin); }).join('')
      : '<div class="empty" style="padding:14px 4px">' + (isAdmin ? '아직 올린 PDF가 없습니다. 아래에서 파일을 올려 주세요.' : '관리자가 아직 등록하지 않았습니다.') + '</div>';
    return '<div class="card">' +
      '<div class="card-head"><div><div class="sec-t">' + c.ic + ' ' + c.label + '</div>' +
      '<div class="muted">' + (files.length ? 'PDF ' + files.length + '개 · 최근 등록 ' + shortDate(files[0].addedAt) : '등록된 PDF 없음') + '</div></div>' +
      '<span class="badge b-work">PDF</span></div>' +
      '<button class="btn btn-primary block doc-open-btn" data-act="openPdf" data-id="' + (latest ? latest.id : '') + '"' + (latest ? '' : ' disabled') + '>' + c.btn + '</button>' +
      '<div class="pdf-list">' + list + '</div>' +
      (isAdmin
        ? '<label class="upload-box"><input type="file" accept="application/pdf,.pdf" class="pdf-in" data-cat="' + c.key + '" hidden>' +
          '<span class="ub-ic">＋</span><span class="ub-tx">' + c.label + ' PDF 파일 업로드</span></label>'
        : '') +
      '</div>';
  }).join('') +
    '<div class="foot-note">' + (isAdmin
      ? 'PDF는 Supabase Storage <b>site-docs</b> 버킷에 저장됩니다 · 파일당 50MB까지'
      : '자료는 관리자가 등록 · 교체합니다') + '</div>';
}

/* =========================================================
   일정 달력 (홈)
   ========================================================= */
function schedMonthKey() {
  var mk = state.ui.schedMonth || todayKey().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(mk) ? mk : todayKey().slice(0, 7);
}
function schedSelDate() {
  var d = state.ui.schedDate || todayKey();
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayKey();
}
function schedTimeText(s) { return s.time ? esc(s.time) : '종일'; }

function monthDayLabel(k) {
  var p = String(k).split('-');
  return parseInt(p[1], 10) + '월 ' + parseInt(p[2], 10) + '일';
}

/* 홈에 보이는 한 줄 요약 카드 — 누르면 전체 달력이 열린다 */
function schedSummaryHTML() {
  var tk = todayKey();
  var day = tk;
  var list = schedulesOn(tk).slice().sort(schedSort);
  if (!list.length) {
    var future = (state.schedules || []).filter(function (s) { return s.date > tk; }).sort(function (a, b) {
      if (a.date !== b.date) { return a.date < b.date ? -1 : 1; }
      return schedSort(a, b);
    });
    if (future.length) { day = future[0].date; list = schedulesOn(day).slice().sort(schedSort); }
  }
  var main;
  if (list.length) {
    main = '<b class="sched-sum-date">' + monthDayLabel(day) + '</b>' +
      '<span class="sched-sum-title">' + esc(list[0].title) + '</span>' +
      (list.length > 1 ? '<span class="sched-sum-more">외 ' + (list.length - 1) + '건</span>' : '');
  } else {
    main = '<b class="sched-sum-date">' + monthDayLabel(tk) + '</b>' +
      '<span class="sched-sum-title none">등록된 일정 없음</span>';
  }
  return '<button class="card sched-sum" data-act="openSchedCal">' +
    '<span class="sched-sum-flag">📅 일정</span>' +
    '<span class="sched-sum-main">' + main + '</span>' +
    '<span class="sched-sum-go">달력 ›</span>' +
    '</button>';
}

function schedCalendarHTML() {
  var mk = schedMonthKey();
  var sel = schedSelDate();
  var p = mk.split('-');
  var y = parseInt(p[0], 10), m = parseInt(p[1], 10);
  var firstDow = new Date(y, m - 1, 1).getDay();
  var last = new Date(y, m, 0).getDate();
  var tk = todayKey();
  var cells = [];
  var i;
  for (i = 0; i < firstDow; i++) { cells.push('<span class="sched-cell blank"></span>'); }
  for (var d = 1; d <= last; d++) {
    var k = y + '-' + pad2(m) + '-' + pad2(d);
    var n = schedulesOn(k).length;
    var cls = 'sched-cell';
    if (k === sel) { cls += ' sel'; }
    if (k === tk) { cls += ' today'; }
    if (n) { cls += ' has'; }
    cells.push('<span class="' + cls + '" data-act="schedPick" data-d="' + k + '" role="button" tabindex="0">' +
      '<span class="n">' + d + '</span>' +
      (n ? '<span class="sched-dot">' + (n > 1 ? n : '') + '</span>' : '') + '</span>');
  }
  while (cells.length % 7 !== 0) { cells.push('<span class="sched-cell blank"></span>'); }

  var list = schedulesOn(sel).slice().sort(schedSort);
  var rows = list.length ? list.map(function (s) {
    return '<div class="sched-item">' +
      '<span class="sched-time">' + schedTimeText(s) + '</span>' +
      '<span class="sched-main"><span class="sched-title">' + esc(s.title) + '</span>' +
      (s.memo ? '<span class="sched-memo">' + esc(s.memo).replace(/\n/g, '<br>') + '</span>' : '') + '</span>' +
      (canManage() ? '<span class="sched-acts">' +
        '<button class="sched-ib" data-act="schedEdit" data-id="' + esc(s.id) + '" aria-label="일정 수정">✎</button>' +
        '<button class="sched-ib del" data-act="schedAskDel" data-id="' + esc(s.id) + '" aria-label="일정 삭제">🗑</button></span>' : '') +
      '</div>';
  }).join('') : '<div class="sched-empty">등록된 일정이 없습니다</div>';

  return '<div class="card sched-card">' +
    '<div class="card-head">' +
    '<div><div class="sec-t">📅 ' + monthDayLabel(sel) + ' (' + wd(sel) + ')</div><div class="muted">이번 달 ' + schedMonthCount(mk) + '건 · ' + longDate(sel) + '</div></div>' +
    '<div class="sched-nav">' +
    '<button class="sched-arrow" data-act="schedPrev" aria-label="이전 달">‹</button>' +
    '<b class="sched-month">' + monthLabel(mk) + '</b>' +
    '<button class="sched-arrow" data-act="schedNext" aria-label="다음 달">›</button>' +
    '</div></div>' +
    '<div class="sched-week">' + ['일', '월', '화', '수', '목', '금', '토'].map(function (w, idx) {
      return '<span class="sched-wd' + (idx === 0 ? ' sun' : idx === 6 ? ' sat' : '') + '">' + w + '</span>';
    }).join('') + '</div>' +
    '<div class="sched-grid">' + cells.join('') + '</div>' +
    '<div class="sched-dayhead">' +
    '<div class="sched-daytitle">' + longDate(sel) + (sel === todayKey() ? ' <span class="badge b-work">오늘</span>' : '') + '</div>' +
    (canManage() ? '<button class="btn btn-line sm" data-act="schedNew">+ 일정 추가</button>' : '') +
    '</div>' +
    '<div class="sched-list">' + rows + '</div>' +
    (!canManage() ? '<div class="hint">일정 등록·수정은 관리자·팀장만 할 수 있습니다.</div>' : '') +
    '</div>';
}

function openScheduleSheet(id) {
  var s = id ? (state.schedules || []).filter(function (x) { return x.id === id; })[0] : null;
  var d = s ? s.date : schedSelDate();
  var body =
    '<label class="field"><span>날짜</span><input type="date" id="sc_date" value="' + esc(d) + '"></label>' +
    '<label class="field"><span>제목</span><input id="sc_title" value="' + esc(s ? s.title : '') + '" placeholder="예) 정기 안전교육"></label>' +
    '<label class="field"><span>시간 <span class="muted">(선택)</span></span><input id="sc_time" value="' + esc(s ? s.time : '') + '" placeholder="예) 08:30 또는 10:00~11:00"></label>' +
    '<label class="field"><span>메모 <span class="muted">(선택)</span></span><textarea id="sc_memo" rows="3" placeholder="예) 전 인원 참석, 교육 후 TBM">' + esc(s ? s.memo : '') + '</textarea></label>' +
    '<div class="banner">등록하면 기술인·관리자 홈 <b>일정 달력</b>의 그 날짜에 바로 표시됩니다.</div>';
  openSheet(s ? '일정 수정' : '일정 추가', body,
    '<button class="btn btn-ghost" data-act="closeSheet">취소</button>' +
    '<button class="btn btn-primary" data-act="schedSave" data-id="' + (s ? esc(s.id) : '') + '">' + (s ? '저장' : '등록') + '</button>');
}

/* 홈 요약 카드를 누르면 열리는 전체 달력 (시트) */
function openSchedSheet() {
  var sb = $('#sheetBody');
  var st = (sb && $('#sheetWrap').classList.contains('open')) ? sb.scrollTop : 0;
  openSheet('일정 달력', schedCalendarHTML(), '<button class="btn btn-ghost" data-act="closeSheet">닫기</button>');
  if (sb) { sb.scrollTop = st; }
  state.ui.schedSheet = true;
}

/* =========================================================
   관리자 화면
   ========================================================= */
function adminView() {
  var tab = state.ui.adminTab;
  if (tab === 'teams') { return adminTeams(); }
  if (tab === 'reports') { return adminReports(); }
  if (tab === 'docs') { return docsViewerHTML('admin'); }
  return adminDash();
}

function adminDash() {
  var view = state.ui.adminDashView === 'gongsu' ? 'gongsu' : 'today';
  var seg = '<div class="seg big" style="margin-bottom:11px">' +
    '<button class="' + (view === 'today' ? 'on' : '') + '" data-act="adminDashView" data-v="today">오늘 현황</button>' +
    '<button class="' + (view === 'gongsu' ? 'on' : '') + '" data-act="adminDashView" data-v="gongsu">한달 공수표</button>' +
    '</div>';
  return seg + (view === 'gongsu' ? adminGongsu() : noticeBannerHTML('admin') + schedSummaryHTML() + adminTodayBody());
}

function gsPeopleList() {
  var f = state.ui.adminGsTeam || 'all';
  var order = {};
  state.teams.forEach(function (t, i) { order[t.id] = i; });
  var list = activePeople();
  if (f === 'none') { list = list.filter(function (p) { return !p.teamId || !teamById(p.teamId); }); }
  else if (f !== 'all') { list = list.filter(function (p) { return p.teamId === f; }); }
  return list.sort(function (a, b) {
    var ta = a.teamId ? (order[a.teamId] === undefined ? 90 : order[a.teamId]) : 99;
    var tb = b.teamId ? (order[b.teamId] === undefined ? 90 : order[b.teamId]) : 99;
    if (ta !== tb) { return ta - tb; }
    if (a.role !== b.role) { return a.role === 'leader' ? -1 : 1; }
    return a.name.localeCompare(b.name, 'ko');
  });
}

function adminGongsu() {
  var mk = state.ui.gsMonth || todayKey().slice(0, 7);
  var f = state.ui.adminGsTeam || 'all';
  var mem = gsPeopleList();
  var days = monthDayKeys(mk);
  var totals = {};
  var grand = 0;
  mem.forEach(function (m) { totals[m.id] = gongsuMonthUpTo(m, mk); grand += totals[m.id]; });
  grand = Math.round(grand * 1000) / 1000;

  var unassigned = activePeople().filter(function (p) { return !p.teamId || !teamById(p.teamId); });
  var filters = [['all', '전체']].concat(state.teams.map(function (t) { return [t.id, t.name]; }));
  if (unassigned.length) { filters.push(['none', '미배정']); }
  var filterHtml = '<div class="filter-row">' + filters.map(function (x) {
    return '<button class="fchip' + (f === x[0] ? ' on' : '') + '" data-act="gsTeam" data-f="' + x[0] + '">' + esc(x[1]) + '</button>';
  }).join('') + '</div>';

  var nav = '<div class="month-nav">' +
    '<button data-act="gsMonth" data-d="-1">\u2039</button>' +
    '<span class="m-lab">' + monthLabel(mk) + '</span>' +
    '<button data-act="gsMonth" data-d="1">\u203a</button>' +
    '</div>';

  var teamSummary = '';
  if (f === 'all' && state.teams.length) {
    var rows = state.teams.map(function (t) {
      var m = teamMembers(t.id);
      var sum = 0;
      m.forEach(function (q) { sum += gongsuMonthUpTo(q, mk); });
      sum = Math.round(sum * 1000) / 1000;
      return { name: t.name, n: m.length, gs: sum };
    });
    if (unassigned.length) {
      var nsum = 0;
      unassigned.forEach(function (q) { nsum += gongsuMonthUpTo(q, mk); });
      rows.push({ name: '미배정', n: unassigned.length, gs: Math.round(nsum * 1000) / 1000 });
    }
    teamSummary = '<div class="gs-team">' +
      '<div class="gs-team-row head"><span>조</span><span class="tc">인원</span><span class="tg">월 공수</span><span class="ta">1인 평균</span></div>' +
      rows.map(function (r) {
        return '<div class="gs-team-row"><span>' + esc(r.name) + '</span><span class="tc">' + r.n + '명</span>' +
          '<span class="tg">' + fmtGs(r.gs) + '</span>' +
          '<span class="ta">' + (r.n ? fmtGs(Math.round((r.gs / r.n) * 1000) / 1000) : '-') + '</span></div>';
      }).join('') +
      '<div class="gs-team-row total"><span>전체</span><span class="tc">' + mem.length + '명</span>' +
      '<span class="tg">' + fmtGs(grand) + '공수</span>' +
      '<span class="ta">' + (mem.length ? fmtGs(Math.round((grand / mem.length) * 1000) / 1000) : '-') + '</span></div>' +
      '</div>';
  }

  var thead = '<tr><th class="gs-name">일자</th>' +
    mem.map(function (m) { return '<th class="gs-phead" data-act="openPerson" data-id="' + m.id + '" data-name="' + esc(m.name) + '">' + esc(m.name) + '</th>'; }).join('') +
    '<th class="gs-day">계</th></tr>';

  var rows = days.map(function (k) {
    var dsum = 0;
    var tds = mem.map(function (m) {
      var v = gongsuOn(m, k);
      dsum += v;
      return '<td class="gs-c' + (v ? ' on v' + String(v).replace('.', '') : '') + '" data-v="' + v + '">' + (v ? fmtGs(v) : '·') + '</td>';
    }).join('');
    return '<tr><td class="gs-name">' + shortDate(k) + '<em>' + wd(k) + '</em></td>' + tds +
      '<td class="gs-day">' + (dsum ? fmtGs(Math.round(dsum * 1000) / 1000) : '·') + '</td></tr>';
  }).join('');

  var totalRow = '<tr class="gs-sum"><td class="gs-name">월 합계</td>' +
    mem.map(function (m) { return '<td class="gs-t" data-v="' + totals[m.id] + '">' + fmtGs(totals[m.id]) + '</td>'; }).join('') +
    '<td class="gs-day gs-t">' + fmtGs(grand) + '</td></tr>';

  var table;
  if (!mem.length) {
    table = '<div class="empty"><span class="e-ic">\ud83d\udc65</span>이 조에 인원이 없습니다.<br>다른 조를 선택해 보세요.</div>';
  } else if (!days.length) {
    table = '<div class="empty"><span class="e-ic">\ud83d\udcc5</span>이 달 공수 기록이 없습니다.<br>지난 달로 이동해 확인해 보세요.</div>';
  } else {
    table = '<div class="gs-wrap"><table class="gs-table"><thead>' + thead + '</thead><tbody>' + rows + totalRow + '</tbody></table></div>';
  }

  var sumCard = '';
  if (f !== 'all' && mem.length) {
    sumCard = '<div class="card">' +
      '<div class="card-head"><div class="sec-t">인원별 월 합계</div><span class="pill-mini">' + monthLabel(mk) + '</span></div>' +
      mem.map(function (m) {
        return '<div class="kv"><span>' + esc(m.name) + ' ' + (m.role === 'leader' ? '<span class="tag tag-leader">반장</span>' : '') + '</span>' +
          '<b>' + fmtGs(totals[m.id]) + '공수</b></div>';
      }).join('') +
      '</div>';
  }

  return '<div class="card">' +
    '<div class="card-head"><div><div class="sec-t">' + (f === 'all' ? '전체' : esc(teamLabel(f))) + ' · 한달 공수표</div>' +
    '<div class="muted">' + monthLabel(mk) + ' · <span data-count="gongsu">' + mem.length + '명</span></div></div>' +
    '<span class="badge b-work">총 ' + fmtGs(grand) + '공수</span></div>' +
    nav + filterHtml + nameSearchHTML('gongsu') +
    '<div data-list="gongsu">' + teamSummary + table +
    '<div class="empty q-empty hide">검색 결과가 없습니다.</div></div>' +
    '<div class="hint">공수 기준 · 점심 11:00~13:00 제외 · 출근은 분이 있으면 다음 정각부터 · <b>8시간 이하 = 시간 × 0.125</b> · <b>8시간 초과 = 1.0 + (초과 × 0.25)</b> · 휴무·미출근 0<br>이름을 누르면 그 사람의 월 근태·공수 상세가 열립니다.</div>' +
    '</div>' + sumCard +
    '<div class="foot-note">날짜별 공수는 출퇴근 시각으로 자동 계산됩니다 · 시간을 수정하면 바로 다시 계산됩니다</div>';
}

/* TBM 리더 자격 알림 */
function tbmAlerts() {
  var out = [];
  activePeople().forEach(function (p) {
    (p.certs || []).forEach(function (c) {
      if (c.name !== 'TBM 리더' || !c.on || !c.exp) { return; }
      var du = daysUntil(c.exp);
      if (du !== null && du <= 30) { out.push({ p: p, exp: c.exp, du: du }); }
    });
  });
  return out.sort(function (a, b) { return a.du - b.du; });
}

function tbmAlertHTML() {
  var list = tbmAlerts();
  if (!list.length) { return ''; }
  var expired = list.filter(function (x) { return x.du < 0; }).length;
  var soon = list.length - expired;
  return '<div class="card tbm-card">' +
    '<div class="card-head"><div><div class="sec-t">⚠️ TBM 리더 자격 알림</div>' +
    '<div class="muted">만료 <b>' + expired + '명</b> · 30일 이내 만료 <b>' + soon + '명</b></div></div>' +
    '<span class="badge b-bad">확인 필요</span></div>' +
    '<div class="tbm-chips">' +
    list.map(function (x) {
      return '<button class="tbm-chip" data-act="openPerson" data-id="' + x.p.id + '">' +
        '<span class="nm">' + esc(x.p.name) + '</span>' +
        '<span class="du' + (x.du < 0 ? ' out' : '') + '">' + (x.du < 0 ? '만료 ' + Math.abs(x.du) + '일' : 'D-' + x.du) + '</span></button>';
    }).join('') +
    '</div>' +
    '<div class="hint">이름을 누르면 인원 상세에서 <b>TBM 리더 자격 만료일</b>을 바로 고칠 수 있어요.</div>' +
    '</div>';
}

/* ---------- 📋 오늘 인원 현황 요약 카드 ---------- */
/* 카톡 보고용 휴무자 명단 텍스트 */
function leaveCopyText(dateKey) {
  var k = dateKey || todayKey();
  var p = String(k).split('-');
  var head = parseInt(p[1], 10) + '월 ' + parseInt(p[2], 10) + '일 ' + wd(k) + '요일 휴무자 명단';
  var list = [];
  peopleAsOf(k).forEach(function (x) {
    var l = leaveOn(x, k);
    if (l) { list.push({ name: x.name, reason: l.reason || '사유 미입력' }); }
  });
  list.sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); });
  if (!list.length) { return head + ' : 없음'; }
  return head + '\n' + list.map(function (x, i) {
    return (i === 0 ? ': ' : '  ') + x.name + '(사유 : ' + x.reason + ')';
  }).join('\n');
}

/* ---------- 🏃 조퇴 명단 · [조퇴보고] 복사 양식 ---------- */
/* 그 날짜 조퇴자 (반려 제외) — 이름 순. [{p: 사람, e: 조퇴신청}] */
function earlyListFor(k) {
  var key = k || todayKey();
  var out = [];
  peopleAsOf(key).forEach(function (p) {
    (p.earlyLeaves || []).forEach(function (e) {
      if (e.date !== key) { return; }
      if ((e.status || 'pending') === 'rejected') { return; }
      out.push({ p: p, e: e });
    });
  });
  return out.sort(function (a, b) { return a.p.name.localeCompare(b.p.name, 'ko'); });
}
/* 카톡에 붙여넣는 [조퇴보고] 양식 — x = {p, e} 또는 {name, date, start, end, reason} */
function earlyReportText(x) {
  var e = (x && x.e) || x || {};
  var nm = (x && x.p) ? x.p.name : (e.name || '');
  var k = e.date || todayKey();
  var sp = String(k).split('-');
  var dateText = sp.length === 3
    ? (parseInt(sp[1], 10) + '월 ' + parseInt(sp[2], 10) + '일 ' + wd(k) + '요일')
    : String(k);
  return '[조퇴보고]\n' +
    '날짜 : ' + dateText + '\n' +
    '이름 : ' + nm + '\n' +
    '사유 : ' + (e.reason ? e.reason : '사유 미입력') + '\n' +
    '근무시간 : ' + (e.start || '') + '~' + (e.end || '');
}
/* 여러 명이면 사람 블록을 빈 줄(\n\n)로 구분해 한 번에 복사 */
function earlyReportAllText(k) {
  var list = earlyListFor(k);
  if (!list.length) { return ''; }
  return list.map(function (x) { return earlyReportText(x); }).join('\n\n');
}

function hcDateKey() {
  var d = state.ui && state.ui.hcDate;
  return /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) ? d : todayKey();
}
/* 그 날짜 기준 재직자 (그 뒤에 퇴사한 사람은 포함) */
function peopleAsOf(k) {
  return state.people.filter(function (p) {
    if (p.status !== 'resigned') { return true; }
    var rd = p.resign && p.resign.date;
    return !!(rd && rd > k);
  });
}
/* 그 날짜까지 퇴사한 사람 */
function resignedAsOf(k) {
  return state.people.filter(function (p) {
    if (p.status !== 'resigned') { return false; }
    var rd = p.resign && p.resign.date;
    return !rd || rd <= k;
  });
}
function hcOffList(ps, k) {
  var out = [];
  ps.forEach(function (p) {
    var l = leaveOn(p, k);
    if (l) { out.push({ name: p.name, reason: l.reason || '' }); }
  });
  return out.sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); });
}

/* 인원 현황 카드에 보이는 퇴사자 = 퇴사일로부터 7일 이내 (일주일 지나면 카드에서 숨김 · 보관함에는 그대로) */
function resignedInCard(tk) {
  return state.people.filter(function (p) {
    if (p.status !== 'resigned') { return false; }
    var rd = p.resign && p.resign.date;
    if (!rd) { return false; }
    if (rd > tk) { return false; }
    var gap = Math.round((parseKey(tk) - parseKey(rd)) / 86400000);
    return gap >= 0 && gap <= 7;
  }).sort(function (a, b) {
    var da = (a.resign && a.resign.date) || '';
    var db = (b.resign && b.resign.date) || '';
    return da === db ? a.name.localeCompare(b.name, 'ko') : (da < db ? 1 : -1);
  });
}

function adminHeadcountCard() {
  var tk = hcDateKey();
  var isToday = tk === todayKey();
  var ps = peopleAsOf(tk);
  var res = resignedInCard(tk);
  var offs = hcOffList(ps, tk);
  var outCnt = Math.max(0, ps.length - offs.length);
  var nIn = 0, nNone = 0;
  ps.forEach(function (p) {
    if (leaveOn(p, tk)) { return; }
    var a = (p.attendance || {})[tk];
    if (a && a.in) { nIn++; } else { nNone++; }
  });

  var earlies = earlyListFor(tk);
  var earlyRows = earlies.length
    ? '<div class="hc-list">' + earlies.map(function (x) {
      var e = x.e, st = e.status || 'pending';
      return '<div class="hc-row hc-el-row">' +
        '<span class="hc-name">' + esc(x.p.name) + '</span>' +
        '<span class="hc-sub">' + esc(e.start) + '~' + esc(e.end) + ' · ' +
        (e.reason ? esc(e.reason) : '사유 미입력') + '</span>' +
        '<span class="badge ' + leaveBadgeCls(st) + ' hc-el-bd">' + leaveStatusLabel(st) + '</span>' +
        (canManage() ? '<button class="hc-copy hc-copy-mini" data-act="copyEarlyReport" data-id="' + e.id + '">복사</button>' : '') +
        '</div>';
    }).join('') + '</div>'
    : '';

  var offList = offs.length
    ? '<div class="hc-list">' + offs.map(function (o) {
      return '<div class="hc-row"><span class="hc-name">' + esc(o.name) + '</span>' +
        '<span class="hc-sub">' + (o.reason ? '(' + esc(o.reason) + ')' : '(사유 미입력)') + '</span></div>';
    }).join('') + '</div>'
    : '';

  var resList = res.length
    ? '<div class="hc-list">' + res.map(function (p) {
      var r = p.resign || {};
      return '<div class="hc-row"><span class="hc-name">' + esc(p.name) + '</span>' +
        '<span class="hc-sub">(' + (r.date ? String(r.date).replace(/-/g, '-') + ' 퇴사' : '퇴사') +
        (r.reason ? ' · ' + esc(r.reason) : '') + ')</span></div>';
    }).join('') + '</div>'
    : '';

  return '<div class="card hc-card">' +
    '<div class="hc-nav">' +
    '<button class="hc-arrow" data-act="hcDay" data-d="-1" aria-label="이전 날짜">‹</button>' +
    '<div class="hc-navmid"><div class="sec-t">📋 ' + mdLabel(tk) + ' 인원 현황</div>' +
    '<div class="muted">' + wd(tk) + '요일' + (isToday ? ' · 오늘' : '') + '</div></div>' +
    '<button class="hc-arrow" data-act="hcDay" data-d="1" aria-label="다음 날짜">›</button>' +
    '</div>' +
    '<div class="hc-tools">' +
    (isToday ? '' : '<button class="hc-today" data-act="hcToday">오늘</button>') +
    '<button class="hc-month" data-act="hcMonth" data-date="' + tk + '">한달 보기</button>' +
    '<span class="hc-foot-inline">출근 <b>' + nIn + '</b> · 미출근 <b>' + nNone + '</b></span>' +
    '</div>' +
    '<div class="hc-grid">' +
    '<div class="hc-item"><div class="hc-num">' + ps.length + '</div><div class="hc-lab">총원</div></div>' +
    '<div class="hc-item"><div class="hc-num c-off">' + offs.length + '</div><div class="hc-lab">휴무</div></div>' +
    '<div class="hc-item"><div class="hc-num c-out">' + outCnt + '</div><div class="hc-lab">출력인원</div></div>' +
    '</div>' +
    '<div class="hc-sect">' +
    '<div class="hc-head2"><div class="hc-t">휴무 <b>' + offs.length + '명</b>' + (offs.length ? '' : ' <span class="hc-none-inline">(없음)</span>') + '</div>' +
    (canManage() ? '<button class="hc-copy" data-act="leaveManage">휴무 관리</button>' : '') +
    (canManage() ? '<button class="hc-copy" data-act="copyLeaveList" data-date="' + tk + '">복사</button>' : '') +
    '</div>' +
    offList + '</div>' +
    '<div class="hc-sect hc-el-sect"><div class="hc-head2"><div class="hc-t">🏃 조퇴 <b>' + earlies.length + '명</b>' +
    (earlies.length ? '' : ' <span class="hc-none-inline">(없음)</span>') + '</div>' +
    (canManage() && earlies.length ? '<button class="hc-copy" data-act="copyEarlyReport" data-date="' + tk + '">전체 복사</button>' : '') +
    '</div>' +
    earlyRows + '</div>' +
    '<div class="hc-sect"><div class="hc-head2"><div class="hc-t">퇴사자 <b>' + res.length + '명</b>' +
    (res.length ? '' : ' <span class="hc-none-inline">(없음)</span>') + '</div>' +
    '<span class="hc-sub2">최근 7일</span></div>' +
    resList + '</div>' +
    '</div>';
}

/* 한달 간단히 보기 — 날짜별 출근·휴무·퇴사 요약 */
function hcMonthHTML(mk) {
  var sp = String(mk).split('-');
  var y = parseInt(sp[0], 10), m = parseInt(sp[1], 10);
  var last = new Date(y, m, 0).getDate();
  var tk = todayKey();
  var rows = [];
  var tot = { in: 0, off: 0, res: 0, days: 0, empty: 0 };
  for (var d = 1; d <= last; d++) {
    var k = mk + '-' + pad2(d);
    var ps = peopleAsOf(k);
    var offs = hcOffList(ps, k);
    var rs = state.people.filter(function (p) {
      return p.status === 'resigned' && p.resign && p.resign.date === k;
    });
    var nIn = 0;
    ps.forEach(function (p) {
      if (leaveOn(p, k)) { return; }
      var a = (p.attendance || {})[k];
      if (a && a.in) { nIn++; }
    });
    tot.in += nIn; tot.off += offs.length; tot.res += rs.length;
    if (nIn || offs.length || rs.length) { tot.days++; }
    var empty = !nIn && !offs.length && !rs.length;
    /* 기록 없는 날은 목록에서 빼고(오늘은 항상 표시) 아래에 몇 일인지 알려 준다 */
    if (empty && k !== tk) { tot.empty++; continue; }
    rows.push('<div class="hm-day' + (k === tk ? ' today' : '') + (k > tk ? ' fut' : '') + (empty ? ' empty' : '') + '" data-act="hcPick" data-date="' + k + '" role="button" tabindex="0">' +
      '<div class="hm-top"><span class="hm-d">' + shortDate(k) + ' <em>' + wd(k) + '</em>' +
      (k === tk ? ' <span class="hm-today">오늘</span>' : '') + '</span>' +
      '<span class="hm-cs">' +
      '<i class="hm-c hi-in">출근 ' + nIn + '</i>' +
      '<i class="hm-c hi-off">휴무 ' + offs.length + '</i>' +
      '<i class="hm-c hi-res">퇴사 ' + rs.length + '</i>' +
      '</span></div>' +
      (offs.length ? '<div class="hm-names">휴무 · ' + offs.map(function (o) {
        return esc(o.name) + (o.reason ? '(' + esc(o.reason) + ')' : '');
      }).join(', ') + '</div>' : '') +
      (rs.length ? '<div class="hm-names">퇴사 · ' + rs.map(function (x) { return esc(x.name); }).join(', ') + '</div>' : '') +
      '</div>');
  }
  return '<div class="month-nav">' +
    '<button data-act="hcMonthMove" data-d="-1" aria-label="이전 달">\u2039</button>' +
    '<span class="m-lab">' + monthLabel(mk) + '</span>' +
    '<button data-act="hcMonthMove" data-d="1" aria-label="다음 달">\u203a</button>' +
    '</div>' +
    '<div class="hm-sum">이번 달 <b>출근 연인원 ' + tot.in + '명</b> · <b>휴무 ' + tot.off + '명</b> · <b>퇴사 ' + tot.res + '명</b>' +
    '<br>기록이 있는 날 <b>' + tot.days + '일</b>' + (tot.empty ? ' · 기록 없는 날 ' + tot.empty + '일' : '') + '</div>' +
    '<div class="hm-list">' + (rows.join('') || '<div class="empty">이 달 기록이 없습니다.</div>') + '</div>' +
    '<div class="hint">날짜별 <b>출근</b>은 그 날 출근 기록이 있는 인원, <b>휴무</b>는 휴무 신청(보고) 인원입니다.<br>날짜를 누르면 그 날짜 현황으로 이동합니다.</div>';
}

function openHcMonth(mk) {
  openSheet('인원 현황 · 한달 보기',
    '<div id="hcMonthBox">' + hcMonthHTML(mk || hcDateKey().slice(0, 7)) + '</div>',
    '<button class="btn btn-ghost" data-act="closeSheet">닫기</button>');
}

function adminTodayBody() {
  var ps = activePeople();
  var cnt = { in: 0, out: 0, off: 0, none: 0 };
  ps.forEach(function (p) {
    var a = todayAtt(p);
    var lv = leaveOn(p, todayKey());
    if (lv) { cnt.off++; }
    else if (a && a.in) { cnt.in++; if (a.out && !isFutureOut(a)) { cnt.out++; } }
    else { cnt.none++; }
  });
  var res = resignedPeople().length;
  var teams = avgByTeam();
  var maxAvg = Math.max.apply(null, teams.map(function (t) { return t.avg; }).concat([1]));
  var barRef = Math.max(200000, maxAvg);

  var statCard = '<div class="card">' +
    '<div class="card-head"><div class="sec-t">오늘 현황</div><div class="muted">' + longDate(todayKey()) + '</div></div>' +
    '<div class="stat-grid">' +
    '<div class="stat"><div class="s-num c-in">' + cnt.in + '</div><div class="s-lab">출근</div></div>' +
    '<div class="stat"><div class="s-num c-out">' + cnt.out + '</div><div class="s-lab">퇴근</div></div>' +
    '<div class="stat"><div class="s-num c-off">' + cnt.off + '</div><div class="s-lab">휴무</div></div>' +
    '<div class="stat"><div class="s-num c-res">' + res + '</div><div class="s-lab">퇴사 누적</div></div>' +
    '</div>' +
    '<div class="stat-foot">총 인원 <b>' + ps.length + '명</b> (퇴사자 제외) · 미출근 <b>' + cnt.none + '명</b></div>' +
    '</div>';

  var avgCard = !isAdminView() ? '' : '<div class="card">' +
    '<div class="card-head"><div class="sec-t">평균 단가</div><span class="pill-mini">퇴사자 자동 제외</span></div>' +
    '<div class="avg-big"><b>' + won(overallAvg()) + '</b><span>원 / 1일</span></div>' +
    '<div class="avg-sub">전체 ' + ps.length + '명 기준 · 단가 미입력 인원 제외 · 수정하면 즉시 다시 계산</div>' +
    '<div class="avg-teams">' +
    (teams.length ? teams.map(function (t) {
      var w = Math.round((t.avg / barRef) * 100);
      return '<div class="avg-row"><span class="an">' + esc(t.name) + '</span>' +
        '<span class="abar"><i style="width:' + w + '%"></i></span>' +
        '<span class="av2">' + won(t.avg) + '</span>' +
        '<span class="ac">' + t.count + '명</span></div>';
    }).join('') : '<div class="muted">아직 만든 조가 없습니다.</div>') +
    '</div></div>';

  var filters = [['all', '전체']].concat(state.teams.map(function (t) { return [t.id, t.name]; }));
  var rp = resignedPeople();
  var hasNone = activePeople().filter(function (p) { return !p.teamId; }).length > 0;
  if (hasNone) { filters.push(['none', '미배정']); }
  var f = state.ui.adminTeamFilter || 'all';
  var filterHtml = '<div class="filter-row">' + filters.map(function (x) {
    return '<button class="fchip' + (f === x[0] ? ' on' : '') + '" data-act="adminFilter" data-f="' + x[0] + '">' + esc(x[1]) + '</button>';
  }).join('') + '</div>';

  var list = adminPeopleList();
  var rows = list.map(function (p) {
    return '<div class="p-row" data-act="openPerson" data-id="' + p.id + '" data-name="' + esc(p.name) + '">' +
      '<input type="checkbox" class="bulk-chk" data-id="' + p.id + '"' + (bulkSel[p.id] ? ' checked' : '') + ' aria-label="' + esc(p.name) + ' 선택">' +
      '<span class="av">' + esc(p.name.slice(0, 1)) + '</span>' +
      '<span class="p-main"><span class="p-name">' + esc(p.name) + ' ' +
      (p.role === 'leader' ? '<span class="tag tag-leader">반장</span>' : '') +
      (p.admin ? '<span class="tag tag-admin">관리자</span>' : '') + '</span>' +
      '<span class="p-sub">' + teamLabel(p.teamId) + ' · ' + birthText(p.birth) + '생' + (isAdminView() ? ' · ' + won(p.price) + '원' : '') + '</span></span>' +
      '<span class="p-right">' + statusBadge(p) + '<span class="p-time">' + timeText(p) + '</span></span>' +
      '</div>';
  }).join('');

  var bulkBar = '<div class="bulk-bar">' +
    '<div class="bulk-top"><span class="bulk-t">☑️ 공수 일괄 적용</span>' +
    '<button class="bulk-all" id="bulkAllBtn" data-act="bulkAll">전체 선택</button>' +
    '<span class="bulk-cnt" id="bulkCnt">0명 선택</span></div>' +
    '<div class="bulk-date"><span>날짜</span><input type="date" id="bulkDate" max="' + todayKey() + '" value="' + (state.ui.bulkDate || todayKey()) + '"></div>' +
    '<div class="bulk-pick"><span class="bulk-lab">시간</span>' +
    '<span class="bulk-selwrap"><select id="bulkGsSel" aria-label="공수 선택">' + bulkGsOptionsHTML() + '</select><i class="bulk-car">▾</i></span>' +
    '<button class="bulk-apply" data-act="bulkGsApply">적용</button></div>' +
    '<div class="bulk-custom hide" id="bulkCustom">' +
    '<div class="bulk-times">' +
    '<label class="bt-f"><span>시 작</span><input type="time" id="bulk_in"></label>' +
    '<label class="bt-f"><span>종 료</span><input type="time" id="bulk_out"></label>' +
    '</div>' +
    '<div class="bulk-prev" id="bulkPrev">시작·종료 시간을 넣으면 공수가 자동 계산됩니다.</div>' +
    '</div></div>';

  var peopleCard = '<div class="card">' +
    '<div class="card-head"><div class="sec-t">인원별 출퇴근</div><span class="muted" data-count="dash">' + list.length + '명</span></div>' +
    nameSearchHTML('dash') +
    filterHtml +
    bulkBar +
    '<div class="btn-row"><button class="btn btn-dark sm" data-act="personAdd">+ 인원 직접 등록</button></div>' +
    '<div data-list="dash">' +
    (rows || '<div class="empty">해당 인원이 없습니다.<br>팀·조 탭에서 <b>명단 일괄 등록</b>으로 인원을 넣어 주세요.</div>') +
    '<div class="empty q-empty hide">검색 결과가 없습니다.</div>' +
    '</div>' +
    '<button class="btn btn-line sm block" style="margin-top:12px" data-act="toggleArchive">퇴사자 보관함 ' + (state.ui.showArchive ? '닫기' : '보기') + ' (' + rp.length + '명)</button>' +
    (state.ui.showArchive ?
      '<div class="divider"></div>' +
      (rp.length ? rp.map(function (p) {
        return '<div class="p-row" data-act="openPerson" data-id="' + p.id + '">' +
          '<span class="av">' + esc(p.name.slice(0, 1)) + '</span>' +
          '<span class="p-main"><span class="p-name">' + esc(p.name) + ' <span class="tag tag-job">퇴사</span></span>' +
          '<span class="p-sub">' + (p.resign ? longDate(p.resign.date) : '') + ' · ' + (p.resign ? esc(p.resign.reason) : '') + '</span></span>' +
          '<span class="p-right"><span class="badge b-res">보관</span><span class="p-time">' + teamLabel(p.teamId) + '</span></span>' +
          '</div>';
      }).join('') : '<div class="empty">퇴사자가 없습니다.</div>') +
      '<div class="hint">퇴사자는 출근 명단 · 조 편성' + (isAdminView() ? ' · 평균단가 계산' : '') + '에서 자동으로 빠져 있습니다. 잘못 처리했다면 상세 화면에서 복직시킬 수 있어요.</div>'
      : '') +
    '</div>';

  var todayLeaves = activePeople().filter(function (p) { return !!leaveOn(p, todayKey()); });
  var leaveCard = todayLeaves.length ? '<div class="card">' +
    '<div class="card-head"><div><div class="sec-t">오늘 휴무</div>' +
    '<div class="muted">' + longDate(todayKey()) + ' · ' + todayLeaves.length + '명</div></div>' +
    '<button class="hc-copy" data-act="copyLeaveList" data-date="' + todayKey() + '">복사</button></div>' +
    todayLeaves.map(function (p) {
      var l = leaveOn(p, todayKey());
      return '<div class="p-row" data-act="openPerson" data-id="' + p.id + '">' +
        '<span class="av">' + esc(p.name.slice(0, 1)) + '</span>' +
        '<span class="p-main"><span class="p-name">' + esc(p.name) + ' <span class="tag tag-job">휴무</span></span>' +
        '<span class="p-sub">' + esc(l.reason) + ' · ' + esc(l.teamName || teamLabel(p.teamId)) + ' · 보고 ' + esc(leaveReportLabel(l.reportTo)) + '</span></span>' +
        '<span class="p-right"><span class="badge b-off2">' + esc(shortDate(l.date)) + '</span>' +
        '<span class="p-time">신청 ' + esc(l.at || '-') + '</span></span></div>';
    }).join('') +
    '<div class="hint">당일 휴무 취소는 기술인이 직접 할 수 없어 관리자에게 연락해야 합니다.</div>' +
    '</div>' : '';

  return adminHeadcountCard() + tbmAlertHTML() + statCard + leaveCard + avgCard + peopleCard +
    '<div class="foot-note">Supabase 실시간 저장 · 20초마다 자동 새로고침</div>';
}

function adminPeopleList() {
  var f = state.ui.adminTeamFilter || 'all';
  var list = activePeople();
  if (f === 'none') { list = list.filter(function (p) { return !p.teamId; }); }
  else if (f !== 'all') { list = list.filter(function (p) { return p.teamId === f; }); }
  var order = {};
  state.teams.forEach(function (t, i) { order[t.id] = i; });
  return list.sort(function (a, b) {
    var ta = a.teamId ? (order[a.teamId] === undefined ? 90 : order[a.teamId]) : 99;
    var tb = b.teamId ? (order[b.teamId] === undefined ? 90 : order[b.teamId]) : 99;
    if (ta !== tb) { return ta - tb; }
    if (a.role !== b.role) { return a.role === 'leader' ? -1 : 1; }
    return a.name.localeCompare(b.name, 'ko');
  });
}

/* ---------------- 팀·조 편성 ---------------- */
function adminTeams() {
  var ps = activePeople();
  var un = ps.filter(function (p) { return !p.teamId || !teamById(p.teamId); });

  var head = '<div class="card">' +
    '<div class="card-head"><div><div class="sec-t">팀 · 조 편성</div>' +
    '<div class="muted">전체 ' + ps.length + '명 · ' + state.teams.length + '개 조 · 미배정 ' + un.length + '명</div></div>' +
    '<span class="badge ' + (un.length ? 'b-warn' : 'b-ok') + '">' + (un.length ? '미배정 있음' : '전원 배정') + '</span></div>' +
    '<div class="btn-row">' +
    '<button class="btn btn-dark sm" data-act="newTeam">+ 새 팀/조 만들기</button>' +
    '<button class="btn btn-dark sm" data-act="personAdd">+ 인원 직접 등록</button>' +
    '</div>' +
    (isAdminView() ? '<button class="btn btn-line sm block" style="margin-top:8px" data-act="bulkOpen">명단/엑셀 일괄 등록</button>' : '') +
    (isAdminView() ? '<div class="hint">엑셀 명단을 붙여넣으면 조와 인원이 한 번에 만들어지고 평균단가도 다시 계산됩니다.</div>' : '') +
    nameSearchHTML('teams') +
    '<div class="muted" style="font-size:11.5px"><span data-count="teams">' + ps.length + '명</span></div>' +
    '</div>';

  var cards = state.teams.map(function (t) {
    var mem = teamMembers(t.id);
    var leader = leaderOf(t.id);
    var rep = findReport(t.id, todayKey());
    return '<div class="card team-card" data-teamcard="1">' +
      '<div class="card-head" style="margin-bottom:6px">' +
      '<div class="row gap8">' + (leader ? '<span class="av">' + esc(leader.name.slice(0, 1)) + '</span>' : '<span class="av">?</span>') +
      '<div><div class="team-name">' + esc(t.name) + '</div>' +
      '<div class="team-sub">반장 ' + (leader ? esc(leader.name) : '미지정') + ' · ' + mem.length + '명' + (isAdminView() ? ' · 평균 ' + won(avgOf(mem)) + '원' : '') + '</div></div></div>' +
      '<span class="badge ' + (rep ? 'b-ok' : 'b-warn') + '">' + (rep ? '일보 제출' : '일보 미제출') + '</span>' +
      '</div>' +
      '<div class="chips">' +
      (mem.length ? mem.map(function (m) {
        return '<button class="chip' + (m.role === 'leader' ? ' leader' : '') + '" data-act="moveMember" data-id="' + m.id + '" data-name="' + esc(m.name) + '">' +
          esc(m.name) + ' <i>⇄</i></button>';
      }).join('') : '<span class="muted">조원이 없습니다</span>') +
      '</div>' +
      '<div class="btn-row">' +
      '<button class="btn btn-line sm" data-act="changeLeader" data-team="' + t.id + '">반장 변경</button>' +
      '<button class="btn btn-line sm" data-act="addMembers" data-team="' + t.id + '">조원 이동/추가</button>' +
      '</div>' +
      '</div>';
  }).join('');

  var unCard = '';
  if (un.length) {
    unCard = '<div class="card unassigned team-card" data-teamcard="1">' +
      '<div class="card-head"><div><div class="team-name">미배정 ' + un.length + '명</div>' +
      '<div class="team-sub">조를 지정하면 조 편성에 포함됩니다</div></div><span class="badge b-warn">미배정</span></div>' +
      '<div class="chips">' + un.map(function (m) {
        return '<button class="chip" data-act="moveMember" data-id="' + m.id + '" data-name="' + esc(m.name) + '">' + esc(m.name) + ' <i>⇄</i></button>';
      }).join('') + '</div></div>';
  }

  return head +
    '<div data-list="teams">' + cards + unCard +
    '<div class="empty q-empty hide">검색 결과가 없습니다.</div></div>' +
    '<div class="foot-note">조 이동은 조원 이름을 눌러서 바꿀 수 있어요</div>';
}

/* ---------------- 작업일보함 ---------------- */
function adminReports() {
  var date = state.ui.reportDate || todayKey();
  var teams = state.teams;
  var subs = teams.filter(function (t) { return !!findReport(t.id, date); }).length;
  var miss = teams.length - subs;
  var pct = teams.length ? Math.round((subs / teams.length) * 100) : 0;

  var nav = '<div class="card">' +
    '<div class="date-nav">' +
    '<button data-act="repPrev">‹</button>' +
    '<div class="d-mid"><b>' + longDate(date) + '</b><div class="muted">' + (date === todayKey() ? '오늘' : date === addDays(todayKey(), -1) ? '어제' : '') + '</div></div>' +
    '<button data-act="repNext">›</button>' +
    '</div>' +
    '<div class="rep-sum"><span>제출 <b style="color:#027A48">' + subs + '조</b></span><span>미제출 <b style="color:#B42318">' + miss + '조</b></span><span class="bar"><i style="width:' + pct + '%"></i></span></div>' +
    '<button class="btn btn-dark block digest-btn" style="margin-top:12px" data-act="digestAll" data-date="' + date + '">' +
    '<span class="ic">📋</span>전체 일보 취합 복사</button>' +
    '<div class="hint">제출된 모든 조의 일보를 날짜 · 조 · 명단 · 작업내용 · 특이사항 순서로 한 번에 모아 복사합니다.</div>' +
    '</div>';

  var cards = teams.map(function (t) {
    var rep = findReport(t.id, date);
    var mem = teamMembers(t.id);
    var leader = leaderOf(t.id);
    if (rep) {
      var shortContent = String(rep.content).split('\n').slice(0, 3).join('\n');
      return '<div class="card rep-card">' +
        '<div class="card-head" style="margin-bottom:4px"><div class="rep-team">' + esc(t.name) + '</div>' +
        '<span class="badge b-ok">제출완료 ' + rep.submittedAt + '</span></div>' +
        '<div class="rep-meta">📍 ' + esc(rep.location) + ' · 🕗 ' + esc(rep.timeFrom) + '~' + esc(rep.timeTo) + ' · 👥 ' + (rep.memberNames || []).length + '명 · 반장 ' + (leader ? esc(leader.name) : '-') + '</div>' +
        '<div class="rep-author">✍️ 작성자 <b>' + esc(authorLabel(rep)) + '</b> · 제출 ' + esc(rep.submittedAt || '-') + '</div>' +
        '<div class="rep-content">' + esc(shortContent) + '</div>' +
        '<button class="btn btn-line sm block" style="margin-top:10px" data-act="reportDetail" data-id="' + rep.id + '">상세보기</button>' +
        '</div>';
    }
    return '<div class="card rep-card missing">' +
      '<div class="card-head" style="margin-bottom:4px"><div class="rep-team">' + esc(t.name) + '</div>' +
      '<span class="badge b-bad">미제출</span></div>' +
      '<div class="rep-meta">반장 ' + (leader ? esc(leader.name) : '미지정') + ' · 조원 ' + mem.length + '명 · 마감 18:00</div>' +
      '</div>';
  }).join('');

  return nav + (teams.length ? cards : '<div class="card"><div class="empty"><span class="e-ic">🧩</span>아직 만든 조가 없습니다.<br>팀·조 탭에서 조를 만들고 인원을 배정해 주세요.</div></div>') +
    '<div class="foot-note">작업일보는 기술인이 제출하면 이 화면에 바로 나타납니다</div>';
}

/* ---------------- 일보 전체 취합 ---------------- */
function composeDailyDigest(date) {
  var teams = state.teams;
  var subs = teams.filter(function (t) { return !!findReport(t.id, date); }).length;
  var lines = [];
  lines.push('[한양이엔지(주) PCW 작업일보] ' + longDate(date));
  lines.push('제출 ' + subs + '조 / 미제출 ' + (teams.length - subs) + '조');
  lines.push('');
  teams.forEach(function (t) {
    var rep = findReport(t.id, date);
    var leader = leaderOf(t.id);
    if (!rep) {
      lines.push('■ ' + t.name + ' (미제출)');
      lines.push('반장 : ' + (leader ? leader.name : '미지정'));
      lines.push('');
      return;
    }
    var names = rep.memberNames || [];
    lines.push('■ ' + t.name);
    lines.push('반장 : ' + (leader ? leader.name : '-'));
    lines.push('작성자 : ' + authorLabel(rep));
    lines.push('투입 : ' + names.length + '명 (' + (names.join(', ') || '-') + ')');
    lines.push('작업위치 : ' + (rep.location || '-'));
    lines.push('작업시간 : ' + (rep.timeFrom || '-') + ' ~ ' + (rep.timeTo || '-'));
    lines.push('작업내용 :');
    String(rep.content || '').split('\n').forEach(function (l) { lines.push('  ' + l); });
    lines.push('특이사항 : ' + (rep.note ? String(rep.note).replace(/\n/g, ' / ') : '없음'));
    lines.push('제출 : ' + (rep.submittedAt || '-'));
    lines.push('');
  });
  return lines.join('\n').replace(/\n+$/, '');
}

function fallbackCopy(text) {
  try {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    var ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) { return false; }
}

function copyText(text, cb) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { cb(true); }, function () { cb(fallbackCopy(text)); });
  } else {
    cb(fallbackCopy(text));
  }
}

function openDigest(date) {
  var text = composeDailyDigest(date);
  var subs = state.teams.filter(function (t) { return !!findReport(t.id, date); }).length;
  var body = '<div class="muted" style="margin-bottom:8px">' + longDate(date) + ' · 제출 ' + subs + '조 취합</div>' +
    '<pre class="digest-pre" id="digestText">' + esc(text) + '</pre>' +
    '<div class="hint">이 내용이 그대로 복사됩니다. 메신저 · 문자에 붙여넣어 공유하세요.</div>';
  openSheet('전체 일보 취합', body,
    '<button class="btn btn-ghost" data-act="closeSheet">닫기</button>' +
    '<button class="btn btn-primary" data-act="digestCopy" data-date="' + date + '">전체 복사</button>');
}

/* ---------------- 인원 상세 시트 ---------------- */
function certRowHTML(c) {
  var noExp = c.name === 'T/L';
  var du = (!noExp && c.exp) ? daysUntil(c.exp) : null;
  var badge = '';
  if (du !== null) {
    if (du < 0) { badge = '<span class="exp-warn">만료</span>'; }
    else if (du <= 30) { badge = '<span class="exp-warn">곧 만료</span>'; }
  }
  var nameHtml = c.custom
    ? '<input class="cert-name" value="' + esc(c.name) + '" placeholder="자격 이름">'
    : '<span class="cert-label">' + esc(c.name) + '</span>';
  var expHtml = noExp
    ? '<span class="cert-noexp">만료 없음</span>'
    : (c.exp ? '<input class="cert-exp" type="date" value="' + esc(c.exp) + '">'
      : '<button class="cert-exp-add" data-act="certExpAdd">만료일 입력</button>');
  return '<div class="cert-row" data-cert="' + esc(c.name) + '">' +
    '<label class="chk"><input type="checkbox" class="cert-on"' + (c.on ? ' checked' : '') + '>' + nameHtml + '</label>' +
    (badge || '') +
    expHtml +
    '<button class="cert-x" data-act="delCert">✕</button>' +
    '</div>';
}

/* 내 정보 · 📅 내 한달 공수표 — 달력형 (일~토 7열 · 미래 날짜도 입력·합산) */
function myGsMonthKey() {
  var mk = state.ui.myGsMonth || todayKey().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(mk) ? mk : todayKey().slice(0, 7);
}

function myGsCalCellHTML(p, k, d, tk) {
  var a = (p.attendance || {})[k];
  var lv = leaveOn(p, k);
  var gs = lv ? 0 : gongsuOf(a);
  var cls = 'mgc';
  if (String(k) === tk) { cls += ' today'; }
  if (k > tk) { cls += ' fut'; }
  if (lv) { cls += ' leave'; }
  else if (a && a.in) { cls += ' has'; }
  var inner = '<span class="mgc-d">' + d + '</span>';
  if (lv) {
    inner += '<span class="mgc-b off">휴무</span>';
  } else if (a && a.in) {
    var hmShort = function (t) { return String(t || '').replace(':00', ''); };
    inner += '<span class="mgc-b g' + String(gs).replace('.', '') + '">' + fmtGs(gs) + '</span>' +
      '<span class="mgc-t">' + (a.out ? hmShort(a.in) + '~' + hmShort(a.out) : hmShort(a.in)) + '</span>';
  }
  return '<button class="' + cls + '" data-act="myGsPick" data-date="' + k + '" aria-label="' +
    longDate(k) + ' 출퇴근 입력">' + inner + '</button>';
}

function myGsCalHTML(p) {
  var mk = myGsMonthKey();
  var sp = mk.split('-');
  var y = parseInt(sp[0], 10), m = parseInt(sp[1], 10);
  var firstDow = new Date(y, m - 1, 1).getDay();
  var last = new Date(y, m, 0).getDate();
  var tk = todayKey();
  var cells = [];
  var total = 0, workDays = 0, offDays = 0;
  var i, d;
  for (i = 0; i < firstDow; i++) { cells.push('<span class="mgc blank"></span>'); }
  for (d = 1; d <= last; d++) {
    var k = mk + '-' + pad2(d);
    var a = (p.attendance || {})[k];
    var lv = leaveOn(p, k);
    if (lv) { offDays++; } else if (a && a.in) { workDays++; total += gongsuOf(a); }
    cells.push(myGsCalCellHTML(p, k, d, tk));
  }
  while (cells.length % 7 !== 0) { cells.push('<span class="mgc blank"></span>'); }
  total = Math.round(total * 1000) / 1000;

  return '<div class="mgc-nav">' +
    '<button class="mgc-arrow" data-act="myGsMonth" data-d="-1" aria-label="이전 달">‹</button>' +
    '<b class="mgc-lab">' + monthLabel(mk) + '</b>' +
    '<button class="mgc-arrow" data-act="myGsMonth" data-d="1" aria-label="다음 달">›</button>' +
    '</div>' +
    '<div class="mgc-week">' + ['일', '월', '화', '수', '목', '금', '토'].map(function (w, idx) {
      return '<span class="mgc-wd' + (idx === 0 ? ' sun' : idx === 6 ? ' sat' : '') + '">' + w + '</span>';
    }).join('') + '</div>' +
    '<div class="mgc-grid">' + cells.join('') + '</div>' +
    '<div class="mgc-legend">' +
      '<span class="lg-i"><i class="lg-d g1"></i>1공수</span>' +
      '<span class="lg-i"><i class="lg-d g15"></i>1.5</span>' +
      '<span class="lg-i"><i class="lg-d off"></i>휴무</span>' +
      '<span class="lg-i lg-tip">날짜를 누르면 출퇴근 입력</span>' +
    '</div>' +
    '<div class="mygs-total">이번 달 총 공수: <b>' + fmtGs(total) + '공수</b> · 출근 <b>' + workDays + '일</b>' +
      (offDays ? ' · 휴무 <b>' + offDays + '일</b>' : '') + '</div>';
}

function openMyGsCal() {
  var p = me();
  if (!p) { return; }
  var body = '<div class="muted" style="margin:-6px 0 2px">날짜를 누르면 그 날 출근·퇴근 시간을 직접 입력·수정할 수 있습니다. <b>미래 날짜</b>도 미리 넣을 수 있어요.</div>' +
    '<div id="myGsBox">' + myGsCalHTML(p) + '</div>';
  openSheet('📅 내 한달 공수표', body,
    '<button class="btn btn-ghost" data-act="myGsToSettings">설정으로</button>' +
    '<button class="btn btn-primary" data-act="closeSheet">닫기</button>');
}

function attBlockHTML(p, scope) {
  var mk = state.ui.pMonth || todayKey().slice(0, 7);
  var days = {};
  Object.keys(p.attendance || {}).forEach(function (k) {
    if (k.slice(0, 7) === mk) { days[k] = { att: p.attendance[k] }; }
  });
  (p.leaves || []).forEach(function (l) {
    if (String(l.date).slice(0, 7) === mk) { days[l.date] = { leave: l }; }
  });
  var keys = Object.keys(days).sort().reverse();
  if (scope === 'admin') { keys = keys.filter(function (k) { return k <= todayKey(); }); }
  var workDays = keys.filter(function (k) { return days[k].att && days[k].att.in; }).length;
  var offDays = keys.filter(function (k) { return !!days[k].leave; }).length;
  var monthGs = scope === 'admin' ? gongsuMonthUpTo(p, mk) : gongsuMonth(p, mk);

  var rows = keys.map(function (k) {
    var d = days[k];
    var day = parseInt(String(k).split('-')[2], 10);
    var left = '<span class="ad">' + pad2(day) + '일<em>' + wd(k) + '</em></span>';
    if (d.leave) {
      return '<div class="att-tr">' + left +
        '<span class="at dim">--:--</span><span class="at dim">--:--</span>' +
        '<span class="ab"><span class="gs-badge off">0</span><span class="badge b-off2">휴무 · ' + esc(d.leave.reason) + '</span></span></div>';
    }
    var a = d.att;
    var gs = gongsuOf(a);
    var st = a.out ? '' : (k === todayKey() ? '<span class="badge b-work">근무중</span>' : '<span class="badge b-none">미퇴근</span>');
    return '<div class="att-tr">' + left +
      '<span class="at">' + (a.in || '--:--') + '</span>' +
      '<span class="at out">' + (a.out || '--:--') + '</span>' +
      '<span class="ab"><span class="gs-badge g' + String(gs).replace('.', '') + '">' + fmtGs(gs) + '공수</span>' + st + '</span></div>';
  }).join('');

  return '<div class="month-nav">' +
    '<button data-act="pmonth" data-d="-1">‹</button>' +
    '<span class="m-lab">' + monthLabel(mk) + '</span>' +
    '<button data-act="pmonth" data-d="1">›</button>' +
    '</div>' +
    '<div class="att-sum">' +
    '<div>출근 <b>' + workDays + '</b>일</div>' +
    '<div>월 공수 <b>' + fmtGs(monthGs) + '</b>공수</div>' +
    '<div>휴무 <b>' + offDays + '</b>일</div>' +
    '</div>' +
    '<div class="att-table">' + (rows || '<div class="empty" style="padding:18px 4px">이 달 기록이 없습니다.</div>') + '</div>';
}

function openPerson(id) {
  var p = personById(id);
  if (!p) { return; }
  state.ui.personOpen = id;
  var ta = todayAtt(p);
  var taEdited = !!(ta && (ta.inEdited || ta.outEdited));
  var todaySec = p.status === 'resigned' ? '' :
    '<div class="sect">' +
    '<div class="sect-t">출퇴근 기록 직접 입력 · 수정</div>' +
    '<div class="muted">날짜를 고르고 시각을 넣으면 공수가 바로 계산됩니다. 미래 날짜는 넣을 수 없습니다.</div>' +
    '<label class="field"><span>날짜</span><input type="date" id="pf_adate" max="' + todayKey() + '" value="' + todayKey() + '"></label>' +
    '<div class="grid2">' +
    '<label class="field"><span>출근 시각</span><input type="time" id="pf_tin" value="' + (ta && ta.in ? ta.in : '') + '"></label>' +
    '<label class="field"><span>퇴근 시각</span><input type="time" id="pf_tout" value="' + (ta && ta.out ? ta.out : '') + '"></label>' +
    '</div>' +
    '<div class="pf-presets">' +
    '<button class="chip" data-act="pfPreset" data-in="05:00" data-out="15:00">조출 05:00~15:00</button>' +
    '<button class="chip" data-act="pfPreset" data-in="07:00" data-out="17:00">1공수 07:00~17:00</button>' +
    '<button class="chip" data-act="pfPreset" data-in="07:00" data-out="19:00">1.5공수 07:00~19:00</button>' +
    '<button class="chip" data-act="pfPreset" data-in="07:00" data-out="11:00">조퇴 07:00~11:00</button>' +
    '</div>' +
    '<div class="att-now" id="pf_prev">예상 공수 <b>' + fmtGs(gongsuOf(ta)) + '공수</b>' + (taEdited ? ' <span class="ed-mark">(수정됨)</span>' : '') + '</div>' +
    '<button class="btn btn-line sm block" style="margin-top:9px" data-act="saveAttTimes" data-id="' + p.id + '">근태 저장 / 수정</button>' +
    '<div class="hint">저장하면 <b>전체 현황 · 한달 공수표</b>에 바로 다시 계산됩니다. 출근·퇴근을 모두 비우면 그 날짜 기록을 지웁니다.</div>' +
    '</div>';
  var teamOpts = '<option value="">미배정</option>' + state.teams.map(function (t) {
    return '<option value="' + t.id + '"' + (p.teamId === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>';
  }).join('');

  var body =
    '<div class="sheet-head">' +
    '<span class="av lg">' + esc(p.name.slice(0, 1)) + '</span>' +
    '<div style="flex:1"><div class="sheet-name">' + esc(p.name) + ' ' +
    (p.role === 'leader' ? '<span class="tag tag-leader">반장</span>' : '<span class="tag tag-job">기술인</span>') +
    (p.admin ? ' <span class="tag tag-admin">관리자 권한</span>' : '') +
    (p.status === 'resigned' ? ' <span class="badge b-res">퇴사</span>' : '') + '</div>' +
    '<div class="muted">' + teamLabel(p.teamId) + ' · ' + esc(p.job) + ' · ' + (p.status === 'resigned' ? '퇴사자 보관함' : statusOf(p)) + '</div></div>' +
    '</div>' +

    '<div class="sect">' +
    '<div class="sect-t">신상 정보' + (isAdminView() ? ' · 단가' : '') + '</div>' +
    '<div class="grid2">' +
    '<label class="field"><span>이름</span><input id="pf_name" value="' + esc(p.name) + '"></label>' +
    '<label class="field"><span>생년월일</span><input id="pf_birth" type="date" value="' + esc(p.birth) + '"></label>' +
    '<label class="field"><span>연락처</span><input id="pf_phone" type="tel" value="' + esc(p.phone) + '"></label>' +
    '<label class="field"><span>소속 조</span><select id="pf_team">' + teamOpts + '</select></label>' +
    '<label class="field"><span>직종</span><input id="pf_job" value="' + esc(p.job) + '"></label>' +
    '<label class="field"><span>입사일자</span><input id="pf_hire" type="date" value="' + esc(p.hireDate || '') + '"></label>' +
    (isAdminView() ? '<label class="field"><span>단가 (원/일)</span><input id="pf_price" type="number" inputmode="numeric" value="' + p.price + '"></label>' : '') +
    '</div>' +
    (isAdminView() ? '<div class="hint">단가를 저장하면 전체 · 조별 평균단가가 바로 다시 계산됩니다.</div>' : '') +
    '</div>' +

    todaySec +

    '<div class="sect">' +
    '<div class="sect-t">매달 근태 확인 · 공수</div>' +
    '<div id="attBlock" data-scope="admin">' + attBlockHTML(p, 'admin') + '</div>' +
    '</div>' +

    '<div class="sect">' +
    '<div class="sect-t">자격 확인</div>' +
    '<div id="certList">' + (p.certs || []).map(certRowHTML).join('') + '</div>' +
    '<button class="btn btn-line sm block" style="margin-top:9px" data-act="addCert">+ 자격 추가</button>' +
    '</div>' +

    '<div class="sect">' +
    '<div class="sect-t">현장 부상 이력</div>' +
    '<div class="seg-toggle" id="injurySeg">' +
    '<button class="' + (p.injury.has ? '' : 'on') + '" data-act="injury" data-v="no">없음</button>' +
    '<button class="' + (p.injury.has ? 'on' : '') + '" data-act="injury" data-v="yes">있음</button>' +
    '</div>' +
    '<div id="injuryFields" class="' + (p.injury.has ? '' : 'hide') + '">' +
    '<div class="grid2">' +
    '<label class="field"><span>부상 날짜</span><input id="pf_injdate" type="date" value="' + esc(p.injury.date) + '"></label>' +
    '<label class="field"><span>부상 내용</span><input id="pf_injnote" value="' + esc(p.injury.note) + '" placeholder="예) 우측 손목 염좌"></label>' +
    '</div></div>' +
    '</div>' +

    (isAdminView() ?
    '<div class="sect">' +
    '<div class="sect-t">권한 부여</div>' +
    '<div class="muted">관리자 화면 전체 권한과, 단가를 뺀 팀장 공용 화면 권한을 따로 줄 수 있습니다.</div>' +
    '<div class="kv"><span>관리자 권한</span><b>' + (p.admin ? '있음' : '없음') + '</b></div>' +
    '<button class="btn ' + (p.admin ? 'btn-danger' : 'btn-line') + ' sm block" style="margin-top:6px" data-act="toggleAdmin" data-id="' + p.id + '">' +
    (p.admin ? '관리자 권한 해제' : '관리자 권한 부여') + '</button>' +
    '<div class="kv" style="margin-top:11px"><span>팀장 권한</span><b>' + (p.role === 'leader' ? '있음' : '없음') + '</b></div>' +
    '<button class="btn ' + (p.role === 'leader' ? 'btn-danger' : 'btn-line') + ' sm block" style="margin-top:6px" data-act="toggleLeader" data-id="' + p.id + '">' +
    (p.role === 'leader' ? '팀장 권한 해제' : '팀장 권한 부여') + '</button>' +
    '<div class="hint">팀장은 전체 현황 · 팀·조 · 일보함 · 일정 · 공수표를 쓰지만 <b>단가·관리자 권한·암호</b>는 볼 수 없습니다. 관리자 권한이 있으면 상단 <b>관리자</b> 버튼도 생깁니다.</div>' +
    '</div>' : '') +

    '<div class="sect">' +
    '<div class="sect-t">특이사항 메모</div>' +
    '<textarea id="pf_memo" rows="3" placeholder="예) 장비 반입 담당, 토요일 근무 가능">' + esc(p.memo) + '</textarea>' +
    '</div>' +

    (p.status === 'resigned' ?
      '<div class="sect"><div class="sect-t">퇴사 정보</div>' +
      '<div class="kv"><span>퇴사일</span><b>' + (p.resign ? longDate(p.resign.date) : '-') + '</b></div>' +
      '<div class="kv"><span>사유</span><b>' + (p.resign ? esc(p.resign.reason) : '-') + '</b></div>' +
      '<button class="btn btn-line sm block" style="margin-top:10px" data-act="restore" data-id="' + p.id + '">복직 처리' + (isAdminView() ? ' (평균단가 · 조 편성에 다시 포함)' : ' (조 편성에 다시 포함)') + '</button>' +
      '</div>' : '');

  var footer = '<button class="btn btn-ghost" data-act="closeSheet">닫기</button>' +
    (p.status === 'resigned' ? '' : '<button class="btn btn-primary" data-act="savePerson" data-id="' + p.id + '">저장</button>');

  openSheet('인원 상세', body, footer);
}
