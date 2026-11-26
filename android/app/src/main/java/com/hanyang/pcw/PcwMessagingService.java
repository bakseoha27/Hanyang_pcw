package com.hanyang.pcw;

import android.util.Log;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * FCM 수신.
 * - 앱이 화면에 떠 있을 때: 직접 상단 알림을 띄운다.
 * - 앱이 꺼져 있거나 백그라운드일 때: FCM 이 notification 페이로드로 자동 표시한다
 *   (channel_id = pcw_alarm, 중요도 HIGH → 소리·진동).
 */
public class PcwMessagingService extends FirebaseMessagingService {

    private static final String TAG = "PcwPush";

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        PushApi.saveToken(this, token);
        final String worker = PushApi.savedWorker(this);
        if (worker != null && worker.length() > 0) {
            final android.content.Context app = getApplicationContext();
            new Thread(new Runnable() {
                @Override public void run() { PushApi.upsert(app, worker, token); }
            }).start();
        }
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage msg) {
        super.onMessageReceived(msg);

        String title = null;
        String body = null;
        if (msg.getNotification() != null) {
            title = msg.getNotification().getTitle();
            body = msg.getNotification().getBody();
        }
        Map<String, String> data = msg.getData();
        if ((title == null || title.length() == 0) && data != null) {
            title = data.get("title");
            body = data.get("body");
        }
        if (title == null || title.length() == 0) title = "한양 pcw팀 알림";
        if (body == null) body = "";

        String kind = data != null ? data.get("kind") : null;
        String id = data != null ? data.get("id") : null;
        Log.i(TAG, "푸시 수신: " + title);
        PushNotify.show(this, title, body, kind, id);
    }
}
