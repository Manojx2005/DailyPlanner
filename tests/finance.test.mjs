import { test } from "node:test";
import assert from "node:assert/strict";
import { computeFinance, financeVerdict, financeText } from "../js/finance.js";

function base(overrides = {}) {
  return {
    income: [],
    initialBalance: 0,
    expenses: [],
    receipts: [],
    cards: [],
    ...overrides,
  };
}

// ── computeFinance ────────────────────────────────────────────────────────────
test("computeFinance: zero state returns all zeros", () => {
  const s = computeFinance(base());
  assert.equal(s.income, 0);
  assert.equal(s.totalSpend, 0);
  assert.equal(s.net, 0);
  assert.equal(s.cashOnHand, 0);
});

test("computeFinance: net = income + initialBalance − totalSpend", () => {
  const s = computeFinance(base({
    income:  [{ amount: 200000 }],
    initialBalance: 50000,
    expenses: [{ amount: 30000, paidBy: "cash" }, { amount: 20000, paidBy: "cash" }],
  }));
  assert.equal(s.income,      200000);
  assert.equal(s.initial,     50000);
  assert.equal(s.expenseTot,  50000);
  assert.equal(s.totalSpend,  50000);
  assert.equal(s.net,         200000 + 50000 - 50000); // 200000
});

test("computeFinance: receipts add to totalSpend correctly", () => {
  const s = computeFinance(base({
    income: [{ amount: 100000 }],
    receipts: [{ total: 5000, paidBy: "cash" }, { total: 3000, paidBy: "cash" }],
  }));
  assert.equal(s.receiptTot, 8000);
  assert.equal(s.totalSpend, 8000);
  assert.equal(s.net, 100000 - 8000);
});

test("computeFinance: card spend is tracked separately, not double-counted", () => {
  const s = computeFinance(base({
    income:   [{ amount: 100000 }],
    expenses: [{ amount: 20000, paidBy: "Visa" }],
    cards:    [{ name: "Visa", limit: 100000 }],
  }));
  // Net should subtract the expense once only
  assert.equal(s.net, 100000 - 20000);
  // Card shows the spend
  assert.equal(s.cards[0].spend, 20000);
  assert.equal(s.cardDebt, 20000);
});

test("computeFinance: cashOnHand excludes card payments", () => {
  const s = computeFinance(base({
    income:         [{ amount: 100000 }],
    initialBalance: 10000,
    expenses: [
      { amount: 5000,  paidBy: "cash" },
      { amount: 15000, paidBy: "Visa" },
    ],
    cards: [{ name: "Visa", limit: 50000 }],
  }));
  // cashOnHand = initial + income - cashSpend only
  assert.equal(s.cashSpend,  5000);
  assert.equal(s.cashOnHand, 10000 + 100000 - 5000); // 105000
});

test("computeFinance: savingsRate is net / income", () => {
  const s = computeFinance(base({
    income:   [{ amount: 100000 }],
    expenses: [{ amount: 20000, paidBy: "cash" }],
  }));
  assert.ok(Math.abs(s.savingsRate - 0.8) < 0.001);
});

test("computeFinance: savingsRate is 0 when income is 0", () => {
  const s = computeFinance(base({ initialBalance: 50000 }));
  assert.equal(s.savingsRate, 0);
});

test("computeFinance: card utilisation = spend / limit", () => {
  const s = computeFinance(base({
    expenses: [{ amount: 50000, paidBy: "MyCard" }],
    cards:    [{ name: "MyCard", limit: 100000 }],
  }));
  assert.equal(s.cards[0].util, 0.5);
});

test("computeFinance: multiple income sources are summed", () => {
  const s = computeFinance(base({
    income: [{ amount: 80000 }, { amount: 20000 }, { amount: 5000 }],
  }));
  assert.equal(s.income, 105000);
});

test("computeFinance: counts reflect number of expenses and receipts", () => {
  const s = computeFinance(base({
    expenses: [{ amount: 1000, paidBy: "cash" }, { amount: 2000, paidBy: "cash" }],
    receipts: [{ total: 500, paidBy: "cash" }],
  }));
  assert.equal(s.counts.expenses, 2);
  assert.equal(s.counts.receipts, 1);
});

// ── financeVerdict ────────────────────────────────────────────────────────────
test("financeVerdict: negative net → bad", () => {
  const s = computeFinance(base({
    income:   [{ amount: 10000 }],
    expenses: [{ amount: 20000, paidBy: "cash" }],
  }));
  const v = financeVerdict(s);
  assert.equal(v.cls, "bad");
});

test("financeVerdict: healthy savings rate → ok", () => {
  const s = computeFinance(base({
    income:   [{ amount: 100000 }],
    expenses: [{ amount: 20000, paidBy: "cash" }],
  }));
  const v = financeVerdict(s);
  assert.equal(v.cls, "ok");
  assert.ok(typeof v.msg === "string" && v.msg.length > 0);
});

test("financeVerdict: maxed card → bad", () => {
  const s = computeFinance(base({
    income:   [{ amount: 100000 }],
    expenses: [{ amount: 95000, paidBy: "Visa" }],
    cards:    [{ name: "Visa", limit: 100000 }],
  }));
  const v = financeVerdict(s);
  assert.equal(v.cls, "bad");
});

// ── financeText ───────────────────────────────────────────────────────────────
test("financeText returns a string with income and spend", () => {
  const f = base({ income: [{ amount: 50000 }], expenses: [{ amount: 10000, paidBy: "cash" }] });
  const s = computeFinance(f);
  const yenFn = n => "¥" + Math.round(n).toLocaleString("ja-JP");
  const txt = financeText(f, s, yenFn);
  assert.ok(txt.includes("¥50,000") || txt.includes("¥50000"));
  assert.ok(txt.includes("FINANCE"));
});

// ── financeVerdict: warn paths ────────────────────────────────────────────────
test("financeVerdict: card at 50–89% utilisation → warn", () => {
  const s = computeFinance(base({
    income:   [{ amount: 100000 }],
    expenses: [{ amount: 60000, paidBy: "Visa" }],
    cards:    [{ name: "Visa", limit: 100000 }],
  }));
  const v = financeVerdict(s);
  assert.equal(v.cls, "warn");
});

test("financeVerdict: savings rate 0 (break-even) → warn", () => {
  const s = computeFinance(base({
    income:   [{ amount: 100000 }],
    expenses: [{ amount: 100000, paidBy: "cash" }],
  }));
  // net=0, savingsRate=0 → SAVE_OK (>=0) satisfied but SAVE_GOOD (>=0.20) not → warn
  const v = financeVerdict(s);
  assert.equal(v.cls, "warn");
});

test("financeVerdict: savings rate 0–20% → warn", () => {
  const s = computeFinance(base({
    income:   [{ amount: 100000 }],
    expenses: [{ amount: 85000, paidBy: "cash" }],
  }));
  // savingsRate = 15000/100000 = 0.15 → warn
  const v = financeVerdict(s);
  assert.equal(v.cls, "warn");
});

test("financeVerdict: exactly >=20% savings rate → ok", () => {
  const s = computeFinance(base({
    income:   [{ amount: 100000 }],
    expenses: [{ amount: 80000, paidBy: "cash" }],
  }));
  // savingsRate = 20000/100000 = 0.20 → ok
  const v = financeVerdict(s);
  assert.equal(v.cls, "ok");
});

// ── computeFinance: receipts paid by card ────────────────────────────────────
test("computeFinance: receipt paid by card adds to card spend, not cashSpend", () => {
  const s = computeFinance(base({
    income:   [{ amount: 100000 }],
    receipts: [{ total: 12000, paidBy: "Amex" }],
    cards:    [{ name: "Amex", limit: 50000 }],
  }));
  assert.equal(s.receiptTot, 12000);
  assert.equal(s.cashSpend,  0);         // not cash
  assert.equal(s.cards[0].spend, 12000); // goes to card
  assert.equal(s.cardDebt, 12000);
});

// ── computeFinance: card with zero limit → util = 0 ──────────────────────────
test("computeFinance: card with limit=0 has util=0 (no division by zero)", () => {
  const s = computeFinance(base({
    expenses: [{ amount: 1000, paidBy: "ZeroCard" }],
    cards:    [{ name: "ZeroCard", limit: 0 }],
  }));
  assert.equal(s.cards[0].util, 0);
});

// ── computeFinance: unknown paidBy treated as cash ───────────────────────────
test("computeFinance: expense paidBy undefined falls back to cash bucket", () => {
  const s = computeFinance(base({
    income:   [{ amount: 50000 }],
    expenses: [{ amount: 10000 }],  // no paidBy field
  }));
  assert.equal(s.cashSpend, 10000);
});

// ── financeText: includes card section when cards present ────────────────────
test("financeText: card section appears when cards are defined", () => {
  const f = base({
    income:   [{ amount: 100000 }],
    expenses: [{ amount: 30000, paidBy: "Visa" }],
    cards:    [{ name: "Visa", limit: 100000 }],
  });
  const s = computeFinance(f);
  const yenFn = n => "¥" + Math.round(n).toLocaleString("ja-JP");
  const txt = financeText(f, s, yenFn);
  assert.ok(txt.includes("Cards"));
  assert.ok(txt.includes("Visa"));
});

// ── financeText: receipt section appears when receipts present ────────────────
test("financeText: receipt section appears when receipts are defined", () => {
  const f = base({
    income:   [{ amount: 100000 }],
    receipts: [{ total: 5000, paidBy: "cash", date: "2026-06-01", store: "7-Eleven", items: [] }],
  });
  const s = computeFinance(f);
  const yenFn = n => "¥" + Math.round(n).toLocaleString("ja-JP");
  const txt = financeText(f, s, yenFn);
  assert.ok(txt.includes("Receipts"));
  assert.ok(txt.includes("7-Eleven"));
});

// ── computeFinance: mixed card and cash expenses ──────────────────────────────
test("computeFinance: net subtracts both cash and card expenses once only", () => {
  const s = computeFinance(base({
    income:   [{ amount: 100000 }],
    initialBalance: 20000,
    expenses: [
      { amount: 10000, paidBy: "cash" },
      { amount: 15000, paidBy: "Visa" },
    ],
    cards: [{ name: "Visa", limit: 50000 }],
  }));
  assert.equal(s.net, 100000 + 20000 - 10000 - 15000); // 95000
  assert.equal(s.cashSpend, 10000);
  assert.equal(s.cards[0].spend, 15000);
});
