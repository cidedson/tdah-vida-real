package com.cidedson.tdahvidareal;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Botão "Parar o som" (ou tocar/arrastar a notificação): para o alarme que está tocando. */
public class PararSomReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Toques.parar(context.getApplicationContext());
    }
}
