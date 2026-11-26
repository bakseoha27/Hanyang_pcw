/* =========================================================
   시트 · 동작 · 시작
   ========================================================= */
function openSheet(title, body, footer) {
  var sb = $('#sheetBody');
  sb.innerHTML =
    '<div class="sheet-title"><b>' + title + '</b><button class="x" data-act="closeSheet">✕</button></div>' +
    body +
    (footer ? '<div class="btn-row">' + footer + '</div>' : '');
  $('#sheetWrap').classList.add('open');
  document.body.style.overflow = 'hidden';
  sb.scrollTop = 0;
}

function closeSheet() {
  $('#sheetWrap').classList.remove('open');
  document.body.style.overflow = '';
  if (state.ui) { state.ui.schedSheet = false; state.ui.schedBackToCal = false; }
  /* 휴무 알람을 × · 배경으로 닫으면 이번 세션에서는 잠시 숨긴다 (새 보고가 또 올라오면 다시 뜨다) */
  if (leaveAlarmOpenIds) {
    leaveAlarmOpenIds.forEach(function (id) { leaveAlarm.dismissed[id] = 1; });
    leaveAlarmOpenIds = null;
  }
}

/* 로그인 화면 관리자 암호 입력칸 */
function loginPassValue() {
  var el = $('#li_pass');
  return el && !$('#li_pass_wrap').classList.contains('hide') ? el.value.trim() : '';
}
function toggleLoginPass(show) {
  var wrap = $('#li_pass_wrap');
  if (!wrap) { return; }
  if (show) { wrap.classList.remove('hide'); } else { wrap.classList.add('hide'); }
}
function showLoginPass(msg) {
  toggleLoginPass(true);
  if (msg) { toast(msg); }
  var el = $('#li_pass');
  if (el) { try { el.focus(); } catch (e) { /* noop */ } }
}

function confirmSheet(title, msg, okLabel, action, extra, danger) {
  openSheet(title, '<p class="confirm-msg">' + msg + '</p>',
    '<button class="btn btn-ghost" data-act="closeSheet">취소</button>' +
    '<button class="btn ' + (danger === false ? 'btn-primary' : 'btn-danger') + '" data-act="' + action + '" ' + (extra || '') + '>' + okLabel + '</button>');
}

/* =========================================================
   명단 선택 / 이동
   ========================================================= */
function openDraftPicker() {
  var p0 = me();
  var tid = p0 ? p0.teamId : null;
  var d = ensureDraft(tid);
  var mem = teamMembers(tid);
  var body = '<div class="hint" style="margin:0 0 6px">작업일보에 넣을 인원을 눌러 주세요.</div>' +
    (mem.map(function (m) {
      var on = d.memberIds.indexOf(m.id) >= 0;
      return '<div class="p-row" data-act="draftToggle" data-id="' + m.id + '">' +
        '<span class="av">' + esc(m.name.slice(0, 1)) + '</span>' +
        '<span class="p-main"><span class="p-name">' + esc(m.name) + '</span>' +
        '<span class="p-sub">' + esc(m.job) + ' · ' + teamLabel(m.teamId) + '</span></span>' +
        '<span class="p-right">' + (on ? '<span class="badge b-ok">포함</span>' : '<span class="badge b-res">제외</span>') + '</span></div>';
    }).join('') || '<div class="empty">조원이 없습니다.</div>');
  openSheet('작업자 명단 선택', body,
    '<button class="btn btn-primary" data-act="closeSheet">완료 · ' + d.memberIds.length + '명</button>');
}

function openMoveMember(id) {
  var p = personById(id);
  if (!p) { return; }
  var opts = state.teams.map(function (t) {
    return '<div class="p-row" data-act="setTeam" data-id="' + id + '" data-team="' + t.id + '">' +
      '<span class="av">' + esc(t.name.slice(0, 1)) + '</span>' +
      '<span class="p-main"><span class="p-name">' + esc(t.name) + '</span>' +
      '<span class="p-sub">' + teamMembers(t.id).length + '명' + (isAdminView() ? ' · 평균 ' + won(avgOf(teamMembers(t.id))) + '원' : '') + '</span></span>' +
      '<span class="p-right">' + (p.teamId === t.id ? '<span class="badge b-ok">현재</span>' : '<span class="badge b-res">이동</span>') + '</span></div>';
  }).join('');
  var body = '<div class="sheet-head"><span class="av lg">' + esc(p.name.slice(0, 1)) + '</span>' +
    '<div><div class="sheet-name">' + esc(p.name) + '</div><div class="muted">현재 ' + teamLabel(p.teamId) +
    (isAdminView() ? ' · ' + won(p.price) + '원/일' : '') + '</div></div></div>' +
    '<div class="sect"><div class="sect-t">이동할 조를 선택하세요</div>' +
    (opts || '<div class="empty">아직 만든 조가 없습니다.<br>팀·조 탭에서 조를 먼저 만들어 주세요.</div>') +
    '<div class="p-row" data-act="setTeam" data-id="' + id + '" data-team=""><span class="av">–</span>' +
    '<span class="p-main"><span class="p-name">미배정</span><span class="p-sub">조 편성에서 빼기</span></span></div></div>';
  openSheet('조 이동', body, '<button class="btn btn-ghost" data-act="closeSheet">닫기</button>');
}

function openAddMembers(teamId) {
  var mem = activePeople().filter(function (p) { return p.teamId !== teamId; });
  var t = teamById(teamId);
  var body = '<div class="hint" style="margin:0 0 6px">' + esc(t ? t.name : '') + '으로 옮길 인원을 선택하세요. (여러 명 선택 가능)</div>' +
    (mem.map(function (m) {
      return '<label class="p-row" style="cursor:pointer">' +
        '<input type="checkbox" class="addchk" data-id="' + m.id + '" style="width:22px;height:22px;accent-color:#2F6BFF">' +
        '<span class="av">' + esc(m.name.slice(0, 1)) + '</span>' +
        '<span class="p-main"><span class="p-name">' + esc(m.name) + '</span>' +
        '<span class="p-sub">' + teamLabel(m.teamId) + ' · ' + esc(m.job) + '</span></span></label>';
    }).join('') || '<div class="empty">이동할 인원이 없습니다.</div>');
  openSheet('조원 이동/추가', body,
    '<button class="btn btn-ghost" data-act="closeSheet">취소</button>' +
    '<button class="btn btn-primary" data-act="applyAddMembers" data-team="' + teamId + '">이 조로 이동</button>');
}

function openChangeLeader(teamId) {
  var t = teamById(teamId);
  var cur = leaderOf(teamId);
  var body = '<div class="hint" style="margin:0 0 6px">' + esc(t ? t.name : '') + ' 반장을 선택하세요.</div>' +
    (activePeople().map(function (m) {
      var isCur = cur && cur.id === m.id;
      return '<div class="p-row" data-act="setLeader" data-team="' + teamId + '" data-id="' + m.id + '">' +
        '<span class="av">' + esc(m.name.slice(0, 1)) + '</span>' +
        '<span class="p-main"><span class="p-name">' + esc(m.name) + ' ' + (m.role === 'leader' ? '<span class="tag tag-leader">반장</span>' : '') + '</span>' +
        '<span class="p-sub">' + teamLabel(m.teamId) + ' · ' + esc(m.job) + '</span></span>' +
        '<span class="p-right">' + (isCur ? '<span class="badge b-ok">현재 반장</span>' : '<span class="badge b-res">지정</span>') + '</span></div>';
    }).join('') || '<div class="empty">인원이 없습니다.</div>');
  openSheet('반장 지정 / 변경', body, '<button class="btn btn-ghost" data-act="closeSheet">닫기</button>');
}

function openNewTeam() {
  var body = '<label class="field"><span>조 이름</span><input id="teamName" placeholder="예) 배관 3조"></label>' +
    '<div class="banner">만든 뒤 조원은 <b>조원 이동/추가</b>에서 배정할 수 있어요.</div>';
  openSheet('새 팀/조 만들기', body,
    '<button class="btn btn-ghost" data-act="closeSheet">취소</button>' +
    '<button class="btn btn-primary" data-act="createTeam">만들기</button>');
}

/* ---------------- 이전 날짜 공수 추가 (기술인 · 미래 불가) ---------------- */
function pastAttHTML(d) {
  d = d || todayKeyAdd(-1);
  return '<div class="hint" style="margin:0 0 8px">오늘 이전 날짜의 출퇴근 시각을 직접 넣어 공수를 추가합니다. <b>미래 날짜는 넣을 수 없습니다.</b><br>공수 = 점심(11:00~13:00) 제외 근무시간 기준 · 8시간 이하 시간×0.125 · 8시간 초과 1.0+(초과×0.25)</div>' +
    '<label class="field"><span>날짜</span><input type="date" id="patt_date" max="' + todayKey() + '" value="' + d + '"></label>' +
    '<div class="grid2">' +
    '<label class="field"><span>출근 시각</span><input type="time" id="patt_in" value="07:00"></label>' +
    '<label class="field"><span>퇴근 시각</span><input type="time" id="patt_out" value="17:00"></label>' +
    '</div>' +
    '<div class="att-prev" id="pattPrev"></div>';
}

function pattPreview() {
  var box = document.getElementById('pattPrev');
  if (!box) { return; }
  var p = me();
  var d = $('#patt_date') ? $('#patt_date').value : '';
  var iv = $('#patt_in') ? $('#patt_in').value : '';
  var ov = $('#patt_out') ? $('#patt_out').value : '';
  var parts = [];
  if (d && iv && ov) {
    parts.push('이 날 계산 공수 <b>' + fmtGs(calcGongsu(iv, ov)) + '공수</b>' +
      (iv !== '07:00' || ov !== '17:00' ? ' <span class="muted">(' + iv + ' ~ ' + ov + ')</span>' : ''));
  }
  if (p && d) {
    var a = (p.attendance || {})[d];
    if (a && a.in) {
      parts.push('이 날짜에 이미 기록이 있습니다 (' + a.in + (a.out ? ' ~ ' + a.out : '') + ') · 저장하면 덮어씁니다');
    }
    if (leaveOn(p, d)) { parts.push('이 날짜는 휴무 신청이 있어 공수가 0으로 계산됩니다'); }
  }
  if (d && d > todayKey()) { parts.push('미래 날짜는 저장할 수 없습니다'); }
  box.innerHTML = parts.join('<br>');
}

function openPastAtt() {
  openSheet('이전 날짜 공수 추가', pastAttHTML(todayKeyAdd(-1)),
    '<button class="btn btn-ghost" data-act="closeSheet">취소</button>' +
    '<button class="btn btn-primary" data-act="pastAttSave">공수 저장</button>');
  setTimeout(pattPreview, 30);
}

function pastAttSave() {
  var p = me();
  if (!p) { return; }
  var d = $('#patt_date') ? $('#patt_date').value : '';
  var iv = $('#patt_in') ? $('#patt_in').value : '';
  var ov = $('#patt_out') ? $('#patt_out').value : '';
  if (!d) { toast('날짜를 선택해 주세요.'); return; }
  if (d > todayKey()) { toast('미래 날짜는 공수를 넣을 수 없습니다.<br>오늘까지만 입력할 수 있어요.'); return; }
  if (!iv) { toast('출근 시각을 입력해 주세요.'); return; }
  if (ov && ov <= iv) { toast('퇴근 시각이 출근 시각보다 빠릅니다.<br>시간을 다시 확인해 주세요.'); return; }
  var existed = !!(p.attendance[d] && p.attendance[d].in);
  p.attendance[d] = { in: iv, out: ov || '', inEdited: true, outEdited: !!ov, };
  saveAttendance(p, d, existed ? '이전 공수 수정' : '이전 공수 추가');
  var g = gongsuOf(p.attendance[d]);
  var lv = leaveOn(p, d);
  closeSheet();
  render();
  toast('<b>' + longDate(d) + '</b> ' + iv + ' ~ ' + (ov || '미등록') + ' · <b>' + fmtGs(g) + '공수</b> ' +
    (existed ? '저장했습니다(기존 기록 수정)' : '추가했습니다') +
    (lv ? '<br>이 날짜는 휴무 신청이 있어 공수는 0으로 계산됩니다' : ''));
}

/* ---------------- 명단 일괄 등록 ---------------- */
function openBulk() {
  var body = '<div class="hint" style="margin:0 0 8px">엑셀에서 복사해 붙여넣으세요. 한 줄에 <b>이름 · 직종 · 생년월일 · 단가 · 조 · 전화번호(선택)</b> 순서입니다. (탭 · 쉼표 · 공백 모두 인식)</div>' +
    '<textarea id="bulkText" rows="8" placeholder="김민수\t배관공\t1992-03-11\t175000\t배관 1조\t010-1234-5678"></textarea>' +
    '<div class="btn-row"><button class="btn btn-line sm" data-act="bulkClear">지우기</button></div>' +
    '<div class="hint" id="bulkHint">없는 조 이름을 적으면 조가 자동으로 만들어집니다.</div>';
  openSheet('명단/엑셀 텍스트 일괄 등록', body,
    '<button class="btn btn-ghost" data-act="closeSheet">취소</button>' +
    '<button class="btn btn-primary" data-act="bulkApply">등록하기</button>');
}

function normTeam(s) { return String(s || '').replace(/\s+/g, ''); }

/* ---------------- 인원 직접 등록 (관리자) ---------------- */
function openPersonAdd() {
  if (!canManage()) { toast('관리자·팀장만 인원을 등록할 수 있습니다.'); return; }
  var jobOpts = ['관리자'].concat(JOB_LIST).map(function (j) {
    return '<option value="' + j + '"' + (j === '관리자' ? ' selected' : '') + '>' + j + '</option>';
  }).join('');
  var body =
    '<div class="hint" style="margin:0 0 8px">이름·생년월일·전화번호가 같으면 그대로 로그인됩니다. 생년월일은 <b>851029</b> 처럼 6자리 또는 <b>1985-10-29</b> 처럼 8자리로 적어 주세요.</div>' +
    '<label class="field"><span>이름 <b class="must">*</b></span><input id="pa_name" placeholder="예) 김근하" autocomplete="name"></label>' +
    '<label class="field"><span>생년월일 <b class="must">*</b></span><input id="pa_birth" inputmode="numeric" placeholder="예) 851029 또는 1985-10-29" autocomplete="bday"></label>' +
    '<label class="field"><span>전화번호 <b class="must">*</b></span><input id="pa_phone" type="tel" inputmode="numeric" placeholder="010-0000-0000" autocomplete="tel"></label>' +
    '<label class="field"><span>직종</span><select id="pa_job">' + jobOpts + '</select></label>' +
    '<label class="field"><span>입사일자</span><input id="pa_hire" type="date" value="' + todayKey() + '"></label>' +
    '<label class="field"><span>소속 팀/조</span><select id="pa_team">' + teamOptionsHTML(null) + '</select></label>' +
    (isAdminView()
      ? '<label class="chk" style="margin-top:12px"><input type="checkbox" id="pa_admin" checked> <b>관리자 권한 부여</b> (is_admin)</label>' +
        '<label class="chk" style="margin-top:8px"><input type="checkbox" id="pa_leader"> <b>팀장 권한 부여</b> (is_leader)</label>' +
        '<div class="banner">관리자 = 모든 기능 + 권한 부여 + 암호 변경. 팀장 = 현황·일보·일정·팀·조·공수표·인원 등록(관리자 전용 항목 제외, 관리자 암호 불필요).</div>'
      : '<label class="chk" style="margin-top:12px"><input type="checkbox" id="pa_leader" checked> <b>팀장 권한 부여</b> (is_leader)</label>' +
        '<div class="banner">팀장은 현황·일보·일정·팀·조·공수표·인원 등록을 쓸 수 있습니다. <b>관리자 전용 항목과 관리자 권한 부여는 보이지 않습니다.</b></div>');
  openSheet('인원 직접 등록', body,
    '<button class="btn btn-ghost" data-act="closeSheet">취소</button>' +
    '<button class="btn btn-primary" data-act="personAddSubmit">등록</button>');
}

function personAddSubmit() {
  if (!canManage()) { toast('관리자·팀장만 인원을 등록할 수 있습니다.'); return; }
  var name = ($('#pa_name') ? $('#pa_name').value : '').trim();
  var birthRaw = ($('#pa_birth') ? $('#pa_birth').value : '').trim();
  var phoneRaw = ($('#pa_phone') ? $('#pa_phone').value : '').trim();
  var job = $('#pa_job') ? $('#pa_job').value : '관리자';
  var tid = $('#pa_team') ? ($('#pa_team').value || null) : null;
  var isAdmin = isAdminView() && !!(($('#pa_admin') && $('#pa_admin').checked));
  var isLeader = !!(($('#pa_leader') && $('#pa_leader').checked));
  if (!name) { toast('이름을 입력해 주세요.'); return; }
  var birth = birthFromDigits(birthRaw);
  if (!birth) { toast('생년월일을 정확히 입력해 주세요.<br>예) 851029 또는 1985-10-29'); return; }
  var pd = phoneDigits(phoneRaw);
  if (pd.length < 9 || pd.length > 11) { toast('전화번호를 정확히 입력해 주세요.<br>예) 010-2126-5524'); return; }

  var exact = state.people.filter(function (p) {
    return p.name === name && p.birth === birth && phoneDigits(p.phone) === pd;
  })[0];
  if (exact) {
    if (exact.status === 'resigned') {
      toast('퇴사 처리된 인원입니다.<br>인원 상세에서 복직 처리한 뒤 이용해 주세요.');
      return;
    }
    var changed = [];
    if (isAdmin && !exact.admin) {
      exact.admin = true;
      patchWorker(exact.id, { is_admin: true }, '관리자 권한 부여');
      changed.push('관리자 권한 부여');
    }
    if (isLeader && !isAdmin && exact.role !== 'leader') {
      exact.role = 'leader';
      patchWorker(exact.id, { is_leader: true }, '팀장 권한 부여');
      changed.push('팀장 권한 부여');
    }
    if (tid && exact.teamId !== tid) {
      exact.teamId = tid;
      patchWorker(exact.id, { team_id: tid }, '조 배정');
      changed.push(teamLabel(tid) + ' 배정');
    }
    closeSheet();
    render();
    toast('이미 등록된 인원입니다 · <b>' + esc(exact.name) + '</b>' +
      (changed.length ? '<br>' + esc(changed.join(' · ')) + ' 처리했습니다(중복 등록 안 함)' : '<br>중복 등록하지 않았습니다.'));
    return;
  }

  var byPhone = state.people.filter(function (p) { return phoneDigits(p.phone) === pd; })[0];
  if (byPhone) {
    toast('이 전화번호로 이미 등록된 인원이 있습니다: <b>' + esc(byPhone.name) + '</b><br>이름·생년월일을 확인해 주세요(중복 등록 안 함).');
    return;
  }

  var np = {
    id: uuid(), name: name, job: job || '관리자', birth: birth, phone: phonePretty(phoneRaw),
    price: 0, teamId: tid, role: isLeader ? 'leader' : 'worker', admin: isAdmin, status: 'active', resign: null,
    hireDate: ($('#pa_hire') ? $('#pa_hire').value : '') || todayKey(),
    attendance: {}, leaves: [], certs: defaultCerts(),
    injury: { has: false, date: '', note: '' }, memo: '',
    privacyAgreedAt: '', privacyVersion: '', sensitiveAgreedAt: ''
  };
  state.people.push(np);
  insertWorker(np, '인원 직접 등록');
  closeSheet();
  render();
  toast('<b>' + esc(np.name) + '</b> 님을 등록했습니다' + (isAdmin ? ' · 관리자 권한' : (isLeader ? ' · 팀장 권한' : '')) +
    '<br>' + esc(teamLabel(np.teamId)) + ' · 로그인은 이름·생년월일·전화번호로 바로 됩니다');
}

function parseRoster(text) {
  var lines = String(text).split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l.length; });
  var out = [], bad = [];
  lines.forEach(function (line, i) {
    var parts;
    if (line.indexOf('\t') >= 0) { parts = line.split('\t'); }
    else if (line.indexOf(',') >= 0) { parts = line.split(','); }
    else { parts = line.split(/\s{2,}/); }
    parts = parts.map(function (s) { return s.trim(); });
    if (i === 0 && /^(이름|성명|name)$/i.test(parts[0])) { return; }
    if (parts.length < 2 || !parts[0]) { bad.push(i + 1); return; }
    out.push({
      name: parts[0],
      job: parts[1] || '배관공',
      birth: birthFromDigits(parts[2] || ''),
      price: num(parts[3] || ''),
      team: (parts[4] || '').trim(),
      phone: parts[5] ? phonePretty(parts[5]) : ''
    });
  });
  return { rows: out, bad: bad };
}

/* ---------------- 토요일 조사 ---------------- */
function defaultDeadlineLocal() {
  var fri = addDays(nextSaturday(), -1);
  return fri + 'T18:00';
}

function openNewPoll() {
  var sat = nextSaturday();
  var body = '<label class="field"><span>공지 제목</span><input id="pollTitle" value="이번 주 토요일(' + shortDate(sat) + ') 출근 여부"></label>' +
    '<label class="field"><span>응답 마감</span><input id="pollDeadline" type="datetime-local" value="' + defaultDeadlineLocal() + '"></label>' +
    '<div class="banner">공지를 올리면 기술인 화면에 <b>예 / 아니오</b> 버튼이 바로 나타나고, 응답이 실시간으로 집계됩니다.</div>';
  openSheet('토요일 출근 여부 공지', body,
    '<button class="btn btn-ghost" data-act="closeSheet">취소</button>' +
    '<button class="btn btn-primary" data-act="createPoll">공지 올리기</button>');
}

function openPollDetail(id) {
  var poll = state.polls.filter(function (p) { return p.id === id; })[0];
  if (!poll) { return; }
  var groups = [['yes', '예 (출근 가능)'], ['no', '아니오 (어려움)'], ['none', '미응답']];
  var body = groups.map(function (g) {
    var list = activePeople().filter(function (p) {
      var v = poll.votes[p.id] || 'none';
      return v === g[0];
    });
    return '<div class="sect"><div class="sect-t">' + g[1] + ' · ' + list.length + '명</div>' +
      '<div class="chips">' + (list.map(function (p) {
        return '<span class="chip">' + esc(p.name) + '</span>';
      }).join('') || '<span class="muted">없음</span>') + '</div></div>';
  }).join('');
  openSheet('응답 현황', body, '<button class="btn btn-ghost" data-act="closeSheet">닫기</button>');
}

/* 토요일 투표 — 조별 현황 + 인원별 출근/미출근 직접 변경 (관리자·팀장) */
function openPollAdmin(id) {
  var poll = state.polls.filter(function (x) { return x.id === id; })[0];
  if (!poll) { return; }
  if (!canManage()) { toast('관리자·팀장만 바꿀 수 있습니다.'); return; }
  var groups = pollTeamGroups(poll);
  var c = pollCounts(poll);
  var body = '<div class="muted" style="margin:-4px 0 10px">' + esc(poll.title) +
    '<br>출근 <b>' + c.yes + '</b> · 미출근 <b>' + c.no + '</b> · 미응답 <b>' + c.none + '</b>' +
    '<br>전화·카톡으로 확인한 인원은 아래 <b>출근 / 미출근</b>을 눌러 바로 바꿔 주세요.' +
    (pollIsOpen(poll) ? '' : '<br>응답은 마감됐지만 관리자는 계속 바꿀 수 있습니다.') + '</div>';
  body += groups.length ? groups.map(function (g) {
    return '<div class="sect"><div class="sect-t">' + esc(g.name) +
      ' <span class="pt-c"><b class="pt-y">' + g.yes + '</b>출근</span>' +
      ' <span class="pt-c"><b class="pt-n2">' + g.no + '</b>미출근</span>' +
      ' <span class="pt-c"><b class="pt-x">' + g.none + '</b>미응답</span></div>' +
      g.list.map(function (x) {
        return '<div class="pv-row"><span class="av">' + esc(x.p.name.slice(0, 1)) + '</span>' +
          '<span class="pv-main"><span class="p-name">' + esc(x.p.name) + '</span>' +
          '<span class="p-sub">' + (x.vote === 'yes' ? '출근' : x.vote === 'no' ? '미출근' : '미응답') + '</span></span>' +
          '<span class="pv-btns">' +
          '<button class="pv-btn yes' + (x.vote === 'yes' ? ' on' : '') + '" data-act="pollSetVote" data-id="' + poll.id + '" data-wid="' + x.p.id + '" data-v="yes">출근</button>' +
          '<button class="pv-btn no' + (x.vote === 'no' ? ' on' : '') + '" data-act="pollSetVote" data-id="' + poll.id + '" data-wid="' + x.p.id + '" data-v="no">미출근</button>' +
          '</span></div>';
      }).join('') + '</div>';
  }).join('') : '<div class="empty">등록된 인원이 없습니다.</div>';
  openSheet('토요일 투표 · 조별 현황', body, '<button class="btn btn-ghost" data-act="closeSheet">닫기</button>');
}

/* ---------------- 작업일보 상세 ---------------- */
function openReportDetail(id) {
  var r = state.reports.filter(function (x) { return x.id === id; })[0];
  if (!r) { return; }
  var t = teamById(r.teamId);
  var names = r.memberNames || [];
  var body = '<div class="sect">' +
    '<div class="kv"><span>조</span><b>' + esc(t ? t.name : (r.teamName || '-')) + '</b></div>' +
    '<div class="kv"><span>작성자</span><b>' + esc(authorLabel(r)) + '</b></div>' +
    '<div class="kv"><span>날짜</span><b>' + longDate(r.date) + '</b></div>' +
    '<div class="kv"><span>제출 시각</span><b>' + esc(r.submittedAt) + '</b></div>' +
    '<div class="kv"><span>작업위치</span><b>' + esc(r.location) + '</b></div>' +
    '<div class="kv"><span>작업시간</span><b>' + esc(r.timeFrom) + ' ~ ' + esc(r.timeTo) + '</b></div>' +
    '<div class="kv"><span>투입 인원</span><b>' + names.length + '명</b></div>' +
    '</div>' +
    '<div class="sect"><div class="sect-t">작업내용</div>' +
    '<div class="rep-content" style="margin-top:6px">' + esc(r.content) + '</div></div>' +
    '<div class="sect"><div class="sect-t">특이사항</div>' +
    '<div class="rep-note">' + (r.note ? esc(r.note).replace(/\n/g, '<br>') : '<span class="muted">없음</span>') + '</div></div>' +
    '<div class="sect"><div class="sect-t">투입 명단</div>' +
    '<div class="chips">' + (names.map(function (n) { return '<span class="chip">' + esc(n) + '</span>'; }).join('') || '<span class="muted">없음</span>') + '</div>' +
    '</div>';
  openSheet('작업일보 상세', body, '<button class="btn btn-ghost" data-act="closeSheet">닫기</button>');
}

/* ---------------- PDF 업로드 (Storage) ----------------
   · Storage object key 는 ASCII 만 (한글 파일명은 Supabase Storage 가 400 InvalidKey 로 거절)
     → 경로는 날짜+타임스탬프+난수.pdf, 원본 한글 이름은 DB documents.file_name/title 에 저장
   · 업로드가 끝나지 않아도 안내가 뜨게 시간 제한 + try/catch/finally 로 상태 복구 */
var pdfUploading = false;

function pdfObjectPath(cat, file) {
  var ext = /\.pdf$/i.test(file.name) ? '.pdf' : '.pdf';
  var t = Date.now();
  var rnd = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6) || 'x';
  return cat + '/' + todayKey().replace(/-/g, '') + '_' + t + '_' + rnd + ext;
}

function withTimeout(promise, ms, msg) {
  var timer = null;
  var guard = new Promise(function (resolve, reject) {
    timer = setTimeout(function () { reject(new Error(msg || ('시간 초과 (' + Math.round(ms / 1000) + '초)'))); }, ms);
  });
  return Promise.race([promise, guard]).then(function (r) {
    if (timer) { clearTimeout(timer); }
    return r;
  }, function (e) {
    if (timer) { clearTimeout(timer); }
    throw e;
  });
}

async function handlePdfUpload(input) {
  if (!isAdminView()) { toast('관리자만 현장자료를 올릴 수 있습니다.'); return; }
  if (pdfUploading) { toast('다른 PDF를 올리는 중입니다.<br>잠시만 기다려 주세요.'); return; }
  var cat = input.getAttribute('data-cat') || 'risk';
  var file = input.files && input.files[0];
  if (!file) { return; }
  var label = cat === 'risk' ? '위험성평가' : '시방서';
  var okType = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
  if (!okType) { toast('PDF 파일만 올릴 수 있어요.'); return; }
  if (file.size > 50 * 1024 * 1024) {
    toast('50MB 이하 PDF만 올릴 수 있어요.<br>(' + (file.size / 1024 / 1024).toFixed(1) + 'MB)');
    return;
  }
  pdfUploading = true;
  var mb = (file.size / 1024 / 1024).toFixed(1);
  toast('PDF 업로드 중… (' + mb + 'MB)<br><b>' + esc(file.name) + '</b>');
  try {
    var path = pdfObjectPath(cat, file);
    var up = await withTimeout(storageUpload(path, file, 'application/pdf'), 90000,
      '업로드가 90초 안에 끝나지 않았어요. 전화·와이파이 상태를 확인하고 다시 시도해 주세요.');
    if (!up || !up.ok) {
      var why = up ? String(up.error || ('HTTP ' + up.status)) : '알 수 없는 오류';
      var tip = /InvalidKey|Invalid key/i.test(why)
        ? '<br>파일 이름을 영문으로 바꿔 다시 시도해 주세요.'
        : (/exceeded|too large|413/i.test(why) ? '<br>50MB 이하 PDF만 올릴 수 있어요.' : '<br>잠시 후 다시 시도해 주세요.');
      toast('PDF 업로드에 실패했어요.<br><b>' + esc(why) + '</b>' + tip);
      return;
    }
    var doc = {
      id: uuid(), type: cat, name: file.name, title: String(file.name).replace(/\.pdf$/i, ''),
      url: storagePublicUrl(path), path: path, by: (me() ? me().name : ''), addedAt: todayKey()
    };
    if (!state.docs[cat]) { state.docs[cat] = []; }
    state.docs[cat].unshift(doc);
    render();
    insertDocument(doc);
    toast('PDF 업로드 완료 · <b>' + esc(file.name) + '</b><br>' + label + ' 자료가 바로 열립니다');
  } catch (e) {
    toast('PDF 업로드에 실패했어요.<br>' + esc((e && e.message) || '알 수 없는 오류') +
      '<br>전화·와이파이 상태를 확인하고 다시 시도해 주세요.');
  } finally {
    pdfUploading = false;
    try { input.value = ''; } catch (e2) { /* noop */ }
  }
}

/* ---------------- 기술인 오늘 근태 빠른 기록 (조출 · 조퇴) ---------------- */
function setTodayAtt(inHM, outHM, label) {
  var p = me();
  if (!p) { return; }
  var err = applyAttTime(p, inHM, outHM);
  if (err) { toast(err + '<br>다시 확인해 주세요.'); return; }
  saveAttendance(p, todayKey(), label || '근태 저장');
  render();
  var a = todayAtt(p);
  toast('<b>' + label + '</b> 저장했어요 · ' + inHM + ' ~ ' + outHM + ' · <b>' + fmtGs(gongsuOf(a)) + '공수</b>');
}

/* 인원 상세 : 선택 날짜·시각으로 예상 공수 미리보기 */
function pfAttPreview() {
  var box = document.getElementById('pf_prev');
  if (!box) { return; }
  var p = personById(state.ui.personOpen || '');
  var d = ($('#pf_adate') ? $('#pf_adate').value : '') || todayKey();
  var iv = $('#pf_tin') ? $('#pf_tin').value : '';
  var ov = $('#pf_tout') ? $('#pf_tout').value : '';
  var parts = [];
  if (iv) {
    parts.push('예상 공수 <b>' + fmtGs(ov ? calcGongsu(iv, ov) : 1) + '공수</b>' +
      (iv !== '07:00' || ov !== '17:00' ? ' <span class="muted">(' + iv + ' ~ ' + (ov || '미퇴근') + ')</span>' : ''));
  } else {
    parts.push('<span class="muted">출근 시각을 넣으면 공수가 계산됩니다</span>');
  }
  if (p) {
    var a = (p.attendance || {})[d];
    if (a && (a.in || a.out)) { parts.push('기존 기록 ' + (a.in || '-') + ' ~ ' + (a.out || '-') + ' · 저장하면 덮어씁니다'); }
    if (leaveOn(p, d)) { parts.push('이 날짜는 휴무 신청이 있어 공수 0으로 표시됩니다'); }
  }
  if (d > todayKey()) { parts.push('미래 날짜는 저장할 수 없습니다'); }
  box.innerHTML = parts.join('<br>');
}

/* 근태 저장 토스트 (인원 상세 · 선택 날짜) */
function attSavedToast(gs, d, hasLeave) {
  toast(longDate(d) + ' 근태 저장 완료 · <b>' + gs + '공수</b>' +
    (hasLeave ? '<br>휴무 신청이 있어 공수는 0으로 표시됩니다' : '<br>전체 현황 · 한달 공수표에 <b>(수정됨)</b>으로 반영됩니다'));
}

/* 공수 일괄 적용 — 시간 선택창 적용
   kind:'att' → 출근·퇴근 시간 저장 / kind:'leave' → 휴무(0공수) 등록 */
var bulkPending = null;

function bulkApplyNow() {
  var b = bulkPending;
  if (!b) { return; }
  var ids = b.ids || [];
  var date = b.date;
  if (!ids.length) { toast('적용할 인원이 없습니다.'); return; }
  if (b.kind === 'leave') {
    var leaveRows = [];
    ids.forEach(function (id) {
      var p = personById(id);
      if (!p) { return; }
      p.leaves = p.leaves || [];
      p.attendance = p.attendance || {};
      delete p.attendance[date];
      if (leaveOn(p, date)) { return; }
      var meId = me() ? me().id : null;
      var l = {
        id: uuid(), date: date, reason: b.reason || '관리자 일괄 휴무', at: nowHM(),
        teamName: teamLabel(p.teamId), reportTo: '관리자', status: 'pending',
        ackAt: new Date().toISOString(), ackBy: meId
      };
      p.leaves.push(l);
      leaveRows.push({
        id: l.id, workerId: p.id, date: date, reason: l.reason, teamName: l.teamName,
        reportTo: l.reportTo, ackAt: l.ackAt, ackBy: meId
      });
    });
    insertLeaveBulk(leaveRows);
    deleteAttendanceBulk(ids, date);
    bulkSel = {};
    bulkPending = null;
    closeSheet();
    render();
    toast('<b>' + ids.length + '명</b> ' + longDate(date) + ' 휴무(0공수) 처리 완료<br>공수표·집계에 바로 0공수로 반영됩니다');
    setTimeout(function () { refresh(true); }, 700);
    return;
  }
  var gs = calcGongsu(b.in, b.out);
  var rows = ids.map(function (id) {
    return {
      worker_id: id, work_date: date,
      check_in: toIso(date, b.in), check_out: toIso(date, b.out),
      in_edited: false, out_edited: false, gongsu: gs
    };
  });
  ids.forEach(function (id) {
    var p = personById(id);
    p.attendance = p.attendance || {};
    p.attendance[date] = { in: b.in, out: b.out, inEdited: false, outEdited: false };
  });
  bulkSel = {};
  bulkPending = null;
  saveAttendanceBulk(rows, '공수 일괄 적용');
  closeSheet();
  render();
  toast('<b>' + ids.length + '명</b> ' + b.label + ' 적용 완료' + (date === todayKey() ? '' : '<br>' + longDate(date)));
  setTimeout(function () { refresh(true); }, 700);
}

function bulkDoApply(key, date) {
  var preset = BULK_PRESETS[key];
  if (!preset) { return; }
  date = date || todayKey();
  var ids = Object.keys(bulkSel).filter(function (id) {
    var p = personById(id);
    return p && p.status !== 'resigned' && !leaveOn(p, date);
  });
  bulkPending = { kind: 'att', ids: ids, date: date, in: preset.in, out: preset.out, label: preset.label };
  bulkApplyNow();
}

/* 직접 입력칸의 예상 공수 미리보기 */
function bulkPreview() {
  var box = $('#bulkPrev');
  if (!box) { return; }
  var iv = $('#bulk_in') ? $('#bulk_in').value : '';
  var ov = $('#bulk_out') ? $('#bulk_out').value : '';
  if (!iv || !ov) {
    box.innerHTML = '시작·종료 시간을 넣으면 공수가 자동 계산됩니다.';
    return;
  }
  if (minFromHM(ov) <= minFromHM(iv)) {
    box.innerHTML = '<b class="bp-bad">종료 시간이 시작 시간보다 빠릅니다.</b>';
    return;
  }
  box.innerHTML = '예상 공수 <b>' + fmtGs(calcGongsu(iv, ov)) + '공수</b> <span>(점심 11:00~13:00 제외)</span>';
}

/* 내 정보 · 내 한달 공수표 : 날짜별 직접 입력/수정 (미래 날짜 허용) */
function openMyGsEdit(date) {
  var p = me();
  if (!p) { return; }
  var d = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? date : todayKey();
  var a = (p.attendance || {})[d];
  var lv = leaveOn(p, d);
  var body =
    '<div class="muted" style="margin:0 0 8px">날짜를 고르고 출근·퇴근 시각을 넣으면 공수가 바로 계산됩니다. 미래 날짜도 미리 넣을 수 있습니다.</div>' +
    '<label class="field"><span>날짜</span><input type="date" id="mg_date" value="' + d + '"></label>' +
    '<div class="grid2">' +
    '<label class="field"><span>출근 시각</span><input type="time" id="mg_in" value="' + (a && a.in ? a.in : '') + '"></label>' +
    '<label class="field"><span>퇴근 시각</span><input type="time" id="mg_out" value="' + (a && a.out ? a.out : '') + '"></label>' +
    '</div>' +
    '<div class="pf-presets">' +
    '<button class="chip" data-act="mgPreset" data-in="05:00" data-out="15:00">조출 05:00~15:00</button>' +
    '<button class="chip" data-act="mgPreset" data-in="07:00" data-out="17:00">1공수 07:00~17:00</button>' +
    '<button class="chip" data-act="mgPreset" data-in="07:00" data-out="19:00">1.5공수 07:00~19:00</button>' +
    '<button class="chip" data-act="mgPreset" data-in="07:00" data-out="11:00">조퇴 07:00~11:00</button>' +
    '</div>' +
    '<div class="att-now" id="mg_prev"></div>' +
    (lv ? '<div class="hint">이 날짜는 휴무 신청(' + esc(lv.reason) + ')이 있어 공수는 0으로 표시됩니다.</div>' : '') +
    '<div class="hint">출근·퇴근을 모두 비우면 그 날짜 기록을 지웁니다.</div>';
  openSheet('공수 입력 · ' + longDate(d), body,
    '<button class="btn btn-ghost" data-act="myGsBack">취소</button>' +
    (a && (a.in || a.out) ? '<button class="btn btn-line" data-act="myGsDelete" data-date="' + d + '">삭제</button>' : '') +
    '<button class="btn btn-primary" data-act="myGsSave">저장</button>');
  setTimeout(mgPreview, 30);
}
function mgPreview() {
  var box = document.getElementById('mg_prev');
  if (!box) { return; }
  var iv = $('#mg_in') ? $('#mg_in').value : '';
  var ov = $('#mg_out') ? $('#mg_out').value : '';
  var d = ($('#mg_date') ? $('#mg_date').value : '') || todayKey();
  var p = me();
  var parts = [];
  if (iv) {
    parts.push('예상 공수 <b>' + fmtGs(ov ? calcGongsu(iv, ov) : 1) + '공수</b>' +
      (iv !== '07:00' || ov !== '17:00' ? ' <span class="muted">(' + iv + ' ~ ' + (ov || '미퇴근') + ')</span>' : ''));
  } else {
    parts.push('<span class="muted">출근 시각을 넣으면 공수가 계산됩니다</span>');
  }
  if (p) {
    var a = (p.attendance || {})[d];
    if (a && (a.in || a.out)) { parts.push('기존 기록 ' + (a.in || '-') + ' ~ ' + (a.out || '-') + ' · 저장하면 덮어씁니다'); }
    if (leaveOn(p, d)) { parts.push('이 날짜는 휴무 신청이 있어 공수 0으로 표시됩니다'); }
    if (d > todayKey()) { parts.push('미래 날짜 · 본인 공수표에만 합산되고 관리자 전체 공수표에는 표시되지 않습니다'); }
  }
  box.innerHTML = parts.join('<br>');
}

/* ---------------- 출퇴근 시간 반영 (공통) ---------------- */
function applyAttTime(p, inVal, outVal, dateOpt) {
  var k = dateOpt || todayKey();
  if (!p.attendance[k]) { p.attendance[k] = { in: '', out: '', inEdited: false, outEdited: false }; }
  var a = p.attendance[k];
  var nIn = String(inVal || '').slice(0, 5);
  var nOut = String(outVal || '').slice(0, 5);
  if (!nIn && nOut) { return '출근 시각을 먼저 입력해 주세요.'; }
  if (nIn && nOut && minFromHM(nOut) <= minFromHM(nIn)) { return '퇴근 시각이 출근 시각보다 빠릅니다.'; }
  if (nIn !== (a.in || '')) { a.in = nIn; a.inEdited = !!nIn; }
  if (nOut !== (a.out || '')) { a.out = nOut; a.outEdited = !!nOut; }
  if (nIn) {
    var lv = k === todayKey() ? leaveOn(p, k) : null;
    if (lv) {
      p.leaves = p.leaves.filter(function (x) { return x !== lv; });
      deleteLeave(lv.id);
    }
  }
  if (!a.in && !a.out) { delete p.attendance[k]; }
  return null;
}

/* ---------------- 휴무 정정 ---------------- */
function openLeaveEdit(l, p) {
  var body = '<div class="muted" style="margin-bottom:4px">' + longDate(l.date) + ' 신청 · ' + esc(l.reason) + '</div>' +
    '<label class="field"><span>휴무 날짜</span><input type="date" id="lv_date" value="' + esc(l.date) + '"></label>' +
    '<label class="field"><span>사유</span><input id="lv_reason" value="' + esc(l.reason) + '"></label>' +
    '<label class="field"><span>소속 팀</span><select id="lv_team">' + teamOptionsHTML(l.teamId || p.teamId) + '</select></label>' +
    '<label class="field"><span>보고 대상</span><input id="lv_report" type="text" value="' + esc(leaveReportLabel(l.reportTo)) + '" placeholder="예) 박서하 관리자 또는 현장 리더 이름"></label>' +
    '<div class="hint">내일 이후 날짜로만 바꿀 수 있습니다.</div>';
  openSheet('휴무 정정', body,
    '<button class="btn btn-ghost" data-act="closeSheet">취소</button>' +
    '<button class="btn btn-primary" data-act="saveLeaveEdit" data-id="' + l.id + '">저장</button>');
}

function leaveById(p, id) {
  return (p.leaves || []).filter(function (l) { return l.id === id; })[0] || null;
}
/* id로 휴무 신청 찾기 (관리자·팀장은 여러 인원의 신청을 다룬다) */
function leaveFind(id) {
  var found = null;
  state.people.forEach(function (p) {
    (p.leaves || []).forEach(function (l) { if (l.id === id) { found = { p: p, l: l }; } });
  });
  return found;
}
/* 승인·반려 뒤 : 시트를 다시 그린다 (남은 알람이 있으면 알람, 없으면 휴무 관리 목록) */
function afterLeaveDecision() {
  var rest = unackedLeaves();
  leaveAlarmOpenIds = null;
  closeSheet();
  render();
  if (rest.length) { openLeaveAlarmSheet(rest); } else { openLeaveManageSheet(); }
}
/* 휴무 대리 등록 시트 */
function openLeaveProxySheet() {
  var ps = activePeople().slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); });
  if (!ps.length) { toast('등록된 인원이 없습니다.'); return; }
  var opts = ps.map(function (p) {
    return '<option value="' + p.id + '">' + esc(p.name) + ' · ' + esc(teamLabel(p.teamId)) + '</option>';
  }).join('');
  var body = '<div class="muted" style="margin:-4px 0 8px">전화·카톡으로 받은 휴무를 관리자가 대신 등록합니다. <b>바로 승인</b> 상태로 저장됩니다.</div>' +
    '<label class="field"><span>인원</span><select id="lp_worker">' + opts + '</select></label>' +
    '<label class="field"><span>휴무 날짜</span><input type="date" id="lp_date" min="' + todayKey() + '" value="' + todayKey() + '"></label>' +
    '<label class="field"><span>사유</span><input id="lp_reason" placeholder="예) 병원 진료"></label>' +
    '<div class="hint">등록하면 그 날 근태 기록이 지워지고 <b>0공수(휴무)</b>로 바뀝니다.</div>';
  openSheet('휴무 대리 등록', body,
    '<button class="btn btn-ghost" data-act="leaveManage">돌아가기</button>' +
    '<button class="btn btn-primary" data-act="leaveProxySave">등록 · 승인</button>');
}

/* =========================================================
   동작 정의
   ========================================================= */
var ACTIONS = {
  /* ----- 공통 ----- */
  role: function (el) {
    var r = el.getAttribute('data-role');
    var went = false;
    if (r === 'worker') {
      state.role = 'worker';
      state.ui.timeEdit = false;
      sessionSetRole('worker');
      went = true;
    } else if (r === 'manager') {
      if (!canManage()) { toast('팀장 권한이 없습니다.<br>관리자에게 권한 부여를 요청하세요.'); return; }
      state.role = 'manager';
      state.ui.timeEdit = false;
      sessionSetRole('manager');
      went = true;
    } else if (r === 'admin') {
      if (!canAdmin()) { toast('관리자 권한이 없습니다.<br>관리자에게 권한 부여를 요청하세요.'); return; }
      state.role = 'admin';
      state.ui.timeEdit = false;
      sessionSetRole('admin');
      went = true;
    }
    if (!went) { return; }
    closeSheet();
    render();
    toast((r === 'admin' ? '관리자' : r === 'manager' ? '팀장' : '기술인') + ' 화면으로 전환했어요');
  },
  roleMenu: function () { openRoleMenu(); },
  tab: function (el) {
    state.ui[state.role + 'Tab'] = el.getAttribute('data-tab');
    state.ui.timeEdit = false;
    render();
  },
  closeSheet: function () { closeSheet(); },
  refreshNow: function () {
    toast('최신 내용을 불러오는 중…');
    refresh(false).then(function () { toast('동기화 완료 · ' + nowHM()); });
  },

  /* ----- 로그인 · 계정 ----- */
  loginSubmit: async function () {
    var f = readLoginForm();
    if (f.err) { toast(f.err); return; }
    /* [필수] 개인정보 수집·이용 동의 — 체크하지 않으면 로그인·자동등록 모두 차단 */
    var agreeEl = $('#li_privacy');
    if (!agreeEl || !agreeEl.checked) {
      toast('개인정보 수집·이용 동의에 체크해야 로그인할 수 있습니다.');
      return;
    }
    /* [선택] 민감정보 동의 — 선택 사항이라 미체크여도 로그인 진행 */
    var sensEl = $('#li_sensitive');
    var sensitiveChecked = !!(sensEl && sensEl.checked);
    var found = state.people.filter(function (p) {
      return p.name === f.name && p.birth === f.birth && phoneDigits(p.phone) === f.pd;
    })[0];

    /* 팀장 선택 : is_leader 또는 is_admin 인 사람만 통과 · 자동등록 없음 · 관리자만 암호 확인 */
    if (f.job === LOGIN_MANAGER_LABEL) {
      if (!found || !(found.admin || found.role === 'leader')) {
        toast('팀장 권한이 등록된 인원만 선택할 수 있습니다.<br>먼저 관리자에게 권한 등록을 요청해 주세요.');
        return;
      }
      if (found.status === 'resigned') { toast('퇴사 처리된 인원입니다.<br>관리자에게 문의해 주세요.'); return; }
      if (found.admin) {
        var mcode = loginPassValue();
        if (!mcode) { showLoginPass('관리자 계정은 관리자 암호를 입력해야 로그인할 수 있습니다.'); return; }
        var mv = await verifyAdminPasscode(mcode);
        if (!mv.ok) { toast('관리자 암호를 확인하지 못했어요 · 인터넷 연결을 확인해 주세요.'); return; }
        if (!mv.pass) { toast('관리자 암호가 올바르지 않습니다.'); return; }
      }
      state.auth = { personId: found.id };
      markPrivacyAgree(found);
      if (sensitiveChecked) { markSensitiveAgree(found); }
      sessionSave(found, found.admin ? 'admin' : 'manager');
      state.role = found.admin ? 'admin' : 'manager';
      state.ui.adminTab = 'dash';
      render();
      toast(found.name + ' 님 ' + (found.admin ? '관리자' : '팀장') + ' 로그인 완료 · ' + teamLabel(found.teamId));
      return;
    }

    /* 관리자 선택 : DB에서 is_admin=true 로 등록된 사람만 통과 · 자동등록 없음 · 암호 필수 */
    if (f.job === LOGIN_ADMIN_LABEL) {
      if (!found || !found.admin) {
        toast('관리자 권한이 등록된 인원만 선택할 수 있습니다.<br>먼저 관리자에게 권한 등록을 요청해 주세요.');
        return;
      }
      if (found.status === 'resigned') { toast('퇴사 처리된 인원입니다.<br>관리자에게 문의해 주세요.'); return; }
      var code = loginPassValue();
      if (!code) { showLoginPass('관리자 암호를 입력해 주세요.'); return; }
      var v = await verifyAdminPasscode(code);
      if (!v.ok) { toast('관리자 암호를 확인하지 못했어요 · 인터넷 연결을 확인해 주세요.'); return; }
      if (!v.pass) { toast('관리자 암호가 올바르지 않습니다.'); return; }
      state.auth = { personId: found.id };
      markPrivacyAgree(found);
      if (sensitiveChecked) { markSensitiveAgree(found); }
      sessionSave(found, 'admin');
      state.role = 'admin';
      state.ui.adminTab = 'dash';
      render();
      toast(found.name + ' 님 관리자 로그인 완료 · ' + teamLabel(found.teamId));
      return;
    }

    if (found) {
      if (found.status === 'resigned') { toast('퇴사 처리된 인원입니다.<br>관리자에게 문의해 주세요.'); return; }
      /* 관리자 권한이 있는 계정은 일반 직종을 골라도 암호를 확인한다 */
      if (found.admin) {
        var code2 = loginPassValue();
        if (!code2) { showLoginPass('관리자 계정은 관리자 암호를 입력해야 로그인할 수 있습니다.'); return; }
        var v2 = await verifyAdminPasscode(code2);
        if (!v2.ok) { toast('관리자 암호를 확인하지 못했어요 · 인터넷 연결을 확인해 주세요.'); return; }
        if (!v2.pass) { toast('관리자 암호가 올바르지 않습니다.'); return; }
      }
      state.auth = { personId: found.id };
      markPrivacyAgree(found);
      if (sensitiveChecked) { markSensitiveAgree(found); }
      sessionSave(found, 'worker');
      state.role = 'worker';
      state.ui.workerTab = 'home';
      render();
      toast(found.name + ' 님 로그인 완료 · ' + teamLabel(found.teamId));
      return;
    }
    var near = state.people.filter(function (p) {
      return p.name === f.name && phoneDigits(p.phone) === f.pd;
    })[0];
    if (near) { toast('생년월일이 등록된 정보와 달라요.<br>다시 확인해 주세요.'); return; }

    var np = {
      id: uuid(), name: f.name, job: f.job || '배관공', birth: f.birth, phone: f.phone,
      price: 0, teamId: null, role: 'worker', admin: false, status: 'active', resign: null,
      hireDate: ($('#li_hire') ? $('#li_hire').value : '') || todayKey(),
      attendance: {}, leaves: [], certs: defaultCerts(),
      injury: { has: false, date: '', note: '' }, memo: '',
      privacyAgreedAt: new Date().toISOString(), privacyVersion: PRIVACY_VERSION,
      sensitiveAgreedAt: sensitiveChecked ? new Date().toISOString() : ''
    };
    state.people.push(np);
    state.auth = { personId: np.id };
    sessionSave(np, 'worker');
    state.role = 'worker';
    state.ui.workerTab = 'home';
    render();
    toast('신규 기술인으로 등록했어요<br>관리자 인원 목록에 추가됩니다');
    insertWorker(np);
  },
  openPrivacy: function (el) {
    openPrivacySheet(el ? el.getAttribute('data-from') : '');
  },
  leaveAlarmAck: function () {
    var p = me();
    if (!p || !canManage()) { toast('관리자·팀장만 확인할 수 있습니다.'); return; }
    var list = unackedLeaves();
    if (!list.length) { leaveAlarmOpenIds = null; closeSheet(); render(); return; }
    var ids = list.map(function (l) { return l.id; });
    ackLeaves(ids, p.id);
    leaveAlarmOpenIds = null;
    closeSheet();
    render();
    toast('<b>' + ids.length + '건</b> 휴무 보고를 <b>확인 완료</b>로 표시했습니다');
  },
  leaveAlarmList: function () {
    /* 알람을 열 수 있는 건 이미 관리자·팀장 화면 → 보던 역할 그대로 유지 (팀장은 팀장 화면에 머문다) */
    if (state.role === 'worker') { state.role = canAdmin() ? 'admin' : 'manager'; }
    state.role = state.role === 'worker' ? (canAdmin() ? 'admin' : 'manager') : state.role;
    leaveAlarmOpenIds = null;
    closeSheet();
    render();
    openLeaveManageSheet();
  },
  openSensitive: function (el) {
    openSensitiveSheet(el ? el.getAttribute('data-from') : '');
  },
  changeAdminPass: async function () {
    var p = me();
    if (!p || !p.admin || !isAdminView()) { toast('관리자만 암호를 바꿀 수 있습니다.'); return; }
    var o = $('#pw_old') ? $('#pw_old').value : '';
    var n = $('#pw_new') ? $('#pw_new').value : '';
    var n2 = $('#pw_new2') ? $('#pw_new2').value : '';
    if (!o) { toast('현재 암호를 입력해 주세요.'); return; }
    if (!n || n.length < 6) { toast('새 암호는 6자 이상으로 정해 주세요.'); return; }
    if (n !== n2) { toast('새 암호 확인이 일치하지 않습니다.'); return; }
    var r = await updateAdminPasscode(o, n);
    if (!r.ok) { toast('암호를 바꾸지 못했어요 · ' + esc(r.error || '인터넷 연결을 확인해 주세요.')); return; }
    if (!r.pass) { toast('현재 암호가 올바르지 않습니다.'); return; }
    if ($('#pw_old')) { $('#pw_old').value = ''; }
    if ($('#pw_new')) { $('#pw_new').value = ''; }
    if ($('#pw_new2')) { $('#pw_new2').value = ''; }
    toast('관리자 암호를 바꿨어요<br>다음 로그인부터 새 암호를 쓰세요');
  },
  openSettings: function (el) {
    var p = (el && el.getAttribute('data-id')) ? personById(el.getAttribute('data-id')) : me();
    openSettings(p || me());
  },
  /* 설정 시트 메뉴 */
  myInfoEdit: function () { openMyInfoEdit(me()); },
  myLeavesOpen: function () { openMyLeavesSheet(me()); },
  myGsOpen: function () { openMyGsCal(); },
  myGsToSettings: function () { openSettings(me()); },
  /* 📋 인원 현황 카드 — 하루씩 이동 · 오늘 복귀 · 한달 보기 */
  hcDay: function (el) {
    var d = parseInt(el.getAttribute('data-d'), 10) || 1;
    state.ui.hcDate = addDays(hcDateKey(), d);
    render();
  },
  hcToday: function () {
    state.ui.hcDate = todayKey();
    render();
  },
  hcMonth: function (el) {
    var mk = String((el && el.getAttribute('data-date')) || hcDateKey()).slice(0, 7);
    state.ui.hcMonth = mk;
    openHcMonth(mk);
  },
  hcMonthMove: function (el) {
    var d = parseInt(el.getAttribute('data-d'), 10) || 1;
    state.ui.hcMonth = shiftMonth(state.ui.hcMonth || todayKey().slice(0, 7), d);
    var box = $('#hcMonthBox');
    if (box) { box.innerHTML = hcMonthHTML(state.ui.hcMonth); }
  },
  hcPick: function (el) {
    var k = el.getAttribute('data-date');
    if (!k) { return; }
    state.ui.hcDate = k;
    closeSheet();
    render();
    toast(mdLabel(k) + ' (' + wd(k) + ') 인원 현황');
  },
  copyLeaveList: function (el) {
    var k = (el && el.getAttribute('data-date')) || todayKey();
    var text = leaveCopyText(k);
    copyText(text, function (ok) {
      toast(ok ? '휴무자 명단을 복사했어요<br><span class="muted">카톡에 붙여넣기 하세요</span>'
        : '복사가 막혔어요 · 아래 내용을 길게 눌러 복사해 주세요<br><b>' + esc(text).replace(/\n/g, '<br>') + '</b>');
    });
  },
  saveMyInfo: function (el) {
    var p = personById(el.getAttribute('data-id'));
    if (!p) { return; }
    var name = ($('#mi_name').value || '').trim();
    if (!name) { toast('이름을 입력해 주세요.'); return; }
    var birth = birthFromDigits($('#mi_birth').value);
    if (!birth) { toast('생년월일은 <b>숫자 6자리</b>(예: 961228) 또는 <b>8자리</b>(예: 19961228)로 입력해 주세요.'); return; }
    p.name = name;
    p.birth = birth;
    p.phone = ($('#mi_phone').value || '').trim() || p.phone;
    p.job = $('#mi_job').value || p.job;
    if ($('#mi_hire')) { p.hireDate = $('#mi_hire').value || ''; }
    var s = sessionRead();
    if (s && s.personId === p.id) { sessionSave(p, state.role); }
    patchWorker(p.id, { name: p.name, birth_date: p.birth, phone: p.phone, job_type: p.job, hire_date: p.hireDate || null }, '내 정보 저장');
    render();
    openSettings(p);
    toast('내 정보를 저장했어요 · 관리자 인원 목록에도 반영');
  },
  logout: function () {
    confirmSheet('로그아웃할까요?', '로그아웃하면 다시 <b>이름 · 생년월일 · 전화번호</b>로 로그인해야 합니다.<br>출퇴근 · 휴무 · 일보 기록은 그대로 남아 있어요.',
      '로그아웃', 'doLogout');
  },
  doLogout: function () { closeSheet(); logOut(); },

  /* ----- 기술인 ----- */
  clockIn: function () {
    var p = me();
    if (!p) { return; }
    var k = todayKey();
    if (!p.attendance[k]) { p.attendance[k] = { in: '', out: '', inEdited: false, outEdited: false }; }
    if (p.attendance[k].in) { toast('이미 출근 기록이 있어요 · ' + p.attendance[k].in); return; }
    var lv = leaveOn(p, k);
    if (lv) {
      p.leaves = p.leaves.filter(function (l) { return l !== lv; });
      deleteLeave(lv.id);
    }
    p.attendance[k].in = nowHM();
    p.attendance[k].inEdited = false;
    p.attendance[k].outEdited = false;
    render();
    saveAttendance(p, k, '출근 저장');
    toast('출근 완료 · ' + p.attendance[k].in + (lv ? ' (오늘 휴무 신청은 취소됐어요)' : '') + '<br>관리자 전체 현황에 반영됩니다');
  },
  earlyIn: function () {
    var p = me();
    if (!p) { return; }
    var a = todayAtt(p);
    if (a && (a.in || a.out)) {
      confirmSheet('오늘 근태를 조출로 바꿀까요?',
        '05:00 ~ 15:00 · <b>1공수</b>로 덮어씁니다.<br>지금 기록: ' + (a.in || '-') + ' ~ ' + (a.out || '-'),
        '조출로 저장', 'earlyInDo', '', false);
      return;
    }
    setTodayAtt('05:00', '15:00', '조출');
  },
  earlyInDo: function () { setTodayAtt('05:00', '15:00', '조출'); },
  earlyOut: function () {
    var p = me();
    if (!p) { return; }
    var a = todayAtt(p);
    var iv = (a && a.in) ? a.in : '07:00';
    if (a && a.in && a.out) {
      confirmSheet('오늘 근태를 조퇴로 바꿀까요?',
        iv + ' ~ 11:00 · <b>' + fmtGs(calcGongsu(iv, '11:00')) + '공수</b>로 덮어씁니다.<br>지금 기록: ' + a.in + ' ~ ' + a.out,
        '조퇴로 저장', 'earlyOutDo', '', false);
      return;
    }
    setTodayAtt(iv, '11:00', '조퇴');
  },
  earlyOutDo: function () {
    var p = me();
    if (!p) { return; }
    var a = todayAtt(p);
    setTodayAtt((a && a.in) ? a.in : '07:00', '11:00', '조퇴');
  },
  clockOut: function () {
    var p = me();
    var k = todayKey();
    var a = p.attendance[k];
    if (!a || !a.in) { toast('출근 기록이 없어요. 먼저 출근하기를 눌러 주세요.'); return; }
    if (a.out) { toast('이미 퇴근 기록이 있어요 · ' + a.out); return; }
    a.out = nowHM();
    a.outEdited = false;
    render();
    saveAttendance(p, k, '퇴근 저장');
    toast('퇴근 완료 · ' + a.out + '<br>오늘 근무 ' + a.in + ' ~ ' + a.out + ' · ' + fmtGs(gongsuOf(a)) + '공수');
  },
  timeEditOpen: function () { state.ui.timeEdit = true; render(); },
  timeEditCancel: function () { state.ui.timeEdit = false; render(); },
  saveTimeEdit: function () {
    var p = me();
    var iv = $('#te_in') ? $('#te_in').value : '';
    var ov = $('#te_out') ? $('#te_out').value : '';
    var err = applyAttTime(p, iv, ov);
    if (err) { toast(err + '<br>다시 확인해 주세요.'); return; }
    state.ui.timeEdit = false;
    render();
    saveAttendance(p, todayKey(), '출퇴근 시간 수정');
    var a = todayAtt(p);
    if (!a) { toast('출퇴근 기록을 비웠어요'); return; }
    toast('시간 수정 완료 · 출근 ' + a.in + (a.out ? ' · 퇴근 ' + a.out : '') +
      '<br>관리자 전체 현황 · 한달 공수표에 <b>(수정됨)</b>으로 반영됩니다');
  },
  vote: function (el) {
    var v = el.getAttribute('data-v');
    var poll = latestPoll();
    if (!poll) { return; }
    if (!pollIsOpen(poll)) { toast('응답이 마감된 공지예요.'); return; }
    var p = me();
    poll.votes[p.id] = v;
    render();
    saveVote(poll.id, p.id, v);
    toast(v === 'yes' ? '토요일 <b>출근 가능(예)</b>으로 응답했어요' : '토요일 <b>출근 어려움(아니오)</b>으로 응답했어요');
  },
  applyLeave: function () {
    var p = me();
    var d = $('#leaveDate') ? $('#leaveDate').value : '';
    var r = ($('#leaveReason') ? $('#leaveReason').value : '').trim();
    var teamId = $('#leaveTeam') ? ($('#leaveTeam').value || null) : (p.teamId || null);
    var reportTo = ($('#leaveReport') ? ($('#leaveReport').value || '').trim() : '') || '관리자';
    if (!d) { toast('휴무 날짜를 선택해 주세요.'); return; }
    if (d < todayKey()) { toast('지난 날짜는 휴무 신청할 수 없어요.'); return; }
    if (!r) { r = '개인 사정'; }
    var l = { id: uuid(), date: d, reason: r, at: nowHM(), teamName: teamLabel(teamId), reportTo: reportTo, status: 'pending' };
    p.leaves.push(l);
    var hadAtt = !!p.attendance[d];
    if (d === todayKey()) { delete p.attendance[d]; }
    render();
    insertLeave(p, l);
    if (hadAtt) { saveAttendance(p, d, '휴무로 근태 삭제'); }
    toast(shortDate(d) + ' (' + wd(d) + ') 휴무 신청 완료 · ' + esc(r) +
      '<br>' + esc(teamLabel(teamId)) + ' · 보고 ' + esc(reportTo) + ' · 관리자 현황에 반영됩니다');
  },
  editLeave: function (el) {
    var p = me();
    var l = leaveById(p, el.getAttribute('data-id'));
    if (!l) { return; }
    if (daysUntil(l.date) <= 0) {
      toast('당일 · 지난 휴무는 앱에서 정정할 수 없어요.<br>박서하 총무 또는 관리자에게 연락해 주세요.');
      return;
    }
    openLeaveEdit(l, p);
  },
  saveLeaveEdit: function (el) {
    var p = me();
    var l = leaveById(p, el.getAttribute('data-id'));
    if (!l) { return; }
    var d = $('#lv_date').value;
    var r = ($('#lv_reason').value || '').trim() || l.reason;
    var teamId = $('#lv_team') ? ($('#lv_team').value || null) : null;
    var reportTo = $('#lv_report') ? (($('#lv_report').value || '').trim() || l.reportTo) : l.reportTo;
    if (!d) { toast('휴무 날짜를 선택해 주세요.'); return; }
    if (daysUntil(d) <= 0) { toast('내일 이후 날짜로만 정정할 수 있어요.'); return; }
    l.date = d; l.reason = r; l.teamName = teamLabel(teamId); l.reportTo = reportTo;
    /* 반려됐던 신청을 정정해 다시 올리면 → 대기(pending)로 되돌려 다시 승인받게 한다 */
    if (l.status === 'rejected') { l.status = 'pending'; l.decidedAt = ''; l.decidedBy = ''; l.rejectReason = ''; }
    patchLeave(l);
    render();
    openSettings(p);
    toast('휴무 신청을 정정했어요 · ' + longDate(d));
  },
  askCancelLeave: function (el) {
    var p = me();
    var l = leaveById(p, el.getAttribute('data-id'));
    if (!l) { return; }
    if (daysUntil(l.date) < 0) {
      toast('지난 날짜의 휴무는 앱에서 취소할 수 없어요.<br>박서하 총무 또는 관리자에게 연락해 주세요.');
      return;
    }
    var isToday = daysUntil(l.date) === 0;
    confirmSheet('휴무 신청을 취소할까요?',
      '<b>' + longDate(l.date) + '</b> · ' + esc(l.reason) + '<br>' +
      (isToday ? '<b>오늘</b> 휴무입니다. 취소하면 오늘 0공수가 풀리고 <b>미출근</b>으로 바뀝니다.<br>관리자에게도 알려 주세요.' : '취소하면 관리자 현황 · 공수 집계에서도 빠집니다.'),
      '신청 취소', 'doCancelLeave', 'data-id="' + l.id + '"');
  },
  doCancelLeave: function (el) {
    var p = me();
    var l = leaveById(p, el.getAttribute('data-id'));
    if (!l) { closeSheet(); return; }
    p.leaves = p.leaves.filter(function (x) { return x.id !== l.id; });
    deleteLeave(l.id);
    closeSheet();
    render();
    toast('휴무 신청을 취소했어요 · ' + longDate(l.date));
    setTimeout(function () { refresh(true); }, 600);
  },

  /* ----- 관리자·팀장 : 휴무 관리 (승인 · 반려 · 대리 등록) ----- */
  leaveManage: function () {
    if (!canManage()) { toast('관리자·팀장만 볼 수 있습니다.'); return; }
    openLeaveManageSheet();
  },
  leaveApprove: function (el) {
    var who = me();
    if (!who || !canManage()) { toast('관리자·팀장만 승인할 수 있습니다.'); return; }
    var f = leaveFind(el.getAttribute('data-id'));
    if (!f) { toast('휴무 신청을 찾지 못했어요 · 새로고침 후 다시 시도해 주세요.'); return; }
    decideLeave(f.l, 'approved', who.id);
    afterLeaveDecision();
    toast('<b>' + esc(f.p.name) + '</b> 님 ' + mdLabel(f.l.date) + ' 휴무 <b>승인</b><br>0공수로 집계됩니다');
    setTimeout(function () { refresh(true); }, 600);
  },
  leaveRejectOpen: function (el) {
    var who = me();
    if (!who || !canManage()) { toast('관리자·팀장만 반려할 수 있습니다.'); return; }
    var f = leaveFind(el.getAttribute('data-id'));
    if (!f) { toast('휴무 신청을 찾지 못했어요 · 새로고침 후 다시 시도해 주세요.'); return; }
    var body = '<div class="muted" style="margin:-4px 0 6px">' + esc(f.p.name) + ' · ' + longDate(f.l.date) +
      ' · ' + esc(f.l.reason || '사유 없음') + '</div>' +
      '<label class="field"><span>반려 사유 (선택)</span><input id="lvr_reason" placeholder="예) 현장 인원 부족"></label>' +
      '<div class="hint">반려하면 이 휴무는 <b>인원 현황 · 공수 집계에서 빠지고</b>, 신청자 화면에 <b>반려</b>로 표시됩니다.</div>';
    openSheet('휴무 반려', body,
      '<button class="btn btn-ghost" data-act="leaveManage">돌아가기</button>' +
      '<button class="btn btn-danger" data-act="leaveRejectDo" data-id="' + f.l.id + '">반려하기</button>');
  },
  leaveRejectDo: function (el) {
    var who = me();
    if (!who || !canManage()) { toast('관리자·팀장만 반려할 수 있습니다.'); return; }
    var f = leaveFind(el.getAttribute('data-id'));
    if (!f) { toast('휴무 신청을 찾지 못했어요 · 새로고침 후 다시 시도해 주세요.'); return; }
    var reason = ($('#lvr_reason') ? $('#lvr_reason').value : '').trim();
    decideLeave(f.l, 'rejected', who.id, reason);
    afterLeaveDecision();
    toast('<b>' + esc(f.p.name) + '</b> 님 ' + mdLabel(f.l.date) + ' 휴무 <b>반려</b><br>휴무 집계에서 빠집니다');
    setTimeout(function () { refresh(true); }, 600);
  },
  leaveProxyOpen: function () {
    if (!canManage()) { toast('관리자·팀장만 등록할 수 있습니다.'); return; }
    openLeaveProxySheet();
  },
  leaveProxySave: function () {
    var who = me();
    if (!who || !canManage()) { toast('관리자·팀장만 등록할 수 있습니다.'); return; }
    var w = personById($('#lp_worker') ? $('#lp_worker').value : '');
    var d = $('#lp_date') ? $('#lp_date').value : '';
    var r = ($('#lp_reason') ? $('#lp_reason').value : '').trim() || '관리자 대리 등록';
    if (!w) { toast('휴무 처리할 인원을 골라 주세요.'); return; }
    if (!d) { toast('휴무 날짜를 선택해 주세요.'); return; }
    if (d < todayKey()) { toast('지난 날짜는 대리 등록할 수 없어요.'); return; }
    var at = new Date().toISOString();
    var ex = leaveAnyOn(w, d);
    if (ex) {
      ex.reason = r;
      ex.teamName = teamLabel(w.teamId);
      ex.reportTo = '관리자';
      ex.ackAt = ex.ackAt || at;
      ex.ackBy = ex.ackBy || who.id;
      decideLeave(ex, 'approved', who.id);
      patchLeave(ex);
    } else {
      var l = {
        id: uuid(), date: d, reason: r, at: nowHM(), teamName: teamLabel(w.teamId), reportTo: '관리자',
        status: 'approved', decidedAt: at, decidedBy: who.id, ackAt: at, ackBy: who.id
      };
      w.leaves.push(l);
      insertLeave(w, l, '휴무 대리 등록');
    }
    var had = !!(w.attendance && w.attendance[d]);
    if (had) { delete w.attendance[d]; saveAttendance(w, d, '휴무로 근태 삭제'); }
    closeSheet();
    render();
    openLeaveManageSheet();
    toast('<b>' + esc(w.name) + '</b> 님 ' + longDate(d) + ' 휴무 <b>대리 등록 · 승인</b>' + (had ? '<br>그 날 근태를 지워 0공수로 바꿨어요' : ''));
    setTimeout(function () { refresh(true); }, 700);
  },
  toggleResign: function () {
    state.ui.resignOpen = !state.ui.resignOpen;
    render();
  },
  askResign: function () {
    var paper = $('#resignPaper');
    var tbm = $('#resignTbm');
    var d = $('#resignDate').value;
    var reason = $('#resignReason').value;
    var etc = $('#resignEtc') ? ($('#resignEtc').value || '').trim() : '';
    /* 사직서 작성 · TBM카드 반납 둘 다 체크해야 진행 */
    if (!paper || !tbm || !paper.checked || !tbm.checked) {
      toast('사직서 작성 및 TBM카드 반납 여부를 모두 체크해야 퇴사 처리가 가능합니다.');
      return;
    }
    if (!d) { toast('퇴사일자를 선택해 주세요.'); return; }
    if (reason === '개인사유(직접입력)' && !etc) { toast('개인사유 내용을 적어 주세요.'); return; }
    state.ui.pendingResign = {
      date: d, reason: reason, text: reason === '개인사유(직접입력)' ? etc : '',
      paper: true, tbm: true
    };
    confirmSheet('퇴사 신청을 제출할까요?',
      '<b>' + esc(me().name) + '</b> 님 · 퇴사일 <b>' + longDate(d) + '</b><br>사유 <b>' + esc(reason) + (etc ? ' · ' + esc(etc) : '') + '</b><br>사직서 작성 <b>확인</b> · TBM카드 반납 <b>확인</b><br><br>제출하면 출근 대상 · 조 편성 · 평균단가 계산에서 <b>자동 제외</b>되고 퇴사자 보관함으로 이동합니다.',
      '퇴사 신청 제출', 'resignConfirm');
  },
  resignConfirm: function () {
    var pr = state.ui.pendingResign;
    if (!pr) { return; }
    if (!pr.paper || !pr.tbm) {
      toast('사직서 작성 및 TBM카드 반납 여부를 모두 체크해야 퇴사 처리가 가능합니다.');
      return;
    }
    var p = me();
    p.status = 'resigned';
    p.resign = { date: pr.date, reason: pr.reason, text: pr.text };
    var hadAtt = !!p.attendance[todayKey()];
    delete p.attendance[todayKey()];
    state.ui.resignOpen = false;
    state.ui.pendingResign = null;
    closeSheet();
    render();
    patchWorker(p.id, {
      status: 'resigned', resign_date: pr.date,
      resign_reason: pr.reason + (pr.text ? ' · ' + pr.text : '')
    }, '퇴사 처리');
    if (hadAtt) { saveAttendance(p, todayKey(), '퇴사 근태 삭제'); }
    toast('퇴사 처리 완료 · 출근 대상 · 조 편성' + (isAdminView() ? ' · 평균단가' : '') + '에서 제외됐어요');
  },

  /* ----- 관리자 · 전체 현황 ----- */
  adminDashView: function (el) {
    state.ui.adminDashView = el.getAttribute('data-v') === 'gongsu' ? 'gongsu' : 'today';
    render();
  },
  gsTeam: function (el) {
    state.ui.adminGsTeam = el.getAttribute('data-f') || 'all';
    render();
  },
  gsMonth: function (el) {
    var d = parseInt(el.getAttribute('data-d'), 10);
    state.ui.gsMonth = shiftMonth(state.ui.gsMonth || todayKey().slice(0, 7), d);
    render();
  },
  adminFilter: function (el) {
    state.ui.adminTeamFilter = el.getAttribute('data-f');
    render();
  },
  toggleArchive: function () {
    state.ui.showArchive = !state.ui.showArchive;
    render();
  },
  /* 이름 검색 : 입력 즉시 목록 필터 (재렌더 없이 DOM 만 → 포커스 유지) */
  searchClear: function (el) {
    var key = el.getAttribute('data-search') || 'dash';
    state.ui['q_' + key] = '';
    var inp = document.querySelector('[data-search="' + key + '"]');
    if (inp) { inp.value = ''; }
    var btn = document.querySelector('[data-act="searchClear"][data-search="' + key + '"]');
    if (btn) { btn.classList.add('hide'); }
    applyNameFilters();
  },
  /* 공수 일괄 적용 : 전체 선택 / 선택 해제 (지금 화면에 보이는 인원 기준) */
  bulkAll: function () {
    var vis = bulkChecksVisible();
    var allOn = vis.length > 0 && vis.every(function (c) { return c.checked; });
    vis.forEach(function (c) {
      c.checked = !allOn;
      var id = c.getAttribute('data-id');
      if (allOn) { delete bulkSel[id]; } else { bulkSel[id] = 1; }
    });
    syncBulkUI();
  },
  bulkGsApply: function () {
    if (!canManage()) { toast('관리자·팀장만 공수를 일괄 적용할 수 있습니다.'); return; }
    var date = state.ui.bulkDate || ($('#bulkDate') ? $('#bulkDate').value : '') || todayKey();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('날짜를 선택해 주세요.'); return; }
    if (date > todayKey()) { toast('미래 날짜는 공수를 넣을 수 없습니다.<br>오늘까지만 입력할 수 있어요.'); return; }
    var ids = Object.keys(bulkSel).filter(function (id) {
      var p = personById(id);
      return p && p.status !== 'resigned';
    });
    if (!ids.length) { toast('공수를 넣을 인원을 선택해 주세요.<br>이름 왼쪽 체크박스를 눌러 주세요.'); return; }

    var val = $('#bulkGsSel') ? $('#bulkGsSel').value : 'p:07:00|17:00';

    /* 휴무(0공수) — leaves 에 등록해 공수표·집계 모두 0으로 */
    if (val === 'leave') {
      var hadAtt = ids.filter(function (id) {
        var a = personById(id).attendance[date];
        return !!(a && (a.in || a.out));
      });
      var msg = '<b>' + ids.length + '명</b>을 ' + longDate(date) + ' <b>휴무(0공수)</b>로 처리합니다.<br>휴무 신청 내역에도 함께 남습니다.';
      if (hadAtt.length) { msg += '<br>출퇴근 기록이 있는 <b>' + hadAtt.length + '명</b>은 기록을 지우고 휴무로 바뀝니다.'; }
      bulkPending = { kind: 'leave', ids: ids, date: date, reason: '관리자 일괄 휴무' };
      confirmSheet('휴무(0공수)로 처리할까요?', msg, '휴무 처리', 'bulkGsDo', '', true);
      return;
    }

    var inHM = '', outHM = '', label = '';
    if (val === 'custom') {
      inHM = $('#bulk_in') ? $('#bulk_in').value : '';
      outHM = $('#bulk_out') ? $('#bulk_out').value : '';
      if (!inHM || !outHM) { toast('시작·종료 시간을 넣어 주세요.'); return; }
      if (minFromHM(outHM) <= minFromHM(inHM)) { toast('종료 시간이 시작 시간보다 빠릅니다.<br>다시 확인해 주세요.'); return; }
      label = fmtGs(calcGongsu(inHM, outHM)) + '공수(' + inHM + '~' + outHM + ')';
    } else {
      var mm = /^p:(\d{2}:\d{2})\|(\d{2}:\d{2})$/.exec(val);
      if (!mm) { toast('적용할 시간을 골라 주세요.'); return; }
      inHM = mm[1]; outHM = mm[2];
      label = fmtGs(calcGongsu(inHM, outHM)) + '공수(' + inHM + '~' + outHM + ')';
    }

    var leaveIds = ids.filter(function (id) { return !!leaveOn(personById(id), date); });
    var useIds = ids.filter(function (id) { return leaveIds.indexOf(id) < 0; });
    if (!useIds.length) { toast('선택한 인원이 모두 그 날짜에 휴무입니다.<br>다른 날짜를 골라 주세요.'); return; }
    var ow = useIds.filter(function (id) {
      var a = personById(id).attendance[date];
      return !!(a && (a.in || a.out));
    });
    bulkPending = { kind: 'att', ids: useIds, date: date, in: inHM, out: outHM, label: label };
    if (ow.length || leaveIds.length) {
      var msg2 = '<b>' + useIds.length + '명</b>에게 ' + longDate(date) + ' <b>' + label + '</b>을 적용합니다.';
      if (ow.length) { msg2 += '<br>이미 기록이 있는 <b>' + ow.length + '명</b>은 덮어씁니다.'; }
      if (leaveIds.length) { msg2 += '<br>휴무 신청이 있는 <b>' + leaveIds.length + '명</b>은 제외합니다.'; }
      confirmSheet('공수를 일괄 적용할까요?', msg2, '적용', 'bulkGsDo', '', false);
      return;
    }
    bulkApplyNow();
  },
  bulkGsDo: function () { bulkApplyNow(); },
  openPerson: function (el) { openPerson(el.getAttribute('data-id')); },
  pmonth: function (el) {
    var d = parseInt(el.getAttribute('data-d'), 10);
    state.ui.pMonth = shiftMonth(state.ui.pMonth || todayKey().slice(0, 7), d);
    var block = $('#attBlock');
    var q = personById(state.ui.personOpen || '');
    if (!q && el.closest) {
      var sheet = el.closest('.sheet');
      var idEl = sheet ? sheet.querySelector('[data-act="savePerson"]') : null;
      if (idEl) { q = personById(idEl.getAttribute('data-id')); }
    }
    if (block && q) { block.innerHTML = attBlockHTML(q, block.getAttribute('data-scope') || 'me'); }
  },
  addCert: function () {
    var list = $('#certList');
    if (!list) { return; }
    var div = document.createElement('div');
    div.className = 'cert-row';
    div.innerHTML = '<label class="chk"><input type="checkbox" class="cert-on" checked>' +
      '<input class="cert-name" placeholder="자격 이름"></label>' +
      '<input class="cert-exp" type="date">' +
      '<button class="cert-x" data-act="delCert">✕</button>';
    list.appendChild(div);
    var inp = div.querySelector('.cert-name');
    if (inp) { inp.focus(); }
  },
  certExpAdd: function (el) {
    var row = el.closest ? el.closest('.cert-row') : null;
    if (!row) { return; }
    var inp = document.createElement('input');
    inp.className = 'cert-exp';
    inp.type = 'date';
    row.replaceChild(inp, el);
    inp.focus();
  },
  delCert: function (el) {
    var row = el.closest ? el.closest('.cert-row') : null;
    if (row) { row.parentNode.removeChild(row); }
  },
  injury: function (el) {
    var v = el.getAttribute('data-v');
    var seg = $('#injurySeg');
    var fields = $('#injuryFields');
    if (!seg || !fields) { return; }
    $$('#injurySeg button').forEach(function (b) { b.classList.remove('on'); });
    el.classList.add('on');
    if (v === 'yes') { fields.classList.remove('hide'); } else { fields.classList.add('hide'); }
  },
  savePerson: function (el) {
    var p = personById(el.getAttribute('data-id'));
    if (!p) { return; }
    var nameEl = $('#pf_name');
    if (nameEl && nameEl.value.trim()) { p.name = nameEl.value.trim(); }
    p.birth = $('#pf_birth').value;
    p.phone = $('#pf_phone').value.trim();
    p.job = $('#pf_job').value.trim() || p.job;
    var newTeam = $('#pf_team').value || null;
    var oldTeam = p.teamId;
    p.teamId = newTeam;
    if (oldTeam !== newTeam) {
      var ot = teamById(oldTeam);
      if (ot && ot.leaderId === p.id) {
        ot.leaderId = null;
        p.role = 'worker';
        apiWrite({ m: 'PATCH', path: '/rest/v1/teams?id=' + sbEq(ot.id), body: { leader_id: null }, prefer: 'return=minimal', label: '반장 해제' });
      }
    }
    if (isAdminView() && $('#pf_price')) { p.price = Math.max(0, num($('#pf_price').value)); }
    if ($('#pf_tin') || $('#pf_tout')) {
      var err = applyAttTime(p, $('#pf_tin') ? $('#pf_tin').value : '', $('#pf_tout') ? $('#pf_tout').value : '');
      if (err) { toast(err + '<br>다시 확인해 주세요.'); }
      else { saveAttendance(p, todayKey(), '출퇴근 시간 수정'); }
    }
    p.certs = $$('#certList .cert-row').map(function (row) {
      var onEl = row.querySelector('.cert-on');
      var nameInp = row.querySelector('.cert-name');
      var label = row.querySelector('.cert-label');
      var expEl = row.querySelector('.cert-exp');
      var nm = nameInp ? nameInp.value.trim() : (label ? label.textContent.trim() : '');
      return { name: nm, on: onEl ? onEl.checked : false, exp: (expEl ? expEl.value : ''), custom: !!nameInp };
    }).filter(function (c) { return !!c.name; });
    var injFields = $('#injuryFields');
    p.injury = {
      has: injFields ? !injFields.classList.contains('hide') : false,
      date: $('#pf_injdate') ? $('#pf_injdate').value : '',
      note: $('#pf_injnote') ? $('#pf_injnote').value.trim() : ''
    };
    p.memo = $('#pf_memo') ? $('#pf_memo').value : '';
    if ($('#pf_hire')) { p.hireDate = $('#pf_hire').value || ''; }

    var fields = {
      name: p.name, birth_date: p.birth || null, phone: p.phone || null, job_type: p.job || null,
      hire_date: p.hireDate || null,
      team_id: p.teamId, certs_json: p.certs,
      injury_has: !!p.injury.has, injury_date: p.injury.date || null,
      injury_note: p.injury.note || null, memo: p.memo || null
    };
    if (isAdminView()) { fields.daily_rate = p.price || null; fields.is_leader = (p.role === 'leader'); }
    patchWorker(p.id, fields, '인원 정보 저장');
    if (sessionRead() && sessionRead().personId === p.id) { sessionSave(p, state.role); }
    render();
    openPerson(p.id);
    toast(isAdminView() ? '저장됐어요 · 전체 평균단가 <b>' + won(overallAvg()) + '원</b>' : '저장됐어요');
  },
  toggleAdmin: function (el) {
    if (!isAdminView()) { toast('관리자만 권한을 바꿀 수 있습니다.'); return; }
    var p = personById(el.getAttribute('data-id'));
    if (!p) { return; }
    p.admin = !p.admin;
    patchWorker(p.id, { is_admin: p.admin }, '관리자 권한 변경');
    if (!canAdmin() && state.role === 'admin') { state.role = 'worker'; }
    render();
    openPerson(p.id);
    toast('<b>' + esc(p.name) + '</b> 님 관리자 권한을 ' + (p.admin ? '부여' : '해제') + '했어요');
  },
  toggleLeader: function (el) {
    if (!isAdminView()) { toast('관리자만 권한을 바꿀 수 있습니다.'); return; }
    var p = personById(el.getAttribute('data-id'));
    if (!p) { return; }
    var next = p.role !== 'leader';
    p.role = next ? 'leader' : 'worker';
    patchWorker(p.id, { is_leader: next }, '팀장 권한 변경');
    var t = teamById(p.teamId);
    if (t) {
      if (next && !t.leaderId) { t.leaderId = p.id; apiWrite({ m: 'PATCH', path: '/rest/v1/teams?id=' + sbEq(t.id), body: { leader_id: p.id }, prefer: 'return=minimal', label: '팀장 지정' }); }
      else if (!next && t.leaderId === p.id) { t.leaderId = null; apiWrite({ m: 'PATCH', path: '/rest/v1/teams?id=' + sbEq(t.id), body: { leader_id: null }, prefer: 'return=minimal', label: '팀장 해제' }); }
    }
    render();
    openPerson(p.id);
    toast('<b>' + esc(p.name) + '</b> 님 팀장 권한을 ' + (next ? '부여' : '해제') + '했어요' +
      (next ? '<br>상단 <b>팀장</b> 화면에서 현황·일보·일정·공수표를 쓸 수 있습니다' : ''));
  },
  restore: function (el) {
    var p = personById(el.getAttribute('data-id'));
    if (!p) { return; }
    p.status = 'active';
    p.resign = null;
    patchWorker(p.id, { status: 'active', resign_date: null, resign_reason: null }, '복직 처리');
    closeSheet();
    render();
    toast(p.name + ' 님을 복직 처리했어요' + (isAdminView() ? ' · 평균단가에 다시 포함됩니다' : ''));
  },

  /* ----- 관리자 · 팀·조 ----- */
  newTeam: function () { if (!canManage()) { toast('관리자·팀장만 조를 만들 수 있습니다.'); return; } openNewTeam(); },
  createTeam: function () {
    if (!canManage()) { toast('관리자·팀장만 조를 만들 수 있습니다.'); return; }
    var name = ($('#teamName').value || '').trim();
    if (!name) { toast('조 이름을 입력해 주세요.'); return; }
    var dup = state.teams.filter(function (t) { return normTeam(t.name) === normTeam(name); })[0];
    if (dup) { toast('같은 이름의 조가 이미 있어요.'); return; }
    var t = insertTeam(name);
    state.teams.push(t);
    closeSheet();
    render();
    toast('<b>' + esc(name) + '</b> 조를 만들었어요 · 조원을 배정해 주세요');
  },
  moveMember: function (el) { if (!canManage()) { return; } openMoveMember(el.getAttribute('data-id')); },
  setTeam: function (el) {
    if (!canManage()) { return; }
    var p = personById(el.getAttribute('data-id'));
    if (!p) { return; }
    var tid = el.getAttribute('data-team') || null;
    var old = teamById(p.teamId);
    var wasLeader = p.role === 'leader';
    if (old && old.leaderId === p.id) {
      old.leaderId = null;
      p.role = 'worker';
      wasLeader = false;
      apiWrite({ m: 'PATCH', path: '/rest/v1/teams?id=' + sbEq(old.id), body: { leader_id: null }, prefer: 'return=minimal', label: '반장 해제' });
    }
    p.teamId = tid;
    var nt = teamById(tid);
    if (nt && !nt.leaderId && p.role === 'leader') { nt.leaderId = p.id; }
    patchWorker(p.id, { team_id: tid, is_leader: p.role === 'leader' }, '조 이동');
    closeSheet();
    render();
    toast(p.name + ' 님을 <b>' + teamLabel(tid) + '</b>(으)로 옮겼어요');
  },
  addMembers: function (el) { if (!canManage()) { return; } openAddMembers(el.getAttribute('data-team')); },
  applyAddMembers: function (el) {
    if (!canManage()) { return; }
    var tid = el.getAttribute('data-team');
    var ids = $$('.addchk').filter(function (c) { return c.checked; }).map(function (c) { return c.getAttribute('data-id'); });
    ids.forEach(function (id) {
      var p = personById(id);
      if (!p) { return; }
      var old = teamById(p.teamId);
      if (old && old.leaderId === p.id) {
        old.leaderId = null;
        p.role = 'worker';
        apiWrite({ m: 'PATCH', path: '/rest/v1/teams?id=' + sbEq(old.id), body: { leader_id: null }, prefer: 'return=minimal', label: '반장 해제' });
      }
      p.teamId = tid;
      patchWorker(p.id, { team_id: tid, is_leader: p.role === 'leader' }, '조 이동');
    });
    closeSheet();
    render();
    toast(ids.length + '명을 <b>' + teamLabel(tid) + '</b>(으)로 옮겼어요');
  },
  changeLeader: function (el) { if (!canManage()) { return; } openChangeLeader(el.getAttribute('data-team')); },
  setLeader: function (el) {
    if (!canManage()) { toast('관리자·팀장만 팀장을 바꿀 수 있습니다.'); return; }
    var tid = el.getAttribute('data-team');
    var pid = el.getAttribute('data-id');
    var t = teamById(tid);
    var p = personById(pid);
    if (!t || !p) { return; }
    var prev = personById(t.leaderId);
    if (prev && prev.id !== p.id && prev.status !== 'resigned') {
      prev.role = 'worker';
      patchWorker(prev.id, { is_leader: false }, '반장 해제');
    }
    t.leaderId = p.id;
    p.role = 'leader';
    p.teamId = tid;
    apiWrite({ m: 'PATCH', path: '/rest/v1/teams?id=' + sbEq(t.id), body: { leader_id: p.id }, prefer: 'return=minimal', label: '반장 지정' });
    patchWorker(p.id, { is_leader: true, team_id: tid }, '반장 지정');
    closeSheet();
    render();
    toast('<b>' + esc(p.name) + '</b> 님을 ' + esc(t.name) + ' 반장으로 지정했어요');
  },
  bulkOpen: function () { if (!isAdminView()) { toast('관리자만 명단을 일괄 등록할 수 있습니다.'); return; } openBulk(); },
  pastAttOpen: function () { openPastAtt(); },
  pastAttSave: function () { pastAttSave(); },
  personAdd: function () { openPersonAdd(); },
  personAddSubmit: function () { personAddSubmit(); },
  bulkClear: function () {
    var ta = $('#bulkText');
    if (ta) { ta.value = ''; }
  },
  bulkApply: function () {
    if (!isAdminView()) { toast('관리자만 명단을 일괄 등록할 수 있습니다.'); return; }
    var ta = $('#bulkText');
    if (!ta) { return; }
    var parsed = parseRoster(ta.value);
    if (!parsed.rows.length) { toast('등록할 명단을 확인해 주세요.<br>이름 · 직종 · 생년월일 · 단가 · 조 순서입니다.'); return; }
    var newTeams = 0, added = 0;
    parsed.rows.forEach(function (r) {
      var tid = null;
      if (r.team) {
        var found = state.teams.filter(function (t) { return normTeam(t.name) === normTeam(r.team); })[0];
        if (!found) {
          found = insertTeam(r.team);
          state.teams.push(found);
          newTeams++;
        }
        tid = found.id;
      }
      var np = {
        id: uuid(), name: r.name, job: r.job || '배관공', birth: r.birth || '', phone: r.phone || '',
        price: r.price || 0, teamId: tid, role: 'worker', admin: false, status: 'active', resign: null,
        attendance: {}, leaves: [], certs: defaultCerts(),
        injury: { has: false, date: '', note: '' }, memo: ''
      };
      state.people.push(np);
      insertWorker(np, '명단 일괄 등록');
      added++;
    });
    closeSheet();
    render();
    toast('<b>' + added + '명</b> 등록 완료' + (newTeams ? ' · 새 조 ' + newTeams + '개 자동 생성' : '') +
      (isAdminView() ? '<br>전체 평균단가 <b>' + won(overallAvg()) + '원</b>으로 다시 계산됐어요' : '') +
      (parsed.rows.some(function (r) { return !r.birth; }) ? '<br>생년월일이 비었거나 형식이 다른 줄은 직접 확인해 주세요.' : ''));
  },

  /* ----- 관리자 · 작업일보함 ----- */
  repPrev: function () {
    state.ui.reportDate = addDays(state.ui.reportDate || todayKey(), -1);
    render();
  },
  repNext: function () {
    state.ui.reportDate = addDays(state.ui.reportDate || todayKey(), 1);
    render();
  },
  reportDetail: function (el) { openReportDetail(el.getAttribute('data-id')); },
  digestAll: function (el) {
    var date = el.getAttribute('data-date') || todayKey();
    var text = composeDailyDigest(date);
    copyText(text, function (ok) {
      toast(ok ? '전체 일보를 복사했어요' : '복사가 막혔어요 · 미리보기에서 직접 복사해 주세요');
    });
    openDigest(date);
  },
  digestCopy: function (el) {
    var date = el.getAttribute('data-date') || todayKey();
    copyText(composeDailyDigest(date), function (ok) {
      toast(ok ? '전체 일보를 복사했어요' : '복사가 막혔어요 · 아래 내용을 길게 눌러 복사해 주세요');
    });
  },
  myGsMonth: function (el) {
    var d = parseInt(el.getAttribute('data-d'), 10);
    state.ui.myGsMonth = shiftMonth(myGsMonthKey(), d);
    var box = $('#myGsBox');
    var p = me();
    if (box && p) { box.innerHTML = myGsCalHTML(p); }
  },
  myGsPick: function (el) { openMyGsEdit(el.getAttribute('data-date')); },
  myGsBack: function () { openMyGsCal(); },
  myGsDelete: function (el) {
    var p = me();
    if (!p) { return; }
    var d = el.getAttribute('data-date') || ($('#mg_date') ? $('#mg_date').value : '') || todayKey();
    p.attendance = p.attendance || {};
    delete p.attendance[d];
    state.ui.myGsMonth = d.slice(0, 7);
    saveAttendance(p, d, '내 근태 삭제');
    openMyGsCal();
    toast(longDate(d) + ' 공수 기록을 지었습니다');
  },
  mgPreset: function (el) {
    if ($('#mg_in')) { $('#mg_in').value = el.getAttribute('data-in'); }
    if ($('#mg_out')) { $('#mg_out').value = el.getAttribute('data-out'); }
    mgPreview();
  },
  myGsSave: function () {
    var p = me();
    if (!p) { return; }
    var d = ($('#mg_date') ? $('#mg_date').value : '') || todayKey();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { toast('날짜를 선택해 주세요.'); return; }
    var iv = $('#mg_in') ? $('#mg_in').value : '';
    var ov = $('#mg_out') ? $('#mg_out').value : '';
    var err = applyAttTime(p, iv, ov, d);
    if (err) { toast(err + '<br>다시 확인해 주세요.'); return; }
    saveAttendance(p, d, '내 근태 저장');
    state.ui.myGsMonth = d.slice(0, 7);
    openMyGsCal();
    var a = p.attendance[d];
    toast(longDate(d) + ' 근태 저장 완료 · <b>' + fmtGs(a ? gongsuOf(a) : 0) + '공수</b>' +
      (d > todayKey() ? '<br>미래 날짜 · 본인 공수표에만 합산됩니다' : ''));
  },
  pfPreset: function (el) {
    if ($('#pf_tin')) { $('#pf_tin').value = el.getAttribute('data-in'); }
    if ($('#pf_tout')) { $('#pf_tout').value = el.getAttribute('data-out'); }
    pfAttPreview();
  },
  saveAttTimes: function (el) {
    var p = personById(el.getAttribute('data-id'));
    if (!p) { return; }
    if (!canManage()) { toast('관리자·팀장만 근태를 수정할 수 있습니다.'); return; }
    var d = ($('#pf_adate') ? $('#pf_adate').value : '') || todayKey();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { toast('날짜를 선택해 주세요.'); return; }
    if (d > todayKey()) { toast('미래 날짜는 공수를 넣을 수 없습니다.<br>오늘까지만 입력할 수 있어요.'); return; }
    var iv = $('#pf_tin') ? $('#pf_tin').value : '';
    var ov = $('#pf_tout') ? $('#pf_tout').value : '';
    var err = applyAttTime(p, iv, ov, d);
    if (err) { toast(err + '<br>다시 확인해 주세요.'); return; }
    saveAttendance(p, d, '출퇴근 시간 수정');
    var sb = $('#sheetBody');
    var keep = sb ? sb.scrollTop : 0;
    p.attendance = p.attendance || {};
    render();
    openPerson(p.id);
    if (sb) { sb.scrollTop = keep; }
    var a = p.attendance[d];
    attSavedToast(a ? fmtGs(gongsuOf(a)) : '0', d, !!leaveOn(p, d));
  },

  /* ----- 작업일보 (기술인) ----- */
  loadPrev: function () {
    var p = me();
    var tid = p ? p.teamId : null;
    var prev = state.reports.filter(function (r) { return r.teamId === tid && r.date < todayKey(); })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0];
    if (!prev) { toast('불러올 이전 작업일보가 없어요.'); return; }
    var d = ensureDraft(tid);
    d.memberIds = state.people.filter(function (q) {
      return (prev.memberNames || []).indexOf(q.name) >= 0;
    }).map(function (q) { return q.id; });
    d.location = prev.location;
    d.timeFrom = prev.timeFrom;
    d.timeTo = prev.timeTo;
    render();
    toast(longDate(prev.date) + ' 명단 ' + d.memberIds.length + '명을 불러왔어요');
  },
  loadPrevReport: function () {
    var p = me();
    var tid = p ? p.teamId : null;
    var pick = function (list) {
      return list.sort(function (a, b) {
        if (a.date !== b.date) { return a.date < b.date ? 1 : -1; }
        return (a.submittedAt || '') < (b.submittedAt || '') ? 1 : -1;
      })[0];
    };
    /* 1순위: 같은 조의 가장 최근 일보 · 2순위: 본인이 쓴 가장 최근 일보 */
    var prev = pick(state.reports.filter(function (r) { return r.teamId === tid && r.date <= todayKey(); }));
    if (!prev && p) {
      prev = pick(state.reports.filter(function (r) { return r.authorName === p.name && r.date <= todayKey(); }));
    }
    if (!prev) { toast('불러올 이전 작업일보가 없습니다.'); return; }
    var d = ensureDraft(tid);
    d.location = prev.location || d.location;
    d.timeFrom = prev.timeFrom || d.timeFrom;
    d.timeTo = prev.timeTo || d.timeTo;
    d.content = prev.content || d.content;
    d.note = prev.note || '';
    if (!d.memberIds.length) {
      d.memberIds = state.people.filter(function (q) {
        return (prev.memberNames || []).indexOf(q.name) >= 0;
      }).map(function (q) { return q.id; });
    }
    render();
    toast(longDate(prev.date) + ' 작업일보를 불러왔어요<br>위치 · 시간 · 작업내용 · 특이사항을 채웠습니다');
  },
  draftAdd: function () { openDraftPicker(); },
  draftToggle: function (el) {
    var id = el.getAttribute('data-id');
    var p = me();
    var d = ensureDraft(p ? p.teamId : null);
    var i = d.memberIds.indexOf(id);
    if (i >= 0) { d.memberIds.splice(i, 1); } else { d.memberIds.push(id); }
    render();
    openDraftPicker();
  },
  draftRemove: function (el) {
    var id = el.getAttribute('data-id');
    var p = me();
    var d = ensureDraft(p ? p.teamId : null);
    var i = d.memberIds.indexOf(id);
    if (i >= 0) { d.memberIds.splice(i, 1); }
    render();
  },
  submitReport: function () {
    var p = me();
    var tid = p.teamId;
    var d = ensureDraft(tid);
    var loc = ($('[data-draft="location"]') ? $('[data-draft="location"]').value : d.location || '').trim();
    if (!loc) { toast('작업위치를 입력해 주세요.'); return; }
    if (!d.memberIds.length) { toast('작업자 명단을 한 명 이상 넣어 주세요.'); return; }
    var noteEl = $('#repNote');
    var noteVal = noteEl ? noteEl.value.trim() : (d.note || '');
    var contentEl = $('[data-draft="content"]');
    var contentVal = contentEl ? contentEl.value : d.content;
    var editingId = d.editingId || null;
    var names = d.memberIds.map(function (id) { var q = personById(id); return q ? q.name : ''; }).filter(Boolean);
    var rep = {
      id: editingId || uuid(), teamId: tid,
      teamName: teamById(tid) ? teamById(tid).name : null,
      date: todayKey(), authorName: p.name, authorRole: '기술인',
      memberIds: d.memberIds.slice(), memberNames: names,
      location: loc, timeFrom: d.timeFrom || '08:00', timeTo: d.timeTo || '17:00',
      content: contentVal, note: noteVal, submittedAt: nowHM()
    };
    if (editingId) {
      patchReport(rep);
      state.reports = state.reports.map(function (r) { return r.id === editingId ? rep : r; });
    } else {
      insertReport(rep);
      var old = findReport(tid, todayKey());
      if (old) { state.reports = state.reports.filter(function (r) { return r.id !== old.id; }); }
      state.reports.push(rep);
    }
    state.ui.reportRewrite = null;
    state.draft = null;
    render();
    toast('작업일보 제출 완료 · ' + rep.submittedAt + '<br>관리자 작업일보함에 등록됐어요');
  },
  reportRewrite: function () {
    var p = me();
    var tid = p ? p.teamId : null;
    var rep = findReport(tid, todayKey());
    if (!rep) { return; }
    state.draft = {
      teamId: tid, memberIds: rep.memberIds.slice(), location: rep.location,
      timeFrom: rep.timeFrom, timeTo: rep.timeTo, content: rep.content,
      note: rep.note || '', editingId: rep.id
    };
    state.ui.reportRewrite = rep.id;
    render();
    toast('수정할 수 있게 열었어요. 고친 뒤 다시 제출해 주세요.');
  },

  /* ----- 관리자 · 토요일 조사 ----- */
  newPoll: function () { if (!isAdminView()) { toast('관리자만 조사를 올릴 수 있습니다.'); return; } openNewPoll(); },
  createPoll: function () {
    if (!isAdminView()) { toast('관리자만 조사를 올릴 수 있습니다.'); return; }
    var title = ($('#pollTitle').value || '').trim();
    var dl = ($('#pollDeadline').value || '').trim();
    if (!title) { toast('공지 제목을 입력해 주세요.'); return; }
    var iso = dl ? (dl.length === 16 ? dl + ':00+09:00' : dl) : null;
    var poll = {
      id: uuid(), title: title, satKey: nextSaturday(), deadline: iso || '',
      open: true, createdAt: todayKey(), votes: {}
    };
    state.polls.unshift(poll);
    closeSheet();
    render();
    insertPollDb(poll);
    toast('토요일 출근 여부 공지를 올렸어요<br>기술인 화면에 예 / 아니오 버튼이 생겼습니다');
  },
  closePoll: function (el) {
    var id = el.getAttribute('data-id');
    var poll = state.polls.filter(function (p) { return p.id === id; })[0];
    if (poll) { poll.open = false; }
    closePollDb(id);
    render();
    toast('응답을 마감했어요');
  },
  pollDetail: function (el) { openPollDetail(el.getAttribute('data-id')); },
  pollAdmin: function (el) { openPollAdmin(el.getAttribute('data-id')); },
  pollSetVote: function (el) {
    if (!canManage()) { toast('관리자·팀장만 바꿀 수 있습니다.'); return; }
    var id = el.getAttribute('data-id'), wid = el.getAttribute('data-wid'), v = el.getAttribute('data-v');
    var poll = state.polls.filter(function (x) { return x.id === id; })[0];
    if (!poll || !wid || (v !== 'yes' && v !== 'no')) { return; }
    poll.votes[wid] = v;
    saveVote(poll.id, wid, v);
    var sb = $('#sheetBody');
    var keep = sb ? sb.scrollTop : 0;
    render();
    openPollAdmin(poll.id);
    var sb2 = $('#sheetBody');
    if (sb2) { sb2.scrollTop = keep; }
    var wp = personById(wid);
    toast((wp ? esc(wp.name) : '인원') + ' · <b>' + (v === 'yes' ? '출근' : '미출근') + '</b>으로 바꿨어요');
  },

  /* ----- 현장 자료 PDF / 공지 ----- */
  openPdf: function (el) { openPdf(el.getAttribute('data-id')); },
  pdfPreviewToggle: function (el) {
    pdfPreviewOpen = !pdfPreviewOpen;
    openPdf(el.getAttribute('data-id'), true);
  },
  delPdf: function (el) {
    var id = el.getAttribute('data-id');
    var f = pdfById(id);
    confirmSheet('PDF를 삭제할까요?',
      '<b>' + esc(f ? f.name : 'PDF') + '</b><br>삭제하면 기술인 화면에서도 바로 사라집니다.',
      '삭제', 'doDelPdf', 'data-id="' + id + '"');
  },
  doDelPdf: function (el) {
    var id = el.getAttribute('data-id');
    var f = pdfById(id);
    ['risk', 'spec'].forEach(function (c) {
      state.docs[c] = (state.docs[c] || []).filter(function (x) { return x.id !== id; });
    });
    deleteDocument(id);
    if (f && f.path) { storageRemove(f.path); }
    closeSheet();
    render();
    toast('PDF를 삭제했어요');
  },
  openNotice: function (el) { openNoticeDetail(el.getAttribute('data-id')); },
  openNoticeList: function () { openNoticeList(); },
  noticeNew: function () { if (!isAdminView()) { toast('관리자만 공지를 올릴 수 있습니다.'); return; } openAddNotice(); },
  createNotice: function () {
    if (!isAdminView()) { toast('관리자만 공지를 올릴 수 있습니다.'); return; }
    var t = ($('#nv_title').value || '').trim();
    var b = ($('#nv_body').value || '').trim();
    if (!t) { toast('공지 제목을 입력해 주세요.'); return; }
    var n = { id: uuid(), title: t, body: b, date: todayKey(), pinned: $('#nv_pin').checked, author: (me() ? me().name : '관리자') };
    state.notices.unshift(n);
    closeSheet();
    render();
    insertNotice(n);
    toast('공지 등록 완료<br>기술인 홈 <b>맨 위</b>에 바로 표시됩니다');
  },

  /* ----- 일정 달력 ----- */
  openSchedCal: function () {
    if (!state.ui.schedMonth) { state.ui.schedMonth = todayKey().slice(0, 7); }
    if (!state.ui.schedDate) { state.ui.schedDate = todayKey(); }
    openSchedSheet();
  },
  schedPrev: function () { schedShiftMonth(-1); },
  schedNext: function () { schedShiftMonth(1); },
  schedPick: function (el) {
    var d = el.getAttribute('data-d');
    if (!d) { return; }
    state.ui.schedDate = d;
    state.ui.schedMonth = d.slice(0, 7);
    if (state.ui.schedSheet) { openSchedSheet(); return; }
    render();
  },
  schedNew: function () {
    if (!canManage()) { toast('관리자·팀장만 일정을 등록할 수 있습니다.'); return; }
    state.ui.schedBackToCal = !!state.ui.schedSheet;
    openScheduleSheet(null);
  },
  schedEdit: function (el) {
    if (!canManage()) { toast('관리자·팀장만 일정을 수정할 수 있습니다.'); return; }
    state.ui.schedBackToCal = !!state.ui.schedSheet;
    openScheduleSheet(el.getAttribute('data-id'));
  },
  schedAskDel: function (el) {
    if (!canManage()) { toast('관리자·팀장만 일정을 삭제할 수 있습니다.'); return; }
    var s = schedById(el.getAttribute('data-id'));
    if (!s) { return; }
    state.ui.schedBackToCal = !!state.ui.schedSheet;
    confirmSheet('일정을 삭제할까요?',
      '<b>' + esc(s.title) + '</b><br>' + longDate(s.date) + (s.time ? ' · ' + esc(s.time) : '') +
      '<br>삭제하면 기술인·관리자 홈 달력에서도 바로 사라집니다.',
      '삭제', 'schedDoDel', 'data-id="' + esc(s.id) + '"');
  },
  schedDoDel: function (el) {
    if (!isAdminView()) { return; }
    var id = el.getAttribute('data-id');
    var backCal = !!state.ui.schedBackToCal;
    state.schedules = (state.schedules || []).filter(function (x) { return x.id !== id; });
    deleteScheduleDb(id);
    closeSheet();
    render();
    if (backCal) { openSchedSheet(); }
    toast('일정을 삭제했어요');
  },
  schedSave: function (el) {
    if (!canManage()) { toast('관리자·팀장만 일정을 저장할 수 있습니다.'); return; }
    var id = el.getAttribute('data-id') || '';
    var date = ($('#sc_date').value || '').trim();
    var title = ($('#sc_title').value || '').trim();
    var time = ($('#sc_time').value || '').trim();
    var memo = ($('#sc_memo').value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('날짜를 선택해 주세요.'); return; }
    if (!title) { toast('일정 제목을 입력해 주세요.'); return; }
    if (id) {
      var s = schedById(id);
      if (!s) { closeSheet(); render(); return; }
      s.date = date; s.title = title; s.time = time; s.memo = memo;
      patchScheduleDb(s);
      toast('일정을 수정했어요');
    } else {
      var ns = { id: uuid(), date: date, title: title, time: time, memo: memo, by: (me() ? me().name : '관리자'), at: nowHM() };
      state.schedules.push(ns);
      insertScheduleDb(ns);
      toast('일정을 등록했어요 · ' + shortDate(date) + ' (' + wd(date) + ')');
    }
    state.ui.schedMonth = date.slice(0, 7);
    state.ui.schedDate = date;
    var backCal = !!state.ui.schedBackToCal;
    closeSheet();
    render();
    if (backCal) { openSchedSheet(); }
  }
};

/* =========================================================
   이벤트 · 시작
   ========================================================= */
function onClick(e) {
  /* 인원 선택 체크박스는 상세 열기(data-act)로 번지지 않게 먼저 처리 */
  var tgt = e.target;
  if (tgt && tgt.matches && tgt.matches('input.bulk-chk')) {
    var cid = tgt.getAttribute('data-id');
    if (tgt.checked) { bulkSel[cid] = 1; } else { delete bulkSel[cid]; }
    syncBulkUI();
    return;
  }
  var el = e.target.closest ? e.target.closest('[data-act]') : null;
  if (!el) { return; }
  var act = el.getAttribute('data-act');
  if (act === 'closeSheet' && el.classList.contains('sheet-bg')) { closeSheet(); return; }
  var fn = ACTIONS[act];
  if (!fn) { return; }
  e.preventDefault();
  try {
    var r = fn(el, e);
    if (r && r.catch) { r.catch(function (err) { toast('처리하지 못했어요 · ' + esc(err && err.message || err)); }); }
  } catch (err) {
    toast('처리하지 못했어요 · ' + esc(err && err.message || err));
  }
}

function onInput(e) {
  var el = e.target;
  if (el.hasAttribute && el.hasAttribute('data-draft') && state.draft) {
    state.draft[el.getAttribute('data-draft')] = el.value;
  }
  if (el.hasAttribute && el.hasAttribute('data-search')) {
    var key = el.getAttribute('data-search');
    state.ui['q_' + key] = el.value;
    var clr = document.querySelector('[data-act="searchClear"][data-search="' + key + '"]');
    if (clr) { clr.classList.toggle('hide', !el.value); }
    applyNameFilters();
    return;
  }
  if (el.id === 'pf_tin' || el.id === 'pf_tout') { pfAttPreview(); }
  if (el.id === 'mg_in' || el.id === 'mg_out') { mgPreview(); }
}

function onChange(e) {
  var el = e.target;
  if (el.id === 'li_privacy') {
    state.ui.privacyChecked = !!el.checked;
  }
  if (el.id === 'li_sensitive') {
    state.ui.sensitiveChecked = !!el.checked;
  }
  if (el.id === 'li_job') {
    toggleLoginPass(el.value === LOGIN_ADMIN_LABEL);
  }
  if (el.id === 'patt_date' || el.id === 'patt_in' || el.id === 'patt_out') {
    pattPreview();
  }
  if (el.classList && el.classList.contains('bulk-chk')) {
    var bid = el.getAttribute('data-id');
    if (el.checked) { bulkSel[bid] = 1; } else { delete bulkSel[bid]; }
    syncBulkUI();
  }
  if (el.id === 'bulkDate') { state.ui.bulkDate = el.value || todayKey(); }
  if (el.id === 'bulkGsSel') {
    var cust = $('#bulkCustom');
    if (cust) { cust.classList.toggle('hide', el.value !== 'custom'); }
    if (el.value === 'custom') { bulkPreview(); }
  }
  if (el.id === 'bulk_in' || el.id === 'bulk_out') { bulkPreview(); }
  if (el.id === 'mg_date') {
    var mp = me();
    var md = el.value || todayKey();
    var ma = mp ? (mp.attendance || {})[md] : null;
    if ($('#mg_in')) { $('#mg_in').value = ma && ma.in ? ma.in : ''; }
    if ($('#mg_out')) { $('#mg_out').value = ma && ma.out ? ma.out : ''; }
    mgPreview();
  }
  if (el.id === 'pf_adate') {
    var pp = personById(state.ui.personOpen || '');
    var dd = el.value || todayKey();
    var aa = pp ? (pp.attendance || {})[dd] : null;
    if ($('#pf_tin')) { $('#pf_tin').value = aa && aa.in ? aa.in : ''; }
    if ($('#pf_tout')) { $('#pf_tout').value = aa && aa.out ? aa.out : ''; }
    pfAttPreview();
  }
  if (el.id === 'resignReason') {
    var wrap = $('#resignEtcWrap');
    if (wrap) {
      if (el.value === '개인사유(직접입력)') { wrap.classList.remove('hide'); }
      else { wrap.classList.add('hide'); }
    }
  }
  if (el.classList && el.classList.contains('pdf-in')) {
    handlePdfUpload(el);
  }
}

function onKey(e) {
  if (e.key !== 'Enter') { return; }
  var id = e.target && e.target.id;
  if (id && /^li_(name|birth|phone)$/.test(id)) {
    e.preventDefault();
    ACTIONS.loginSubmit();
  }
}

window.pcwSyncChanged = function () { renderSync(); };
window.pcwSyncError = function (msg) {
  state.sync.err = msg;
  if (state.sync.phase === 'ok') { state.sync.phase = 'err'; }
  renderSync();
};
window.pcwAfterFlush = function () { refresh(true); };

async function boot() {
  var s = sessionRead();
  if (s) { state.auth = { personId: s.personId }; }
  state.ready = false;
  render();
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', onKey);
  setInterval(function () {
    var el = document.getElementById('liveClock');
    if (el) { el.textContent = nowHM(); }
  }, 20000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { refresh(true); }
  });

  var ok = await loadData({ silent: false });
  if (state.auth && !personById(state.auth.personId)) {
    sessionClear();
    state.auth = null;
    render();
    if (ok) { toast('등록된 정보를 찾지 못해 다시 로그인해야 해요.'); }
  }
  /* 관리자로 로그인했던 휴대폰은 다시 열어도 관리자 화면으로 시작 */
  var sess = sessionRead();
  if (state.auth && sess && sess.role === 'admin' && canAdmin() && state.role !== 'admin') {
    state.role = 'admin';
    state.ui.timeEdit = false;
    render();
  } else if (state.auth && sess && sess.role === 'manager' && canManage() && state.role === 'worker') {
    /* 관리자 계정이 팀장 화면으로 두고 나갔던 경우도 그대로 복원 */
    state.role = 'manager';
    state.ui.timeEdit = false;
    render();
  }
  startAutoRefresh();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* 오프라인 캐시는 없어도 동작 */ });
  }
}

boot();
