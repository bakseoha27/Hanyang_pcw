/* =========================================================
   카톡 건강검진 PDF 찾는 법 — 안내 모달
   · 단계/이미지를 바꾸려면 아래 GUIDE.steps 만 고치면 됩니다.
   · 이미지: assets/guide/step1.jpg ~ step7.jpg (개인정보 가림 처리본)
   ========================================================= */
var GUIDE = {
  intro: '카카오톡에 온 건강검진 알림톡에서 <b>PDF 파일</b>을 받아 휴대폰에 저장하는 방법입니다. 순서대로 따라 해 주세요.',
  warn: '⚠️ 일반 · 배치전 · 특수 검진을 <b>각각 따로</b> 받으셔야 합니다. 하나만 받으면 나머지 서류가 빠집니다!',
  steps: [
    {
      n: 1,
      title: '카카오톡 실행 후 오른쪽 위 돋보기(🔍) 누르기',
      img: 'assets/guide/step1.jpg',
      desc: '카카오톡 첫 화면 오른쪽 위의 돋보기(🔍)를 눌러 주세요.'
    },
    {
      n: 2,
      title: '‘성모’ 또는 ‘굿모닝’ 검색',
      img: 'assets/guide/step2.jpg',
      desc: '검색창에 <b>성모</b> 또는 <b>굿모닝</b>을 입력하면 병원 알림톡이 나옵니다. (예: 굿모닝병원, 평택성모병원)'
    },
    {
      n: 3,
      title: '알림톡에서 [검진결과 확인하기] 누르기',
      img: 'assets/guide/step3.jpg',
      desc: '병원이 보낸 알림톡을 열고 <b>[검진결과 확인하기]</b> 버튼을 눌러 주세요.'
    },
    {
      n: 4,
      title: '[내 건강검진 결과 보기 >] 누르기',
      img: 'assets/guide/step4.jpg',
      desc: '결과 확인 화면에서 빨간 <b>[내 건강검진 결과 보기 >]</b> 버튼을 눌러 주세요.'
    },
    {
      n: 5,
      title: '일반 / 배치전 / 특수 전부 다 각각 받기',
      img: 'assets/guide/step5.jpg',
      desc: '<b>내 건강검진 결과보기(PDF 결과 보기)</b> 버튼이 검진 종류별로 따로 있습니다. <b>일반·배치·특수 전부 각각</b> 눌러서 다 받으셔야 합니다!'
    },
    {
      n: 6,
      title: '결과지가 열리면 오른쪽 위 ⋮ 버튼 누르기',
      img: 'assets/guide/step6.jpg',
      desc: 'PDF 결과지가 열리면 오른쪽 위 <b>⋮</b> 버튼을 눌러 주세요.'
    },
    {
      n: 7,
      title: '[다운로드] 눌러 PDF 파일 저장하기',
      img: 'assets/guide/step7.jpg',
      desc: '메뉴에서 <b>[다운로드]</b>를 누르면 PDF 파일이 휴대폰에 저장됩니다. 저장한 파일을 이 화면에서 올려 주세요.'
    }
  ],
  call: {
    text: '휴대폰이나 번호를 바꿔서 카톡에 건강검진이 안 뜨면 <b>1544-1416</b> 으로 전화해서 다시 보내달라고 하시면 됩니다!',
    tel: '1544-1416',
    telLink: 'tel:15441416'
  }
};

function renderGuide() {
  var body = document.getElementById('guideBody');
  if (!body) { return; }
  var h = '';
  h += '<p class="doc-txt" style="margin-bottom:12px">' + GUIDE.intro + '</p>';
  h += '<div class="guide-warn">' + GUIDE.warn + '</div>';
  GUIDE.steps.forEach(function (s) {
    h += '<div class="guide-step">';
    h += '<div class="cap"><span>STEP ' + s.n + '</span> · ' + s.title + '</div>';
    h += '<img src="' + s.img + '" alt="STEP ' + s.n + ' 안내 화면" loading="lazy">';
    h += '<div style="padding:10px 12px 12px;font-size:12.5px;color:#344054;line-height:1.6">' + s.desc + '</div>';
    h += '</div>';
  });
  h += '<div class="guide-call"><b>📞 카톡에 검진 결과가 안 보일 때</b><span style="font-size:12.5px;color:#7A271A;line-height:1.55">'
    + GUIDE.call.text + '</span><br><a href="' + GUIDE.call.telLink + '">📞 ' + GUIDE.call.tel + ' 전화하기</a></div>';
  h += '<p class="doc-txt" style="color:#98A2B3">PDF 파일이 저장되었으면 이 안내를 닫고 <b>건강검진 결과지</b> 칸에서 파일을 선택해 주세요.</p>';
  body.innerHTML = h;
}

if (document.readyState !== 'loading') { renderGuide(); }
else { document.addEventListener('DOMContentLoaded', renderGuide); }
