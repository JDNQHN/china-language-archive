import { LANGUAGES } from '../data/languages.js';
import { MAP } from '../data/map.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const byId = Object.fromEntries(LANGUAGES.map((l) => [l.id, l]));

const state = { selected: null };

// Taiwan inset: which language each layer belongs to.
const TAIWAN_LAYERS = { hokkien: 'min', hakka: 'hakka', indigenous: 'formosan' };
const TAIWAN_LANGS = new Set(Object.values(TAIWAN_LAYERS));

const els = {
  frame: document.getElementById('map-frame'),
  map: document.getElementById('china-map'),
  tooltip: document.getElementById('tooltip'),
  detail: document.getElementById('detail'),
};

const zoneEls = {}; // language id -> [path, ...] (a language can have mainland and Taiwan shapes)
const chipEls = {};
let twInset = null;

/* ---------- helpers ---------- */

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function select(id) {
  state.selected = state.selected === id ? null : id;
  render();
}

/* ---------- build ---------- */

function buildChips() {
  for (const lang of LANGUAGES) {
    const chip = el('button', { class: 'chip', type: 'button', 'aria-pressed': 'false', onclick: () => select(lang.id) },
      el('span', { class: 'swatch', 'aria-hidden': 'true', style: `background:${lang.color}` }),
      el('span', { text: lang.name }));
    document.querySelector(`.chips[data-group="${lang.group}"]`).append(chip);
    chipEls[lang.id] = chip;
  }
}

function buildMap() {
  els.map.setAttribute('viewBox', MAP.viewBox.join(' '));
  els.map.append(svgEl('path', { class: 'bg-land', d: MAP.background, 'aria-hidden': 'true' }));

  for (const [id, d] of Object.entries(MAP.zones)) {
    els.map.append(makeZone(id, d));
  }
  buildTaiwanInset();

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.selected) { state.selected = null; render(); }
  });
}

function makeZone(id, d, extraClass = '') {
  const lang = byId[id];
  const path = svgEl('path', {
    class: `zone ${extraClass}`.trim(), d, fill: lang.color, tabindex: '0', role: 'button',
    'aria-label': `${lang.name} (${lang.zh})`, 'aria-pressed': 'false', 'data-id': id,
  });
  path.addEventListener('click', () => select(id));
  path.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(id); }
  });
  path.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    showTooltip(lang, e.clientX, e.clientY);
  });
  path.addEventListener('pointerleave', hideTooltip);
  path.addEventListener('focus', () => {
    if (!path.matches(':focus-visible')) return;
    const r = path.getBoundingClientRect();
    showTooltip(lang, r.left + r.width / 2, r.top + r.height / 2);
  });
  path.addEventListener('blur', hideTooltip);
  (zoneEls[id] ||= []).push(path);
  return path;
}

// Taiwan sits in a permanent box in the map's bottom-right corner (open sea east of Fujian).
function buildTaiwanInset() {
  const [, , mapW, mapH] = MAP.viewBox;
  const [, , twW, twH] = MAP.taiwan.viewBox;
  const boxH = 118, pad = 8, labelH = 14;
  const innerH = boxH - pad * 2 - labelH;
  const innerW = innerH * (twW / twH);
  const boxW = innerW + pad * 2;
  const x = mapW - boxW - 10, y = mapH - boxH - 10;

  twInset = svgEl('g', { class: 'tw-inset', role: 'group', 'aria-label': 'Taiwan (inset)' });
  twInset.append(svgEl('rect', { class: 'tw-box', x, y, width: boxW, height: boxH, rx: 8 }));
  const label = svgEl('text', { class: 'tw-label', x: x + pad, y: y + pad + 8, 'aria-hidden': 'true' });
  label.textContent = 'TAIWAN';
  twInset.append(label);

  const inner = svgEl('svg', { x: x + pad, y: y + pad + labelH, width: innerW, height: innerH, viewBox: MAP.taiwan.viewBox.join(' '), overflow: 'visible' });
  for (const [layer, id] of Object.entries(TAIWAN_LAYERS)) {
    inner.append(makeZone(id, MAP.taiwan[layer], 'tw-zone'));
  }
  twInset.append(inner);
  els.map.append(twInset);
}

/* ---------- tooltip ---------- */

function showTooltip(lang, clientX, clientY) {
  const tt = els.tooltip;
  tt.querySelector('.tt-name').textContent = lang.name;
  tt.querySelector('.tt-zh').textContent = `${lang.zh} · ${lang.pinyin}`;
  tt.querySelector('.tt-family').textContent = lang.family;
  tt.hidden = false;

  const frame = els.frame.getBoundingClientRect();
  const x = clientX - frame.left;
  const y = clientY - frame.top;
  const w = tt.offsetWidth;
  const h = tt.offsetHeight;
  const gap = 14;
  // Prefer above-right of the cursor; flip when it would leave the map.
  let left = x + gap;
  let top = y - h - gap;
  if (left + w > frame.width - 8) left = x - w - gap;
  if (top < 8) top = y + gap;
  left = Math.max(8, Math.min(left, frame.width - w - 8));
  top = Math.max(8, Math.min(top, frame.height - h - 8));
  tt.style.setProperty('--tx', `${left}px`);
  tt.style.setProperty('--ty', `${top}px`);
}

function hideTooltip() { els.tooltip.hidden = true; }

/* ---------- render ---------- */

function renderDetail(lang) {
  const d = els.detail;
  d.replaceChildren();

  if (!lang) {
    d.append(el('div', { class: 'detail-empty' },
      el('h2', { class: 'panel-title', text: 'Choose a language' }),
      el('p', { class: 'muted', style: 'font-size:15px;line-height:1.55', text: 'Click an area on the map, or pick a language above, to see where it’s spoken, its main varieties and recordings from the archive.' }),
      el('div', { class: 'dashed' },
        el('span', { class: 'label', style: 'color:var(--accent)', text: 'Nothing selected' }),
        el('span', { class: 'muted', style: 'font-size:14px', text: 'Language details will appear here.' }))));
    return;
  }

  const closeIcon = svgEl('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'aria-hidden': 'true' });
  closeIcon.append(svgEl('path', { d: 'M6 6l12 12M18 6L6 18' }));

  d.append(
    el('div', { class: 'detail-head' },
      el('div', {},
        el('span', { class: 'label family' }, el('span', { class: 'bar', style: `background:${lang.color}`, 'aria-hidden': 'true' }), lang.family),
        el('h2', { class: 'lang-name', text: lang.name }),
        el('span', { class: 'names' }, el('span', { lang: 'zh-Hans', text: lang.zh }), ` · ${lang.pinyin}`)),
      el('button', { class: 'icon-btn bordered', type: 'button', 'aria-label': 'Clear selection', onclick: () => select(lang.id) }, closeIcon)),
    el('p', { class: 'blurb', text: lang.blurb }),
    el('div', { class: 'section' }, el('h3', { text: 'Where it’s spoken' }), el('p', { text: lang.where })),
  );

  if (lang.varieties.length) {
    const list = el('ul', { class: 'varieties' });
    for (const v of lang.varieties) list.append(el('li', { text: v }));
    d.append(el('div', { class: 'section' }, el('h3', { text: 'Main varieties' }), list));
  }

  if (lang.tw) {
    d.append(el('div', { class: 'section tw-section' },
      el('h3', { text: `In Taiwan · ${lang.tw.title}` }),
      el('p', { text: lang.tw.body }),
      el('p', { class: 'note', text: lang.tw.note })));
  }

  d.append(el('div', { class: 'dashed' },
    el('h3', { class: 'label', text: 'Recordings' }),
    el('p', { class: 'muted', style: 'font-size:14px;line-height:1.5', text: `No recordings yet. Speak ${lang.name}? Help start this collection.` }),
    el('a', { class: 'btn btn-dark', href: '#contribute', text: 'Contribute a recording' })));
}

function render() {
  const sel = state.selected;
  for (const [id, paths] of Object.entries(zoneEls)) {
    for (const path of paths) {
      path.classList.toggle('dim', sel !== null && sel !== id);
      path.setAttribute('aria-pressed', String(sel === id));
    }
  }
  const lit = TAIWAN_LANGS.has(sel);
  twInset.classList.toggle('lit', lit);
  twInset.style.setProperty('--lit', lit ? byId[sel].color : '');
  for (const [id, chip] of Object.entries(chipEls)) {
    chip.setAttribute('aria-pressed', String(sel === id));
  }
  const lang = sel ? byId[sel] : null;
  renderDetail(lang);
}

buildChips();
buildMap();
render();
