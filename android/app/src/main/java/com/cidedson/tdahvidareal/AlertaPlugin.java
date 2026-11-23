package com.cidedson.tdahvidareal;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Canais de notificação com som próprio e o "Não perturbe" do bloco de foco.
 *
 * Canais que terminam em "_alarme" usam o volume de ALARME (AudioAttributes.USAGE_ALARM):
 * tocam mesmo com o celular no silencioso ou no vibrar, e passam pelo Não perturbe
 * quando ele deixa os alarmes tocarem (o padrão do Android).
 */
@CapacitorPlugin(name = "Alerta")
public class AlertaPlugin extends Plugin {

    private static final String PREFS = "nao_perturbe";
    private static final int REQ_FIM = 7301;

    @PluginMethod
    public void criarCanais(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve();
            return;
        }
        try {
            Context ctx = getContext();
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            Uri sino = recurso(ctx, "sino");
            Uri alarme = recurso(ctx, "alarme");
            Uri padrao = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

            nm.createNotificationChannel(canal("foco", "Fim do bloco de foco", "Avisa quando o bloco de foco termina.", sino, AudioAttributes.USAGE_NOTIFICATION));
            nm.createNotificationChannel(canal("foco_alarme", "Fim do foco (toca no silencioso)", "Avisa quando o bloco de foco termina, pelo volume de alarme.", sino, AudioAttributes.USAGE_ALARM));
            nm.createNotificationChannel(canal("foco_mudo", "Foco sem som (só vibra)", "Avisos do foco que só vibram.", null, 0));
            nm.createNotificationChannel(canal("remedios_alarme", "Remédios e água (toca no silencioso)", "Horários de remédios e água, pelo volume de alarme.", alarme, AudioAttributes.USAGE_ALARM));
            nm.createNotificationChannel(canal("lembretes", "Tarefas e lembretes", "Lembretes, tarefas com horário e rotinas.", padrao, AudioAttributes.USAGE_NOTIFICATION));
            nm.createNotificationChannel(canal("lembretes_alarme", "Tarefas e lembretes (toca no silencioso)", "Lembretes, tarefas com horário e rotinas, pelo volume de alarme.", alarme, AudioAttributes.USAGE_ALARM));

            NotificationChannel fixo = new NotificationChannel("fixo", "Próximo (fixo na barra)", NotificationManager.IMPORTANCE_DEFAULT);
            fixo.setDescription("Mostra o próximo remédio ou passo até você concluir. Não toca nem vibra.");
            fixo.setSound(null, null);
            fixo.enableVibration(false);
            fixo.setShowBadge(false);
            nm.createNotificationChannel(fixo);
            call.resolve();
        } catch (Exception e) {
            call.reject("Não consegui criar os canais de aviso: " + e.getMessage());
        }
    }

    private static Uri recurso(Context ctx, String nome) {
        return Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + ctx.getPackageName() + "/raw/" + nome);
    }

    private NotificationChannel canal(String id, String nome, String descricao, Uri som, int uso) {
        NotificationChannel c = new NotificationChannel(id, nome, NotificationManager.IMPORTANCE_HIGH);
        c.setDescription(descricao);
        c.enableVibration(true);
        c.setVibrationPattern(new long[] {0, 400, 200, 400, 200, 600});
        if (som != null) {
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(uso)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            c.setSound(som, attrs);
        } else {
            c.setSound(null, null);
        }
        return c;
    }

    // ---------- Volume de alarme ----------

    @PluginMethod
    public void volumeAlarme(PluginCall call) {
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        JSObject r = new JSObject();
        r.put("vol", am.getStreamVolume(AudioManager.STREAM_ALARM));
        r.put("max", am.getStreamMaxVolume(AudioManager.STREAM_ALARM));
        int modo = am.getRingerMode();
        r.put("modo", modo == AudioManager.RINGER_MODE_SILENT ? "silencioso" : modo == AudioManager.RINGER_MODE_VIBRATE ? "vibrar" : "normal");
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        r.put("naoPerturbe", nm.getCurrentInterruptionFilter() != NotificationManager.INTERRUPTION_FILTER_ALL);
        call.resolve(r);
    }

    @PluginMethod
    public void subirVolumeAlarme(PluginCall call) {
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            double fracao = call.getDouble("fracao", 0.7);
            int max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM);
            int alvo = (int) Math.max(1, Math.round(max * fracao));
            if (am.getStreamVolume(AudioManager.STREAM_ALARM) < alvo) am.setStreamVolume(AudioManager.STREAM_ALARM, alvo, AudioManager.FLAG_SHOW_UI);
            JSObject r = new JSObject();
            r.put("vol", am.getStreamVolume(AudioManager.STREAM_ALARM));
            r.put("max", max);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Não consegui mudar o volume: " + e.getMessage());
        }
    }

    // ---------- Não perturbe durante o foco ----------

    @PluginMethod
    public void acessoNaoPerturbe(PluginCall call) {
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        JSObject r = new JSObject();
        r.put("ok", nm.isNotificationPolicyAccessGranted());
        call.resolve(r);
    }

    @PluginMethod
    public void pedirAcessoNaoPerturbe(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Não consegui abrir a tela de acesso ao Não perturbe: " + e.getMessage());
        }
    }

    /** Liga o Não perturbe (modo Prioridade, que respeita as exceções da pessoa) até "ate" (ms). */
    @PluginMethod
    public void ligarNaoPerturbe(PluginCall call) {
        Context ctx = getContext();
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        JSObject r = new JSObject();
        if (!nm.isNotificationPolicyAccessGranted()) {
            r.put("ok", false);
            call.resolve(r);
            return;
        }
        long ate = call.getLong("ate", 0L);
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean nosso = sp.getBoolean("ativo", false);
        // Se a pessoa já estava com o Não perturbe ligado, o app não mexe (nem liga, nem desliga depois).
        if (!nosso && nm.getCurrentInterruptionFilter() != NotificationManager.INTERRUPTION_FILTER_ALL) {
            r.put("ok", true);
            r.put("jaLigado", true);
            call.resolve(r);
            return;
        }
        sp.edit().putBoolean("ativo", true).putLong("ate", ate).apply();
        nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_PRIORITY);
        if (ate > System.currentTimeMillis()) agendarFim(ctx, ate);
        r.put("ok", true);
        call.resolve(r);
    }

    @PluginMethod
    public void desligarNaoPerturbe(PluginCall call) {
        restaurar(getContext());
        call.resolve();
    }

    private static PendingIntent intencaoFim(Context ctx) {
        Intent i = new Intent(ctx, NaoPerturbeReceiver.class);
        return PendingIntent.getBroadcast(ctx, REQ_FIM, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void agendarFim(Context ctx, long ate) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = intencaoFim(ctx);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ate, pi);
            } else {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ate, pi);
            }
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, ate, pi);
        }
    }

    /** Desliga o Não perturbe que o foco ligou, se a pessoa não mexeu nele no meio. */
    static void restaurar(Context ctx) {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        am.cancel(intencaoFim(ctx));
        if (!sp.getBoolean("ativo", false)) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        try {
            if (nm.isNotificationPolicyAccessGranted() && nm.getCurrentInterruptionFilter() == NotificationManager.INTERRUPTION_FILTER_PRIORITY) {
                nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALL);
            }
        } catch (Exception e) {
            // sem acesso: deixa como está
        }
        sp.edit().putBoolean("ativo", false).apply();
    }
}
