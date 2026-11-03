# SomaSense

A calendar tool for logging symptoms and sensations felt across the body. Mark points on a 3D body map, add details, then review them by day and by symptom type.

**Status: early draft.** The Android app wraps the design prototype in a WebView, with no internet permission and no cloud backup. Reports and symptom-free days are saved to a file in the app's private storage, the Calendar can share a month as a calendar picture and PDF, and Settings can delete everything stored on the device.

The Share PDF button on the Reports tab is still a placeholder. The prototype in `design/` keeps sample data and a fixed date so its screens stay populated for review.

## Layout

| Path | What it holds |
|---|---|
| `app/` | Android app, including the packaged web assets in `src/main/assets/app` |
| `design/project/` | Prototype source; `Main.dc.html` holds the screens and logic |
| `tools/build_web.py`, `tools/web/` | Packages the prototype into the app's assets |
| `body-model/mesh/` | Body build scripts, mesh, shape offsets and rendered rotation frames |
| `body-model/brand/` | Opening screen image |

## Build

Requires JDK 17 or later, and the Android SDK (`local.properties` points to it). minSdk is 33.

```bash
./gradlew :app:assembleDebug
```

After changing the prototype, package it again before building:

```bash
python3 tools/build_web.py design/project/Main.dc.html body-model/mesh
```

## Body model

The body comes from [MakeHuman](https://github.com/makehumancommunity/makehuman) data, which isn't stored here. To rebuild it, download MakeHuman and run these from `body-model/mesh`, using its `makehuman/data` folder:

```bash
node build.js <makehuman data dir> body.json
```

```bash
node bake-shapes.js <makehuman data dir> <scratch dir>
```

`export-and-test.js` writes the mesh the app loads, and `render.js` draws a rotation frame.

## Credits

Authored by ncubeeight LLC. Body models are provided by MakeHuman; its body data is released under CC0, as its [license](https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md) explains. The app bundles [Preact](https://preactjs.com) (MIT, see `tools/web/preact-LICENSE.txt`) and the Atkinson Hyperlegible font (SIL Open Font License, see `tools/web/atkinson-OFL.txt`).

## License

Licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for third-party material, which keeps its own terms.
