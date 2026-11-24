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
        // No horário de dormir, avisos de remédio e lembrete não tocam (o sino do foco, que a pessoa ligou acordada, toca).
        // "abre" é o lembrete que começa a higiene do sono: toca mesmo no início do horário de dormir.
        if ("alarme".equals(som) && Toques.emSilencio(context)) return;
        final PendingResult pr = goAsync();
        Toques.tocar(context.getApplicationContext(), som, pr::finish);
    }
}
