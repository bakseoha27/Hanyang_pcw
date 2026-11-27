/* =========================================================
   휴대폰 문자 본인인증 (OTP) — 첫 화면 게이트
   · 이름 + 전화번호 → [인증번호 받기] → 6자리 입력 → [인증 확인]
   · 인증되면 서류 작성 폼이 열리고, 성명·휴대폰번호는 잠긴다(readOnly)
   · 맨 아래 [관리자로 로그인하기] 는 문자 인증 없이 관리자 암호로 바로 이동
   ========================================================= */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var AUTH_KEY = 'ob_admin_auth_v1';        // admin.html 과 같은 키
  var OTP_KEY = 'ob_otp_v1';                // 새로고침해도 문자를 다시 받지 않도록(탭 세션 동안만)
  var CODE_SEC = 300;                       // 5분

  var S = {
    name: '', phone: '', token: '',
    verified: false, sending: false, verifying: false,
    timer: null, left: 0, resendLeft: 0, resendTimer: null
  };

  function toast(msg, ms) {
    var el = $('#toast');
    if (!el) { return; }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, ms || 2600);
  }

  function digitsOnly(s, max) {
    var v = String(s || '').replace(/\D/g, '');
    return max ? v.slice(0, max) : v;
  }

  function fmtPhone(v) {
    var d = digitsOnly(v, 11);
    if (d.length < 4) { return d; }
    if (d.length < 8) { return d.slice(0, 3) + '-' + d.slice(3); }
    return d.slice(0, 3) + '-' + d.slice(3, d.length - 4) + '-' + d.slice(d.length - 4);
  }

  function phoneOk(d) {
    if (!d) { return false; }
    if (d.indexOf('010') === 0) { return d.length === 11; }   // 010 은 11자리
    return d.length >= 10;
  }

  function showErr(el, msg) {
    if (!el) { return; }
    if (!msg) { el.textContent = ''; el.classList.add('hide'); return; }
    el.textContent = msg;
    el.classList.remove('hide');
  }

  function busy(btn, on, text) {
    if (!btn) { return; }
    if (on) {
      btn._label = btn._label || btn.textContent;
      btn.disabled = true;
      if (text) { btn.textContent = text; }
    } else {
      btn.disabled = false;
      btn.textContent = btn._label || btn.textContent;
    }
  }

  async function call(action, payload) {
    var res = await fetch(CFG.url + CFG.otpFn, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: CFG.anon,
        Authorization: 'Bearer ' + CFG.anon
      },
      body: JSON.stringify(Object.assign({ action: action }, payload || {}))
    });
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok || !data || data.ok !== true) {
      var err = new Error((data && data.error) || ('요청에 실패했어요. (' + res.status + ')'));
      err.data = data || {};
      err.status = res.status;
      throw err;
    }
    return data;
  }

  /* ---------- 인증번호 입력칸 타이머 ---------- */
  function stopTimer() {
    if (S.timer) { clearInterval(S.timer); S.timer = null; }
  }

  function paintTimer() {
    var el = $('#otpTimer');
    if (!el) { return; }
    var m = Math.floor(Math.max(0, S.left) / 60);
    var s = Math.max(0, S.left) % 60;
    el.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    el.classList.toggle('out', S.left <= 0);
  }

  function startTimer(sec) {
    stopTimer();
    S.left = sec;
    paintTimer();
    S.timer = setInterval(function () {
      S.left -= 1;
      paintTimer();
      if (S.left <= 0) {
        stopTimer();
        var hint = $('#otpHint');
        if (hint) { hint.textContent = '입력 시간이 지났습니다. [다시 받기]를 눌러 새 인증번호를 받아 주세요.'; }
      }
    }, 1000);
  }

  function showSendButton(on) {
    var btn = $('#otpSendBtn');
    if (!btn) { return; }
    btn.classList.toggle('hide', !on);
    if (on) { btn.disabled = false; btn.textContent = '인증번호 받기'; }
  }

  /* 번호·이름을 고치면 이미 받은 인증번호는 무효 → 칸을 닫고 다시 받게 한다 */
  function resetCodeBox() {
    var box = $('#otpCodeBox');
    if (!box || box.classList.contains('hide')) { return; }
    box.classList.add('hide');
    var code = $('#otpCode');
    if (code) { code.value = ''; }
    stopTimer();
    showSendButton(true);
  }

  /* ---------- 재발송 대기(60초) ---------- */
  function startResendWait(sec) {
    var btn = $('#otpResendBtn');
    if (!btn || sec <= 0) { return; }
    S.resendLeft = sec;
    btn.disabled = true;
    btn.textContent = '다시 받기 (' + sec + '초)';
    clearInterval(S.resendTimer);
    S.resendTimer = setInterval(function () {
      S.resendLeft -= 1;
      if (S.resendLeft <= 0) {
        clearInterval(S.resendTimer);
        S.resendTimer = null;
        btn.disabled = false;
        btn.textContent = '다시 받기';
      } else {
        btn.textContent = '다시 받기 (' + S.resendLeft + '초)';
      }
    }, 1000);
  }

  /* ---------- 발송 ---------- */
  async function sendCode() {
    if (S.sending || S.verified) { return; }
    var nameEl = $('#vName'), phoneEl = $('#vPhone');
    var name = String(nameEl.value || '').replace(/\s+/g, ' ').trim();
    var phone = digitsOnly(phoneEl.value);
    showErr($('#otpErr'), '');

    if (!name) { showErr($('#otpErr'), '이름을 입력해 주세요.'); nameEl.focus(); return; }
    if (!phoneOk(phone)) { showErr($('#otpErr'), '전화번호를 정확히 입력해 주세요. (예: 010-1234-5678)'); phoneEl.focus(); return; }

    var btn = $('#otpSendBtn');
    S.sending = true;
    busy(btn, true, '보내는 중…');
    try {
      await call('send', { name: name, phone: phone });
      S.name = name;
      S.phone = phone;
      $('#otpCodeBox').classList.remove('hide');
      showSendButton(false);
      var hint = $('#otpHint');
      if (hint) { hint.textContent = fmtPhone(phone) + ' 로 인증번호를 보냈습니다. 문자로 받은 6자리 숫자를 입력해 주세요.'; }
      startTimer(CODE_SEC);
      startResendWait(60);
      var code = $('#otpCode');
      if (code) { code.focus(); }
      toast('인증번호를 보냈습니다. 문자를 확인해 주세요.');
    } catch (e) {
      showErr($('#otpErr'), e.message || '인증번호를 보내지 못했습니다.');
      if (e.data && e.data.retryAfter) { startResendWait(Number(e.data.retryAfter) || 0); }
    } finally {
      S.sending = false;
      busy(btn, false);
    }
  }

  /* ---------- 확인 ---------- */
  async function verifyCode() {
    if (S.verifying || S.verified) { return; }
    var codeEl = $('#otpCode');
    var code = digitsOnly(codeEl.value, 6);
    showErr($('#otpErr'), '');
    if (code.length !== 6) { showErr($('#otpErr'), '인증번호 6자리를 입력해 주세요.'); codeEl.focus(); return; }

    var btn = $('#otpVerifyBtn');
    S.verifying = true;
    busy(btn, true, '확인하는 중…');
    try {
      var d = await call('verify', { phone: S.phone || digitsOnly($('#vPhone').value), code: code });
      S.token = d.token;
      S.name = d.name || S.name;
      S.phone = digitsOnly(d.phone || S.phone);
      S.verified = true;
      stopTimer();
      try {
        sessionStorage.setItem(OTP_KEY, JSON.stringify({
          token: S.token, name: S.name, phone: S.phone,
          exp: Date.now() + 7200 * 1000
        }));
      } catch (e) { /* 무시 */ }
      openForm(true);
      toast('본인인증이 완료되었습니다. 서류를 작성해 주세요.', 3200);
    } catch (e) {
      showErr($('#otpErr'), e.message || '인증번호가 맞지 않습니다.');
      if (codeEl) { codeEl.focus(); codeEl.select && codeEl.select(); }
    } finally {
      S.verifying = false;
      busy(btn, false);
    }
  }

  /* ---------- 인증 완료 → 폼 열기 ---------- */
  function openForm(announce) {
    var gate = $('#gateArea'), form = $('#formArea'), bar = $('#submitbar');
    if (gate) { gate.classList.add('hide'); }
    if (form) { form.classList.remove('hide'); }
    if (bar) { bar.classList.remove('hide'); }

    var nameEl = $('#name'), phoneEl = $('#phone');
    if (nameEl) {
      nameEl.value = S.name;
      nameEl.readOnly = true;
      nameEl.classList.add('locked');
      nameEl.setAttribute('title', '문자 인증으로 확인된 이름입니다.');
      try { nameEl.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) { /* 무시 */ }
    }
    if (phoneEl) {
      phoneEl.value = fmtPhone(S.phone);
      phoneEl.readOnly = true;
      phoneEl.classList.add('locked');
      phoneEl.setAttribute('title', '문자 인증으로 확인된 번호입니다.');
      try { phoneEl.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) { /* 무시 */ }
    }

    var bar2 = $('#verifiedBar');
    if (bar2) {
      bar2.classList.remove('hide');
      var who = $('#verifiedWho'), ph = $('#verifiedPhone');
      if (who) { who.textContent = S.name; }
      if (ph) { ph.textContent = fmtPhone(S.phone); }
    }
    if (announce) { window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }

  /* ---------- 관리자 바로 로그인 ---------- */
  function openAdmin() {
    showErr($('#adminErr'), '');
    var m = $('#adminLoginModal');
    if (m) { m.classList.add('open'); document.body.style.overflow = 'hidden'; }
    var n = $('#gAdminName');
    if (n) { setTimeout(function () { n.focus(); }, 80); }
  }

  function closeAdmin() {
    var m = $('#adminLoginModal');
    if (m) { m.classList.remove('open'); }
    if (!$('.modal.open')) { document.body.style.overflow = ''; }
  }

  async function adminLogin() {
    var name = String($('#gAdminName').value || '').trim();
    var phone = fmtPhone($('#gAdminPhone').value);
    var pass = $('#gAdminPass').value;
    var btn = $('#gAdminLogin');
    showErr($('#adminErr'), '');
    if (!name || !phone || !pass) {
      showErr($('#adminErr'), '이름·전화번호·관리자 암호를 모두 입력해 주세요.');
      return;
    }
    busy(btn, true, '확인하는 중…');
    try {
      var res = await fetch(CFG.url + CFG.adminFn, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: CFG.anon,
          Authorization: 'Bearer ' + CFG.anon
        },
        body: JSON.stringify({ action: 'list', name: name, phone: phone, passcode: pass })
      });
      var data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      if (!res.ok || !data || data.ok !== true) {
        showErr($('#adminErr'), (data && data.error) || '관리자로 들어갈 수 없습니다.');
        return;
      }
      try {
        sessionStorage.setItem(AUTH_KEY, JSON.stringify({ name: name, phone: phone, passcode: pass }));
      } catch (e) { /* 무시 */ }
      location.href = 'admin.html';
    } catch (e) {
      showErr($('#adminErr'), '관리자 페이지에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      busy(btn, false);
    }
  }

  /* ---------- 새로고침 복원 ---------- */
  function restore() {
    var saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(OTP_KEY) || 'null'); } catch (e) { saved = null; }
    if (!saved || !saved.token || !saved.name || !saved.phone) { return false; }
    if (Number(saved.exp || 0) <= Date.now()) {
      try { sessionStorage.removeItem(OTP_KEY); } catch (e) { /* 무시 */ }
      return false;
    }
    S.token = saved.token;
    S.name = String(saved.name);
    S.phone = digitsOnly(saved.phone);
    S.verified = true;
    openForm(false);
    return true;
  }

  /* ---------- 연결 ---------- */
  var nameEl = $('#vName'), phoneEl = $('#vPhone');
  if (nameEl) {
    nameEl.addEventListener('input', function () { if (!S.verified) { resetCodeBox(); } });
    nameEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('#vPhone').focus(); }
    });
  }
  if (phoneEl) {
    phoneEl.addEventListener('input', function () {
      this.value = fmtPhone(this.value);
      if (!S.verified) { resetCodeBox(); }
    });
    phoneEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); sendCode(); }
    });
  }
  var codeEl = $('#otpCode');
  if (codeEl) {
    codeEl.addEventListener('input', function () { this.value = digitsOnly(this.value, 6); });
    codeEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); verifyCode(); }
    });
  }
  var sendBtn = $('#otpSendBtn');
  if (sendBtn) { sendBtn.addEventListener('click', sendCode); }
  var resendBtn = $('#otpResendBtn');
  if (resendBtn) { resendBtn.addEventListener('click', sendCode); }
  var verifyBtn = $('#otpVerifyBtn');
  if (verifyBtn) { verifyBtn.addEventListener('click', verifyCode); }

  var adminBtn = $('#adminGateBtn');
  if (adminBtn) { adminBtn.addEventListener('click', openAdmin); }
  ['#adminLoginModal'].forEach(function (sel) {
    var m = $(sel);
    if (!m) { return; }
    m.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]') || e.target.classList.contains('bg')) { closeAdmin(); }
    });
  });
  var adminLoginBtn = $('#gAdminLogin');
  if (adminLoginBtn) { adminLoginBtn.addEventListener('click', adminLogin); }
  var adminPass = $('#gAdminPass');
  if (adminPass) {
    adminPass.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); adminLogin(); } });
  }
  var adminPhone = $('#gAdminPhone');
  if (adminPhone) {
    adminPhone.addEventListener('input', function () { this.value = fmtPhone(this.value); });
  }

  /* 제출 쪽에서 토큰을 읽어 간다 */
  window.OB_OTP = {
    isVerified: function () { return S.verified; },
    token: function () { return S.token; },
    name: function () { return S.name; },
    phone: function () { return S.phone; }
  };

  restore();
})();
