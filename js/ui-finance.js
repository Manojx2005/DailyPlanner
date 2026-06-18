"use strict";
/* ---------- Finance domain view controller ----------
   Owns finance state, persistence, and all finance-tab render functions.
   Event delegation root stays in app.js. */

import { DEFAULT_FIN, FKEY, saveData, loadData, getCurrency, getCurrentUser, isUsingCloud } from "./store.js?v=1.0";
import { $, esc, cSel } from "./ui-utils.js?v=1.0";
import { t } from "./i18n.js?v=1.7";
import { yen, displayAmount, fromDisplay } from "./shopping.js?v=1.6";
import { computeFinance, financeVerdict, financeText } from "./finance.js?v=1.6";

export { DEFAULT_FIN, FKEY };

export let finance = structuredClone(DEFAULT_FIN);

export function setFinData(data) { finance = { ...structuredClone(DEFAULT_FIN), ...data }; }

/* ---- Persistence ---- */

export async function saveFin() {
  const { ok, cloud } = await saveData(finance, getCurrentUser()?.uid, isUsingCloud(), "finance", FKEY);
  $("savedFin").textContent = cloud
    ? (ok ? t("status.synced") : t("status.savedLocally"))
    : (ok ? t("status.saved")  : t("status.notSaved"));
}

export async function loadFin() {
  const loaded = await loadData(getCurrentUser()?.uid, isUsingCloud(), "finance", FKEY);
  if (loaded) finance = { ...structuredClone(DEFAULT_FIN), ...loaded };
}

/* ---- Payer options (cash + named cards) ---- */

export function payerOptionsArr() {
  const arr = [{ v: "cash", l: t("fin.payer.cash") }];
  finance.cards.forEach(c => { if (c.name) arr.push({ v: c.name, l: c.name }); });
  return arr;
}

/* ---- Render functions ---- */

export function renderIncome() {
  $("incomeRows").innerHTML = finance.income.map((it, i) => `
    <div class="row fin">
      <div><label class="f">Source</label><input data-scope="fin" data-arr="income" data-i="${i}" data-f="label" value="${esc(it.label)}" placeholder="e.g. Scholarship"></div>
      <div><label class="f">${getCurrency()} / month</label><input class="amt-in" type="number" min="0" step="any" data-scope="fin" data-arr="income" data-i="${i}" data-f="amount" value="${displayAmount(it.amount)}"></div>
      <div class="x"><button class="iconbtn" data-delfin="income" data-i="${i}" title="Remove" aria-label="Remove">×</button></div>
    </div>`).join("");
}

export function renderCards() {
  $("cardRows").innerHTML = finance.cards.map((c, i) => `
    <div class="row fin">
      <div><label class="f">Card name</label><input data-scope="fin" data-arr="cards" data-i="${i}" data-f="name" value="${esc(c.name)}" placeholder="e.g. SMBC"></div>
      <div><label class="f">Limit ${getCurrency()}</label><input class="amt-in" type="number" min="0" step="any" data-scope="fin" data-arr="cards" data-i="${i}" data-f="limit" value="${displayAmount(c.limit)}"></div>
      <div class="x"><button class="iconbtn" data-delfin="cards" data-i="${i}" title="Remove" aria-label="Remove">×</button></div>
    </div>`).join("");
}

export function renderExpenses() {
  $("expRows").innerHTML = finance.expenses.map((e, i) => `
    <div class="row fin exp">
      <div><label class="f">What</label><input data-scope="fin" data-arr="expenses" data-i="${i}" data-f="label" value="${esc(e.label)}" placeholder="e.g. Gym"></div>
      <div><label class="f">${getCurrency()}</label><input class="amt-in" type="number" min="0" step="any" data-scope="fin" data-arr="expenses" data-i="${i}" data-f="amount" value="${displayAmount(e.amount)}"></div>
      <div><label class="f">Type</label>${cSel(null, i, "cat", [{v:"fixed",l:t("fin.cat.fixed")},{v:"variable",l:t("fin.cat.variable")}], e.cat, "fin", "expenses")}</div>
      <div><label class="f">Paid with</label>${cSel(null, i, "paidBy", payerOptionsArr(), e.paidBy, "fin", "expenses")}</div>
      <div class="x"><button class="iconbtn" data-delfin="expenses" data-i="${i}" title="Remove" aria-label="Remove">×</button></div>
    </div>`).join("");
}

export function renderFinInputs() {
  $("finInitial").value = displayAmount(finance.initialBalance);
  renderIncome(); renderCards(); renderExpenses();
}

export function updateFinance() {
  const s = computeFinance(finance), vd = financeVerdict(s);
  s.cards = (s.cards || []).filter(c => c.name && c.name.trim());
  $("hNet").textContent    = yen(s.net);
  $("hMsg").textContent    = vd.msg;
  $("finHero").className   = "hero " + vd.cls;
  $("fIncome").textContent = yen(s.income);
  $("fSpend").textContent  = yen(s.totalSpend);
  $("fCash").textContent   = yen(s.cashOnHand);
  $("roNet").textContent   = yen(s.net);
  $("roRate").textContent  = s.income > 0 ? Math.round(s.savingsRate * 100) + "% saved" : "add income";
  const cb = $("cardBars");
  if (!s.cards.length) {
    cb.innerHTML = `<div class="empty">${t("fin.noCards")}</div>`;
  } else {
    cb.innerHTML = s.cards.map(c => {
      const pct = Math.min(100, Math.round(c.util * 100));
      const lvl = c.util >= 0.9 ? "bad" : c.util >= 0.5 ? "warn" : "";
      return `<div class="cardbar"><div class="top"><span>${esc(c.name || "(card)")}</span><b>${yen(c.spend)} / ${yen(c.limit)}</b></div>
        <div class="track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(c.name || "card")} ${pct}% used"><div class="fill ${lvl}" style="width:${pct}%"></div></div></div>`;
    }).join("");
  }
  $("finTxt").value = financeText(finance, s, yen);
}

/* ---- Event handlers ---- */

export function onFinField(e) {
  const tgt = e.target, arr = tgt.dataset.arr, i = +tgt.dataset.i, f = tgt.dataset.f;
  finance[arr][i][f] = (f === "amount" || f === "limit") ? fromDisplay(tgt.value) : tgt.value;
  if (arr === "cards" && f === "name") renderExpenses();
  updateFinance();
  saveFin();
}

