/* =========================================================
   건강검진 PDF 자동 인식 — PDF.js 로컬 번들(vendor/pdfjs)
   · PDF 첫 1~2쪽의 글자를 읽어 검진일자 · 검진종류를 찾는다.
   · 읽지 못한(스캔본 등) 경우엔 빈 값을 돌려주고 화면에서 직접 고르게 한다.
   ========================================================= */
(function () {
  'use strict';

  var BASE = '';
  var tag = document.querySelector('script[src*="js/exam.js"]');
  if (tag && tag.src) { BASE = tag.src.replace(/js\/exam\.js.*$/, ''); }

  var CMAP = BASE + 'vendor/pdfjs/cmaps/';
  var WORKER = BASE + 'vendor/pdfjs/pdf.worker.min.js';

  if (window.pdfjsLib) {
    try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER; } catch (e) { /* 무시 */ }
  }

  var TYPE_LABEL = { '배치전': '배치전', '특수': '특수', '일반': '일반' };

  function norm(s) {
    return String(s == null ? '' : s).replace(/\u00a0/g, ' ').replace(/[\u200b-\u200d\ufeff]/g, '');
  }

  /* ---------- PDF → 글자 ---------- */
  function readArrayBuffer(file) {
    if (file.arrayBuffer) { return file.arrayBuffer(); }
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error('파일을 읽지 못했어요.')); };
      fr.readAsArrayBuffer(file);
    });
  }

  function itemsToText(items) {
    var out = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var s = norm(it && it.str);
      if (!s) { continue; }
      out += s;
      out += (it.hasEOL ? '\n' : ' ');
    }
    return out;
  }

  async function extractText(file, maxPages) {
    if (!window.pdfjsLib) { throw new Error('PDF 라이브러리를 불러오지 못했어요.'); }
    var buf = await readArrayBuffer(file);
    var doc = await window.pdfjsLib.getDocument({
      data: new Uint8Array(buf),
      cMapUrl: CMAP,
      cMapPacked: true,
      isEvalSupported: false,
      disableAutoFetch: true,
      disableStream: true
    }).promise;
    var pages = Math.min(doc.numPages || 1, maxPages || 2);
    var chunks = [];
    for (var p = 1; p <= pages; p++) {
      var page = await doc.getPage(p);
      var tc = await page.getTextContent();
      chunks.push(itemsToText(tc.items || []));
      try { page.cleanup(); } catch (e) { /* 무시 */ }
    }
    try { doc.destroy(); } catch (e) { /* 무시 */ }
    return chunks.join('\n');
  }

  /* ---------- 날짜 ---------- */
  var DATE_RE = /(20\d{2})\s*[년.\-\/]\s*(\d{1,2})\s*[월.\-\/]\s*(\d{1,2})/g;
  var DATE_LABEL = /(검진일자|검진일|검진시행일|건강진단일자|건강진단일|수검일자|수검일|진찰일|검사일|시행일|실시일|받은날짜|검진날짜)/;
  var BIRTH_LABEL = /(생년월일|생년|출생|주민번호|주민등록번호)/;

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function mkDate(y, m, d) {
    y = Number(y); m = Number(m); d = Number(d);
    if (!(y >= 1950 && y <= 2099) || !(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) { return ''; }
    return y + '-' + pad2(m) + '-' + pad2(d);
  }

  function datesIn(flat) {
    var out = [];
    DATE_RE.lastIndex = 0;
    var m;
    while ((m = DATE_RE.exec(flat))) {
      var v = mkDate(m[1], m[2], m[3]);
      if (!v) { continue; }
      out.push({ date: v, at: m.index, before: flat.slice(Math.max(0, m.index - 28), m.index) });
    }
    return out;
  }

  function dateFromFileName(name) {
    var n = String(name || '');
    var m = /(20\d{2})[.\-_년\s]*(\d{1,2})[.\-_월\s]*(\d{1,2})/.exec(n);
    if (m) {
      var v = mkDate(m[1], m[2], m[3]);
      if (v) { return { date: v, src: 'file' }; }
    }
    m = /(?:^|\D)(\d{2})(\d{2})(\d{2})(?:\D|$)/.exec(n.replace(/\s+/g, ''));
    if (m) {
      var v2 = mkDate('20' + m[1], m[2], m[3]);
      if (v2) { return { date: v2, src: 'file' }; }
    }
    return null;
  }

  function findDate(flat, fileName) {
    var all = datesIn(flat);
    // 1) '검진일자' 같은 라벨 바로 뒤의 날짜
    for (var i = 0; i < all.length; i++) {
      if (DATE_LABEL.test(all[i].before)) { return { date: all[i].date, src: 'label' }; }
    }
    // 2) 생년월일·주민번호가 아닌 첫 날짜
    for (var j = 0; j < all.length; j++) {
      if (!BIRTH_LABEL.test(all[j].before)) { return { date: all[j].date, src: 'text' }; }
    }
    // 3) 파일 이름의 날짜
    return dateFromFileName(fileName);
  }

  /* ---------- 종류 ---------- */
  function typeIn(text) {
    var t = text.replace(/\s+/g, '');
    if (/배치전/.test(t)) { return '배치전'; }
    if (/특수(건강)?(진단|검진|검사)/.test(t)) { return '특수'; }
    if (/특수/.test(t) && !/일반/.test(t)) { return '특수'; }
    if (/일반(건강)?(진단|검진|검사)/.test(t)) { return '일반'; }
    return '';
  }

  function findType(text, fileName) {
    var t = typeIn(text);
    if (t) { return { type: t, src: 'text' }; }
    var f = typeIn(String(fileName || ''));
    if (f) { return { type: f, src: 'file' }; }
    return { type: '', src: '' };
  }

  /* ---------- D2 판정 ---------- */
  function detectD2(text) {
    var flat = norm(text).replace(/\s+/g, '');
    if (!flat) { return false; }
    // D2 / 판정D2 / D2판정 / D2유소견 — 숫자가 붙은 D20 같은 코드는 제외
    if (/D2(?![0-9])/.test(flat)) { return true; }
    if (/디투/.test(flat)) { return true; }
    return false;
  }

  /* ---------- 공개 ---------- */
  function parseExam(text, fileName) {
    var raw = norm(text);
    var flat = raw.replace(/\s+/g, '');
    var d = findDate(flat, fileName) || { date: '', src: '' };
    var t = findType(raw, fileName) || { type: '', src: '' };
    return {
      date: d.date || '',
      type: t.type || '',
      dateSrc: d.src || '',
      typeSrc: t.src || '',
      d2: detectD2(raw),
      chars: flat.length,
      snippet: raw.replace(/\s+/g, ' ').trim().slice(0, 300)
    };
  }

  function yymmdd(date) {
    var d = String(date || '').replace(/[^0-9]/g, '');
    return d.length === 8 ? d.slice(2) : d;
  }

  /* YYMMDD_이름 종류.pdf */
  function fileName(name, date, type) {
    var n = String(name || '').replace(/[\\/:*?"<>|\r\n\t]/g, '').replace(/\s+/g, ' ').trim() || '성명';
    var y = yymmdd(date);
    var out = (y ? y + '_' : '') + n;
    if (type) { out += ' ' + type; }
    return out + '.pdf';
  }

  window.ExamPDF = {
    ready: !!window.pdfjsLib,
    extractText: extractText,
    parseExam: parseExam,
    detectD2: detectD2,
    fileName: fileName,
    yymmdd: yymmdd,
    labels: TYPE_LABEL
  };
})();
