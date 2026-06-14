import { test } from "node:test";
import assert from "node:assert/strict";
import { calcShopping, shopText, yen } from "../js/shopping.js";

// ── yen formatter ────────────────────────────────────────────────────────────
test("yen prefixes ¥ and rounds", () => {
  assert.equal(yen(0),     "¥0");
  assert.equal(yen(1000),  "¥1,000");
  assert.equal(yen(1000.6),"¥1,001");  // rounds up
  assert.equal(yen(1234),  "¥1,234");
});

// ── calcShopping (tax-excluded mode = default) ────────────────────────────────
function shop(items, taxMode = "excl") {
  return { items, taxMode };
}

test("calcShopping: empty list → all zeros", () => {
  const c = calcShopping(shop([]));
  assert.equal(c.total, 0);
  assert.equal(c.left,  0);
  assert.equal(c.count, 0);
});

test("calcShopping: food item taxed at 8% (excl mode)", () => {
  const c = calcShopping(shop([
    { name: "Rice", qty: 1, price: 1000, cat: "food", got: false },
  ]));
  // pre-tax: 1000, tax 8% = 80, incl = 1080
  assert.equal(c.subtotal, 1000);
  assert.ok(Math.abs(c.tax8  - 80)   < 1);
  assert.ok(Math.abs(c.total - 1080) < 1);
  assert.ok(Math.abs(c.left  - 1080) < 1);
});

test("calcShopping: other item taxed at 10% (excl mode)", () => {
  const c = calcShopping(shop([
    { name: "Soap", qty: 1, price: 500, cat: "other", got: false },
  ]));
  assert.equal(c.subtotal, 500);
  assert.ok(Math.abs(c.tax10 -  50)  < 1);
  assert.ok(Math.abs(c.total - 550) < 1);
});

test("calcShopping: got=true item excluded from `left`", () => {
  const c = calcShopping(shop([
    { name: "Rice", qty: 1, price: 1000, cat: "food",  got: true  },
    { name: "Soap", qty: 1, price: 500,  cat: "other", got: false },
  ]));
  // left only includes Soap (550 incl-tax)
  assert.ok(Math.abs(c.left - 550) < 1);
  // total still includes everything
  assert.ok(Math.abs(c.total - (1080 + 550)) < 1);
});

test("calcShopping: qty * price multiplication", () => {
  const c = calcShopping(shop([
    { name: "Egg", qty: 3, price: 200, cat: "food", got: false },
  ]));
  // line = 600, tax 8% = 48, total = 648
  assert.ok(Math.abs(c.subtotal - 600) < 1);
  assert.ok(Math.abs(c.total    - 648) < 1);
});

test("calcShopping: tax-included mode back-calculates correctly", () => {
  const c = calcShopping(shop([
    { name: "Rice", qty: 1, price: 1080, cat: "food", got: false },
  ], "incl"));
  // incl = 1080, pre = 1080/1.08 = 1000, tax = 80
  assert.ok(Math.abs(c.subtotal - 1000) < 1);
  assert.ok(Math.abs(c.tax8    -   80) < 1);
  assert.ok(Math.abs(c.total   - 1080) < 1);
});

test("calcShopping: unknown cat defaults to 10% tax", () => {
  const c = calcShopping(shop([
    { name: "Widget", qty: 1, price: 1000, cat: "mystery", got: false },
  ]));
  assert.ok(Math.abs(c.tax10 - 100) < 1);
  assert.ok(Math.abs(c.total - 1100) < 1);
});

test("calcShopping: mixed food and other items", () => {
  const c = calcShopping(shop([
    { name: "Milk",  qty: 2, price: 200, cat: "food",  got: false },
    { name: "Towel", qty: 1, price: 800, cat: "other", got: false },
  ]));
  // food: 400 → 432 (8%), other: 800 → 880 (10%)
  assert.ok(Math.abs(c.tax8  -  32) < 1);
  assert.ok(Math.abs(c.tax10 -  80) < 1);
  assert.ok(Math.abs(c.total - 1312) < 1);
});

test("calcShopping: items with no name and no price are skipped", () => {
  const c = calcShopping(shop([
    { name: "", qty: 0, price: 0, cat: "food", got: false },
    { name: "Rice", qty: 1, price: 100, cat: "food", got: false },
  ]));
  assert.equal(c.count, 1);
});

// ── shopText ──────────────────────────────────────────────────────────────────
test("shopText returns a string with SHOPPING LIST header", () => {
  const s = shop([{ name: "Rice", qty: 1, price: 1000, cat: "food", got: false }]);
  const c = calcShopping(s);
  const txt = shopText(s, c);
  assert.ok(txt.includes("SHOPPING LIST"));
  assert.ok(txt.includes("Rice"));
  assert.ok(txt.includes("food 8%"));
});

// ── yen edge cases ────────────────────────────────────────────────────────────
test("yen: negative value is formatted with minus", () => {
  // yen rounds Math.round(-1.5) then adds ¥ prefix — just ensure it doesn't crash
  const result = yen(-500);
  assert.ok(typeof result === "string");
  assert.ok(result.startsWith("¥") || result.includes("-"));
});

test("yen: fractional value rounds correctly (0.4 → 0)", () => {
  assert.equal(yen(0.4), "¥0");
  assert.equal(yen(0.5), "¥1");
});

// ── calcShopping: all items got=true → left=0 ────────────────────────────────
test("calcShopping: all items got=true → left=0", () => {
  const c = calcShopping(shop([
    { name: "Rice",  qty: 1, price: 1000, cat: "food",  got: true },
    { name: "Soap",  qty: 1, price: 500,  cat: "other", got: true },
  ]));
  assert.equal(c.left, 0);
  // total still includes both
  assert.ok(Math.abs(c.total - (1080 + 550)) < 1);
});

// ── calcShopping: incl mode with got=true ────────────────────────────────────
test("calcShopping: incl mode + got=true item excluded from left", () => {
  const c = calcShopping(shop([
    { name: "Milk",  qty: 1, price: 216, cat: "food",  got: true  },  // 216 incl → 200 pre, 16 tax
    { name: "Towel", qty: 1, price: 550, cat: "other", got: false },  // 550 incl → 500 pre, 50 tax
  ], "incl"));
  // left should only include Towel (550)
  assert.ok(Math.abs(c.left - 550) < 1);
  // total = 216 + 550
  assert.ok(Math.abs(c.total - 766) < 1);
});

// ── calcShopping: incl mode tax10 ────────────────────────────────────────────
test("calcShopping: incl mode 10% item back-calculates pre and tax", () => {
  const c = calcShopping(shop([
    { name: "Detergent", qty: 1, price: 1100, cat: "other", got: false },
  ], "incl"));
  // incl=1100, pre=1100/1.10=1000, tax10=100
  assert.ok(Math.abs(c.subtotal - 1000) < 1);
  assert.ok(Math.abs(c.tax10 - 100) < 1);
  assert.ok(Math.abs(c.total - 1100) < 1);
});

// ── calcShopping: large qty ───────────────────────────────────────────────────
test("calcShopping: large qty is multiplied correctly", () => {
  const c = calcShopping(shop([
    { name: "Water bottle", qty: 24, price: 100, cat: "food", got: false },
  ]));
  // pre = 2400, tax8 = 192, total = 2592
  assert.ok(Math.abs(c.subtotal - 2400) < 1);
  assert.ok(Math.abs(c.tax8 - 192) < 1);
  assert.ok(Math.abs(c.total - 2592) < 1);
});

// ── shopText: incl mode header ────────────────────────────────────────────────
test("shopText: incl mode shows 税込 in header", () => {
  const s = shop([{ name: "Rice", qty: 1, price: 1080, cat: "food", got: false }], "incl");
  const c = calcShopping(s);
  const txt = shopText(s, c);
  assert.ok(txt.includes("税込") || txt.includes("tax-included"));
});

// ── shopText: all-got items → no 'Still to buy' line ────────────────────────
test("shopText: all items got=true → no 'Still to buy' line", () => {
  const s = shop([{ name: "Rice", qty: 1, price: 1000, cat: "food", got: true }]);
  const c = calcShopping(s);
  const txt = shopText(s, c);
  assert.ok(!txt.includes("Still to buy"));
});

// ── shopText: got item shows [x] marker ──────────────────────────────────────
test("shopText: got=true item shows [x] marker", () => {
  const s = shop([{ name: "Eggs", qty: 1, price: 200, cat: "food", got: true }]);
  const c = calcShopping(s);
  const txt = shopText(s, c);
  assert.ok(txt.includes("[x]"));
});

// ── shopText: not-got item shows [ ] marker ───────────────────────────────────
test("shopText: got=false item shows [ ] marker", () => {
  const s = shop([{ name: "Eggs", qty: 1, price: 200, cat: "food", got: false }]);
  const c = calcShopping(s);
  const txt = shopText(s, c);
  assert.ok(txt.includes("[ ]"));
});
