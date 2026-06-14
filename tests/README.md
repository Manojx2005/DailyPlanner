# Tests

Unit tests for the pure-logic JS modules, using Node's built-in test runner.

## Run

```sh
node --test tests/*.test.mjs
```

(Run from the repo root. The bare directory form `node --test tests/` may not auto-discover files on all Node versions, so the explicit glob above is the reliable command.)

No install required — uses only `node:test` and `node:assert` from Node's standard library.

## Coverage

| File | Module tested | Notes |
|------|--------------|-------|
| `schedule.test.mjs` | `js/schedule.js` | `buildSchedule`, `asText`, `fmtDur`, `toHHMM`, `toMin` |
| `finance.test.mjs`  | `js/finance.js`  | `computeFinance`, `financeVerdict`, `financeText` |
| `shopping.test.mjs` | `js/shopping.js` | `calcShopping`, `shopText`, `yen` |
| `meals.test.mjs`    | `js/meals.js`    | `neededIngredients`, `toShopItem`, `coerceRecipe`, `suggestWeek` |
| `week.test.mjs`     | `js/week.js`     | `buildWeek`, `DOW` |

## Excluded modules

- `js/fx.js` — uses `window.matchMedia` and `element.querySelectorAll`; requires a browser DOM.
- `js/auth.js` — uses `window.FIREBASE_CONFIG` and dynamic CDN imports; requires a browser + Firebase.
- `js/sync.js` / `js/app.js` — orchestrate DOM and Firebase; not pure functions.
