package com.hanyang.pcw;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * 상단 알림(헤드업) 표시 · 알림 채널 관리.
 * 채널 ID pcw_alarm 은 서버(FCM) 메시지의 android.notification.channel_id 와 같아야 한다.
 */
public final class PushNotify {

    static final String CHANNEL_ID = "pcw_alarm";
    static final String CHANNEL_NAME = "현장 알림";

    private PushNotify() {}

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel ch = nm.getNotificationChannel(CHANNEL_ID);
        if (ch == null) {
            ch = new NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("휴무·조퇴 신청, 공지사항, 토요일 출근 조사 알림");
            ch.enableVibration(true);
            ch.setVibrationPattern(new long[]{0, 400, 200, 400});
            ch.setShowBadge(true);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            ch.enableLights(true);
            nm.createNotificationChannel(ch);
        }
        /* 사용자가 채널을 꺼 두지 않았으면 중요도 HIGH 유지 */
        if (ch.getImportance() < NotificationManager.IMPORTANCE_HIGH) {
            try {
                ch.setImportance(NotificationManager.IMPORTANCE_HIGH);
                nm.createNotificationChannel(ch);
            } catch (Exception ignored) { /* 일부 제조사에서만 실패 */ }
        }
    }

    /** 앱이 화면에 떠 있을 때도 상단 알림을 띄운다 */
    static void show(Context c, String title, String body, String kind, String id) {
        ensureChannel(c);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        Intent intent = new Intent(c, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (id != null) intent.putExtra("push_id", id);
        if (kind != null) intent.putExtra("push_kind", kind);
        PendingIntent pi = PendingIntent.getActivity(c, (int) (System.currentTimeMillis() % 100000),
            intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(c, CHANNEL_ID)
            : new Notification.Builder(c);
        b.setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title == null ? "한양 pcw팀" : title)
            .setContentText(body == null ? "" : body)
            .setStyle(new Notification.BigTextStyle().bigText(body == null ? "" : body))
            .setAutoCancel(true)
            .setContentIntent(pi)
            .setPriority(Notification.PRIORITY_HIGH)
            .setDefaults(Notification.DEFAULT_SOUND | Notification.DEFAULT_VIBRATE)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setColor(0xFF14213D);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            b.setCategory(Notification.CATEGORY_MESSAGE);
        }
        try {
            nm.notify((int) (System.currentTimeMillis() % 100000), b.build());
        } catch (Exception ignored) { /* 알림 권한 없음 등 */ }
    }
}
