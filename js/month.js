"use strict";
/**
 * month.js — pure month-grid business logic for DailyPlanner
 *
 * buildMonth(state, year, month) → Array<DayCell> (42 cells, 6-week grid)
 *
 * DayCell shape:
 *   { date: Date, dateStr: string, dayNum: number, month: number,
 *     isOtherMonth: boolean, isToday: boolean,
 *     events: Array<{label: string, type: string}> }
 *
 * "type" values for events:
 *   "specific"  — fixed event with an explicit date match
 *   "task"      — placed task from the 7-day week plan
 *   "routine"   — immovable non-meal block from the 7-day week plan
 *   "fixed"     — routine fixed event outside the 7-day window
 */

import { buildWeek } from "./week.js?v=1.7";
import { getLocalYMD } from "./ui-utils.js?v=1.0";

/**
 * Build a 42-cell (6-week) grid descriptor for the given year/month.
 * Cells outside the target month are marked isOtherMonth=true.
 *
 * @param {object} state  — planner state (state.fixed, state.tasks, etc.)
 * @param {number} year
 * @param {number} month  — 0-indexed (January = 0)
 * @returns {Array<DayCell>}
 */
export function buildMonth(state, year, month) {
  const startDow    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevLast    = new Date(year, month, 0).getDate();
  const todayStr    = getLocalYMD(new Date());

  // Build the 7-day week plan from today so we can overlay placed tasks.
  const todayForPlan = new Date();
  todayForPlan.setHours(0, 0, 0, 0);
  const weekPlan = buildWeek(state, todayForPlan.getDay());
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayForPlan);
    d.setDate(d.getDate() + i);
    return getLocalYMD(d);
  });

  return Array.from({ length: 42 }, (_, i) => {
    let cellDate, isOtherMonth = false;
    if (i < startDow) {
      cellDate = new Date(year, month - 1, prevLast - startDow + i + 1);
      isOtherMonth = true;
    } else if (i >= startDow + daysInMonth) {
      cellDate = new Date(year, month + 1, i - startDow - daysInMonth + 1);
      isOtherMonth = true;
    } else {
      cellDate = new Date(year, month, i - startDow + 1);
    }

    const dateStr = getLocalYMD(cellDate);
    const events  = [];

    // Specific-date fixed events always appear.
    for (const f of state.fixed || []) {
      if (f.date === dateStr) events.push({ label: f.label, type: "specific" });
    }

    const weekIdx = weekDates.indexOf(dateStr);
    if (weekIdx !== -1) {
      // Within the 7-day plan: overlay immovable blocks (skip meals) + placed tasks.
      const day = weekPlan.days[weekIdx];
      for (const b of day.immovable) {
        if (b.type !== "meal") events.push({ label: b.label, type: b.type || "routine" });
      }
      for (const t of day.placed) events.push({ label: t.label, type: "task" });
    } else {
      // Outside 7-day window: show routine fixed events matching this weekday.
      const dow = cellDate.getDay();
      for (const f of state.fixed || []) {
        if (!f.date && f.days && f.days.includes(dow)) events.push({ label: f.label, type: "fixed" });
      }
    }

    return {
      date:         cellDate,
      dateStr,
      dayNum:       cellDate.getDate(),
      month:        cellDate.getMonth(),
      isOtherMonth,
      isToday:      dateStr === todayStr,
      events,
    };
  });
}
