package com.symptomtracker.draft;

import android.animation.ArgbEvaluator;
import android.animation.ValueAnimator;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Bundle;
import android.util.AtomicFile;
import android.util.Base64;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.widget.Toast;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.window.OnBackInvokedDispatcher;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Map;

/** Hosts the prototype in a WebView, serving every file from the APK's assets. */
public class MainActivity extends Activity {
    private static final String HOST = "app.symptomtracker.invalid";
    private static final int SPLASH_COLOR = Color.parseColor("#121622");
    private static final int GROUND_COLOR = Color.parseColor("#F3F6F6");
    private static final long SPLASH_FADE_MS = 1000;
    private static final int SAVE_PDF = 1;
    private File pendingSave;
    private WebView web;
    private FrameLayout frame;
    private boolean splashEnded;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setTextZoom(100);
        settings.setDomStorageEnabled(true);
        web.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        web.setWebViewClient(new AssetClient());
        web.setBackgroundColor(SPLASH_COLOR);
        // Only the bundled pages load here; navigation elsewhere is sent to the browser.
        web.addJavascriptInterface(new Shell(), "AppShell");
        // The app draws edge to edge, so keep content clear of the status bar, gesture bar and keyboard.
        frame = new FrameLayout(this);
        frame.setBackgroundColor(SPLASH_COLOR);
        frame.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        frame.setOnApplyWindowInsetsListener((view, insets) -> {
            Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsets.Type.ime());
            view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            return WindowInsets.CONSUMED;
        });
        setContentView(frame);
        getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                () -> web.evaluateJavascript("window.appBack ? window.appBack() : false", result -> {
                    if (!"true".equals(result)) finish();
                }));
        web.loadUrl("https://" + HOST + "/index.html");
    }

    /** Lets the system bars fade from the opening image's dark color to the app's light one. */
    private void endSplash() {
        if (splashEnded) return;
        splashEnded = true;
        web.setBackgroundColor(GROUND_COLOR);
        ValueAnimator fade = ValueAnimator.ofObject(new ArgbEvaluator(), SPLASH_COLOR, GROUND_COLOR);
        fade.setDuration(SPLASH_FADE_MS);
        fade.addUpdateListener(a -> frame.setBackgroundColor((int) a.getAnimatedValue()));
        fade.start();
        int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
        frame.postDelayed(() -> getWindow().getInsetsController().setSystemBarsAppearance(light, light), SPLASH_FADE_MS / 2);
    }

    private AtomicFile dataFile() {
        return new AtomicFile(new File(getFilesDir(), "somasense-log.json"));
    }

    private final class Shell {
        @JavascriptInterface
        public void splashFading() {
            runOnUiThread(MainActivity.this::endSplash);
        }

        /** The saved log, or an empty string before anything has been saved. */
        @JavascriptInterface
        public String readData() throws IOException {
            AtomicFile file = dataFile();
            if (!file.getBaseFile().exists()) return "";
            return new String(file.readFully(), StandardCharsets.UTF_8);
        }

        @JavascriptInterface
        public boolean writeData(String json) {
            AtomicFile file = dataFile();
            FileOutputStream out = null;
            try {
                out = file.startWrite();
                out.write(json.getBytes(StandardCharsets.UTF_8));
                file.finishWrite(out);
                return true;
            } catch (IOException e) {
                if (out != null) file.failWrite(out);
                return false;
            }
        }

        /** Keeps an unreadable log on the device instead of letting new saves replace it. */
        @JavascriptInterface
        public void setAsideData() {
            File base = dataFile().getBaseFile();
            base.renameTo(new File(base.getParentFile(), "somasense-log-unreadable-" + System.currentTimeMillis() + ".json"));
        }

        /** Removes the log, its backup, any set-aside copies and any shared files. */
        @JavascriptInterface
        public boolean clearData() {
            dataFile().delete();
            boolean gone = !dataFile().getBaseFile().exists();
            File[] files = getFilesDir().listFiles((dir, name) -> name.startsWith("somasense-log"));
            if (files != null) for (File f : files) gone &= f.delete();
            clearShareFiles();
            return gone;
        }

        @JavascriptInterface
        public boolean sharePdf(String subject, String body, String baseName, String pdfBase64) {
            clearShareFiles();
            File pdf = shareFile(new File(baseName).getName() + ".pdf", pdfBase64);
            if (pdf == null) return false;
            Uri uri = shareUri(pdf);
            Intent send = new Intent(Intent.ACTION_SEND)
                    .setType("application/pdf")
                    .putExtra(Intent.EXTRA_SUBJECT, subject)
                    .putExtra(Intent.EXTRA_TEXT, body)
                    .putExtra(Intent.EXTRA_STREAM, uri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            send.setClipData(ClipData.newRawUri(pdf.getName(), uri));
            runOnUiThread(() -> startActivity(Intent.createChooser(send, subject)));
            return true;
        }

        /** Opens Android's file picker; the PDF is written once the person chooses where it goes. */
        @JavascriptInterface
        public boolean savePdf(String baseName, String pdfBase64) {
            clearShareFiles();
            File pdf = shareFile(new File(baseName).getName() + ".pdf", pdfBase64);
            if (pdf == null) return false;
            pendingSave = pdf;
            Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("application/pdf")
                    .putExtra(Intent.EXTRA_TITLE, pdf.getName());
            runOnUiThread(() -> startActivityForResult(save, SAVE_PDF));
            return true;
        }

        @JavascriptInterface
        public boolean shareLog(String subject, String body, String baseName, String calendarBase64, String pdfBase64) {
            clearShareFiles();
            String name = new File(baseName).getName();
            File picture = shareFile(name + "-calendar.png", calendarBase64);
            File pdf = shareFile(name + ".pdf", pdfBase64);
            if (picture == null || pdf == null) return false;
            ArrayList<Uri> uris = new ArrayList<>();
            uris.add(shareUri(picture));
            uris.add(shareUri(pdf));
            ClipData clip = ClipData.newRawUri(name, uris.get(0));
            clip.addItem(new ClipData.Item(uris.get(1)));
            Intent send = new Intent(Intent.ACTION_SEND_MULTIPLE)
                    .setType("*/*")
                    .putExtra(Intent.EXTRA_SUBJECT, subject)
                    .putExtra(Intent.EXTRA_TEXT, body)
                    .putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            send.setClipData(clip);
            runOnUiThread(() -> startActivity(Intent.createChooser(send, subject)));
            return true;
        }
    }

    private File shareFile(String name, String base64) {
        File dir = new File(getCacheDir(), ShareProvider.DIR);
        dir.mkdirs();
        File file = new File(dir, name);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(Base64.decode(base64, Base64.DEFAULT));
            return file;
        } catch (IOException e) {
            return null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != SAVE_PDF || pendingSave == null) return;
        File pdf = pendingSave;
        pendingSave = null;
        if (resultCode == RESULT_OK && data != null && data.getData() != null) {
            boolean saved = false;
            try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                if (out != null) {
                    Files.copy(pdf.toPath(), out);
                    saved = true;
                }
            } catch (IOException e) {
                saved = false;
            }
            Toast.makeText(this, saved ? "PDF saved" : "The PDF could not be saved", Toast.LENGTH_LONG).show();
        }
        pdf.delete();
    }

    private Uri shareUri(File file) {
        return new Uri.Builder().scheme("content").authority(ShareProvider.authority(this)).appendPath(file.getName()).build();
    }

    private void clearShareFiles() {
        File[] old = new File(getCacheDir(), ShareProvider.DIR).listFiles();
        if (old != null) for (File f : old) f.delete();
    }

    private final class AssetClient extends WebViewClient {
        private final Map<String, String> types = Map.of("js", "text/javascript", "json", "application/json", "woff2", "font/woff2");

        // Links leave the app: this WebView only ever shows the bundled pages.
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (HOST.equals(url.getHost())) return false;
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, url));
            } catch (ActivityNotFoundException e) {
                // No browser on the device; the link simply does nothing.
            }
            return true;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (!HOST.equals(url.getHost())) return blocked();
            String path = url.getPath() == null ? "" : url.getPath().substring(1);
            String ext = MimeTypeMap.getFileExtensionFromUrl(path);
            String type = types.containsKey(ext) ? types.get(ext) : MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
            try {
                InputStream in = getAssets().open("app/" + path);
                return new WebResourceResponse(type, "utf-8", in);
            } catch (IOException e) {
                return blocked();
            }
        }

        private WebResourceResponse blocked() {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", Map.of(), null);
        }
    }
}
