# Dialect Archive · 方言档案

An interactive map for archiving and preserving China’s non-Mandarin languages — Chinese groups such as Yue, Min, Hakka and Wu, and other languages of China and Taiwan such as Tibetan, Uyghur, Zhuang and the Formosan languages.

Click a language area (or a language button) to see where it’s spoken, its main varieties, and — eventually — recordings from native speakers. Taiwan is shown in an inset box in the corner of the map, which lights up when a language spoken there is selected.

## Running it locally

It’s a plain static site: no build step, no framework. Because the scripts are ES modules, open it through a local web server rather than by double-clicking `index.html`:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static host (GitHub Pages, Netlify, etc.) will serve it as is.

## Project layout

```
index.html          Page structure
css/styles.css      All styling
js/app.js           Map, language buttons, tooltip, detail panel, Taiwan inset
data/languages.js   Language info: names, family, description, varieties, colour, Taiwan notes
data/map.js         Map geometry (generated — see below)
tools/              Script and data used to regenerate data/map.js
```

### Editing languages

All the text for each language lives in `data/languages.js`. Each entry’s `id` must match a key in `data/map.js` (`zones`) for it to appear on the map. Entries with a `tw` object also appear in the Taiwan inset.

### Changing which areas belong to a language

Area assignments live in `tools/areas.json`:

- **Mainland:** six-digit prefecture codes per language. Where a code is listed twice, the later language wins (minority languages are listed after Chinese groups so they take priority).
- **Taiwan:** township names by county for Hakka and Formosan; every other township defaults to Hokkien (Min). Kinmen and Matsu are excluded from the inset.

Then regenerate the geometry:

```sh
npm install --prefix tools     # downloads cn-atlas and taiwan-atlas
pip install shapely
python3 tools/build_map.py     # rewrites data/map.js
```

## Accuracy

Language areas are assigned at prefecture (city) level to the language most spoken there, so boundaries are approximate and most areas are multilingual. Several languages are not yet mapped: Pinghua, Shaozhou Tuhua, Waxiang, Dong, Tujia, Qiang, Wa, Salar, Manchu and others.

## Data sources

- Mainland boundaries: [cn-atlas](https://www.npmjs.com/package/cn-atlas) (ISC), derived from [ruiduobao/shengshixian.com](https://github.com/ruiduobao/shengshixian.com), 2023 edition.
- Taiwan townships: [taiwan-atlas](https://github.com/dkaoster/taiwan-atlas) (MIT), from Taiwan’s Ministry of the Interior.
