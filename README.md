# Day Planner — schedule, goals, finances & meals for daily life in Tokyo

A zero-dependency personal dashboard for students living in Japan. Plan your day
and **week**, protect your study **goals**, track **finances** in yen (with Japan's
8% / 10% consumption tax), and plan **meals** that auto-generate a shopping list.
An optional **Gemini assistant** can read your timetable, invent recipes, and make
changes for you — using *your own* API key, stored only in your browser.

No build step. No framework. No backend. Just static files.

---

## ✨ Features

- **Day** — fixed classes/shifts, meals, and tasks packed into a real timeline with your true free time.
- **Week** — classes/shifts recur on the weekdays you choose; tasks spread across 7 days by deadline.
- **Goals** — set a weekly hour target ("JLPT N2 — 5h/week"); the planner schedules it *first* and warns if it won't fit.
- **Shopping** — qty × price per item, with 税込 / 税抜 handling and 8% (food) / 10% (other) tax.
- **Meals** — recipe library (Gyūdon, mapo tofu, naan, biryani, paneer…); pick meals → missing ingredients auto-flow into Shopping.
- **Finance** — income, balance, cards, expenses, **net savings**, and a 📷 receipt entry flow.
- **Gemini assistant** *(optional)* — chat that can add goals/tasks/expenses/meals (you tap **Apply**), generate recipes, and read a timetable photo into your week.

Everything is saved in your browser (`localStorage`). Nothing leaves your device
except calls *you* make to Google's Gemini API.

---

## 🚀 Run it

This app uses **ES modules**, so it must be served over `http(s)` — opening
`index.html` by double-click (`file://`) will fail with a CORS error.

### Locally
```bash
# from the project folder
python -m http.server 8000
# then open http://127.0.0.1:8000
```
(or any static server: `npx serve`, VS Code "Live Server", etc.)

### Deploy (free static hosts)
It's just static files — host them anywhere:
- **GitHub Pages** — push the repo, enable Pages on the `main` branch root.
- **Netlify / Vercel** — drag-and-drop the folder, or connect the repo. No build command, output dir = project root.
- **Cloudflare Pages** — same; framework preset "None".

> The Gemini features work the same once deployed — each visitor uses **their own**
> key (entered in-app), so you never pay for anyone's usage.

---

## 🔑 Gemini features (optional) — bring your own key

The timetable scanner, recipe generator, and assistant need a Google Gemini API
key. **End users don't edit any file** — they paste a key into the app:

1. Open the app, click the **✨** button (bottom-right) → the **⚙** settings icon.
2. Paste a key and **Save**. It's stored in *your* browser only (`localStorage`),
   sent only to Google, never to the site's author.

Get a free key at <https://aistudio.google.com/apikey> (Gemini's free tier covers
typical personal use at no cost).

### 🛡️ Restrict your key (do this!)
A key used in any client-side app is, by design, visible to that browser. Make a
stolen key worthless:

1. In **Google AI Studio → API keys**, edit your key.
2. **API restrictions:** allow only the **Generative Language API**.
3. **(Optional) Application restrictions:** add an **HTTP referrer** for your
   deployed domain (e.g. `https://yourname.github.io/*`).

Now even if the key leaks, it can do nothing but call Gemini, capped by *your*
free tier.

### Developer convenience: `config.local.js`
For local development you can skip the in-app field by creating `config.local.js`
(git-ignored) from the template:
```js
// config.local.js
window.GEMINI_API_KEY = "AIza...";
```
This file is **never committed** (see `.gitignore`) and is **not** how end users
set their key — the in-app ⚙ field is. An in-app key always overrides this file.

---

## 🔒 Privacy

- **Your data** (schedule, goals, finances, meals, shopping) lives in your browser's
  `localStorage`. There is no server and no analytics.
- **Your API key** is stored only in your browser and is sent only to Google when
  you use a Gemini feature.
- **Photos** (receipts, timetable) are shown locally as a reference. A timetable
  photo is uploaded to Google **only when you press scan** with a key set; receipt
  photos are never uploaded — you type the line items.
- Want maximum privacy? **Download and run it locally** — your key never touches
  any host but Google.

---

## 📁 Project structure
```
index.html          markup + tab panels
css/styles.css       all styling (CSS variables, "ink + accent" palette)
js/
  schedule.js        pure day engine (gaps + task packing)
  week.js            pure weekly engine (goals + 7-day distribution)
  shopping.js        pure yen + Japan consumption-tax math
  finance.js         pure net-savings engine
  meals.js           recipe DB + pantry-diff → shopping items
  gemini.js          Gemini API calls (chat, recipes, timetable OCR)
  app.js             controller: state, rendering, events, persistence
config.example.js    template for the dev key file
config.local.js      YOUR dev key (git-ignored)
```

The `js/*.js` engine modules are **pure** (no DOM) and unit-testable in isolation;
`app.js` is the only file that touches the DOM, storage, and the network.

---

## 📄 License

MIT — see [LICENSE](LICENSE).
