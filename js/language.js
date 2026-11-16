import { LANGUAGES } from '../data/languages.js';
import { MAP } from '../data/map.js';

// One page per language: language.html?id=<id>, built from data/languages.js.

const SVG_NS = 'http://www.w3.org/2000/svg';
const TAIWAN_LAYERS = { hokkien: 'min', hakka: 'hakka', indigenous: 'formosan' };
const page = document.getElementById('lang-page');

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) node.setAttribute(k, v);
  return node;
}

const langUrl = (id) => `language.html?id=${encodeURIComponent(id)}`;
const mapUrl = (id) => `index.html?lang=${encodeURIComponent(id)}`;

function arrow(dir) {
  const s = svgEl('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
  s.append(svgEl('path', { d: dir === 'left' ? 'M19 12H5M11 6l-6 6 6 6' : 'M5 12h14M13 6l6 6-6 6' }));
  return s;
}

// Small map: the whole country in grey with this language's area in its colour.
function locatorMap(lang) {
  const svg = svgEl('svg', { class: 'locator', viewBox: MAP.viewBox.join(' '), role: 'img', 'aria-label': `Map showing where ${lang.name} is spoken` });
  svg.append(svgEl('path', { class: 'bg-land', d: MAP.background }));
  for (const [id, d] of Object.entries(MAP.zones)) {
    svg.append(svgEl('path', { class: id === lang.id ? 'loc-zone on' : 'loc-zone', d }));
  }

  const twLayers = Object.entries(TAIWAN_LAYERS).filter(([, id]) => id === lang.id).map(([layer]) => layer);
  if (twLayers.length) {
    const [, , mapW, mapH] = MAP.viewBox;
    const [, , twW, twH] = MAP.taiwan.viewBox;
    const boxH = 118, pad = 8, labelH = 14;
    const innerH = boxH - pad * 2 - labelH, innerW = innerH * (twW / twH), boxW = innerW + pad * 2;
    const x = mapW - boxW - 10, y = mapH - boxH - 10;
    const g = svgEl('g', { class: 'tw-inset lit', style: `--lit:${lang.color}` });
    g.append(svgEl('rect', { class: 'tw-box', x, y, width: boxW, height: boxH, rx: 8 }));
    const label = svgEl('text', { class: 'tw-label', x: x + pad, y: y + pad + 8 });
    label.textContent = 'TAIWAN';
    g.append(label);
    const inner = svgEl('svg', { x: x + pad, y: y + pad + labelH, width: innerW, height: innerH, viewBox: MAP.taiwan.viewBox.join(' '), overflow: 'visible' });
    for (const layer of Object.keys(TAIWAN_LAYERS)) {
      const on = twLayers.includes(layer);
      inner.append(svgEl('path', { class: on ? 'loc-zone on tw' : 'loc-zone tw', d: MAP.taiwan[layer] }));
    }
    g.append(inner);
    svg.append(g);
  }
  return svg;
}

function renderNotFound() {
  document.title = 'Language not found — Dialect Archive';
  const list = el('ul', { class: 'lang-index' });
  for (const l of LANGUAGES) {
    list.append(el('li', {}, el('a', { href: langUrl(l.id) },
      el('span', { class: 'swatch', style: `background:${l.color}`, 'aria-hidden': 'true' }), l.name)));
  }
  page.replaceChildren(el('div', { class: 'wrap lang-wrap' },
    el('a', { class: 'back-link', href: 'index.html' }, arrow('left'), 'Back to the map'),
    el('h1', { class: 'lang-title', text: 'Language not found' }),
    el('p', { class: 'lang-blurb', text: 'We couldn’t find that language. Choose one below.' }),
    list));
}

function render(lang) {
  document.title = `${lang.name} (${lang.zh}) — Dialect Archive`;
  page.style.setProperty('--lang', lang.color);

  const i = LANGUAGES.indexOf(lang);
  const prev = LANGUAGES[(i - 1 + LANGUAGES.length) % LANGUAGES.length];
  const next = LANGUAGES[(i + 1) % LANGUAGES.length];

  const main = el('div', { class: 'lang-body' },
    el('section', { class: 'lang-section' }, el('h2', { text: 'Where it’s spoken' }), el('p', { text: lang.where })));

  if (lang.varieties.length) {
    const list = el('ul', { class: 'varieties' });
    for (const v of lang.varieties) list.append(el('li', { text: v }));
    main.append(el('section', { class: 'lang-section' }, el('h2', { text: 'Main varieties' }), list));
  }

  if (lang.tw) {
    main.append(el('section', { class: 'lang-section' },
      el('h2', { text: `In Taiwan · ${lang.tw.title}` }),
      el('p', { text: lang.tw.body }),
      el('p', { class: 'note', text: lang.tw.note })));
  }

  page.replaceChildren(
    el('div', { class: 'lang-hero' },
      el('div', { class: 'wrap lang-wrap lang-hero-inner' },
        el('div', { class: 'lang-hero-text' },
          el('a', { class: 'back-link', href: mapUrl(lang.id) }, arrow('left'), 'Back to the map'),
          el('span', { class: 'label family' }, el('span', { class: 'bar', 'aria-hidden': 'true' }), lang.family),
          el('h1', { class: 'lang-title', text: lang.name }),
          el('p', { class: 'lang-names' }, el('span', { lang: 'zh-Hans', text: lang.zh }), ` · ${lang.pinyin}`),
          el('p', { class: 'lang-blurb', text: lang.blurb })),
        el('a', { class: 'locator-card', href: mapUrl(lang.id), 'aria-label': `See ${lang.name} on the full map` }, locatorMap(lang)))),
    el('div', { class: 'wrap lang-wrap lang-grid' },
      main,
      el('aside', { class: 'lang-side' },
        el('div', { class: 'card recordings' },
          el('h2', { class: 'label', text: 'Recordings' }),
          el('p', { class: 'muted', text: `No recordings yet. Speak ${lang.name}? Help start this collection.` }),
          el('a', { class: 'btn btn-dark', href: '#contribute', text: 'Contribute a recording' })))),
    el('nav', { class: 'wrap lang-wrap lang-pager', 'aria-label': 'Other languages' },
      el('a', { class: 'pager-link', href: langUrl(prev.id), rel: 'prev' },
        arrow('left'), el('span', {}, el('span', { class: 'label', text: 'Previous' }), el('span', { class: 'pager-name', text: prev.name }))),
      el('a', { class: 'pager-link next', href: langUrl(next.id), rel: 'next' },
        el('span', {}, el('span', { class: 'label', text: 'Next' }), el('span', { class: 'pager-name', text: next.name })), arrow('right'))),
  );
}

const id = new URLSearchParams(location.search).get('id');
const lang = LANGUAGES.find((l) => l.id === id);
if (lang) render(lang); else renderNotFound();
