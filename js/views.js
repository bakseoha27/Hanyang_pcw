/* =========================================================
   화면 렌더링
   ========================================================= */
var TABS = {
  worker: [['home', '근태', '🕒'], ['report', '작업일보', '📝']],
  admin: [['dash', '전체 현황', '📊'], ['teams', '팀·조', '🧩'], ['reports', '작업일보함', '📥'], ['docs', '현장자료', '📁']]
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
  if (state.role === 'admin' && !canAdmin()) { state.role = 'worker'; }

  renderTop();
  var key = state.role === 'worker' ? 'workerTab' : 'adminTab';
  var valid = TABS[state.role].map(function (t) { return t[0]; });
  if (valid.indexOf(state.ui[key]) < 0) { state.ui[key] = valid[0]; }
  var html = state.role === 'worker' ? workerView() : adminView();
  $('#screen').innerHTML = html;
  renderTabs();
  renderSync();
  resetScrollOnce(state.role + ':' + state.ui[key]);
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
    '<div class="brand-sub">한양엔지(주) PCW · ' + shortDate(todayKey()) + ' (' + wd(todayKey()) + ')</div>' +
    '</div></div>';
}

function renderLoginTop() {
  $('#topbar').innerHTML = '<div class="tb-row">' + topBrandHTML() + '</div>';
}

function renderTop() {
  var p = me();
  if (!p) { renderLoginTop(); return; }
  var roles = '';
  if (canAdmin()) {
    var pairs = [['worker', '기술인', p.name], ['admin', '관리자', p.name]];
    roles = '<div class="roles">' + pairs.map(function (x) {
      var on = state.role === x[0] ? ' active' : '';
      return '<button class="role-btn' + on + '" data-act="role" data-role="' + x[0] + '">' +
        '<span class="r-main">' + x[1] + '</span><span class="r-sub">' + esc(x[2]) + '</span></button>';
    }).join('') + '</div>';
  }
  $('#topbar').innerHTML =
    '<div class="tb-row">' +
    topBrandHTML() +
    '<div class="tb-btns">' +
    '<button class="tb-ic" data-act="openSettings" title="내 정보" aria-label="내 정보">⚙️</button>' +
    '</div>' +
    '</div>' + roles;
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
   로그인
   ========================================================= */
function jobOptionsHTML(sel) {
  return JOB_LIST.map(function (j) {
    return '<option value="' + j + '"' + (sel === j ? ' selected' : '') + '>' + j + '</option>';
  }).join('');
}

/* 로그인 화면 전용 : 직종 + 맨 아래 [관리자] 선택칸 */
var LOGIN_ADMIN_LABEL = '관리자';
function loginJobOptionsHTML(sel) {
  return jobOptionsHTML(sel) +
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
  return '<div class="login-brand card">' +
    '<div class="lb-mark">한</div>' +
    '<div class="lb-t">한양 pcw팀 로그인</div>' +
    '<div class="lb-s">한양엔지(주) PCW · 처음이면 입력한 정보로 자동 등록됩니다</div>' +
    '</div>' +
    '<div class="card">' + err +
    '<label class="field"><span>이름</span><input id="li_name" placeholder="예) 김기종" autocomplete="name"></label>' +
    '<label class="field"><span>생년월일</span><input id="li_birth" type="text" inputmode="numeric" placeholder="예) 961228 또는 19961228" autocomplete="bday"></label>' +
    '<label class="field"><span>전화번호</span><input id="li_phone" type="tel" inputmode="numeric" placeholder="010-0000-0000" autocomplete="tel"></label>' +
    '<label class="field"><span>직종</span><select id="li_job">' + loginJobOptionsHTML('배관공') + '</select></label>' +
    '<button class="btn btn-primary block" style="margin-top:13px" data-act="loginSubmit">로그인</button>' +
    '<div class="hint">등록된 <b>이름 · 생년월일 · 전화번호</b>가 같으면 바로 로그인됩니다. 처음이면 기술인으로 자동 등록돼요.</div>' +
    '<div class="hint"><b>관리자</b>는 관리자 권한을 등록받은 분만 선택할 수 있습니다.</div>' +
    '<div class="hint">로그인은 이 휴대폰에 저장돼 <b>앱을 닫아도 풀리지 않습니다</b>. 로그아웃은 <b>⚙️ 내 정보</b>에서 직접 눌러야 해요.</div>' +
    '</div>' +
    '<div class="foot-note">한양 pcw팀<br>입력한 정보는 현장 Supabase DB에 저장됩니다</div>';
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

function myLeaveRowsHTML(p) {
  var leaves = (p.leaves || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  if (!leaves.length) {
    return '<div class="empty" style="padding:16px 4px">신청한 휴무가 없습니다.</div>';
  }
  return leaves.map(function (l) {
    var du = daysUntil(l.date);
    var badge = du > 0 ? '<span class="badge b-warn">D-' + du + '</span>'
      : du === 0 ? '<span class="badge b-work">오늘</span>'
        : '<span class="badge b-res">지난 휴무</span>';
    var acts = '';
    if (du > 0) {
      acts = '<span class="lv-acts">' +
        '<button class="lv-btn" data-act="editLeave" data-id="' + l.id + '">정정</button>' +
        '<button class="lv-btn del" data-act="askCancelLeave" data-id="' + l.id + '">취소</button></span>';
    } else if (du === 0) {
      acts = '<span class="lv-acts"><button class="lv-btn" disabled>취소 불가</button></span>';
    }
    return '<div class="lv-row">' +
      '<div class="lv-main"><div class="lv-date">' + longDate(l.date) + ' ' + badge + '</div>' +
      '<div class="lv-sub">' + esc(l.reason) + ' · ' + esc(l.teamName || teamLabel(p.teamId)) + ' · 보고 ' + esc(leaveReportLabel(l.reportTo)) + '</div></div>' +
      acts + '</div>' +
      (du === 0 ? '<div class="lv-warn">당일 취소는 박서하 총무에게 개인톡 혹은 관리자에게 연락해 주세요.</div>' : '');
  }).join('');
}

function openSettings(p) {
  if (!p) { return; }
  var body =
    '<div class="sheet-head">' +
    '<span class="av lg">' + esc(p.name.slice(0, 1)) + '</span>' +
    '<div style="flex:1"><div class="sheet-name">' + esc(p.name) + ' <span class="tag tag-job">기술인</span></div>' +
    '<div class="muted">' + teamLabel(p.teamId) + ' · ' + esc(p.job) + ' · ' + birthText(p.birth) + '생</div></div>' +
    '</div>' +

    '<div class="sect">' +
    '<div class="sect-t">개인정보 수정</div>' +
    '<div class="grid2">' +
    '<label class="field"><span>이름</span><input id="mi_name" value="' + esc(p.name) + '"></label>' +
    '<label class="field"><span>생년월일</span><input id="mi_birth" type="text" inputmode="numeric" value="' + esc(p.birth) + '" placeholder="예) 961228 또는 19961228"></label>' +
    '<label class="field"><span>전화번호</span><input id="mi_phone" type="tel" value="' + esc(p.phone) + '"></label>' +
    '<label class="field"><span>직종</span><select id="mi_job">' + jobOptionsHTML(p.job) + '</select></label>' +
    '</div>' +
    '<button class="btn btn-line sm block" style="margin-top:9px" data-act="saveMyInfo" data-id="' + p.id + '">개인정보 저장</button>' +
    '<div class="hint">이름 · 직종 · 연락처 · 생년월일은 관리자 인원 목록에도 바로 반영됩니다. 생년월일은 <b>숫자 6자리(961228)</b> 또는 <b>8자리(19961228)</b>로 적어 주세요.</div>' +
    '</div>' +

    '<div class="sect">' +
    '<div class="sect-t">내 한달 공수</div>' +
    '<div class="my-gs"><b>' + fmtGs(gongsuMonth(p, todayKey().slice(0, 7))) + '</b>공수 <span>이번 달</span></div>' +
    '<div id="attBlock">' + attBlockHTML(p) + '</div>' +
    '</div>' +

    '<div class="sect">' +
    '<div class="sect-t">내 휴무 신청 내역</div>' +
    '<div class="muted">내일 이후 휴무는 앱에서 바로 정정 · 취소할 수 있습니다.</div>' +
    '<div id="myLeaveList">' + myLeaveRowsHTML(p) + '</div>' +
    '</div>' +

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

function noticeBannerHTML(who) {
  var ns = noticeSorted();
  var addBtn = who === 'admin' ? '<button class="link-btn" data-act="noticeNew">＋ 새 공지 올리기</button>' : '';
  if (!ns.length) {
    return '<div class="card notice-card">' +
      '<div class="notice-head"><span class="notice-flag">📢 공지사항</span>' +
      '<span class="notice-meta">' + longDate(todayKey()) + '</span></div>' +
      '<div class="notice-empty">등록된 공지가 없습니다.</div>' +
      (who === 'admin' ? '<div class="notice-foot">' + addBtn + '</div>' : '') +
      '</div>';
  }
  var n = ns[0];
  var rest = ns.length - 1;
  return '<div class="card notice-card">' +
    '<div class="notice-head">' +
    '<span class="notice-flag' + (n.pinned ? ' pin' : '') + '">' + (n.pinned ? '📌 필독 공지' : '📢 공지사항') + '</span>' +
    '<span class="notice-meta">' + shortDate(n.date) + ' (' + wd(n.date) + ') · ' + esc(n.author || '관리자') + '</span>' +
    '</div>' +
    '<button class="notice-body" data-act="openNotice" data-id="' + esc(n.id) + '">' +
    '<span class="notice-title">' + esc(n.title) + '</span>' +
    '<span class="notice-prev">' + esc(noticePreview(n.body)) + '</span>' +
    '<span class="notice-more">자세히 보기 ›</span>' +
    '</button>' +
    (rest > 0 || who === 'admin'
      ? '<div class="notice-foot">' +
        (rest > 0 ? '<button class="link-btn" data-act="openNoticeList">공지 ' + ns.length + '건 전체 보기</button>' : '<span></span>') +
        addBtn + '</div>'
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
    (canAdmin() ? '<button class="btn btn-line" data-act="noticeNew">새 공지 올리기</button>' : ''));
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
    '<div class="banner">올리면 기술인 홈 <b>맨 위 공지 카드</b>에 바로 표시됩니다.</div>';
  openSheet('새 공지 올리기', body,
    '<button class="btn btn-ghost" data-act="closeSheet">취소</button>' +
    '<button class="btn btn-primary" data-act="createNotice">공지 올리기</button>');
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
    (canAdmin() ? '<button class="btn btn-line sm block" style="margin-top:12px" data-act="role" data-role="admin">관리자 화면에서 확인하기</button>' : '') +
    '</div>' +
    '<div class="foot-note">다시 일하게 되면 관리자에게 <b>복직 처리</b>를 요청해 주세요</div>';
}

function workerHome(p) {
  var a = todayAtt(p);
  var edit = !!state.ui.timeEdit;
  var poll = latestPoll();
  var myVote = poll ? poll.votes[p.id] : null;
  var recentLeaves = (p.leaves || []).slice().sort(function (x, y) { return x.date < y.date ? 1 : -1; }).slice(0, 3);

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
      (a && a.out ? a.out + edMark(a.outEdited) : '미등록') + '</div></div>' +
      '</div>' +
      '<div class="btn-row">' +
      '<button class="btn btn-in" data-act="clockIn"' + (a && a.in ? ' disabled' : '') + '>출근하기</button>' +
      '<button class="btn btn-out" data-act="clockOut"' + (a && a.in && !a.out ? '' : ' disabled') + '>퇴근하기</button>' +
      '</div>' +
      (a && a.in ? '<button class="btn btn-line sm block time-edit-btn" data-act="timeEditOpen">🕘 시간 수정' + (a.out ? ' · 출근 / 퇴근' : ' · 출근만 기록됨') + '</button>' : '') +
      (a && a.in && a.out ? '<div class="done-line">오늘 근무 완료 · ' + a.in + ' ~ ' + a.out + ' · ' + fmtGs(gongsuOf(a)) + '공수</div>' : '') +
      (a && a.in && !a.out ? '<div class="small-note">퇴근할 때 <b>퇴근하기</b>를 눌러 주세요. 누른 시각이 관리자 화면에 바로 표시됩니다.</div>' : '');
  }

  var attCard =
    '<div class="card">' +
    '<div class="card-head"><div><div class="sec-t">오늘 근태</div><div class="muted">' + longDate(todayKey()) + '</div></div>' +
    '<div class="clock" id="liveClock">' + nowHM() + '</div></div>' +
    attInner +
    '</div>';

  var pollCard;
  if (!poll) {
    pollCard = '<div class="card"><div class="sec-t">토요일 출근 여부</div><div class="empty"><span class="e-ic">📅</span>올라온 공지가 없습니다.<br>관리자가 공지를 올리면 여기에서 응답할 수 있어요.</div></div>';
  } else {
    var c = pollCounts(poll);
    var open = pollIsOpen(poll);
    var closed = !open;
    pollCard =
      '<div class="card">' +
      '<div class="card-head"><div class="sec-t">토요일 출근 여부</div>' + (closed ? '<span class="badge b-res">응답 마감</span>' : '<span class="badge b-warn">응답 중</span>') + '</div>' +
      '<div class="poll-title">' + esc(poll.title) + '</div>' +
      '<div class="muted" style="margin-top:3px">마감 ' + esc(fmtDeadline(poll.deadline)) + ' · 응답 ' + (c.yes + c.no) + '/' + c.total + '명</div>' +
      '<div class="vote-row">' +
      '<button class="btn vote-btn yes' + (myVote === 'yes' ? ' on' : '') + '" data-act="vote" data-v="yes"' + (closed ? ' disabled' : '') + '>예</button>' +
      '<button class="btn vote-btn no' + (myVote === 'no' ? ' on' : '') + '" data-act="vote" data-v="no"' + (closed ? ' disabled' : '') + '>아니오</button>' +
      '</div>' +
      (myVote ? '<div class="hint">내 응답 · <b>' + (myVote === 'yes' ? '출근 가능(예)' : '출근 어려움(아니오)') + '</b>' + (closed ? '' : ' · 다시 눌러 변경할 수 있어요') + '</div>'
        : '<div class="hint">' + (closed ? '응답이 마감되었습니다.' : '토요일 출근이 가능한지 선택해 주세요.') + '</div>') +
      '</div>';
  }

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
    (recentLeaves.length ?
      '<div class="divider"></div><div class="muted" style="font-weight:800;color:#475467">최근 신청</div>' +
      recentLeaves.map(function (l) {
        return '<div class="kv"><span>' + shortDate(l.date) + ' (' + wd(l.date) + ') · ' + esc(l.reason) +
          '<em class="kv-sub">' + esc(l.teamName || teamLabel(p.teamId)) + ' · 보고 ' + esc(leaveReportLabel(l.reportTo)) + '</em></span><b>신청됨</b></div>';
      }).join('') || '' : '') +
    '<div class="hint">신청 내역 정정 · 취소는 오른쪽 위 <b>⚙️ 내 정보</b>에서 할 수 있습니다. (당일 휴무는 관리자에게 연락)</div>' +
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

  return noticeBannerHTML('worker') + schedCalendarHTML() +
    '<div class="hello"><span class="av lg">' + esc(p.name.slice(0, 1)) + '</span><div>' +
    '<div class="h-name">' + esc(p.name) + ' 님</div>' +
    '<div class="muted">' + teamLabel(p.teamId) + ' · ' + esc(p.job) + ' · 한양엔지(주) PCW</div></div></div>' +
    attCard + pollCard + leaveCard + pdfQuickHTML() + resignCard +
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
    '<button class="btn btn-line sm" data-act="loadPrev" style="margin-bottom:2px">이전 명단 불러오기</button>' +
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
  var isAdmin = who === 'admin';
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
      (canAdmin() ? '<span class="sched-acts">' +
        '<button class="sched-ib" data-act="schedEdit" data-id="' + esc(s.id) + '" aria-label="일정 수정">✎</button>' +
        '<button class="sched-ib del" data-act="schedAskDel" data-id="' + esc(s.id) + '" aria-label="일정 삭제">🗑</button></span>' : '') +
      '</div>';
  }).join('') : '<div class="sched-empty">등록된 일정이 없습니다</div>';

  return '<div class="card sched-card">' +
    '<div class="card-head">' +
    '<div><div class="sec-t">📅 일정 달력</div><div class="muted">' + shortDate(sel) + ' (' + wd(sel) + ') 일정 · 이번 달 ' + schedMonthCount(mk) + '건</div></div>' +
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
    (canAdmin() ? '<button class="btn btn-line sm" data-act="schedNew">+ 일정 추가</button>' : '') +
    '</div>' +
    '<div class="sched-list">' + rows + '</div>' +
    (!canAdmin() ? '<div class="hint">일정 등록·수정은 관리자만 할 수 있습니다.</div>' : '') +
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
  return seg + (view === 'gongsu' ? adminGongsu() : noticeBannerHTML('admin') + schedCalendarHTML() + adminTodayBody());
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
  mem.forEach(function (m) { totals[m.id] = gongsuMonth(m, mk); grand += totals[m.id]; });
  grand = Math.round(grand * 10) / 10;

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
      m.forEach(function (q) { sum += gongsuMonth(q, mk); });
      sum = Math.round(sum * 10) / 10;
      return { name: t.name, n: m.length, gs: sum };
    });
    if (unassigned.length) {
      var nsum = 0;
      unassigned.forEach(function (q) { nsum += gongsuMonth(q, mk); });
      rows.push({ name: '미배정', n: unassigned.length, gs: Math.round(nsum * 10) / 10 });
    }
    teamSummary = '<div class="gs-team">' +
      '<div class="gs-team-row head"><span>조</span><span class="tc">인원</span><span class="tg">월 공수</span><span class="ta">1인 평균</span></div>' +
      rows.map(function (r) {
        return '<div class="gs-team-row"><span>' + esc(r.name) + '</span><span class="tc">' + r.n + '명</span>' +
          '<span class="tg">' + fmtGs(r.gs) + '</span>' +
          '<span class="ta">' + (r.n ? fmtGs(Math.round((r.gs / r.n) * 10) / 10) : '-') + '</span></div>';
      }).join('') +
      '<div class="gs-team-row total"><span>전체</span><span class="tc">' + mem.length + '명</span>' +
      '<span class="tg">' + fmtGs(grand) + '공수</span>' +
      '<span class="ta">' + (mem.length ? fmtGs(Math.round((grand / mem.length) * 10) / 10) : '-') + '</span></div>' +
      '</div>';
  }

  var thead = '<tr><th class="gs-name">일자</th>' +
    mem.map(function (m) { return '<th class="gs-phead" data-act="openPerson" data-id="' + m.id + '">' + esc(m.name) + '</th>'; }).join('') +
    '<th class="gs-day">계</th></tr>';

  var rows = days.map(function (k) {
    var dsum = 0;
    var tds = mem.map(function (m) {
      var v = gongsuOn(m, k);
      dsum += v;
      return '<td class="gs-c' + (v ? ' on v' + String(v).replace('.', '') : '') + '" data-v="' + v + '">' + (v ? fmtGs(v) : '·') + '</td>';
    }).join('');
    return '<tr><td class="gs-name">' + shortDate(k) + '<em>' + wd(k) + '</em></td>' + tds +
      '<td class="gs-day">' + (dsum ? fmtGs(Math.round(dsum * 10) / 10) : '·') + '</td></tr>';
  }).join('');

  var totalRow = '<tr class="gs-sum"><td class="gs-name">월 합계</td>' +
    mem.map(function (m) { return '<td class="gs-t">' + fmtGs(totals[m.id]) + '</td>'; }).join('') +
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
    '<div class="muted">' + monthLabel(mk) + ' · ' + mem.length + '명</div></div>' +
    '<span class="badge b-work">총 ' + fmtGs(grand) + '공수</span></div>' +
    nav + filterHtml + teamSummary + table +
    '<div class="hint">공수 기준 · 07:00 출근 / 점심 2시간 포함 · <b>~17:00 = 1공수</b> · <b>~19:00 = 1.5공수</b> · <b>~21:00 = 2공수</b> · 휴무·미출근 0<br>이름을 누르면 그 사람의 월 근태·공수 상세가 열립니다.</div>' +
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

function adminTodayBody() {
  var ps = activePeople();
  var cnt = { in: 0, out: 0, off: 0, none: 0 };
  ps.forEach(function (p) {
    var a = todayAtt(p);
    var lv = leaveOn(p, todayKey());
    if (lv) { cnt.off++; }
    else if (a && a.in) { cnt.in++; if (a.out) { cnt.out++; } }
    else { cnt.none++; }
  });
  var res = resignedPeople().length;
  var teams = avgByTeam();
  var maxAvg = Math.max.apply(null, teams.map(function (t) { return t.avg; }).concat([1]));
  var barRef = Math.max(200000, maxAvg);
  var poll = latestPoll();

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

  var avgCard = '<div class="card">' +
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

  var pollCard;
  if (!poll) {
    pollCard = '<div class="card"><div class="card-head"><div class="sec-t">토요일 출근 여부</div>' +
      '<button class="link-btn" data-act="newPoll">+ 토요일 조사</button></div>' +
      '<div class="empty"><span class="e-ic">📅</span>올린 조사가 없습니다.<br>토요일 출근 여부를 조사로 올려 보세요.</div></div>';
  } else {
    var c = pollCounts(poll);
    var py = c.total ? (c.yes / c.total) * 100 : 0;
    var pn = c.total ? (c.no / c.total) * 100 : 0;
    var open = pollIsOpen(poll);
    pollCard = '<div class="card">' +
      '<div class="card-head"><div class="sec-t">토요일 출근 여부</div>' +
      '<button class="link-btn" data-act="newPoll">+ 새 조사</button></div>' +
      '<div class="poll-title">' + esc(poll.title) + '</div>' +
      '<div class="muted" style="margin-top:3px">마감 ' + esc(fmtDeadline(poll.deadline)) + ' · ' + (open ? '응답 받는 중' : '응답 마감됨') + '</div>' +
      '<div class="poll-bars"><i class="pb-yes" style="width:' + py + '%"></i><i class="pb-no" style="width:' + pn + '%"></i></div>' +
      '<div class="poll-counts">' +
      '<span class="c-yes">예 <b>' + c.yes + '</b></span>' +
      '<span class="c-no">아니오 <b>' + c.no + '</b></span>' +
      '<span>미응답 <b>' + c.none + '</b></span>' +
      '</div>' +
      '<div class="btn-row">' +
      (open ? '<button class="btn btn-ghost sm" data-act="closePoll" data-id="' + poll.id + '">응답 마감</button>' : '<button class="btn btn-line sm" data-act="newPoll">새 조사 올리기</button>') +
      '<button class="btn btn-line sm" data-act="pollDetail" data-id="' + poll.id + '">누가 응답했나</button>' +
      '</div></div>';
  }

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
    return '<div class="p-row" data-act="openPerson" data-id="' + p.id + '">' +
      '<span class="av">' + esc(p.name.slice(0, 1)) + '</span>' +
      '<span class="p-main"><span class="p-name">' + esc(p.name) + ' ' +
      (p.role === 'leader' ? '<span class="tag tag-leader">반장</span>' : '') +
      (p.admin ? '<span class="tag tag-admin">관리자</span>' : '') + '</span>' +
      '<span class="p-sub">' + teamLabel(p.teamId) + ' · ' + birthText(p.birth) + '생 · ' + won(p.price) + '원</span></span>' +
      '<span class="p-right">' + statusBadge(p) + '<span class="p-time">' + timeText(p) + '</span></span>' +
      '</div>';
  }).join('');

  var peopleCard = '<div class="card">' +
    '<div class="card-head"><div class="sec-t">인원별 출퇴근</div><span class="muted">이름 누르면 상세</span></div>' +
    filterHtml +
    (rows || '<div class="empty">해당 인원이 없습니다.<br>팀·조 탭에서 <b>명단 일괄 등록</b>으로 인원을 넣어 주세요.</div>') +
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
      '<div class="hint">퇴사자는 출근 명단 · 조 편성 · 평균단가 계산에서 자동으로 빠져 있습니다. 잘못 처리했다면 상세 화면에서 복직시킬 수 있어요.</div>'
      : '') +
    '</div>';

  var todayLeaves = activePeople().filter(function (p) { return !!leaveOn(p, todayKey()); });
  var leaveCard = todayLeaves.length ? '<div class="card">' +
    '<div class="card-head"><div><div class="sec-t">오늘 휴무</div>' +
    '<div class="muted">' + longDate(todayKey()) + ' · ' + todayLeaves.length + '명</div></div>' +
    '<span class="badge b-off2">휴무</span></div>' +
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

  return tbmAlertHTML() + statCard + leaveCard + avgCard + pollCard + peopleCard +
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
    '<button class="btn btn-line sm" data-act="bulkOpen">명단/엑셀 일괄 등록</button>' +
    '</div>' +
    '<div class="hint">엑셀 명단을 붙여넣으면 조와 인원이 한 번에 만들어지고 평균단가도 다시 계산됩니다.</div>' +
    '</div>';

  var cards = state.teams.map(function (t) {
    var mem = teamMembers(t.id);
    var leader = leaderOf(t.id);
    var rep = findReport(t.id, todayKey());
    return '<div class="card team-card">' +
      '<div class="card-head" style="margin-bottom:6px">' +
      '<div class="row gap8">' + (leader ? '<span class="av">' + esc(leader.name.slice(0, 1)) + '</span>' : '<span class="av">?</span>') +
      '<div><div class="team-name">' + esc(t.name) + '</div>' +
      '<div class="team-sub">반장 ' + (leader ? esc(leader.name) : '미지정') + ' · ' + mem.length + '명 · 평균 ' + won(avgOf(mem)) + '원</div></div></div>' +
      '<span class="badge ' + (rep ? 'b-ok' : 'b-warn') + '">' + (rep ? '일보 제출' : '일보 미제출') + '</span>' +
      '</div>' +
      '<div class="chips">' +
      (mem.length ? mem.map(function (m) {
        return '<button class="chip' + (m.role === 'leader' ? ' leader' : '') + '" data-act="moveMember" data-id="' + m.id + '">' +
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
    unCard = '<div class="card unassigned team-card">' +
      '<div class="card-head"><div><div class="team-name">미배정 ' + un.length + '명</div>' +
      '<div class="team-sub">조를 지정하면 평균단가에 포함됩니다</div></div><span class="badge b-warn">미배정</span></div>' +
      '<div class="chips">' + un.map(function (m) {
        return '<button class="chip" data-act="moveMember" data-id="' + m.id + '">' + esc(m.name) + ' <i>⇄</i></button>';
      }).join('') + '</div></div>';
  }

  return head + cards + unCard +
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
  lines.push('[한양엔지(주) PCW 작업일보] ' + longDate(date));
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

function attBlockHTML(p) {
  var mk = state.ui.pMonth || todayKey().slice(0, 7);
  var days = {};
  Object.keys(p.attendance || {}).forEach(function (k) {
    if (k.slice(0, 7) === mk) { days[k] = { att: p.attendance[k] }; }
  });
  (p.leaves || []).forEach(function (l) {
    if (String(l.date).slice(0, 7) === mk) { days[l.date] = { leave: l }; }
  });
  var keys = Object.keys(days).sort().reverse();
  var workDays = keys.filter(function (k) { return days[k].att && days[k].att.in; }).length;
  var offDays = keys.filter(function (k) { return !!days[k].leave; }).length;
  var monthGs = gongsuMonth(p, mk);

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
    '<div class="sect-t">오늘 출퇴근 시간 수정</div>' +
    '<div class="muted">' + longDate(todayKey()) + ' · 늦게 찍은 경우 실제 시각으로 고쳐 주세요</div>' +
    '<div class="grid2">' +
    '<label class="field"><span>출근 시각</span><input type="time" id="pf_tin" value="' + (ta && ta.in ? ta.in : '') + '"></label>' +
    '<label class="field"><span>퇴근 시각</span><input type="time" id="pf_tout" value="' + (ta && ta.out ? ta.out : '') + '"></label>' +
    '</div>' +
    '<div class="att-now">오늘 공수 <b>' + fmtGs(gongsuOf(ta)) + '공수</b>' + (taEdited ? ' <span class="ed-mark">(수정됨)</span>' : '') + '</div>' +
    '<button class="btn btn-line sm block" style="margin-top:9px" data-act="saveAttTimes" data-id="' + p.id + '">출퇴근 시간 저장</button>' +
    '<div class="hint">저장하면 <b>전체 현황 · 한달 공수표</b>에 바로 다시 계산됩니다.</div>' +
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
    '<div class="sect-t">신상 정보 · 단가</div>' +
    '<div class="grid2">' +
    '<label class="field"><span>이름</span><input id="pf_name" value="' + esc(p.name) + '"></label>' +
    '<label class="field"><span>생년월일</span><input id="pf_birth" type="date" value="' + esc(p.birth) + '"></label>' +
    '<label class="field"><span>연락처</span><input id="pf_phone" type="tel" value="' + esc(p.phone) + '"></label>' +
    '<label class="field"><span>소속 조</span><select id="pf_team">' + teamOpts + '</select></label>' +
    '<label class="field"><span>직종</span><input id="pf_job" value="' + esc(p.job) + '"></label>' +
    '<label class="field"><span>단가 (원/일)</span><input id="pf_price" type="number" inputmode="numeric" value="' + p.price + '"></label>' +
    '</div>' +
    '<div class="hint">단가를 저장하면 전체 · 조별 평균단가가 바로 다시 계산됩니다.</div>' +
    '</div>' +

    todaySec +

    '<div class="sect">' +
    '<div class="sect-t">매달 근태 확인 · 공수</div>' +
    '<div id="attBlock">' + attBlockHTML(p) + '</div>' +
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

    '<div class="sect">' +
    '<div class="sect-t">관리자 권한</div>' +
    '<div class="muted">이 사람이 앱에서 <b>관리자 화면</b>(전체 현황 · 한달 공수표 · 일보함)을 열 수 있게 합니다.</div>' +
    '<div class="kv"><span>현재 상태</span><b>' + (p.admin ? '관리자 권한 있음' : '권한 없음') + '</b></div>' +
    '<button class="btn ' + (p.admin ? 'btn-danger' : 'btn-line') + ' sm block" style="margin-top:9px" data-act="toggleAdmin" data-id="' + p.id + '">' +
    (p.admin ? '관리자 권한 해제' : '관리자 권한 부여') + '</button>' +
    '<div class="hint">권한을 받은 기술인은 상단 <b>관리자</b> 버튼을 누를 수 있게 됩니다.' + (p.admin ? ' 해제하면 바로 적용됩니다.' : '') + '</div>' +
    '</div>' +

    '<div class="sect">' +
    '<div class="sect-t">특이사항 메모</div>' +
    '<textarea id="pf_memo" rows="3" placeholder="예) 장비 반입 담당, 토요일 근무 가능">' + esc(p.memo) + '</textarea>' +
    '</div>' +

    (p.status === 'resigned' ?
      '<div class="sect"><div class="sect-t">퇴사 정보</div>' +
      '<div class="kv"><span>퇴사일</span><b>' + (p.resign ? longDate(p.resign.date) : '-') + '</b></div>' +
      '<div class="kv"><span>사유</span><b>' + (p.resign ? esc(p.resign.reason) : '-') + '</b></div>' +
      '<button class="btn btn-line sm block" style="margin-top:10px" data-act="restore" data-id="' + p.id + '">복직 처리 (평균단가 · 조 편성에 다시 포함)</button>' +
      '</div>' : '');

  var footer = '<button class="btn btn-ghost" data-act="closeSheet">닫기</button>' +
    (p.status === 'resigned' ? '' : '<button class="btn btn-primary" data-act="savePerson" data-id="' + p.id + '">저장</button>');

  openSheet('인원 상세', body, footer);
}
