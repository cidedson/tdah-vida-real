package com.cidedson.tdahvidareal;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DocBackupPlugin.class);
        registerPlugin(AlertaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
