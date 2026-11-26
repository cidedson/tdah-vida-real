package com.cidedson.tdahvidareal;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONObject;

import java.util.Calendar;
import java.util.Map;

/**
 * Toque pelo volume de ALARME, tocado pelo próprio app, como faz o relógio.
 *
 * Por que não usar só o som do canal de notificação: em vários celulares (Samsung, principalmente)
 * o canal com AudioAttributes.USAGE_ALARM continua mudo no modo silencioso. Um MediaPlayer com
 * USAGE_ALARM toca pelo volume de alarme, que o silencioso e o vibrar não zeram.
 *
 * Cada toque tem o mesmo id da notificação que ele acompanha. Fica salvo em SharedPreferences
 * para voltar depois de reiniciar o celular.
 *   rep "uma": uma vez, em "at" (ms)
 *   rep "dia": todo dia em hora:minuto
 *   rep "semana": toda semana no "dia" (Calendar.DAY_OF_WEEK: 1 = domingo) em hora:minuto
 *   som "alarme" (padrão), "sino" (foco e rotina guiada) ou "abre" (o lembrete que começa a higiene do sono)
 */
final class Toques {
    static final String ACAO = "com.cidedson.tdahvidareal.TOQUE";
    private static final String PREFS = "toques";

    private Toques() {}

    static void agendar(Context ctx, JSONObject item) throws Exception {
        int id = item.getInt("id");
        prefs(ctx).edit().putString("t" + id, item.toString()).apply();
        long quando = proxima(item, System.currentTimeMillis());
        if (quando <= 0) {
            cancelar(ctx, id);
            return;
        }
        marcar(ctx, id, quando);
    }

    static void cancelar(Context ctx, int id) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        am.cancel(intencao(ctx, id));
        prefs(ctx).edit().remove("t" + id).apply();
    }

    /** Depois de reiniciar o celular ou atualizar o app. */
    static void reagendarTodos(Context ctx) {
        long agora = System.currentTimeMillis();
        for (Map.Entry<String, ?> e : prefs(ctx).getAll().entrySet()) {
            try {
                JSONObject item = new JSONObject(String.valueOf(e.getValue()));
                long quando = proxima(item, agora);
                if (quando > 0) marcar(ctx, item.getInt("id"), quando);
                else prefs(ctx).edit().remove(e.getKey()).apply();
            } catch (Exception ex) {
                prefs(ctx).edit().remove(e.getKey()).apply();
            }
        }
    }

    /** Chamado quando o alarme dispara: agenda a próxima vez (ou apaga, se era uma vez só). Devolve o som. */
    static String aoDisparar(Context ctx, int id) {
        String salvo = prefs(ctx).getString("t" + id, null);
        if (salvo == null) return null;
        try {
            JSONObject item = new JSONObject(salvo);
            if ("uma".equals(item.optString("rep", "uma"))) prefs(ctx).edit().remove("t" + id).apply();
            else {
                long quando = proxima(item, System.currentTimeMillis() + 30000);
                if (quando > 0) marcar(ctx, id, quando);
            }
            return item.optString("som", "alarme");
        } catch (Exception e) {
            prefs(ctx).edit().remove("t" + id).apply();
            return "alarme";
        }
    }

    static long proxima(JSONObject item, long agora) {
        String rep = item.optString("rep", "uma");
        if ("uma".equals(rep)) {
            long at = item.optLong("at", 0);
            return at > agora - 60000 ? Math.max(at, agora + 500) : 0;
        }
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(agora);
        c.set(Calendar.HOUR_OF_DAY, item.optInt("hora", 8));
        c.set(Calendar.MINUTE, item.optInt("minuto", 0));
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        int dia = item.optInt("dia", 0);
        for (int i = 0; i < 9; i++) {
            boolean diaCerto = !"semana".equals(rep) || dia < 1 || c.get(Calendar.DAY_OF_WEEK) == dia;
            if (c.getTimeInMillis() > agora && diaCerto) return c.getTimeInMillis();
            c.add(Calendar.DAY_OF_MONTH, 1);
        }
        return 0;
    }

    private static void marcar(Context ctx, int id, long quando) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = intencao(ctx, id);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, quando, pi);
            } else {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, quando, pi);
            }
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, quando, pi);
        }
    }

    private static PendingIntent intencao(Context ctx, int id) {
        Intent i = new Intent(ctx, ToqueReceiver.class).setAction(ACAO).putExtra("id", id);
        return PendingIntent.getBroadcast(ctx, id, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    // ---------- Horário de dormir ----------
    private static final String CFG = "toques_cfg";

    static void salvarSilencio(Context ctx, boolean ligado, int de, int ate) {
        ctx.getSharedPreferences(CFG, Context.MODE_PRIVATE).edit().putBoolean("ligado", ligado).putInt("de", de).putInt("ate", ate).apply();
    }

    /** Agora está dentro do horário de dormir? (o intervalo pode passar da meia-noite) */
    static boolean emSilencio(Context ctx) {
        SharedPreferences c = ctx.getSharedPreferences(CFG, Context.MODE_PRIVATE);
        if (!c.getBoolean("ligado", false)) return false;
        int de = c.getInt("de", 23 * 60), ate = c.getInt("ate", 7 * 60);
        Calendar agora = Calendar.getInstance();
        int m = agora.get(Calendar.HOUR_OF_DAY) * 60 + agora.get(Calendar.MINUTE);
        if (de == ate) return false;
        return de < ate ? (m >= de && m < ate) : (m >= de || m < ate);
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Toca o som uma vez pelo volume de alarme e chama "fim" ao terminar (ou depois de 9 s). */
    static Runnable tocar(Context ctx, String som, Runnable fim) {
        return tocar(ctx, som, fim, 9000);
    }

    private static Runnable pararPrevia;

    /** Prévia do volume de alarme: toca "ms" milissegundos e corta a prévia anterior, se ainda estiver tocando. */
    static synchronized void previa(Context ctx, String som, long ms) {
        if (pararPrevia != null) pararPrevia.run();
        final Runnable[] esta = new Runnable[1];
        esta[0] = tocar(ctx, som, () -> {
            synchronized (Toques.class) { if (pararPrevia == esta[0]) pararPrevia = null; }
        }, ms);
        pararPrevia = esta[0];
    }

    /** Toca pelo volume de alarme por até "maxMs" e devolve o que para o som. */
    static Runnable tocar(Context ctx, String som, Runnable fim, long maxMs) {
        Handler h = new Handler(Looper.getMainLooper());
        final boolean[] acabou = {false};
        final MediaPlayer mp = new MediaPlayer();
        Runnable encerrar = () -> {
            if (acabou[0]) return;
            acabou[0] = true;
            try { mp.release(); } catch (Exception e) { /* já liberado */ }
            if (fim != null) fim.run();
        };
        try {
            mp.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
            AssetFileDescriptor afd = ctx.getResources().openRawResourceFd("sino".equals(som) ? R.raw.sino : R.raw.alarme);
            mp.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            afd.close();
            mp.setOnCompletionListener(m -> encerrar.run());
            mp.setOnErrorListener((m, a, b) -> { encerrar.run(); return true; });
            mp.prepare();
            mp.start();
            h.postDelayed(encerrar, maxMs);
        } catch (Exception e) {
            encerrar.run();
        }
        return encerrar;
    }
}
