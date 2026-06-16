"use strict";
/* ---------- Month calendar view controller ----------
   Owns the month grid DOM, month navigation state, and the quick-add event modal.
   Pure grid logic lives in month.js.
   Callbacks are injected via initMonth() to avoid circular imports with app.js. */

import { buildMonth } from "./month.js?v=1.0";
import { $, esc, getLocalYMD, formatDateDisplay } from "./ui-utils.js?v=1.0";
import { getViewDate, setViewDate } from "./store.js?v=1.0";
import { animateModal } from "./fx.js?v=2.0";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

let _monthDate = new Date();
_monthDate.setDate(1);

export function getMonthDate() { return new Date(_monthDate); }

/** Snap the month display to the month containing the global view date. */
export function syncMonthToViewDate() {
  const d = getViewDate();
  _monthDate = new Date(d.getFullYear(), d.getMonth(), 1);
}

function shiftMonth(delta) {
  _monthDate.setMonth(_monthDate.getMonth() + delta);
  // Keep the global view date coherent: point to the 1st of the new month.
  setViewDate(new Date(_monthDate));
}

export function navigateMonth(delta) {
  shiftMonth(delta);
}

/* ---- rendering ---- */

export function renderMonth(state, onDayClick) {
  const grid  = $("monthGrid");
  const title = $("monthTitle");
  if (!grid || !title) return;

  const year  = _monthDate.getFullYear();
  const month = _monthDate.getMonth();
  title.textContent = `${MONTH_NAMES[month]} ${year}`;

  const days = buildMonth(state, year, month);
  grid.innerHTML = "";

  // Day-of-week header row
  ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(name => {
    const th = document.createElement("div");
    th.className = "month-header";
    th.textContent = name;
    grid.appendChild(th);
  });

  // Day cells
  for (const day of days) {
    const cell = document.createElement("div");
    cell.className = "month-day";
    if (day.isOtherMonth) cell.classList.add("other-month");
    if (day.isToday)      cell.classList.add("today");

    // Header row: date number + quick-add button
    const header = document.createElement("div");
    header.className = "month-day-header";

    const num = document.createElement("div");
    num.className = "date-num";
    num.textContent = day.dayNum;
    if (day.dayNum === 1) {
      num.textContent = `${MONTH_NAMES[day.month].substring(0, 3)} ${day.dayNum}`;
    }

    const addBtn = document.createElement("button");
    addBtn.className = "cal-add-btn";
    addBtn.type = "button";
    addBtn.title = "Add event on this day";
    addBtn.setAttribute("aria-label", `Add event on ${day.dateStr}`);
    addBtn.textContent = "+";
    addBtn.onclick = ev => { ev.stopPropagation(); _openQuickAdd(day.dateStr); };

    header.appendChild(num);
    header.appendChild(addBtn);
    cell.appendChild(header);

    // Event pills
    const pills = document.createElement("div");
    pills.className = "event-pills";
    for (const evt of day.events) {
      const pill = document.createElement("div");
      pill.className = `event-pill event-type-${evt.type}`;
      pill.textContent = evt.label;
      pill.title = evt.label;
      pills.appendChild(pill);
    }
    cell.appendChild(pills);

    cell.onclick = () => { setViewDate(day.dateStr); onDayClick(day.dateStr); };
    grid.appendChild(cell);
  }
}

/* ---- quick-add event modal ---- */

let _quickAddDate = null;
let _quickAddCbs  = null;   // injected by initMonth

function _openQuickAdd(dateStr) {
  _quickAddDate = dateStr;
  const lbl = $("calEvtDateLbl");
  if (lbl) lbl.textContent = formatDateDisplay(dateStr);
  $("calEvtLabel").value  = "";
  $("calEvtStart").value  = "09:00";
  $("calEvtEnd").value    = "10:00";
  $("calEventModal").hidden = false;
  animateModal($("calEventModal").querySelector(".modal"));
  setTimeout(() => $("calEvtLabel").focus(), 50);
}

function _closeQuickAdd() {
  _quickAddDate = null;
  $("calEventModal").hidden = true;
}

function _confirmQuickAdd() {
  const label = $("calEvtLabel").value.trim();
  if (!label) { $("calEvtLabel").focus(); return; }
  const start = $("calEvtStart").value || "09:00";
  const end   = $("calEvtEnd").value   || "10:00";
  if (_quickAddCbs) {
    _quickAddCbs.onConfirm({ label, start, end, date: _quickAddDate, days: [] });
  }
  _closeQuickAdd();
}

/* ---- init: wires navigation buttons and the quick-add modal ----
   Called once from bootApp. Callbacks avoid importing from app.js.

   callbacks: {
     onDayClick(dateStr) — what happens when a day cell is clicked,
     onConfirm(event)    — called with the new fixed event object to add,
     renderMonth()       — re-renders after nav / confirm,
   }
*/
let _monthInited = false;
export function initMonth(callbacks) {
  if (_monthInited) return; _monthInited = true;

  _quickAddCbs = callbacks;

  if ($("prevMonth")) {
    $("prevMonth").onclick = () => { shiftMonth(-1); callbacks.renderMonth(); };
  }
  if ($("nextMonth")) {
    $("nextMonth").onclick = () => { shiftMonth(1); callbacks.renderMonth(); };
  }

  if ($("calEvtConfirm")) $("calEvtConfirm").onclick = _confirmQuickAdd;
  if ($("calEvtCancel"))  $("calEvtCancel").onclick  = _closeQuickAdd;
  if ($("calEvtLabel"))   $("calEvtLabel").addEventListener("keydown", e => {
    if (e.key === "Enter") _confirmQuickAdd();
  });
}
