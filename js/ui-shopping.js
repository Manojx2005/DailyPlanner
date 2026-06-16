"use strict";
/* ---------- Shopping domain view controller ----------
   Owns shopping state, persistence, and all shopping-tab render functions.
   Event delegation root stays in app.js; this module handles field logic. */

import { DEFAULT_SHOP, SKEY, saveData, loadData, getCurrency, getCurrentUser, isUsingCloud } from "./store.js?v=1.0";
import { $, esc, cSel } from "./ui-utils.js?v=1.0";
import { t } from "./i18n.js?v=1.7";
import { yen, calcShopping, shopText, displayAmount, fromDisplay } from "./shopping.js?v=1.6";

export { DEFAULT_SHOP, SKEY };

export let shop = structuredClone(DEFAULT_SHOP);

export function resetShop() { shop = structuredClone(DEFAULT_SHOP); }
export function setShopData(data) { shop = { ...structuredClone(DEFAULT_SHOP), ...data }; }

/* ---- Persistence ---- */

export async function saveShop() {
  const { ok, cloud } = await saveData(shop, getCurrentUser()?.uid, isUsingCloud(), "shopping", SKEY);
  $("savedShop").textContent = cloud
    ? (ok ? t("status.synced") : t("status.savedLocally"))
    : (ok ? t("status.saved")  : t("status.notSaved"));
}

export async function loadShop() {
  const loaded = await loadData(getCurrentUser()?.uid, isUsingCloud(), "shopping", SKEY);
  if (loaded) shop = { ...structuredClone(DEFAULT_SHOP), ...loaded };
}

/* ---- Render functions ---- */

export function renderShopRows() {
  const frag = document.createDocumentFragment();
  shop.items.forEach((it, i) => {
    const div = document.createElement("div");
    div.className = `row shop${it.got ? " got" : ""}`;
    div.innerHTML = `
      <input type="checkbox" class="chk" data-scope="shop" data-i="${i}" data-f="got"${it.got ? " checked" : ""} aria-label="Mark as in basket">
      <input class="nm-in" data-scope="shop" data-i="${i}" data-f="name" value="${esc(it.name)}" placeholder="e.g. Basmati rice" aria-label="Item name">
      <div style="display:flex; gap:4px; align-items:center;">
        ${it.got ? `<button class="iconbtn" style="color:var(--green); font-size:14px;" data-stockshop="${i}" title="Stock Pantry" aria-label="Stock Pantry">📥</button>` : ""}
        <button class="iconbtn" data-delshop="${i}" title="Remove" aria-label="Remove item">×</button>
      </div>
      <div class="sub3">
        <div><label class="f">Qty</label><input type="number" min="1" step="1" data-scope="shop" data-i="${i}" data-f="qty" value="${it.qty}"></div>
        <div><label class="f">Unit ${getCurrency()}</label><input type="number" min="0" step="any" data-scope="shop" data-i="${i}" data-f="price" value="${displayAmount(it.price)}"></div>
        <div><label class="f">Type</label>${cSel(null, i, "cat", [{v:"food",l:t("shop.cat.food")},{v:"other",l:t("shop.cat.other")}], it.cat, "shop")}</div>
      </div>`;
    frag.appendChild(div);
  });
  const container = $("shopRows");
  container.replaceChildren(frag);
}

export function renderTaxToggle() {
  document.querySelectorAll("#taxToggle button").forEach(b =>
    b.setAttribute("aria-pressed", String(b.dataset.mode === shop.taxMode))
  );
}

export function updateShop() {
  const c = calcShopping(shop);
  $("mSub").textContent   = yen(c.subtotal);
  $("mCount").textContent = c.count;
  $("mTax8").textContent  = yen(c.tax8);
  $("mTax10").textContent = yen(c.tax10);
  $("mTotal").textContent = yen(c.total);
  $("mLeft").textContent  = yen(c.left);
  $("roTotal").textContent = yen(c.total);
  $("roLeft").textContent  = `${c.count} item${c.count === 1 ? "" : "s"} · ${yen(c.left)} left`;
  $("shopTxt").value = shopText(shop, c);
}

/* ---- Event handler (called from app.js routeField) ---- */

export function onShopField(e) {
  const tgt = e.target, i = +tgt.dataset.i, f = tgt.dataset.f;
  if (f === "got") {
    shop.items[i].got = tgt.checked;
    const row = tgt.closest(".row");
    if (row) row.classList.toggle("got", tgt.checked);
  } else {
    shop.items[i][f] = f === "price" ? fromDisplay(tgt.value) : tgt.value;
  }
  updateShop();
  saveShop();
}
