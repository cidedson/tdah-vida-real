package com.cidedson.tdahvidareal;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Canais de notificação do bloco de foco, com o som do sino (res/raw/sino.wav).
 * "foco_alarme" usa o volume de alarme, então toca mesmo com o celular no silencioso.
 */
@CapacitorPlugin(name = "Alerta")
public class AlertaPlugin extends Plugin {

    @PluginMethod
    public void criarCanais(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve();
            return;
        }
        try {
            Context ctx = getContext();
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            Uri som = Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + ctx.getPackageName() + "/raw/sino");
            nm.createNotificationChannel(canal("foco", "Fim do bloco de foco", som, AudioAttributes.USAGE_NOTIFICATION));
            nm.createNotificationChannel(canal("foco_alarme", "Fim do foco (toca no silencioso)", som, AudioAttributes.USAGE_ALARM));
            nm.createNotificationChannel(canal("foco_mudo", "Foco sem som (só vibra)", null, 0));
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

    private NotificationChannel canal(String id, String nome, Uri som, int uso) {
        NotificationChannel c = new NotificationChannel(id, nome, NotificationManager.IMPORTANCE_HIGH);
        c.setDescription("Avisa quando o bloco de foco termina.");
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
}
