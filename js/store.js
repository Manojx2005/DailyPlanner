"use strict";
/* ---------- Application state store ----------
   Central Pub/Sub state manager. Owns canonical default state for all
   domains, persistence routing (cloud vs localStorage), auth state, and
   the subscribe/notify contract for reactive UI updates. */

import { saveToCloud, loadFromCloud } from "./sync.js?v=1.6";

/* ---- Default planner state ---- */
export const DEFAULT = {
  currency: "¥",
  wake: "07:00", sleep: "23:30",
  fixed: [
    { label: "Class",         start: "09:00", end: "10:30", days: [1,3,5] },
    { label: "Part-time job", start: "17:00", end: "21:00", days: [2,4,6] },
  ],
  meals: [
    { label: "Breakfast", time: "07:30", dur: 25 },
    { label: "Lunch",     time: "12:30", dur: 40 },
    { label: "Dinner",    time: "21:15", dur: 40 },
  ],
  tasks: [
    { label: "JLPT study",     dur: 60, category: "study",   priority: "high", deadlineDays: 3 },
    { label: "Coding project", dur: 90, category: "project", priority: "med",  deadlineDays: 7 },
    { label: "Chore",          dur: 30, category: "chore",   priority: "low",  deadlineDays: 1 },
  ],
  goals: [
    { name: "JLPT N2",               hoursPerWeek: 5 },
    { name: "Internship prep (DSA)", hoursPerWeek: 3 },
  ],
  notes: {},
  pinnedNotes: [],
  habits: [],
};
export const KEY = "dayplanner:v1";

/* ---- Shopping default state ---- */
export const DEFAULT_SHOP = {
  taxMode: "excl",
  items: [
    { name: "Basmati rice 1kg", qty: 1, price: 600, cat: "food",  got: false },
    { name: "Chicken thigh",    qty: 1, price: 400, cat: "food",  got: false },
    { name: "Miso paste",       qty: 1, price: 350, cat: "food",  got: false },
    { name: "Tofu",             qty: 2, price: 80,  cat: "food",  got: false },
    { name: "Olive oil",        qty: 1, price: 700, cat: "food",  got: false },
    { name: "Dish soap",        qty: 1, price: 250, cat: "other", got: false },
  ],
};
export const SKEY = "shoppinglist:v1";

/* ---- Finance default state ---- */
export const DEFAULT_FIN = {
  initialBalance: 120000,
  income: [
    { label: "Part-time job", amount: 90000 },
    { label: "Allowance",     amount: 30000 },
  ],
  cards:    [{ name: "Rakuten Card", limit: 200000 }],
  expenses: [
    { label: "Rent",      amount: 55000, cat: "fixed",    paidBy: "cash" },
    { label: "Phone",     amount:  3000, cat: "fixed",    paidBy: "Rakuten Card" },
    { label: "Transport", amount:  8000, cat: "variable", paidBy: "cash" },
  ],
  receipts: [],
};
export const FKEY = "finance:v1";

/* ---- Kitchen / meal-planner default state ---- */
export const DEFAULT_KITCHEN = {
  pantry: [
    { name: "Short-grain rice", qty: 1000, unit: "g"  },
    { name: "Soy sauce",        qty:  500, unit: "ml" },
    { name: "Mirin",            qty:  500, unit: "ml" },
    { name: "Dashi",            qty:  100, unit: "g"  },
    { name: "Sugar",            qty:  500, unit: "g"  },
    { name: "Salt",             qty:  500, unit: "g"  },
    { name: "Cooking oil",      qty: 1000, unit: "ml" },
    { name: "Flour",            qty: 1000, unit: "g"  },
    { name: "Yeast",            qty:   50, unit: "g"  },
    { name: "Garam masala",     qty:   50, unit: "g"  },
    { name: "Turmeric",         qty:   50, unit: "g"  },
    { name: "Garlic",           qty:  100, unit: "g"  },
    { name: "Ginger",           qty:  100, unit: "g"  },
    { name: "Miso paste",       qty:  500, unit: "g"  },
  ],
  plan:          [],
  customRecipes: [],
  aiRecipes:     [],
};
export const MKEY = "mealplan:v1";

/* ---- Internal state ---- */
let _state = structuredClone(DEFAULT);
const _subs = new Set();

/* Auth state — kept in sync by app.js via setConnection() */
let _currentUser = null;
let _useCloud    = false;

const _ls = {
  set(k, v) { try { localStorage.setItem(k, v); return true;  } catch(e) { return false; } },
  get(k)    { try { return localStorage.getItem(k);            } catch(e) { return null;  } },
};

function _notify() { for (const fn of _subs) fn(_state); }

/* ---- Planner state accessors ---- */
export function getState()    { return _state; }
export function getCurrency() { return _state.currency || "¥"; }

/* Patch state and notify subscribers. Accepts a partial object or updater fn. */
export function setState(patch) {
  _state = typeof patch === "function" ? patch(_state) : { ..._state, ...patch };
  _notify();
}

/* Register a callback fired on every state change. Returns an unsubscribe fn. */
export function subscribe(fn) {
  _subs.add(fn);
  return () => _subs.delete(fn);
}

/* ---- Global view-date (shared across Day / Week / Month tabs) ---- */

let _viewDate = new Date();

/** Returns a copy of the current view date. */
export function getViewDate() { return new Date(_viewDate); }

/** Set the view date. Accepts a Date object or a "YYYY-MM-DD" string. */
export function setViewDate(d) {
  _viewDate = typeof d === "string" ? new Date(d + "T00:00:00") : new Date(d);
}

/* ---- Auth state accessors ---- */
export function setConnection(user, cloud) {
  _currentUser = user  ?? null;
  _useCloud    = !!cloud;
}
export function getCurrentUser() { return _currentUser; }
export function isUsingCloud()   { return _useCloud; }

/* ---- Generic persistence routing ---- */

/* Persist `data` to Firestore (collection) or localStorage (localKey).
   Returns { ok: boolean, cloud: boolean } — DOM updates stay in the caller. */
export async function saveData(data, userId, useCloud, collection = "planner", localKey = KEY) {
  if (useCloud && userId) {
    const ok = await saveToCloud(userId, collection, data);
    return { ok, cloud: true };
  }
  const ok = _ls.set(localKey, JSON.stringify(data));
  return { ok, cloud: false };
}

/* Load data from Firestore or localStorage. Returns the raw object, or null. */
export async function loadData(userId, useCloud, collection = "planner", localKey = KEY) {
  if (useCloud && userId) {
    return await loadFromCloud(userId, collection);
  }
  const v = _ls.get(localKey);
  if (!v) return null;
  try { return JSON.parse(v); } catch(e) { return null; }
}
