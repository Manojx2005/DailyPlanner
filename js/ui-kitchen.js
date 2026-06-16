"use strict";
/* ---------- Kitchen / meal-planner domain view controller ----------
   Owns kitchen state, persistence, and all kitchen-tab render functions.
   renderNeeds / renderKitchen accept plannerState to avoid importing app.js. */

import { DEFAULT_KITCHEN, MKEY, saveData, loadData, getCurrency, getCurrentUser, isUsingCloud } from "./store.js?v=1.0";
import { $, esc, safeUrl, getLocalYMD } from "./ui-utils.js?v=1.0";
import { t } from "./i18n.js?v=1.7";
import { RECIPES, neededIngredients, toShopItem, suggestWeek } from "./meals.js?v=1.6";
import { recipeNutrition, planNutrition, fmtKcal, fmtMacros } from "./nutrition.js?v=1.6";
import { yen } from "./shopping.js?v=1.6";
import { shop, renderShopRows, updateShop, saveShop } from "./ui-shopping.js?v=1.0";

export { DEFAULT_KITCHEN, MKEY };

export let kitchen = structuredClone(DEFAULT_KITCHEN);

export function setKitchenData(data) { kitchen = { ...structuredClone(DEFAULT_KITCHEN), ...data }; }

/* ---- Persistence ---- */

export async function saveKitchen() {
  const { ok, cloud } = await saveData(kitchen, getCurrentUser()?.uid, isUsingCloud(), "kitchen", MKEY);
  $("savedKitchen").textContent = cloud
    ? (ok ? t("status.synced") : t("status.savedLocally"))
    : (ok ? t("status.saved")  : t("status.notSaved"));
}

export async function loadKitchen() {
  const loaded = await loadData(getCurrentUser()?.uid, isUsingCloud(), "kitchen", MKEY);
  if (loaded) kitchen = { ...structuredClone(DEFAULT_KITCHEN), ...loaded };

  if (kitchen.pantry) {
    kitchen.pantry = kitchen.pantry.map(p =>
      typeof p === "string" ? { name: p, qty: 1, unit: "unit" } : p
    );
  }
  if (kitchen.plan) {
    kitchen.plan = kitchen.plan.map(p =>
      typeof p === "string" ? { recipeId: p, made: false } : p
    );
  }
}

/* ---- Recipe helpers ---- */

export const allRecipes = () => RECIPES.concat(kitchen.customRecipes || []).concat(kitchen.aiRecipes || []);
export const recipeById = id => allRecipes().find(r => r.id === id);

/* ---- Render functions ---- */

export function renderPantry() {
  $("pantryChips").innerHTML = kitchen.pantry.map((p, i) => {
    const text = typeof p === "string" ? p : `${p.name} (${p.qty} ${p.unit})`;
    return `<span class="chip">${esc(text)}<button data-delpantry="${i}" title="Remove" aria-label="Remove ${esc(text)}">×</button></span>`;
  }).join("") || `<span class="hint" style="margin:0">${t("meals.pantryEmpty")}</span>`;
}

export function renderRecipeList() {
  $("recipeList").innerHTML = allRecipes().map(r => {
    const picked = kitchen.plan.some(p => p.recipeId === r.id);
    return `<div class="recipe ${picked ? "picked" : ""}">
      <div class="rinfo"><div class="rn">${r.ai ? "✨ " : ""}${esc(r.name)} <span class="kcal-badge">${fmtKcal(recipeNutrition(r, 1).kcal)}</span></div>
        <div class="rm">${r.cuisine ? esc(r.cuisine) + " · " : ""}${t("meals.serves")} ${r.serves} · ${r.ingredients.length} ingredients · ${fmtMacros(recipeNutrition(r, 1))}</div>
        <div style="display:flex; gap:12px; margin-top:4px;">
          <button class="rm" style="background:none; border:none; padding:0; color:var(--blue); cursor:pointer; font-weight:600; font-family:var(--sans);" data-viewrecipe="${esc(r.id)}">${t("meals.viewSteps")}</button>
          ${safeUrl(r.url) ? `<a href="${esc(safeUrl(r.url))}" target="_blank" rel="noopener noreferrer" class="rm" style="color:var(--text-muted); text-decoration:none; display:inline-block;">${t("meals.origLink")}</a>` : ""}
        </div>
      </div>
      <button class="radd" data-recipe="${esc(r.id)}">${picked ? t("meals.addedLabel") : t("meals.addLabel")}</button></div>`;
  }).join("");
}

export function renderMealPlan() {
  const el = $("planList");
  if (!kitchen.plan.length) {
    el.innerHTML = `<div class="empty" style="padding:16px">${t("meals.noMeals")}</div>`;
    return;
  }
  const rows = kitchen.plan.map((p, i) => {
    const r = recipeById(p.recipeId);
    if (!r) return "";
    return `<div class="recipe picked ${p.made ? "made" : ""}"><div class="rinfo"><div class="rn">${esc(r.name)} <span class="kcal-badge">${fmtKcal(recipeNutrition(r, 1).kcal)}</span></div>
      <div class="rm">${esc(r.cuisine)} · ${t("meals.serves")} ${r.serves}</div>
      <div style="display:flex; gap:8px; align-items:center; margin-top:4px;">
        <button class="rm" style="background:none; border:none; padding:0; color:var(--blue); cursor:pointer; font-weight:600; font-family:var(--sans);" data-viewrecipe="${esc(r.id)}">${t("meals.viewSteps")}</button>
        ${!p.made
          ? `<button class="btn ghost" style="padding:4px 8px; font-size:11px;" data-mademeal="${i}">Made it!</button>`
          : `<span style="font-size:11px; color:var(--green);">✓ Made</span>`}
      </div>
      </div>
      <button class="iconbtn" data-delmeal="${i}" title="Remove" aria-label="Remove ${esc(r.name)}">×</button></div>`;
  }).join("");
  const tot = planNutrition(
    kitchen.plan.filter(p => !p.made).map(p => recipeById(p.recipeId)).filter(Boolean)
  );
  el.innerHTML = rows + `<div class="nutri-total"><span><b>${fmtKcal(tot.kcal)}</b> total</span><span>${fmtMacros(tot)}</span></div>`;
}

export function currentNeeds() {
  return neededIngredients(
    kitchen.plan.filter(p => !p.made).map(p => recipeById(p.recipeId)).filter(Boolean),
    kitchen.pantry
  );
}

export function renderNeeds(plannerState) {
  const needs = currentNeeds(), el = $("needList");
  $("roMeals").textContent = needs.length;

  let targetPortions = 0;
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = getLocalYMD(d);
    const dow = d.getDay();
    const skips = new Set();
    (plannerState.fixed || []).forEach(f => {
      if (f.date) {
        if (f.date === dateStr && f.skipMeal) skips.add(f.skipMeal);
      } else {
        if ((!f.days || !f.days.length || f.days.includes(dow)) && f.skipMeal) skips.add(f.skipMeal);
      }
    });
    targetPortions += (plannerState.meals || []).filter(m => !skips.has(m.label)).length;
  }

  const plannedPortions = kitchen.plan.filter(p => !p.made).reduce((sum, p) => {
    const r = recipeById(p.recipeId);
    return sum + (r ? (r.serves || 1) : 0);
  }, 0);

  $("roMealsSub").textContent = kitchen.plan.length
    ? `${kitchen.plan.length} meals (${plannedPortions}/${targetPortions} portions)`
    : `target: ${targetPortions} portions`;

  if (!kitchen.plan.length) { el.innerHTML = `<div class="empty" style="padding:16px">${t("meals.noMealsPicked")}</div>`; return; }
  if (!needs.length)        { el.innerHTML = `<div class="empty" style="padding:16px">${t("meals.pantryCovers")}</div>`; return; }

  el.innerHTML = needs.map(n => {
    const amt = n.qty && n.unit ? `${esc(String(n.qty))}${esc(n.unit)}` : n.qty > 1 ? `×${esc(String(n.qty))}` : "";
    return `<div class="needrow"><span>${esc(n.name)} <span style="color:var(--text-muted)">${amt}</span></span><b>${yen(n.price)}</b></div>`;
  }).join("");
}

export function updateAiPrompt() {
  const el = $("aiPromptText");
  if (!el) return;
  const pantryLines = kitchen.pantry.map(p => `  - ${p.qty} ${p.unit} ${p.name}`).join("\n");
  const base = `I need a JSON array of 5 recipes for my meal planner app.\nOutput ONLY valid JSON.\nEach recipe must match this schema exactly:\n{\n  "name": "Recipe Name",\n  "cuisine": "Cuisine Type",\n  "serves": 2,\n  "instructions": [ "Step 1", "Step 2" ],\n  "ingredients": [\n    { "name": "Ingredient 1", "qty": 1, "unit": "cup" }\n  ]\n}\nDo not use markdown blocks, just raw JSON.`;
  const pantryContext = kitchen.pantry.length
    ? `\n\nI currently have these ingredients in my pantry:\n${pantryLines}\n\nPlease prioritize recipes that heavily utilize these ingredients so nothing goes to waste!`
    : "";
  el.value = base + pantryContext;
}

export function renderKitchen(plannerState) {
  renderPantry();
  renderRecipeList();
  renderMealPlan();
  renderNeeds(plannerState);
  updateAiPrompt();
}

/* ---- Custom meal ---- */

export function addCustomMeal(plannerState) {
  const name = $("customMealName").value.trim();
  const ings = $("customMealIngredients").value.trim();
  const inst = $("customMealInstructions").value.trim();
  const url  = $("customMealUrl").value.trim();
  if (!name || !ings) { alert("Please provide a meal name and ingredients."); return; }

  const items = ings.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  const instructions = inst ? inst.split("\n").map(s => s.trim()).filter(Boolean) : [];
  const recipe = { id: "custom_" + Date.now(), name, serves: 2, ingredients: items, instructions, url };

  kitchen.customRecipes = (kitchen.customRecipes || []).concat([recipe]);
  $("customMealName").value = "";
  $("customMealIngredients").value = "";
  $("customMealInstructions").value = "";
  $("customMealUrl").value = "";
  renderKitchen(plannerState);
  saveKitchen();
}

/* ---- Week planning ---- */

export function planSuggestedWeek(plannerState) {
  let targetPortions = 0;
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = getLocalYMD(d);
    const dow = d.getDay();
    const skips = new Set();
    (plannerState.fixed || []).forEach(f => {
      if (f.date) {
        if (f.date === dateStr && f.skipMeal) skips.add(f.skipMeal);
      } else {
        if ((!f.days || !f.days.length || f.days.includes(dow)) && f.skipMeal) skips.add(f.skipMeal);
      }
    });
    targetPortions += (plannerState.meals || []).filter(m => !skips.has(m.label)).length;
  }
  kitchen.plan = suggestWeek(allRecipes(), targetPortions).map(id => ({ recipeId: id, made: false }));
}

export function clearMealPlan() {
  kitchen.plan = [];
}

/* ---- Generate shopping list ---- */

/* Adds needed ingredients to the shopping list. Returns true if the
   caller (app.js) should navigate to the shopping tab. */
export function generateShoppingList() {
  const needs = currentNeeds();
  if (!needs.length) return false;

  const have = new Set(shop.items.map(it => String(it.name).toLowerCase()));
  let added = 0;
  for (const n of needs) {
    const item = toShopItem(n);
    if (have.has(item.name.toLowerCase())) continue;
    shop.items.push(item);
    added++;
  }
  renderShopRows();
  updateShop();
  saveShop();
  $("savedKitchen").textContent = added
    ? `added ${added} item${added === 1 ? "" : "s"} to Shopping`
    : "all already on your list";
  return true;
}
