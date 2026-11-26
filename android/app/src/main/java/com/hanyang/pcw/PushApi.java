package com.hanyang.pcw;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import com.google.android.gms.tasks.Tasks;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.TimeUnit;

/**
 * FCM 토큰 ↔ Supabase push_tokens 연결.
 *
 * - 토큰은 기기(SharedPreferences)에 저장하고, 로그인한 기술인(worker_id)이 있으면
 *   push_tokens 테이블에 upsert 한다. (관리자·팀장뿐 아니라 재직 중인 모든 기술인)
 * - 로그아웃하면 이 기기의 토큰 행을 지운다.
 */
public final class PushApi {

    static final String SUPABASE_URL = "https://vmsqlnmetmxpgrjnhmml.supabase.co";
    static final String ANON_KEY =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtc3Fsbm1ldG14cGdyam5obW1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2MjY2MzMsImV4cCI6MjExMTIwMjYzM30.Ut8WFZ9Qmbw6Z0YIa7x8Q9NsAMVAVGFkn8-dtkrzkJA";

    private static final String PREF = "pcw_push";
    private static final String K_TOKEN = "fcm_token";
    private static final String K_WORKER = "worker_id";
    private static final String TAG = "PcwPush";

    private PushApi() {}

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREF, Context.MODE_PRIVATE);
    }

    static String savedToken(Context c) {
        return prefs(c).getString(K_TOKEN, null);
    }

    static String savedWorker(Context c) {
        return prefs(c).getString(K_WORKER, null);
    }

    static void saveToken(Context c, String token) {
        if (token == null || token.length() == 0) return;
        prefs(c).edit().putString(K_TOKEN, token).apply();
    }

    static void saveWorker(Context c, String workerId) {
        prefs(c).edit().putString(K_WORKER, workerId == null ? "" : workerId).apply();
    }

    /** FCM 등록 토큰 (없으면 발급 요청). 반드시 백그라운드 스레드에서 호출 */
    static String fetchToken(Context c) {
        String t = savedToken(c);
        if (t != null && t.length() > 0) return t;
        try {
            t = Tasks.await(FirebaseMessaging.getInstance().getToken(), 15, TimeUnit.SECONDS);
            saveToken(c, t);
            return t;
        } catch (Exception e) {
            Log.w(TAG, "FCM 토큰 발급 실패: " + e);
            return null;
        }
    }

    /** 토큰을 worker_id 에 연결해 저장(upsert). 백그라운드 스레드에서 호출 */
    static boolean upsert(Context c, String workerId, String token) {
        if (workerId == null || workerId.length() == 0) return false;
        if (token == null || token.length() == 0) return false;
        try {
            JSONObject row = new JSONObject();
            row.put("worker_id", workerId);
            row.put("token", token);
            row.put("platform", "android");
            row.put("updated_at", isoNow());
            JSONArray body = new JSONArray();
            body.put(row);

            HttpURLConnection con = open("/rest/v1/push_tokens?on_conflict=token", "POST");
            con.setRequestProperty("Prefer", "resolution=merge-duplicates,return=minimal");
            write(con, body.toString());
            int code = con.getResponseCode();
            con.disconnect();
            if (code >= 200 && code < 300) {
                saveWorker(c, workerId);
                Log.i(TAG, "push_tokens 저장 완료 (" + code + ")");
                return true;
            }
            Log.w(TAG, "push_tokens 저장 실패 HTTP " + code + " " + readError(con));
        } catch (Exception e) {
            Log.w(TAG, "push_tokens 저장 오류: " + e);
        }
        return false;
    }

    /** 이 기기 토큰 행 삭제 (로그아웃) */
    static void remove(Context c, String token) {
        if (token == null || token.length() == 0) return;
        try {
            HttpURLConnection con = open(
                "/rest/v1/push_tokens?token=eq." + URLEncoder.encode(token, "UTF-8"), "DELETE");
            con.setRequestProperty("Prefer", "return=minimal");
            con.getResponseCode();
            con.disconnect();
        } catch (Exception e) {
            Log.w(TAG, "push_tokens 삭제 오류: " + e);
        }
        saveWorker(c, "");
    }

    private static HttpURLConnection open(String path, String method) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(SUPABASE_URL + path).openConnection();
        con.setRequestMethod(method);
        con.setConnectTimeout(8000);
        con.setReadTimeout(8000);
        con.setRequestProperty("apikey", ANON_KEY);
        con.setRequestProperty("Authorization", "Bearer " + ANON_KEY);
        con.setRequestProperty("Content-Type", "application/json");
        return con;
    }

    private static void write(HttpURLConnection con, String body) throws Exception {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        con.setDoOutput(true);
        con.setFixedLengthStreamingMode(bytes.length);
        OutputStream os = con.getOutputStream();
        os.write(bytes);
        os.close();
    }

    private static String readError(HttpURLConnection con) {
        try {
            InputStream is = con.getErrorStream();
            if (is == null) return "";
            byte[] buf = new byte[512];
            int n = is.read(buf);
            is.close();
            return n > 0 ? new String(buf, 0, n, StandardCharsets.UTF_8) : "";
        } catch (Exception e) {
            return "";
        }
    }

    private static String isoNow() {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date());
    }
}
