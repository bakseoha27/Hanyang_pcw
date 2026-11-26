package com.hanyang.pcw;

import android.content.Context;
import android.webkit.JavascriptInterface;

/**
 * WebView ↔ 네이티브 푸시 다리.
 *
 * 웹앱(js/store.js)이 로그인한 기술인의 id 로
 *   window.AndroidPush.syncToken('worker-uuid', '이름')
 * 을 호출하면 이 기기의 FCM 토큰을 push_tokens 에 저장(upsert)한다.
 * 로그아웃 시 window.AndroidPush.clearToken() → 이 기기 토큰 행 삭제.
 *
 * 관리자·팀장 여부와 관계없이 재직 중인 모든 기술인이 등록된다.
 * (휴무/조퇴 알림 발송 대상은 서버에서 관리자·팀장으로만 고른다.)
 */
public class AndroidPush {

    private final Context ctx;

    AndroidPush(Context c) {
        this.ctx = c.getApplicationContext();
    }

    @JavascriptInterface
    public void syncToken(String workerId, String name) {
        if (workerId == null || workerId.trim().length() == 0) return;
        final String wid = workerId.trim();
        final Context c = ctx;
        new Thread(new Runnable() {
            @Override public void run() {
                String token = PushApi.fetchToken(c);
                if (token == null) return;
                PushApi.upsert(c, wid, token);
            }
        }, "pcw-push-sync").start();
    }

    @JavascriptInterface
    public void clearToken() {
        final Context c = ctx;
        new Thread(new Runnable() {
            @Override public void run() {
                String token = PushApi.savedToken(c);
                if (token != null) PushApi.remove(c, token);
                PushApi.saveWorker(c, "");
            }
        }, "pcw-push-clear").start();
    }

    @JavascriptInterface
    public String getToken() {
        String t = PushApi.savedToken(ctx);
        return t == null ? "" : t;
    }

    @JavascriptInterface
    public boolean isReady() {
        return true;
    }
}
