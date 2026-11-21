# Dialect Archive · 方言档案

An interactive map for archiving and preserving China’s non-Mandarin languages — Chinese groups such as Yue, Min, Hakka and Wu, and other languages of China and Taiwan such as Tibetan, Uyghur, Zhuang and the Formosan languages.

The map fills the page. Hover over an area to see which language is spoken there, click it to highlight it, or open the **Languages** menu to pick from the full list and see the legend. Taiwan is shown in an inset box in the corner of the map, which lights up when a language spoken there is selected.

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
js/app.js           Map, languages menu, tooltip, detail panel, Taiwan inset
js/config.js        Feature switches, and the Supabase project to connect to
data/languages.js   Language info: names, family, description, varieties, colour, Taiwan notes
contribute.html     "Record a word" page for speakers (js/contribute.js, css/contribute.css)
js/backend.js       Everything sent to or read from Supabase (or the demo stand-in)
js/vendor/          supabase-js, kept here instead of a CDN (some CDNs are blocked in mainland China)
data/prompts.js     The words and phrases speakers are asked to record
supabase/schema.sql Database tables, row-level rules and audio storage for Supabase
data/map.js         Map geometry (generated — see below)
tools/              Script and data used to regenerate data/map.js
```

### Feature switches

`js/config.js` turns parts of the page on or off. `detailPanel` controls the side panel with each language’s description, varieties and recordings; it’s off for now, but the markup, styles and code are kept, so setting it to `true` brings it back.

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

## Recordings

Speakers record everyday words on `contribute.html` (linked from every “Contribute a recording” button; `contribute.html?lang=<id>` preselects a language). The page is phone-first and bilingual (English / Chinese):

1. **About you** — language, what they call their dialect, hometown, age group (only the language is required).
2. **Agreement** — recordings are public after review, shared under CC BY-SA 4.0.
3. **Sign in** — a 6-digit code by email. No passwords, and no Google sign-in (blocked in mainland China).
4. **Record** — one prompt at a time from `data/prompts.js`: record, listen back, optionally write it down, send. Every recording waits for a moderator.

Without a Supabase project the page runs in **demo mode**: everything works, but nothing leaves the browser.

### Connecting Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL Editor** → paste all of `supabase/schema.sql` → **Run**. This creates the tables, the row-level rules and a private `recordings` storage bucket. It’s safe to run again after changes.
3. **Authentication → Sign In / Providers → Email**: keep Email enabled. Then **Authentication → Emails → Magic Link** template: make sure it contains `{{ .Token }}` so the email shows the 6-digit code, e.g. `<p>Your code: <strong>{{ .Token }}</strong></p>`.
4. **Authentication → URL Configuration**: set the Site URL to where the site is hosted.
5. **Project Settings → API**: copy the Project URL and the `anon` public key into `BACKEND` in `js/config.js`. The anon key is meant to be public; the row-level rules decide what each visitor can do.
6. Make a linguist a moderator (after they’ve signed in once), in the SQL Editor:
   ```sql
   update public.profiles set role = 'moderator'
   where id = (select id from auth.users where email = 'linguist@example.com');
   ```
   Until the review page exists, moderators can approve recordings in **Table Editor → recordings** by setting `status` to `approved`.

Supabase’s built-in email sender is rate-limited and meant for testing; set up custom SMTP (Authentication → Emails) before inviting people.

**What the rules allow:** anyone can hear approved recordings; speakers can add recordings only as `pending`, see their own, fix their own words while pending, and delete their own pending ones; only moderators can approve or reject. Every change to a recording is copied into `revisions` (who, when, before, after).

## Accuracy

Language areas are assigned at prefecture (city) level to the language most spoken there, so boundaries are approximate and most areas are multilingual. Several languages are not yet mapped: Pinghua, Shaozhou Tuhua, Waxiang, Dong, Tujia, Qiang, Wa, Salar, Manchu and others.

## Data sources

- Mainland boundaries: [cn-atlas](https://www.npmjs.com/package/cn-atlas) (ISC), derived from [ruiduobao/shengshixian.com](https://github.com/ruiduobao/shengshixian.com), 2023 edition.
- Taiwan townships: [taiwan-atlas](https://github.com/dkaoster/taiwan-atlas) (MIT), from Taiwan’s Ministry of the Interior.
