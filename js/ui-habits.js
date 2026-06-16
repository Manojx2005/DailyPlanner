"use strict";
/* ---------- Habits domain view controller ---------- */

import { $, esc, getLocalYMD } from "./ui-utils.js?v=1.0";

export function calcStreak(doneOn) {
  if (!doneOn || !doneOn.length) return 0;
  const sorted = [...doneOn].sort().reverse();
  let streak = 0; const d = new Date();
  for (let i = 0; i < 100; i++) {
    const s = getLocalYMD(d);
    if (sorted.includes(s)) { streak++; d.setDate(d.getDate()-1); }
    else if (i === 0) { d.setDate(d.getDate()-1); }
    else break;
  }
  return streak;
}

export function renderHabitHeatmap(state) {
  const el = $("habitHeatmap"); if (!el) return;
  if (!(state.habits||[]).length) { el.innerHTML = ""; return; }
  const days = 30; const today = new Date();
  el.innerHTML = state.habits.map(h => {
    const dots = Array.from({length: days}, (_, i) => {
      const d = new Date(today); d.setDate(d.getDate()-(days-1-i));
      const s = getLocalYMD(d);
      return `<div class="habit-dot${(h.doneOn||[]).includes(s)?" done":""}" title="${s}"></div>`;
    }).join("");
    return `<div style="margin-bottom:14px"><div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:4px;">${esc(h.name)}</div><div class="habit-heatmap">${dots}</div></div>`;
  }).join("");
}

export function renderHabits(state) {
  if (!state.habits) state.habits = [];
  const el = $("habitRows"); if (!el) return;
  const today = getLocalYMD(new Date());
  el.innerHTML = state.habits.length ? state.habits.map((h, i) => {
    const done = (h.doneOn||[]).includes(today);
    const streak = calcStreak(h.doneOn||[]);
    return `<div class="habit-row">
      <div class="habit-check${done?" done":""}" data-habit-toggle="${i}" role="checkbox" aria-checked="${done}" tabindex="0" aria-label="${esc(h.name)}">${done?"✓":""}</div>
      <div class="habit-name">${esc(h.name)}</div>
      <div class="habit-streak">${streak>0?"🔥 "+streak+"d":"—"}</div>
      <button class="iconbtn" data-del-habit="${i}" aria-label="Remove ${esc(h.name)}">×</button>
    </div>`;
  }).join("") : `<div class="empty">No habits yet. Add your first one below.</div>`;
  renderHabitHeatmap(state);
}

let _habitsInited = false;
export function initHabits(state, save) {
  if (_habitsInited) return; _habitsInited = true;
  document.addEventListener("click", e => {
    if (e.target.dataset.habitToggle !== undefined) {
      const i = +e.target.dataset.habitToggle;
      if (!state.habits[i]) return;
      if (!state.habits[i].doneOn) state.habits[i].doneOn = [];
      const today = getLocalYMD(new Date());
      const idx = state.habits[i].doneOn.indexOf(today);
      if (idx === -1) state.habits[i].doneOn.push(today);
      else state.habits[i].doneOn.splice(idx, 1);
      if (navigator.vibrate) navigator.vibrate(8);
      renderHabits(state); save(); return;
    }
    if (e.target.dataset.delHabit !== undefined) {
      state.habits.splice(+e.target.dataset.delHabit, 1);
      renderHabits(state); save(); return;
    }
  });
  if ($("addHabitBtn")) {
    $("addHabitBtn").onclick = () => {
      const inp = $("habitInput"); if (!inp || !inp.value.trim()) return;
      if (!state.habits) state.habits = [];
      state.habits.push({ name: inp.value.trim(), doneOn: [] });
      inp.value = ""; renderHabits(state); save();
    };
  }
}
