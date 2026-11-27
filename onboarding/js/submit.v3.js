/* =========================================================
   신규입사자 서류 제출 — 입력 · 파일 변환 · 업로드 · 저장
   ========================================================= */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var state = {
    files: {},        // key -> { file, blob, ext, mime, name }
    health: [],       // 건강검진 PDF 목록 (여러 개)
    hseq: 0,
    certs: [],
    busy: false,
    submitted: false,
    id: null,
    uploaded: {}      // 저장 키 -> true (재시도 시 재업로드 방지)
  };

  /* ---------------- 공통 ---------------- */
  function toast(msg, ms) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, ms || 2600);
  }

  function openModal(id) { var m = document.getElementById(id); if (m) { m.classList.add('open'); document.body.style.overflow = 'hidden'; } }
  function closeModal(id) {
    var m = document.getElementById(id);
    if (m) { m.classList.remove('open'); }
    if (!$('.modal.open')) { document.body.style.overflow = ''; }
  }
  $$('.modal').forEach(function (m) {
    m.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]') || e.target.classList.contains('bg')) { closeModal(m.id); }
    });
  });

  function digitsOnly(s, max) {
    var v = String(s || '').replace(/\D/g, '');
    return max ? v.slice(0, max) : v;
  }

  function fmtRRN(v) {
    var d = digitsOnly(v, 13);
    if (d.length <= 6) { return d; }
    return d.slice(0, 6) + '-' + d.slice(6);
  }

  function fmtPhone(v) {
    var d = digitsOnly(v, 11);
    if (d.length < 4) { return d; }
    if (d.length < 8) { return d.slice(0, 3) + '-' + d.slice(3); }
    return d.slice(0, 3) + '-' + d.slice(3, d.length - 4) + '-' + d.slice(d.length - 4);
  }

  function fmtWon(v) {
    var d = digitsOnly(v, 9);
    return d;
  }

  function safeName(s) {
    return String(s || '').replace(/[\\/:*?"<>|\r\n\t]/g, '').replace(/\s+/g, ' ').trim();
  }

  /* 화면 표시용 파일명 줄이기 (저장·다운로드 이름은 그대로) */
  function shortFile(n) {
    var v = String(n || '');
    return v.length > 24 ? v.slice(0, 22) + '…' : v;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) { return crypto.randomUUID(); }
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  /* ---------------- 입력 자동 서식 ---------------- */
  var rrn = $('#rrn'), phone = $('#phone'), account = $('#account_number'), shoe = $('#shoe_size');
  rrn.addEventListener('input', function () { this.value = fmtRRN(this.value); updateProgress(); });
  phone.addEventListener('input', function () { this.value = fmtPhone(this.value); updateProgress(); });
  account.addEventListener('input', function () { this.value = String(this.value).replace(/[^\d-]/g, '').slice(0, 20); });
  shoe.addEventListener('input', function () { this.value = digitsOnly(this.value, 3); });

  $$('input[type=text], input[type=email], input[type=date], select, textarea').forEach(function (el) {
    el.addEventListener('input', updateProgress);
    el.addEventListener('change', updateProgress);
  });
  $$('input[type=radio], input[type=checkbox]').forEach(function (el) {
    el.addEventListener('change', updateProgress);
  });

  /* 입금자명(예금주) — '본인 명의' 체크 시 성명을 실시간 동기화 */
  var nameField = $('#name'), holderField = $('#account_holder'), holderSelf = $('#holder_self');
  function holderIsSelf() { return !!(holderSelf && holderSelf.checked); }
  function syncHolder() {
    if (!holderField) { return; }
    var on = holderIsSelf();
    holderField.readOnly = on;
    holderField.classList.toggle('sync', on);
    if (on) { holderField.value = String((nameField && nameField.value) || '').replace(/\s+/g, ' ').trim(); }
  }
  if (holderSelf) {
    holderSelf.addEventListener('change', function () {
      syncHolder();
      if (!holderIsSelf() && holderField) { holderField.focus(); }
      updateProgress();
    });
  }
  if (nameField) { nameField.addEventListener('input', syncHolder); }

  /* 직종 — 용접공 여부만 */
  function jobRole() {
    var w = $('#is_welder');
    return (w && w.checked) ? '용접공' : '';
  }
  function careerHint() {
    // 카드에는 짧은 이름만 보여 준다. (용접공) 변환 이름은 저장·다운로드 때만 쓴다.
    var el = $('#careerName');
    if (el) { el.textContent = '경력증명서'; }
  }
  var welderBox = $('#is_welder');
  if (welderBox) {
    welderBox.addEventListener('change', function () { careerHint(); updateProgress(); });
  }

  /* 자격 직접 추가 */
  $('#certAdd').addEventListener('click', function () {
    var inp = $('#certEtc');
    var v = safeName(inp.value);
    if (!v) { return; }
    if (state.certs.indexOf(v) >= 0) { toast('이미 추가된 자격입니다.'); inp.value = ''; return; }
    if (state.certs.length >= 8) { toast('자격은 8개까지 추가할 수 있어요.'); return; }
    state.certs.push(v);
    var label = document.createElement('label');
    label.innerHTML = '<input type="checkbox" checked value=""><span></span>';
    label.querySelector('input').value = v;
    label.querySelector('span').textContent = v;
    label.querySelector('input').addEventListener('change', function () { updateProgress(); });
    label._custom = true;
    $('#certChips').appendChild(label);
    inp.value = '';
    updateProgress();
  });
  $('#certEtc').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); $('#certAdd').click(); }
  });

  /* ---------------- 동의 전문 ---------------- */
  var DOCS = {
    privacy: {
      title: '[필수] 개인정보 수집·이용 동의',
      html: ''
        + '<h4>1. 수집하는 개인정보 항목</h4>'
        + '<p>- 성명, 주민등록번호, 주소, 휴대폰 기종 및 번호, 본인 명의 휴대폰 여부<br>'
        + '- 은행명, 계좌번호, 용접공 여부, 단가(일당), 총 경력, 반도체 경력, 이메일, 혈액형<br>'
        + '- 조끼 사이즈, 안전화 사이즈, 보안경 종류, 보유 자격<br>'
        + '- 제출 서류: 신분증 사본, 기초안전보건교육 이수증, 통장사본, 증명사진, 건강검진 결과지, 소견서(해당자), 경력증명서</p>'
        + '<h4>2. 개인정보의 수집·이용 목적</h4>'
        + '<p>- 채용 및 입사 절차 진행, 본인 확인<br>'
        + '- 근로계약 체결·인사관리, 급여 지급 및 4대보험 신고 등 법령상 의무 이행<br>'
        + '- 현장 출입·안전 배치, 작업복·안전화 등 지급품 준비</p>'
        + '<h4>3. 보유 및 이용 기간</h4>'
        + '<p>- <b>입사 시부터 퇴사 전까지</b> 보관합니다.<br>'
        + '- <b>입사가 취소되면 지체 없이 즉시 파기(영구 삭제)</b>합니다. 수집 목적을 달성한 경우에도 같은 방법으로 파기합니다.</p>'
        + '<h4>4. 동의를 거부할 권리</h4>'
        + '<p>동의를 거부할 수 있으나, 위 항목은 채용·입사 절차에 반드시 필요한 정보이므로 동의하지 않으시면 입사 절차 진행이 어렵습니다.</p>'
        + '<h4>5. 개인정보 보호를 위한 조치</h4>'
        + '<p>제출 서류와 정보는 담당자만 열람할 수 있는 비공개 저장소에 보관하며, 지정된 관리자 외에는 조회·다운로드할 수 없습니다.</p>'
    },
    unique: {
      title: '[필수] 고유식별정보(주민등록번호) 처리 동의',
      html: ''
        + '<h4>1. 처리하는 고유식별정보</h4>'
        + '<p>- 주민등록번호 (전체 13자리)</p>'
        + '<h4>2. 처리 목적</h4>'
        + '<p>- 본인 확인 및 중복 확인<br>'
        + '- 근로계약 체결, 4대보험 가입 신고, 급여 지급 및 원천징수 등 법령상 의무 이행</p>'
        + '<h4>3. 처리 근거 및 보유 기간</h4>'
        + '<p>- 「개인정보 보호법」 제24조(고유식별정보의 처리 제한)에 따라 별도 동의를 받습니다.<br>'
        + '- 보유 기간: <b>입사 시부터 퇴사 전까지</b>. <b>입사 취소 시 즉시 영구 파기</b>합니다.</p>'
        + '<h4>4. 동의를 거부할 권리</h4>'
        + '<p>동의를 거부할 수 있으나, 주민등록번호가 없으면 근로계약·4대보험 신고 등 법령상 업무를 진행할 수 없어 입사가 어렵습니다.</p>'
    },
    sensitive: {
      title: '[필수] 민감정보(건강검진·혈액형·소견서) 처리 동의',
      html: ''
        + '<h4>1. 처리하는 민감정보</h4>'
        + '<p>- 건강검진 결과지(일반·배치전·특수), 소견서(해당자), 혈액형</p>'
        + '<h4>2. 처리 목적</h4>'
        + '<p>- 현장 업무에 적합한 안전 배치 및 건강 상태 확인<br>'
        + '- 산업안전보건법상 배치전 건강진단 등 법령상 의무 이행<br>'
        + '- 작업복·안전화 등 지급품 준비</p>'
        + '<h4>3. 처리 근거 및 보유 기간</h4>'
        + '<p>- 「개인정보 보호법」 제23조(민감정보의 처리 제한)에 따라 별도 동의를 받습니다.<br>'
        + '- 보유 기간: <b>입사 시부터 퇴사 전까지</b>. <b>입사 취소 시 즉시 영구 파기</b>합니다.</p>'
        + '<h4>4. 동의를 거부할 권리</h4>'
        + '<p>동의를 거부할 수 있으나, 건강검진 결과는 현장 안전 배치를 위해 반드시 필요한 서류입니다. 동의하지 않으시면 입사 절차 진행이 어렵습니다.</p>'
    }
  };

  $$('[data-doc]').forEach(function (b) {
    b.addEventListener('click', function () {
      var d = DOCS[b.getAttribute('data-doc')];
      if (!d) { return; }
      $('#docTitle').textContent = d.title;
      $('#docBody').innerHTML = d.html;
      openModal('docModal');
    });
  });

  $$('[data-guide]').forEach(function (b) {
    b.addEventListener('click', function () { openModal('guideModal'); });
  });

  /* 동의 전체 선택 */
  var agreeAll = $('#agreeAll');
  var agrees = $$('.agree');
  agreeAll.addEventListener('change', function () {
    agrees.forEach(function (a) { a.checked = agreeAll.checked; });
    updateProgress();
  });
  agrees.forEach(function (a) {
    a.addEventListener('change', function () {
      agreeAll.checked = agrees.every(function (x) { return x.checked; });
      updateProgress();
    });
  });

  /* ---------------- 파일 선택 ---------------- */
  var ALLOWED_IMG = /^image\//;
  var PDF = /\.pdf$/i;

  function setFileRow(key, file, extra) {
    var row = $('[data-file="' + key + '"]');
    if (!row) { return; }
    var nameEl = row.querySelector('[data-name]');
    var thumb = row.querySelector('[data-thumb]');
    row.classList.add('done');
    // 기술인 화면에는 원본 파일명만(길면 줄임) — 변환된 저장 이름은 보여 주지 않는다
    var orig = String((file && file.name) || '');
    if (orig.length > 24) { orig = orig.slice(0, 22) + '…'; }
    nameEl.textContent = orig ? '첨부 완료 ✓ ' + orig : '첨부 완료 ✓';
    var pick = row.querySelector('[data-pick]');
    if (pick) { pick.textContent = '변경'; }
    if (thumb) {
      var icon = thumb.getAttribute('data-icon') || thumb.textContent;
      thumb.setAttribute('data-icon', icon);
      if (ALLOWED_IMG.test(file.type)) {
        var u = URL.createObjectURL(file);
        thumb.innerHTML = '<img src="' + u + '" alt="">';
      } else {
        thumb.textContent = '📄';
      }
    }
  }

  function clearFileRow(key) {
    var row = $('[data-file="' + key + '"]');
    if (!row) { return; }
    row.classList.remove('done');
    var thumb = row.querySelector('[data-thumb]');
    var icon = thumb.getAttribute('data-icon');
    if (icon) { thumb.textContent = icon; }
    row.querySelector('[data-name]').textContent = row.querySelector('[data-name]').getAttribute('data-default') || '선택 안 됨';
    var pick = row.querySelector('[data-pick]');
    if (pick) { pick.textContent = '선택'; }
  }

  $$('[data-default]').forEach(function (el) { el.setAttribute('data-default', el.textContent); });

  /* 사진 → JPG (Canvas) */
  function imageToJpeg(file, maxSide, quality) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth, h = img.naturalHeight;
          var scale = Math.min(1, (maxSide || 1400) / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
          var cv = document.createElement('canvas');
          cv.width = cw; cv.height = ch;
          var ctx = cv.getContext('2d');
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
          cv.toBlob(function (blob) {
            URL.revokeObjectURL(url);
            if (!blob) { reject(new Error('사진을 JPG로 바꾸지 못했어요.')); return; }
            resolve(blob);
          }, 'image/jpeg', quality || 0.92);
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('사진을 읽지 못했어요. 다른 사진으로 다시 시도해 주세요.')); };
      img.src = url;
    });
  }

  function extOf(file) {
    var m = /\.([a-z0-9]+)$/i.exec(file.name || '');
    if (m) { return m[1].toLowerCase(); }
    if (/^image\/jpeg/.test(file.type)) { return 'jpg'; }
    if (/^image\/png/.test(file.type)) { return 'png'; }
    if (/^image\/heic/.test(file.type)) { return 'heic'; }
    if (file.type === 'application/pdf') { return 'pdf'; }
    return 'jpg';
  }

  function isPdf(file) {
    return file.type === 'application/pdf' || PDF.test(file.name || '');
  }

  function checkSize(file) {
    if (file.size > CFG.maxFileMB * 1048576) {
      alert('파일 용량이 너무 큽니다.\n한 파일은 ' + CFG.maxFileMB + 'MB까지 올릴 수 있어요.\n(' + file.name + ' · ' + (file.size / 1048576).toFixed(1) + 'MB)');
      return false;
    }
    return true;
  }

  $$('[data-file]').forEach(function (row) {
    var key = row.getAttribute('data-file');
    var input = row.querySelector('input[type=file]');
    var pick = row.querySelector('[data-pick]');
    pick.addEventListener('click', function () { input.click(); });

    input.addEventListener('change', async function () {
      var file = input.files && input.files[0];
      if (!file) { return; }
      input.value = '';

      if (key === 'photo') {
        if (!ALLOWED_IMG.test(file.type)) { alert('증명사진은 사진 파일만 올릴 수 있어요.'); return; }
        if (!checkSize(file)) { return; }
        try {
          var blob = await imageToJpeg(file, 1400, 0.92);
          state.files[key] = { file: file, blob: blob, ext: 'jpg', mime: 'image/jpeg', converted: 'jpg' };
          setFileRow(key, file);
          updateProgress();
        } catch (e) { alert(e.message || '사진 변환에 실패했어요.'); }
        return;
      }

      if (key === 'opinion' || key === 'career') {
        if (!isPdf(file)) {
          var label = key === 'career' ? '경력증명서' : '소견서';
          alert(label + '는 PDF 파일만 올릴 수 있어요.\n사진·캡처 파일은 접수되지 않습니다.');
          return;
        }
        if (!checkSize(file)) { return; }
        state.files[key] = { file: file, blob: file, ext: 'pdf', mime: 'application/pdf' };
        setFileRow(key, file);
        updateProgress();
        return;
      }

      // 신분증 / 이수증 / 통장사본 — 사진 또는 PDF
      if (!ALLOWED_IMG.test(file.type) && !isPdf(file)) {
        alert('사진 또는 PDF 파일만 올릴 수 있어요.');
        return;
      }
      if (!checkSize(file)) { return; }
      var ext = extOf(file);
      if (ext === 'heic' || ext === 'heif') {
        try {
          var jpg = await imageToJpeg(file, 2000, 0.95);
          state.files[key] = { file: file, blob: jpg, ext: 'jpg', mime: 'image/jpeg', converted: 'jpg' };
          setFileRow(key, file);
          updateProgress();
        } catch (e) { alert('아이폰 사진(HEIC)을 변환하지 못했어요. 사진첩에서 JPG로 저장한 뒤 올려 주세요.'); }
        return;
      }
      state.files[key] = { file: file, blob: file, ext: ext, mime: file.type || (isPdf(file) ? 'application/pdf' : 'image/jpeg') };
      setFileRow(key, file);
      updateProgress();
    });
  });

  /* ---------------- 건강검진 PDF (여러 개 · 자동 인식) ---------------- */
  var healthInput = $('#healthInput');
  var healthList = $('#healthList');
  var HEALTH_TYPES = ['일반', '배치전', '특수'];

  function findByUid(uid) {
    for (var i = 0; i < state.health.length; i++) { if (state.health[i].uid === uid) { return state.health[i]; } }
    return null;
  }

  /* 검진일 유효기간 — 오늘 기준 1년 전 같은 날짜까지 유효 */
  function ymdLocal(d) {
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function oneYearAgo() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setFullYear(d.getFullYear() - 1);
    return ymdLocal(d);
  }
  function expired(h) { return !!(h && h.date && h.date < oneYearAgo()); }
  function d2needed() {
    return state.health.some(function (h) { return !!h.d2; });
  }
  /* 'D2 판정이신가요?' 체크 여부 — 소견서 필수·업로드 칸을 이 값으로 결정 */
  function d2declared() {
    var el = $('#d2Declare');
    return !!(el && el.checked);
  }
  function d2required() {
    return d2needed() || d2declared();
  }

  function updateD2(announce) {
    var auto = d2needed();
    var decl = d2declared();
    var need = auto || decl;
    var box = $('#d2Box');
    var fields = $('#d2Fields');
    var fo = $('#field-opinion');
    var fm = $('#field-medicine');
    var req = $('#opinionReq');
    var opt = $('#opinionOpt');
    var hint = $('#d2AskHint');
    var hasOpinion = !!state.files.opinion;

    // 업로드 칸은 'D2 판정이신가요?' 체크(또는 PDF 자동 감지로 켜진 체크)일 때만 펼친다
    if (fields) { fields.classList.toggle('hide', !decl); }
    if (fo) { fo.classList.toggle('d2need', need && !hasOpinion); }
    if (fm) { fm.classList.toggle('d2need', need && decl); }
    // PDF에서 D2가 감지된 경우엔 체크를 풀어도 소견서는 계속 필수
    if (req) { req.classList.toggle('hide', !need); }
    if (opt) { opt.textContent = need ? 'D2 판정 — 필수' : 'D2 판정을 받은 경우 필수'; }
    if (hint) {
      hint.innerHTML = auto
        ? '검진 결과지(PDF)에서 <b>D2 판정</b>이 확인되어 자동으로 체크했습니다. 소견서는 필수입니다.'
        : (decl
          ? '소견서(<b>필수</b>) · 약봉투(선택) 올리는 칸이 열렸습니다.'
          : 'D2 판정을 받으셨다면 체크해 주세요. 소견서(필수) · 약봉투(선택) 올리는 칸이 열립니다.');
    }
    if (!box) { return; }
    if (!auto) { box.classList.add('hide'); return; }

    box.classList.remove('hide');
    var b = box.querySelector('b');
    var p = box.querySelector('p');
    if (!decl) {
      if (b) { b.textContent = '⚠️ 검진 결과지에서 D2 판정이 확인되었습니다'; }
      if (p) { p.textContent = '소견서는 필수입니다. 아래 버튼을 누르면 올리는 칸이 열립니다.'; }
    } else if (hasOpinion) {
      if (b) { b.textContent = '✅ 소견서가 첨부되었습니다'; }
      if (p) { p.textContent = '복용 중인 약봉투 사진이 있으면 함께 올려 주세요. 없으면 넘어가셔도 됩니다.'; }
    } else {
      if (b) { b.textContent = '⚠️ D2 판정이 확인되었습니다'; }
      if (p) { p.textContent = '소견서(필수)와 복용 중인 약봉투 사진(없으면 패스)을 첨부해 주세요!'; }
    }
    if (announce) {
      toast('D2 판정입니다 — 소견서(필수)와 약봉투 사진을 첨부해 주세요.', 4600);
      try { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { /* 무시 */ }
    }
  }

  function healthOptions(cur) {
    var out = '<option value=""' + (cur ? '' : ' selected') + '>선택</option>';
    HEALTH_TYPES.forEach(function (t) {
      out += '<option value="' + t + '"' + (cur === t ? ' selected' : '') + '>' + t + '</option>';
    });
    return out;
  }

  function renderHealth() {
    if (!healthList) { return; }

    if (!state.health.length) {
      healthList.innerHTML = '<div class="hfile busy" style="text-align:center;color:#98A2B3;font-size:12.5px;padding:16px 12px">아직 올린 검진 파일이 없습니다.</div>';
      return;
    }

    healthList.innerHTML = state.health.map(function (h) {
      var ok = !!(h.date && h.type);
      var bad = expired(h);
      var cls = 'hfile' + (h.state === 'reading' ? ' busy' : (bad ? ' bad' : (ok ? '' : ' warn')));
      var stat;
      if (h.state === 'reading') {
        stat = '⏳ PDF에서 검진일자·종류를 읽는 중…';
      } else if (bad) {
        stat = '❌ 검진일로부터 1년이 지난 서류는 사용할 수 없습니다. 최근 1년 이내 검진 결과지(PDF)를 올려 주세요.';
      } else if (ok) {
        stat = '✅ ' + (h.auto ? '자동 인식' : '직접 입력') + ' · 검진일 ' + esc(h.date) + ' · ' + esc(h.type) + (h.d2 ? ' · <b style="color:#B42318">D2 판정</b>' : '');
      } else if (h.state === 'error') {
        stat = '⚠️ PDF를 읽지 못했어요. 검진일자와 종류를 골라 주세요.';
      } else {
        stat = '⚠️ PDF 글자가 없어 자동 인식을 못 했어요(스캔본 등). 검진일자와 종류를 골라 주세요.';
      }
      var showEdit = h.state !== 'reading' && (!ok || h.edit || bad);

      var html = ''
        + '<div class="' + cls + '" data-huid="' + esc(h.uid) + '">'
        + '<div class="hrow">'
        + '<div class="thumb">🏥</div>'
        + '<div class="meta"><b>' + esc(shortFile(h.file.name)) + '</b>'
        + '<small>첨부 완료 ✓ · ' + (h.blob.size / 1048576).toFixed(1) + 'MB</small></div>'
        + '<button type="button" class="hdel" data-hdel="' + esc(h.uid) + '" aria-label="삭제">✕</button>'
        + '</div>'
        + '<div class="hstat">' + stat + '</div>';

      if (showEdit) {
        html += '<div class="hedit"><div class="grid2">'
          + '<div class="field"><label>검진일자</label><input type="date" data-hdate="' + esc(h.uid) + '" value="' + esc(h.date) + '"></div>'
          + '<div class="field"><label>검진 종류</label><select data-htype="' + esc(h.uid) + '">' + healthOptions(h.type) + '</select></div>'
          + '</div></div>';
      }
      if (h.state !== 'reading' && ok && !h.edit) {
        html += '<span class="hfix" data-hfix="' + esc(h.uid) + '">직접 수정</span>';
      }
      return html + '</div>';
    }).join('');
  }

  async function readHealth(h) {
    try {
      var text = await ExamPDF.extractText(h.file, 2);
      var r = ExamPDF.parseExam(text, h.file.name);
      h.date = r.date || '';
      h.type = r.type || '';
      h.d2 = !!r.d2;
      h.auto = !!(r.date || r.type);
      h.state = (r.chars > 0) ? 'done' : 'notext';
    } catch (e) {
      h.state = 'error';
    }
    renderHealth();
    updateProgress();
  }

  async function addHealthFiles(files) {
    var arr = Array.prototype.slice.call(files || []);
    if (!arr.length) { return; }
    var accepted = [];
    for (var i = 0; i < arr.length; i++) {
      var f = arr[i];
      if (state.health.length + accepted.length >= 10) {
        toast('검진 파일은 10개까지 올릴 수 있어요.');
        break;
      }
      if (!isPdf(f)) {
        if (ALLOWED_IMG.test(f.type)) {
          alert('건강검진은 사진이 아니라 PDF 파일만 올릴 수 있어요.\n\n카카오톡에서 검진 결과 PDF를 찾는 방법을 안내해 드릴게요.');
          openModal('guideModal');
        } else {
          alert('건강검진 결과지는 PDF 파일만 올릴 수 있어요.');
        }
        continue;
      }
      if (!checkSize(f)) { continue; }
      accepted.push(f);
    }
    if (!accepted.length) { return; }

    var made = accepted.map(function (f) {
      state.hseq += 1;
      return { uid: 'h' + state.hseq, file: f, blob: f, ext: 'pdf', mime: 'application/pdf', date: '', type: '', d2: false, state: 'reading', edit: false, auto: false };
    });
    state.health = state.health.concat(made);
    renderHealth();
    updateProgress();

    for (var k = 0; k < made.length; k++) { await readHealth(made[k]); }
    var gotD2 = made.some(function (m) { return m.d2; });
    // PDF에서 D2가 감지되면 'D2 판정이신가요?'를 자동으로 켜서 업로드 칸을 펼친다
    var declEl = $('#d2Declare');
    if (gotD2 && declEl) { declEl.checked = true; }
    updateD2(gotD2);
    updateProgress();
  }

  if (healthInput) {
    $('#healthAdd').addEventListener('click', function () { healthInput.click(); });
    healthInput.addEventListener('change', function () {
      var files = Array.prototype.slice.call(healthInput.files || []);
      healthInput.value = '';
      addHealthFiles(files);
    });
  }
  if (healthList) {
    healthList.addEventListener('click', function (e) {
      var del = e.target.closest('[data-hdel]');
      if (del) {
        var uid = del.getAttribute('data-hdel');
        state.health = state.health.filter(function (h) { return h.uid !== uid; });
        renderHealth();
        updateProgress();
        return;
      }
      var fix = e.target.closest('[data-hfix]');
      if (fix) {
        var h = findByUid(fix.getAttribute('data-hfix'));
        if (h) { h.edit = true; renderHealth(); }
      }
    });
    healthList.addEventListener('change', function (e) {
      var d = e.target.closest('[data-hdate]');
      if (d) {
        var h1 = findByUid(d.getAttribute('data-hdate'));
        if (h1) { h1.date = d.value || ''; h1.auto = false; h1.edit = true; renderHealth(); updateProgress(); }
        return;
      }
      var t = e.target.closest('[data-htype]');
      if (t) {
        var h2 = findByUid(t.getAttribute('data-htype'));
        if (h2) { h2.type = t.value || ''; h2.auto = false; h2.edit = true; renderHealth(); updateProgress(); }
      }
    });
  }

  /* ---------------- 진행률 ---------------- */
  function val(sel) { var el = $(sel); return el ? String(el.value || '').trim() : ''; }
  function radio(name) { var el = $('input[name=' + name + ']:checked'); return el ? el.value : ''; }

  function certs() {
    var arr = $$('#certChips input:checked').map(function (i) {
      if (i.value && i.value !== 'on') { return i.value; }
      var sp = i.parentNode.querySelector('span');
      return safeName(sp ? sp.textContent : '');
    });
    return arr.filter(Boolean);
  }

  function healthReady() {
    // 건강검진은 선택 — 올리지 않아도 되고, 올린 파일만 날짜·종류·유효기간을 본다
    return state.health.every(function (h) { return h.date && h.type && !expired(h); });
  }

  function requiredState() {
    return [
      !!val('#name'), digitsOnly(val('#rrn')).length === 13, !!val('#address'),
      !!radio('phone_os'), digitsOnly(val('#phone')).length >= 10, !!radio('phone_self_owned'),
      !!val('#bank'), !!digitsOnly(val('#account_number')), !!val('#account_holder'), !!val('#daily_wage'),
      !!val('#total_career'), !!val('#semi_career'), !!val('#email'),
      !!val('#blood_type'), !!radio('vest_size'), !!val('#shoe_size'),
      !!radio('glasses_type'),
      !!state.files.idcard, !!state.files.edu, !!state.files.bank, !!state.files.photo,
      healthReady(), (!d2required() || !!state.files.opinion), !!state.files.career,
      agrees.every(function (a) { return a.checked; })
    ];
  }

  function updateProgress() {
    var s = requiredState();
    var done = s.filter(Boolean).length;
    var pct = Math.round((done / s.length) * 100);
    var bar = $('#prog');
    if (bar) { bar.style.width = pct + '%'; }
    updateD2(false);
    if (state.submitted) { return; }
    var btn = $('#submitBtn');
    if (btn) { btn.disabled = false; }
  }

  /* ---------------- 제출 ---------------- */
  /* 주민등록번호 뒷자리 첫 글자로 성별 계산 (2·4·6·8·0 = 여, 1·3·5·7·9 = 남) */
  function genderFromRrn(rrnv) {
    var d = digitsOnly(rrnv);
    if (d.length < 7) { return ''; }
    var g = d.charAt(6);
    if (g === '1' || g === '3' || g === '5' || g === '7' || g === '9') { return '남'; }
    if (g === '2' || g === '4' || g === '6' || g === '8' || g === '0') { return '여'; }
    return '';
  }

  function buildRow() {
    var name = safeName(val('#name'));
    var rrnv = fmtRRN(val('#rrn'));
    var birth6 = digitsOnly(rrnv).slice(0, 6);
    var now = new Date().toISOString();
    return {
      id: state.id,
      name: name,
      rrn: rrnv,
      birth6: birth6,
      gender: genderFromRrn(rrnv),
      address: val('#address'),
      phone_os: radio('phone_os'),
      phone: fmtPhone(val('#phone')),
      phone_self_owned: radio('phone_self_owned'),
      housing: null,
      bank: val('#bank'),
      account_number: val('#account_number'),
      account_holder: val('#account_holder'),
      referrer: val('#referrer'),
      job_role: jobRole(),
      daily_wage: digitsOnly(val('#daily_wage')),
      total_career: val('#total_career'),
      semi_career: val('#semi_career'),
      email: val('#email'),
      blood_type: val('#blood_type'),
      vest_size: radio('vest_size'),
      shoe_size: digitsOnly(val('#shoe_size')),
      glasses_type: radio('glasses_type'),
      certs: certs(),
      health_exam_date: (state.health[0] && state.health[0].date) || null,
      health_exam_type: (state.health[0] && state.health[0].type) || null,
      files_json: [],
      agreed_privacy_at: now,
      agreed_unique_id_at: now,
      agreed_sensitive_at: now,
      status: 'submitted'
    };
  }

  function displayName(key, row) {
    var n = row.name;
    var b6 = row.birth6;
    switch (key) {
      case 'idcard': return '신분증(' + n + ').' + (state.files.idcard.ext);
      case 'edu': return '기초이수증(' + n + ').' + (state.files.edu.ext);
      case 'bank': return '통장사본(' + n + ').' + (state.files.bank.ext);
      case 'photo': return n + '_' + b6 + '.jpg';
      case 'opinion': return n + ' 소견서.pdf';
      case 'medicine': return n + ' 약봉투.' + ((state.files.medicine && state.files.medicine.ext) || 'jpg');
      case 'career': return n + ' 경력증명서' + (row.job_role ? '(' + row.job_role + ')' : '') + '.pdf';
      default: return n + '_' + key;
    }
  }

  function validate() {
    var problems = [];
    if (!val('#name')) { problems.push(['#name', '성명을 적어 주세요.']); }
    else if (digitsOnly(val('#rrn')).length !== 13) { problems.push(['#rrn', '주민등록번호 13자리를 정확히 적어 주세요.']); }
    else if (!val('#address')) { problems.push(['#address', '주소를 적어 주세요.']); }
    else if (!radio('phone_os')) { problems.push(['#seg-os', '휴대폰 기종(삼성/아이폰)을 골라 주세요.']); }
    else if (digitsOnly(val('#phone')).length < 10) { problems.push(['#phone', '휴대폰번호를 정확히 적어 주세요.']); }
    else if (!radio('phone_self_owned')) { problems.push(['#seg-owned', '본인 명의 휴대폰 여부를 골라 주세요.']); }
    else if (!val('#bank')) { problems.push(['#bank', '은행을 적어 주세요.']); }
    else if (!digitsOnly(val('#account_number'))) { problems.push(['#account_number', '계좌번호를 적어 주세요.']); }
    else if (!val('#account_holder')) { problems.push(['#account_holder', '입금자명(예금주)을 적어 주세요.']); }
    else if (!val('#daily_wage')) { problems.push(['#daily_wage', '단가를 적어 주세요.']); }
    else if (!val('#total_career')) { problems.push(['#total_career', '총 경력을 적어 주세요.']); }
    else if (!val('#semi_career')) { problems.push(['#semi_career', '반도체 경력을 적어 주세요. 없으면 “없음”이라고 적어 주세요.']); }
    else if (!val('#email')) { problems.push(['#email', '이메일을 적어 주세요.']); }
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val('#email'))) { problems.push(['#email', '이메일 주소를 정확히 적어 주세요.']); }
    else if (!val('#blood_type')) { problems.push(['#blood_type', '혈액형을 골라 주세요.']); }
    else if (!radio('vest_size')) { problems.push(['#seg-vest', '조끼 사이즈를 골라 주세요.']); }
    else if (!val('#shoe_size')) { problems.push(['#shoe_size', '안전화 사이즈를 적어 주세요.']); }
    else if (!radio('glasses_type')) { problems.push(['#seg-glasses', '보안경 종류를 골라 주세요.']); }
    else if (!state.files.idcard) { problems.push(['[data-file=idcard]', '신분증 사진을 올려 주세요.']); }
    else if (!state.files.edu) { problems.push(['[data-file=edu]', '기초안전보건교육 이수증을 올려 주세요.']); }
    else if (!state.files.bank) { problems.push(['[data-file=bank]', '통장사본을 올려 주세요.']); }
    else if (!state.files.photo) { problems.push(['[data-file=photo]', '증명사진을 올려 주세요.']); }
    else if (state.health.some(function (h) { return h.state === 'reading'; })) { problems.push(['#healthList', '검진 PDF를 읽는 중입니다. 잠시 뒤 다시 눌러 주세요.']); }
    else if (state.health.some(function (h) { return !h.date || !h.type; })) { problems.push(['#healthList', '검진일자·종류를 읽지 못한 파일이 있어요. 날짜와 종류를 골라 주세요.']); }
    else if (state.health.some(expired)) { problems.push(['#healthList', '❌ 검진일로부터 1년이 지난 서류는 사용할 수 없습니다. 최근 1년 이내 검진 결과지(PDF)를 올려 주세요.']); }
    else if (d2required() && !state.files.opinion) { problems.push(['#field-opinion', 'D2 판정입니다. 소견서 PDF를 올려 주세요.']); }
    else if (!state.files.career) { problems.push(['[data-file=career]', '경력증명서 PDF를 올려 주세요.']); }
    else if (!agrees.every(function (a) { return a.checked; })) { problems.push(['#agreeAll', '개인정보 동의 3가지를 모두 체크해 주세요.']); }
    return problems;
  }

  function uploadItems(row) {
    var items = [];
    DOC_TYPES.forEach(function (d) {
      if (d.key === 'health') {
        state.health.forEach(function (h) {
          items.push({
            type: 'health', pathKey: h.uid,
            blob: h.blob, ext: 'pdf', mime: 'application/pdf',
            name: ExamPDF.fileName(row.name, h.date, h.type),
            exam_date: h.date, exam_type: h.type, d2: !!h.d2
          });
        });
        return;
      }
      var f = state.files[d.key];
      if (!f) { return; }
      items.push({
        type: d.key, pathKey: d.key,
        blob: f.blob, ext: f.ext, mime: f.mime,
        name: displayName(d.key, row)
      });
    });
    return items;
  }

  async function uploadOne(row, it) {
    var path = state.id + '/' + it.pathKey + '.' + it.ext;
    var info = { type: it.type, path: path, name: it.name, size: it.blob.size, mime: it.mime };
    if (it.type === 'health') { info.exam_date = it.exam_date; info.exam_type = it.exam_type; info.d2 = !!it.d2; }
    if (state.uploaded[it.pathKey]) { return info; }

    var res = await fetch(CFG.url + '/storage/v1/object/' + CFG.bucket + '/' + encodeURIComponent(path).replace(/%2F/g, '/'), {
      method: 'POST',
      headers: {
        apikey: CFG.anon,
        Authorization: 'Bearer ' + CFG.anon,
        'Content-Type': it.mime,
        'cache-control': '3600',
        'x-upsert': 'false'
      },
      body: it.blob
    });
    if (!res.ok) {
      var txt = '';
      try { txt = await res.text(); } catch (e) { txt = ''; }
      // 이미 올라간 파일(재시도)은 성공으로 본다
      if (!(res.status === 409 || /Duplicate|already exists/i.test(txt))) {
        throw new Error(it.name + ' 업로드 실패 (' + res.status + ')');
      }
    }
    state.uploaded[it.pathKey] = true;
    return info;
  }

  async function submit() {
    if (state.busy || state.submitted) { return; }
    var problems = validate();
    if (problems.length) {
      var first = problems[0];
      if (first[0] === '#field-opinion' && !d2declared()) {
        var dEl = $('#d2Declare');
        if (dEl) { dEl.checked = true; updateD2(false); }
      }
      toast(first[1], 3200);
      var el = document.querySelector(first[0]);
      if (el && el.scrollIntoView) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      return;
    }

    state.busy = true;
    var btn = $('#submitBtn');
    var label = btn.textContent;
    btn.disabled = true;

    try {
      if (!state.id) { state.id = uuid(); }
      var row = buildRow();

      var items = uploadItems(row);
      var files = [];
      for (var i = 0; i < items.length; i++) {
        btn.textContent = '서류 올리는 중… (' + (i + 1) + '/' + items.length + ')';
        var info = await uploadOne(row, items[i]);
        if (info) { files.push(info); }
      }

      row.files_json = files;
      btn.textContent = '저장하는 중…';

      var res = await fetch(CFG.url + '/rest/v1/' + CFG.table, {
        method: 'POST',
        headers: {
          apikey: CFG.anon,
          Authorization: 'Bearer ' + CFG.anon,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify(row)
      });

      if (!res.ok) {
        var msg = '';
        try { msg = await res.text(); } catch (e) { msg = ''; }
        // 같은 id로 이미 저장된 경우(재시도)는 성공으로 본다
        if (!(res.status === 409 || /duplicate key/i.test(msg))) {
          throw new Error('저장에 실패했어요. (' + res.status + ') 잠시 뒤 다시 시도해 주세요.');
        }
      }

      state.submitted = true;
      showDone(row, files);
    } catch (e) {
      toast((e && e.message) || '제출 중 문제가 생겼어요. 다시 시도해 주세요.', 4200);
      btn.textContent = '다시 제출하기';
      btn.disabled = false;
    } finally {
      state.busy = false;
      if (!state.submitted) { btn.disabled = false; if (btn.textContent !== '다시 제출하기') { btn.textContent = label; } }
    }
  }

  function showDone(row, files) {
    $('#doneName').textContent = row.name + ' 님' + (row.job_role ? ' · ' + row.job_role : '');
    var byType = {};
    files.forEach(function (f) { (byType[f.type] = byType[f.type] || []).push(f); });
    var h = '';
    DOC_TYPES.forEach(function (d) {
      var arr = byType[d.key] || [];
      if (arr.length) {
        h += '<div>✅ ' + esc(d.label) + (arr.length > 1 ? ' ' + arr.length + '개' : '') + '</div>';
      } else {
        h += '<div>⬜ ' + esc(d.label) + ' — 없음</div>';
      }
    });
    h += '<div style="margin-top:8px;color:#667085">접수 시각: ' + new Date().toLocaleString('ko-KR') + '</div>';
    $('#doneList').innerHTML = h;
    $('#prog').style.width = '100%';
    var btn = $('#submitBtn');
    btn.textContent = '제출 완료';
    btn.disabled = true;
    openModal('doneModal');
  }

  $('#submitBtn').addEventListener('click', submit);
  $('#doneClose').addEventListener('click', function () {
    closeModal('doneModal');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* 이름을 적으면 검진 파일 이름도 같이 바뀜 */
  var nameInput = $('#name');
  if (nameInput) { nameInput.addEventListener('input', renderHealth); }

  /* D2 안내의 바로 올리기 버튼 */
  $$('[data-jump]').forEach(function (b) {
    b.addEventListener('click', function () {
      var dEl = $('#d2Declare');
      if (dEl && !dEl.checked) { dEl.checked = true; updateD2(false); }
      var row = $('[data-file="' + b.getAttribute('data-jump') + '"]');
      var inp = row && row.querySelector('input[type=file]');
      if (inp) { inp.click(); }
    });
  });

  /* 'D2 판정이신가요?' 체크 → 소견서·약봉투 칸 펼침 */
  var d2DeclareEl = $('#d2Declare');
  if (d2DeclareEl) {
    d2DeclareEl.addEventListener('change', function () {
      updateD2(false);
      updateProgress();
      if (this.checked) {
        var f = $('#d2Fields');
        if (f) { try { f.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { /* 무시 */ } }
      }
    });
  }

  careerHint();
  syncHolder();
  updateD2(false);

  updateProgress();
  renderGuide();
})();
