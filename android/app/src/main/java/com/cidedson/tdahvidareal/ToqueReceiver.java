package com.cidedson.tdahvidareal;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Toca o som de alarme na hora do aviso e reagenda os toques depois de reiniciar o celular. */
public class ToqueReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String acao = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(acao) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(acao)) {
            Toques.reagendarTodos(context);
            return;
        }
        if (!Toques.ACAO.equals(acao)) return;
        String som = Toques.aoDisparar(context, intent.getIntExtra("id", 0));
        if (som == null) return; // cancelado nesse meio-tempo
        final PendingResult pr = goAsync();
        Toques.tocar(context.getApplicationContext(), som, pr::finish);
    }
}
