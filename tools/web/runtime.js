// Small runtime for the prototype's template: holes, sc-if, sc-for and events, rendered with Preact.
(function () {
  const { h, render, Component: PreactComponent } = window.preact;
  const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  const WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
  const INPUT_EVENT = { onchange: 'oninput' };

  function lookup(path, scope) {
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    let v = scope;
    for (const part of path.split('.')) {
      if (v === null || v === undefined) return undefined;
      v = v[part];
    }
    return v;
  }
  const text = (s, scope) => s.replace(HOLE, (_, p) => {
    const v = lookup(p, scope);
    return v === null || v === undefined ? '' : String(v);
  });
  const value = (s, scope) => {
    const m = WHOLE.exec(s);
    return m ? lookup(m[1], scope) : text(s, scope);
  };

  function walkChildren(node, scope) {
    const out = [];
    node.childNodes.forEach((c) => {
      const r = walk(c, scope);
      if (Array.isArray(r)) out.push(...r);
      else if (r !== null && r !== undefined) out.push(r);
    });
    return out;
  }

  function walk(node, scope) {
    if (node.nodeType === 3) {
      if (/^\s*$/.test(node.nodeValue) && node.nodeValue.includes('\n')) return null;
      return value(node.nodeValue, scope);
    }
    if (node.nodeType !== 1) return null;
    const tag = node.localName;
    if (tag === 'sc-if') return value(node.getAttribute('value'), scope) ? walkChildren(node, scope) : null;
    if (tag === 'sc-for') {
      const list = value(node.getAttribute('list'), scope) || [];
      const as = node.getAttribute('as');
      const out = [];
      list.forEach((item, i) => {
        const kids = walkChildren(node, { ...scope, [as]: item, $index: i });
        kids.forEach((k, j) => out.push(k && k.props ? window.preact.cloneElement(k, { key: i + ':' + j }) : k));
      });
      return out;
    }
    const props = {};
    for (const a of node.attributes) {
      if (a.name.startsWith('on')) props[INPUT_EVENT[a.name] || a.name] = value(a.value, scope);
      else if (a.name === 'for') props.htmlFor = a.value;
      else props[a.name] = value(a.value, scope);
    }
    return h(tag, props, ...walkChildren(node, scope));
  }

  const root = document.getElementById('dc-template').content.querySelector('[data-root]') || document.getElementById('dc-template').content;

  // Base class the prototype's logic extends.
  window.DCLogic = class extends PreactComponent {
    render() {
      const scope = this.renderVals();
      const kids = walkChildren(root, scope);
      return kids.length === 1 ? kids[0] : h('div', null, ...kids);
    }
  };

  window.appSplashFade = function () {
    document.documentElement.style.background = '#F3F6F6';
    document.body.style.background = '#F3F6F6';
    if (window.AppShell) window.AppShell.splashFading();
  };

  window.startApp = function (Logic) {
    const mount = document.getElementById('app');
    let ref = null;
    const draw = () => render(h(Logic, { startScreen: 'home', live: true, phoneH: window.innerHeight, ref: (c) => { if (c) ref = c; } }), mount);
    window.addEventListener('resize', draw);
    window.appBack = () => (ref && ref.handleBack ? ref.handleBack() : false);
    draw();
  };
})();
