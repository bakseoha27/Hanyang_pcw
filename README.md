# 한양 pcw팀 — 현장 앱 (GitHub Pages + 안드로이드 APK)

한양이엔지(주) PCW 현장에서 쓰는 웹앱입니다. 휴대폰에서는 **안드로이드 앱(APK)** 또는 **홈 화면에 추가한 웹앱**으로 사용합니다.

| 항목 | 주소 |
|---|---|
| 웹앱 | https://bakseoha27.github.io/Hanyang_pcw/ |
| 설치 안내(다운로드) 페이지 | https://bakseoha27.github.io/Hanyang_pcw/download/ |
| 최신 APK (항상 같은 주소) | https://github.com/bakseoha27/Hanyang_pcw/releases/latest/download/hanyang-pcw.apk |

## 구조

```
/                     웹앱 (index.html · style.css · js/ · manifest.json · sw.js · 아이콘)
/download/            설치 안내 페이지 — 안드로이드 자동 다운로드 / 아이폰 웹앱 안내
/android/             안드로이드 WebView 껍데기 앱 (Gradle 프로젝트)
/.github/workflows/   APK 자동 빌드·배포 (build-apk.yml)
```

## 자동 업데이트 방식

- 앱은 `https://bakseoha27.github.io/Hanyang_pcw/` 를 WebView 로 열기만 합니다.
- 그래서 **웹앱 파일만 고쳐서 push 하면** 현장 인원은 앱을 다시 설치하지 않아도 다음에 열 때 새 화면이 뜹니다.
  (서비스워커 `sw.js` 가 화면은 네트워크 우선으로 받아 옵니다.)
- APK 를 새로 받는 경우는 **껍데기 앱 자체가 바뀌었을 때**(권한·다운로드 처리 등)뿐입니다.

## 웹앱 수정해서 올리기

`projects/site-manager/web/` 에서 고친 뒤 이 저장소 루트로 복사하고 push 하면 끝입니다. (APK 빌드는 필요 없음)

```bash
cp index.html style.css manifest.json sw.js icon.svg icon-192.png icon-512.png .
cp js/*.js js/
git add -A && git commit -m "웹앱 수정" && git push
```

## APK 다시 빌드하기

`android/` 안의 파일이 바뀌어 push 되면 GitHub Actions 가 자동으로 빌드해 `latest` 릴리스의 `hanyang-pcw.apk` 를 새 파일로 바꿉니다.
직접 돌리려면 **Actions → APK 빌드 · 배포 → Run workflow**.

- 서명 키: `android/keystore/hanyang-pcw.jks` (별칭 `hanyang-pcw`)
  - **이 키를 바꾸면 기존 앱 위에 덮어설치가 안 됩니다.** (지우고 다시 설치해야 함) 키 파일은 그대로 보관하세요.
  - SHA-256 지문: `50:B7:E3:9B:A1:59:C3:4C:AC:21:97:BF:76:C4:34:09:AB:C7:B5:64:9C:95:F3:FF:48:A2:D6:0E:51:48:84:1A`
  - 이 저장소는 공개 저장소라 키 파일과 비밀번호(`android/gradle.properties`)가 함께 들어 있습니다. 외부 배포용이 아니라 현장 내부 배포용이라 이렇게 두었습니다.
- 빌드 번호(`versionCode`)는 Actions 실행 번호 + 100 을 씁니다. 앱을 덮어설치하려면 새 번호가 커야 하므로 자동으로 올라갑니다.

## 상단 알림(푸시 · FCM)

- Firebase 프로젝트 `hanyang-pcw-push` · 앱 설정 `android/app/google-services.json` (공개 저장소 허용)
- **서비스 계정 키(`firebase-service-account.json`)는 저장소에 올리지 않습니다.** Supabase Edge Function 시크릿 `FIREBASE_SERVICE_ACCOUNT` 에만 넣습니다.
- 알림 채널 `pcw_alarm` (IMPORTANCE_HIGH · 소리·진동), 안드로이드 13+ 는 첫 실행 때 알림 권한을 요청합니다.
- 앱이 로그인한 기술인의 FCM 토큰을 `push_tokens` 에 저장합니다(관리자·팀장뿐 아니라 재직 기술인 전원). 로그아웃하면 지웁니다.
- 발송
  - `leaves` / `early_leaves` 에 INSERT → DB 트리거(pg_net) → `send-push` → **관리자·팀장** (신청자 제외)
  - 공지·토요일 조사 화면의 **[📢 전체 알림]** → `broadcast-push` (관리자 암호 확인) → **재직 기술인 전원**
- 만료·무효 토큰은 발송 시 자동으로 지워집니다.

## 앱이 지원하는 것

- JavaScript · DOM Storage(localStorage) — 로그인 세션, 저장 대기열
- 상단 알림(푸시) — 휴무·조퇴 신청(관리자·팀장), 공지·토요일 조사(기술인 전체)
- 파일 업로드(`onShowFileChooser`) — 위험성평가서·시방서 PDF, 사진
- PDF·첨부파일: PDF 앱으로 바로 열기, 그 밖의 파일은 다운로드 폴더에 저장 후 알림으로 열기
- 뒤로가기 → 웹 히스토리
- 인터넷이 끊기면 안내 화면 + 다시 시도
- 아이콘 `한양 pcw팀`, 테마 색 `#14213D`

## 보안

- 저장소와 Pages 는 공개입니다. `robots.txt` 로 검색 노출은 막아 두었지만, **주소를 아는 사람은 접속할 수 있습니다.** 현장 인원에게만 공유하세요.
- 앱에는 Supabase `anon` 키만 들어 있습니다. `service_role` 키·DB 비밀번호·`.db-credentials.json` 은 **저장소에 없습니다.**
