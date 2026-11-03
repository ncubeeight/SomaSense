package com.symptomtracker.draft;

import android.animation.ArgbEvaluator;
import android.animation.ValueAnimator;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.window.OnBackInvokedDispatcher;

import java.io.IOException;
import java.io.InputStream;
import java.util.Map;

/** Hosts the prototype in a WebView, serving every file from the APK's assets. */
public class MainActivity extends Activity {
    private static final String HOST = "app.symptomtracker.invalid";
    private static final int SPLASH_COLOR = Color.parseColor("#121622");
    private static final int GROUND_COLOR = Color.parseColor("#F3F6F6");
    private static final long SPLASH_FADE_MS = 1000;
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

    private final class Shell {
        @JavascriptInterface
        public void splashFading() {
            runOnUiThread(MainActivity.this::endSplash);
        }
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
