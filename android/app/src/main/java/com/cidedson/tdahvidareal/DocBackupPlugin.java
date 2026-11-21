package com.cidedson.tdahvidareal;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Backup em um arquivo escolhido pelo usuário (ex.: no Google Drive), via seletor de documentos do Android.
 * O app guarda permissão permanente sobre o arquivo para gravar o backup de novo sem perguntar.
 */
@CapacitorPlugin(name = "DocBackup")
public class DocBackupPlugin extends Plugin {

    private static final int RW = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;

    /** Abre "Salvar como" (o usuário escolhe o Drive e a pasta), grava os dados e guarda a permissão. */
    @PluginMethod
    public void createDocument(PluginCall call) {
        if (call.getString("data") == null) {
            call.reject("Sem dados para salvar.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("fileName", "TDAH-Vida-Real-backup.json"));
        intent.addFlags(RW | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "createResult");
    }

    @ActivityCallback
    private void createResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Uri uri = resultUri(result);
        if (uri == null) {
            call.reject("cancelado");
            return;
        }
        try {
            persist(uri);
            write(uri, call.getString("data"));
            JSObject ret = new JSObject();
            ret.put("uri", uri.toString());
            ret.put("name", displayName(uri));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Não consegui salvar: " + e.getMessage());
        }
    }

    /** Grava de novo no arquivo já conectado. */
    @PluginMethod
    public void writeDocument(PluginCall call) {
        String uriStr = call.getString("uri");
        String data = call.getString("data");
        if (uriStr == null || data == null) {
            call.reject("Faltou o arquivo ou os dados.");
            return;
        }
        try {
            Uri uri = Uri.parse(uriStr);
            write(uri, data);
            JSObject ret = new JSObject();
            ret.put("bytes", data.getBytes(StandardCharsets.UTF_8).length);
            call.resolve(ret);
        } catch (SecurityException e) {
            call.reject("Sem permissão para o arquivo. Conecte o Drive de novo.");
        } catch (Exception e) {
            call.reject("Não consegui gravar: " + e.getMessage());
        }
    }

    /** Lê o arquivo já conectado (para conferir o backup). */
    @PluginMethod
    public void readDocument(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) {
            call.reject("Faltou o arquivo.");
            return;
        }
        try {
            JSObject ret = new JSObject();
            ret.put("data", read(Uri.parse(uriStr)));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Não consegui ler: " + e.getMessage());
        }
    }

    /** Abre o seletor para escolher um backup (ex.: no Drive), lê e guarda a permissão. */
    @PluginMethod
    public void openDocument(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "application/json", "text/plain", "application/octet-stream" });
        intent.addFlags(RW | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "openResult");
    }

    @ActivityCallback
    private void openResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Uri uri = resultUri(result);
        if (uri == null) {
            call.reject("cancelado");
            return;
        }
        try {
            boolean writable = persist(uri);
            JSObject ret = new JSObject();
            ret.put("uri", uri.toString());
            ret.put("name", displayName(uri));
            ret.put("writable", writable);
            ret.put("data", read(uri));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Não consegui abrir: " + e.getMessage());
        }
    }

    // ---------- auxiliares ----------

    private Uri resultUri(ActivityResult result) {
        if (result == null || result.getResultCode() != Activity.RESULT_OK) return null;
        Intent data = result.getData();
        return data == null ? null : data.getData();
    }

    /** Guarda permissão permanente. Devolve true se ficou com permissão de escrita. */
    private boolean persist(Uri uri) {
        ContentResolver cr = getContext().getContentResolver();
        try {
            cr.takePersistableUriPermission(uri, RW);
            return true;
        } catch (SecurityException e) {
            try {
                cr.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (SecurityException ignored) {
                // segue com a permissão temporária desta sessão
            }
            return false;
        }
    }

    private void write(Uri uri, String data) throws IOException {
        ContentResolver cr = getContext().getContentResolver();
        byte[] bytes = data.getBytes(StandardCharsets.UTF_8);
        OutputStream os = null;
        try {
            os = cr.openOutputStream(uri, "wt"); // sobrescreve do zero
        } catch (Exception e) {
            os = null;
        }
        if (os == null) os = cr.openOutputStream(uri, "w");
        if (os == null) throw new IOException("arquivo indisponível");
        try {
            os.write(bytes);
            os.flush();
        } finally {
            os.close();
        }
    }

    private String read(Uri uri) throws IOException {
        InputStream is = getContext().getContentResolver().openInputStream(uri);
        if (is == null) throw new IOException("arquivo indisponível");
        try {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
            return new String(bos.toByteArray(), StandardCharsets.UTF_8);
        } finally {
            is.close();
        }
    }

    private String displayName(Uri uri) {
        Cursor c = null;
        try {
            c = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null);
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception ignored) {
            // sem nome
        } finally {
            if (c != null) c.close();
        }
        return "backup.json";
    }
}
