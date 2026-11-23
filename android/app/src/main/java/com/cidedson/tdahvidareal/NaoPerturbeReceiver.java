package com.cidedson.tdahvidareal;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Desliga o Não perturbe no fim do bloco de foco, mesmo com o app fechado. */
public class NaoPerturbeReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        AlertaPlugin.restaurar(context);
    }
}
