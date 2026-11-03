#!/usr/bin/env python3
"""Packages the design prototype (Main.dc.html) into the app's assets.

Usage: build_web.py <Main.dc.html> <mesh dir with frames/ and body-mesh.json>
Rewrites uploaded-asset addresses to bundled files, so nothing is loaded from the network.
"""
import pathlib
import re
import shutil
import sys

TOOLS = pathlib.Path(__file__).resolve().parent
WEB = TOOLS / 'web'
OUT = TOOLS.parent / 'app/src/main/assets/app'
source = pathlib.Path(sys.argv[1]).read_text()
mesh = pathlib.Path(sys.argv[2])

frames_match = re.search(r'this\.FRAMES = (\[.*?\]);', source, re.S)
ids = re.findall(r'/_blob/([0-9a-f]{32})', frames_match.group(1))
assert len(ids) == 37
for i, blob in enumerate(ids):
    source = source.replace('/_blob/' + blob, 'frames/body-%03d.png' % (i * 5))
source, n = re.subn(r"SHAPES_URL = '/_blob/[0-9a-f]{32}'", "SHAPES_URL = 'body-shapes.json'", source)
assert n == 1, n
source, n = re.subn(r"SPLASH_URL = '/_blob/[0-9a-f]{32}'", "SPLASH_URL = 'somasense-splash.jpg'", source)
assert n == 1, n
source, n = re.subn(r"/_blob/[0-9a-f]{32}", 'body-mesh.json', source)
assert n == 1, n

template = re.search(r'<x-dc>(.*)</x-dc>', source, re.S).group(1)
template = re.sub(r'<helmet>.*?</helmet>', '', template, flags=re.S)
logic = re.search(r'<script type="text/x-dc" data-dc-script[^>]*>(.*?)</script>', source, re.S).group(1)

page = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=390, user-scalable=no">
<title>SomaSense</title>
<style>
@font-face {{ font-family: 'Atkinson Hyperlegible'; font-weight: 400; src: url(atkinson-400.woff2) format('woff2'); }}
@font-face {{ font-family: 'Atkinson Hyperlegible'; font-weight: 700; src: url(atkinson-700.woff2) format('woff2'); }}
html, body {{ margin: 0; height: 100%; overflow: hidden; background: #121622; -webkit-tap-highlight-color: transparent; }}
body {{ -webkit-user-select: none; user-select: none; }}
input, textarea {{ -webkit-user-select: text; user-select: text; }}
</style>
</head>
<body>
<div id="app"></div>
<template id="dc-template">{template}</template>
<script src="preact.umd.js"></script>
<script src="runtime.js"></script>
<script>
{logic}
startApp(Component);
</script>
</body>
</html>
'''

if OUT.exists():
    shutil.rmtree(OUT)
(OUT / 'frames').mkdir(parents=True)
(OUT / 'index.html').write_text(page)
for name in ['preact.umd.js', 'runtime.js', 'atkinson-400.woff2', 'atkinson-700.woff2']:
    shutil.copy(WEB / name, OUT / name)
shutil.copy(mesh / 'body-mesh.json', OUT / 'body-mesh.json')
shutil.copy(mesh / 'body-shapes.json', OUT / 'body-shapes.json')
shutil.copy(mesh.parent / 'brand/somasense-splash.jpg', OUT / 'somasense-splash.jpg')
for f in sorted((mesh / 'frames').glob('body-*.png')):
    shutil.copy(f, OUT / 'frames' / f.name)
print('assets', sum(p.stat().st_size for p in OUT.rglob('*') if p.is_file()) // 1024, 'KB')
