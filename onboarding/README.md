# 신규입사자 서류 제출 (onboarding)

한양이엔지(주) PCW 현장 신규입사자용 **모바일 제출 페이지**와 **관리자 페이지**입니다.

- 제출: `https://bakseoha27.github.io/Hanyang_pcw/onboarding/`
- 관리자: `https://bakseoha27.github.io/Hanyang_pcw/onboarding/admin.html`

## 어떤 정보를 다루나

주민등록번호 전체, 신분증·통장사본, 건강검진 결과(민감정보)를 받습니다. 그래서 이 앱은
`한양 pcw팀` 앱의 다른 테이블과 **보안 구조가 다릅니다.**

| 구분 | 권한 |
|---|---|
| `anon` (브라우저 공개 키) | `onboarding_submissions` **INSERT 만** · Storage `onboarding-docs` **업로드만** |
| 조회 / 내려받기 / 삭제 | `anon` 불가 (정책·권한 없음) |
| 관리자 | Edge Function `onboarding-admin` (서비스롤 키는 함수 안에서만) |

관리자 인증은 **지정 관리자(이름 + 전화번호, `onboarding_admins`)** + **관리자 암호**
(`app_secrets.admin_passcode`, SHA-256 대조) 두 가지를 모두 만족해야 합니다.
지정 관리자를 추가하려면 DB에서:

```sql
insert into public.onboarding_admins (name, phone) values ('이름', '010-0000-0000');
```

## 구성

| 파일 | 설명 |
|---|---|
| `index.html` · `js/submit.js` | 신규입사자 제출 폼 (모바일 우선) |
| `js/guide.js` · `assets/guide/stepN.jpg` | 카톡에서 검진 PDF 찾는 법 (STEP 1~7) |
| `admin.html` · `js/admin.js` | 관리자 조회 · 엑셀 취합 · ZIP · 입사취소 파기 |
| `js/config.js` | Supabase URL · anon 키 · 서류 종류 |
| `vendor/` | ExcelJS · JSZip (CDN 대신 저장소에 포함 → 오프라인·차단망에서도 동작) |

## 파일 이름 규칙 (자동 변환)

| 서류 | 저장 이름 |
|---|---|
| 신분증 | `신분증(성명).확장자` |
| 기초안전보건교육 이수증 | `기초이수증(성명).확장자` |
| 통장사본 | `통장사본(성명).확장자` |
| 증명사진 | `성명_생년월일6자리.jpg` (Canvas로 JPG 변환) |
| 건강검진 | `YYMMDD_성명 일반.pdf` / `배치전` / `특수` |
| 소견서 | `성명 소견서.pdf` |
| 경력증명서 | `성명 경력증명서(직종).pdf` |

Storage 객체 키는 ASCII만 허용되므로 실제 경로는 `{제출id}/{서류종류}.{확장자}`이고,
위의 한글 이름은 DB(`files_json`)에 저장해 **다운로드할 때 그 이름으로** 내려받습니다.

## 엑셀 취합

관리자 페이지의 **[📊 엑셀 취합 다운로드]** 는 서하 님의 실제 양식(`확정 (2)` 시트)의
열 순서·너비·머리글 색을 그대로 따릅니다.

`No. · 성명 · 주민번호 · 입사일자 · 주소 · 핸드폰기종 · 휴대폰 · 월급/일당 · 은행명 ·
계좌번호 · 직종 · 숙소 · 총경력 · 반도체경력 · 이메일 · 혈액형 · 조끼 사이즈 ·
안전화 사이즈 · 보안경(일반/안경) · 보유 자격 현황`

그 뒤에 **서류 제출 현황**(신분증·기초이수증·통장사본·증명사진·건강검진·소견서·경력증명서 O/X,
검진일/종류, 제출일, 상태, 동의 일시 3종)을 덧붙입니다.
`입사일자`는 제출 폼에서 받지 않으므로 빈칸으로 나옵니다.

## 배포

```bash
# projects/onboarding-portal/web/ 에서 고친 뒤
cp -r projects/onboarding-portal/web/* work/gh-hanyang-pcw/onboarding/
cd work/gh-hanyang-pcw && git add onboarding && git commit -m "..." && git push
```

DB·스토리지·함수 정의는 `projects/onboarding-portal/supabase-onboarding.sql` 과
`projects/onboarding-portal/edge-functions/onboarding-admin/index.ts` 입니다.
