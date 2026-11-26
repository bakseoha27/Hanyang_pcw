package com.hanyang.pcw;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.io.UnsupportedEncodingException;
import java.net.URLDecoder;

/**
 * 한양 pcw팀 · 안드로이드 껍데기 앱
 *
 * 하는 일은 하나: https://bakseoha27.github.io/Hanyang_pcw/ 를 WebView 로 연다.
 * 웹앱을 고쳐서 깃허브에 올리면 현장 인원의 앱도 다음 실행 때 자동으로 새 화면이 됩니다.
 * (APK 는 다시 설치할 필요 없음. APK 를 새로 받는 경우는 껍데기 자체가 바뀌었을 때뿐)
 */
public class MainActivity extends Activity {

    /** 웹앱 주소 */
    private static final String APP_URL = "https://bakseoha27.github.io/Hanyang_pcw/";

    private static final int REQ_FILE_CHOOSER = 1001;
    private static final int REQ_STORAGE_PERM = 1002;
    private static final int REQ_NOTIF_PERM = 1003;

    private WebView web;
    private View splash;

    /** 파일 선택(위험성평가·시방서 PDF, 사진 업로드) 결과를 돌려줄 콜백 */
    private ValueCallback<Uri[]> pendingFileCallback;

    /** 안드로이드 9 이하에서 저장 권한을 받은 뒤 이어서 처리할 다운로드 */
    private String[] pendingDownload;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(0x14, 0x21, 0x3D));
        root.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        web = new WebView(this);
        web.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        web.setBackgroundColor(Color.rgb(0xF4, 0xF6, 0xFA));
        root.addView(web);
        root.addView(buildSplash());
        setContentView(root);

        configureWebView();

        /* 상단 알림 채널 · 안드로이드 13+ 알림 권한 · FCM 토큰 미리 받기 */
        PushNotify.ensureChannel(this);
        askNotificationPermission();
        warmPushToken();

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(APP_URL);
        }
    }

    /** 첫 화면이 뜰 때까지 보여 주는 어두운 대기 화면 (흰 화면 깜빡임 방지) */
    private View buildSplash() {
        FrameLayout box = new FrameLayout(this);
        box.setBackgroundColor(Color.rgb(0x14, 0x21, 0x3D));
        box.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        ProgressBar bar = new ProgressBar(this);
        FrameLayout.LayoutParams barLp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT);
        barLp.gravity = Gravity.CENTER;
        barLp.bottomMargin = 90;
        bar.setLayoutParams(barLp);
        box.addView(bar);

        TextView label = new TextView(this);
        label.setText(getString(R.string.loading));
        label.setTextColor(Color.WHITE);
        label.setTextSize(15f);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT);
        lp.gravity = Gravity.CENTER;
        label.setLayoutParams(lp);
        box.addView(label);

        splash = box;
        return box;
    }

    private void hideSplash() {
        if (splash == null || splash.getParent() == null) return;
        final View v = splash;
        splash = null;
        v.animate().alpha(0f).setDuration(180).withEndAction(new Runnable() {
            @Override
            public void run() {
                if (v.getParent() instanceof ViewGroup) {
                    ((ViewGroup) v.getParent()).removeView(v);
                }
            }
        });
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);              // localStorage — 로그인 세션·저장 대기열
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportMultipleWindows(false);        // target=_blank 도 같은 화면에서 열기
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);                        // 휴대폰 글자 크기 설정과 무관하게 화면 유지
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setGeolocationEnabled(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " HanyangPcwApp/1.0");

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);

        /* 웹앱이 로그인 후 FCM 토큰을 push_tokens 에 등록할 수 있게 다리를 놓는다 */
        web.addJavascriptInterface(new AndroidPush(this), "AndroidPush");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                hideSplash();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    showOfflinePage(view);
                }
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                if (failingUrl != null && failingUrl.startsWith("http")) {
                    showOfflinePage(view);
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                return openFileChooser(callback, params);
            }
        });

        web.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition,
                                        String mimeType, long contentLength) {
                startDownload(url, userAgent, contentDisposition, mimeType);
            }
        });
    }

    /* ---------------------------------------------------------------
       푸시 알림 — 채널 · 권한 · 토큰
       --------------------------------------------------------------- */
    private void askNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33) return;   /* 안드로이드 12 이하: 권한 불필요 */
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) return;
        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF_PERM);
    }

    /** 앱을 열 때 FCM 토큰을 미리 받아 두고, 저장된 로그인이 있으면 다시 연결한다 */
    private void warmPushToken() {
        final Context c = getApplicationContext();
        new Thread(new Runnable() {
            @Override public void run() {
                String token = PushApi.fetchToken(c);
                if (token == null) return;
                String worker = PushApi.savedWorker(c);
                if (worker != null && worker.length() > 0) {
                    PushApi.upsert(c, worker, token);
                }
            }
        }, "pcw-push-warm").start();
    }

    /* ---------------------------------------------------------------
       주소 처리: 웹앱·Supabase 는 앱 안에서, tel/mailto/다른 앱 링크는 바깥으로
       --------------------------------------------------------------- */
    private boolean handleUrl(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        if (scheme.equals("http") || scheme.equals("https") || scheme.equals("about")
                || scheme.equals("blob") || scheme.equals("data") || scheme.equals("javascript")) {
            return false; // 앱 안에서 연다
        }
        if (scheme.equals("intent")) {
            try {
                Intent i = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                i.setComponent(null);
                startActivity(i);
            } catch (Exception e) {
                toast(getString(R.string.no_app_for_file));
            }
            return true;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception e) {
            toast(getString(R.string.no_app_for_file));
        }
        return true;
    }

    /* ---------------------------------------------------------------
       파일 선택 — 위험성평가서·시방서 PDF, 사진 업로드
       --------------------------------------------------------------- */
    private boolean openFileChooser(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        if (pendingFileCallback != null) {
            pendingFileCallback.onReceiveValue(null);
            pendingFileCallback = null;
        }
        pendingFileCallback = callback;

        Intent intent = null;
        try {
            if (params != null) intent = params.createIntent();
        } catch (Exception ignored) {
        }
        if (intent == null) {
            intent = new Intent(Intent.ACTION_GET_CONTENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
        }

        try {
            startActivityForResult(intent, REQ_FILE_CHOOSER);
            return true;
        } catch (ActivityNotFoundException e) {
            try {
                Intent fallback = new Intent(Intent.ACTION_GET_CONTENT);
                fallback.addCategory(Intent.CATEGORY_OPENABLE);
                fallback.setType("*/*");
                startActivityForResult(Intent.createChooser(fallback, "파일 선택"), REQ_FILE_CHOOSER);
                return true;
            } catch (Exception e2) {
                pendingFileCallback = null;
                callback.onReceiveValue(null);
                toast(getString(R.string.no_app_for_file));
                return false;
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE_CHOOSER) {
            if (pendingFileCallback != null) {
                Uri[] result = null;
                try {
                    result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
                } catch (Exception ignored) {
                }
                pendingFileCallback.onReceiveValue(result);
                pendingFileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    /* ---------------------------------------------------------------
       PDF·첨부파일 내려받기 / 열기
       --------------------------------------------------------------- */
    private void startDownload(String url, String userAgent, String contentDisposition, String mimeType) {
        if (url == null) return;
        String lower = url.toLowerCase();
        String mime = mimeType == null ? "" : mimeType.toLowerCase();

        if (lower.startsWith("blob:") || lower.startsWith("data:")) {
            toast("이 형식은 앱에서 바로 저장할 수 없습니다. 브라우저에서 열어 주세요.");
            return;
        }
        if (!lower.startsWith("http")) {
            toast(getString(R.string.no_app_for_file));
            return;
        }

        // 현장 PDF 는 설치된 PDF 앱으로 바로 열기 (없으면 내려받기로 넘어감)
        if (mime.contains("pdf") || lower.contains(".pdf")) {
            try {
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(Uri.parse(url), "application/pdf");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(i);
                return;
            } catch (Exception ignored) {
                // 아래 내려받기로
            }
        }

        // 안드로이드 9 이하: 다운로드 폴더에 저장하려면 저장 권한이 필요
        if (Build.VERSION.SDK_INT <= 28
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
            pendingDownload = new String[]{url, userAgent, contentDisposition, mimeType};
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE_PERM);
            return;
        }
        enqueueDownload(url, userAgent, contentDisposition, mimeType);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == REQ_STORAGE_PERM) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            String[] job = pendingDownload;
            pendingDownload = null;
            if (job != null) {
                if (granted) {
                    enqueueDownload(job[0], job[1], job[2], job[3]);
                } else {
                    toast("저장 권한이 없어 내려받을 수 없습니다.");
                }
            }
            return;
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    private void enqueueDownload(String url, String userAgent, String contentDisposition, String mimeType) {
        try {
            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            if (userAgent != null && userAgent.length() > 0) req.addRequestHeader("User-Agent", userAgent);
            if (mimeType != null && mimeType.length() > 0) req.setMimeType(mimeType);
            String name = guessFileName(contentDisposition, url);
            req.setTitle(name);
            req.setDescription("한양 pcw팀 · 현장자료");
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            dm.enqueue(req);
            toast("내려받기를 시작했습니다. 알림을 누르면 열립니다.");
        } catch (Exception e) {
            toast("내려받기에 실패했습니다: " + e.getMessage());
        }
    }

    /** Content-Disposition 헤더나 주소에서 파일 이름 뽑기 (한글 파일명 대응) */
    private String guessFileName(String contentDisposition, String url) {
        String name = null;
        if (contentDisposition != null) {
            String cd = contentDisposition;
            try {
                int i = cd.indexOf("filename*=");
                if (i >= 0) {
                    String part = cd.substring(i + 10);
                    int semi = part.indexOf(';');
                    if (semi >= 0) part = part.substring(0, semi);
                    part = part.trim().replace("\"", "");
                    int q = part.indexOf("''");
                    if (q >= 0) part = part.substring(q + 2);
                    name = URLDecoder.decode(part, "UTF-8");
                } else {
                    int j = cd.indexOf("filename=");
                    if (j >= 0) {
                        String part = cd.substring(j + 9);
                        int semi = part.indexOf(';');
                        if (semi >= 0) part = part.substring(0, semi);
                        name = part.trim().replace("\"", "");
                        try {
                            name = URLDecoder.decode(name, "UTF-8");
                        } catch (UnsupportedEncodingException ignored) {
                        }
                    }
                }
            } catch (Exception ignored) {
            }
        }
        if (name == null || name.trim().length() == 0) {
            try {
                String path = Uri.parse(url).getLastPathSegment();
                if (path != null && path.length() > 0) name = path;
            } catch (Exception ignored) {
            }
        }
        if (name == null || name.trim().length() == 0) name = "한양pcw_파일";
        // 파일 이름에 쓸 수 없는 문자 정리
        name = name.replaceAll("[\\\\/:*?\"<>|\\r\\n]", "_").trim();
        if (name.length() > 120) {
            int dot = name.lastIndexOf('.');
            String ext = dot > 0 && name.length() - dot <= 8 ? name.substring(dot) : "";
            name = name.substring(0, 120 - ext.length()) + ext;
        }
        return name;
    }

    /* ---------------------------------------------------------------
       인터넷이 끊겼을 때 안내 화면
       --------------------------------------------------------------- */
    private void showOfflinePage(WebView view) {
        hideSplash();
        String html = "<!DOCTYPE html><html lang=\"ko\"><head><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                + "<title>연결 없음</title><style>"
                + "html,body{margin:0;height:100%;}"
                + "body{background:#14213D;color:#fff;display:flex;flex-direction:column;"
                + "align-items:center;justify-content:center;text-align:center;padding:28px;"
                + "font-family:-apple-system,BlinkMacSystemFont,'Malgun Gothic',sans-serif;}"
                + "h1{font-size:19px;margin:0 0 10px;}"
                + "p{font-size:14px;line-height:1.6;color:#C7D0E0;margin:0;}"
                + "a{margin-top:26px;display:inline-block;padding:14px 28px;border-radius:14px;"
                + "background:#2F6BFF;color:#fff;text-decoration:none;font-weight:700;font-size:15px;}"
                + ".mark{width:56px;height:56px;border-radius:18px;background:linear-gradient(140deg,#3B82F6,#1D4ED8);"
                + "display:flex;align-items:center;justify-content:center;font-weight:900;font-size:24px;"
                + "margin-bottom:18px;}"
                + "</style></head><body>"
                + "<div class=\"mark\">한</div>"
                + "<h1>인터넷에 연결할 수 없습니다</h1>"
                + "<p>와이파이나 모바일 데이터를 확인한 뒤<br>아래 버튼을 눌러 주세요.</p>"
                + "<a href=\"" + APP_URL + "\">다시 시도</a>"
                + "</body></html>";
        view.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    /* ---------------------------------------------------------------
       생명주기·뒤로가기
       --------------------------------------------------------------- */
    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            ViewGroup parent = (ViewGroup) web.getParent();
            if (parent != null) parent.removeView(web);
            web.stopLoading();
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }
}
