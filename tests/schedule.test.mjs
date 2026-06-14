import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSchedule, asText, fmtDur, toHHMM, toMin } from "../js/schedule.js";

// ── toHHMM / toMin round-trip ────────────────────────────────────────────────
test("toHHMM formats minutes to HH:MM", () => {
  assert.equal(toHHMM(0),    "00:00");
  assert.equal(toHHMM(60),   "01:00");
  assert.equal(toHHMM(90),   "01:30");
  assert.equal(toHHMM(1439), "23:59");
});

test("toHHMM wraps around midnight (1440 = 00:00)", () => {
  assert.equal(toHHMM(1440), "00:00");
  assert.equal(toHHMM(1500), "01:00");
});

test("toMin parses HH:MM string into total minutes", () => {
  assert.equal(toMin("00:00"), 0);
  assert.equal(toMin("01:30"), 90);
  assert.equal(toMin("23:59"), 1439);
});

// ── fmtDur ───────────────────────────────────────────────────────────────────
test("fmtDur formats durations correctly", () => {
  assert.equal(fmtDur(0),   "0m");
  assert.equal(fmtDur(30),  "30m");
  assert.equal(fmtDur(60),  "1h");
  assert.equal(fmtDur(90),  "1h 30m");
  assert.equal(fmtDur(120), "2h");
});

test("fmtDur handles negative/zero as 0m", () => {
  assert.equal(fmtDur(-5), "0m");
});

// ── buildSchedule basics ─────────────────────────────────────────────────────
function simpleCfg(overrides = {}) {
  return {
    wake:  "07:00",
    sleep: "23:00",
    fixed: [],
    meals: [],
    tasks: [],
    ...overrides,
  };
}

test("buildSchedule returns correct structure", () => {
  const r = buildSchedule(simpleCfg());
  assert.ok(Array.isArray(r.timeline));
  assert.ok(Array.isArray(r.placed));
  assert.ok(Array.isArray(r.deferred));
  assert.ok(Array.isArray(r.warnings));
  assert.ok(typeof r.summary === "object");
});

test("buildSchedule: no tasks → everything is free time", () => {
  const r = buildSchedule(simpleCfg());
  assert.equal(r.placed.length, 0);
  assert.equal(r.deferred.length, 0);
  // Free time = wake to sleep (07:00 to 23:00 = 960 min)
  assert.equal(r.summary.totalFree, 960);
  assert.equal(r.summary.requested, 0);
  assert.equal(r.summary.fits, true);
});

test("buildSchedule: single task fits in free time", () => {
  const r = buildSchedule(simpleCfg({
    tasks: [{ label: "Read book", category: "study", priority: "med", dur: 60 }],
  }));
  assert.equal(r.placed.length, 1);
  assert.equal(r.deferred.length, 0);
  assert.equal(r.summary.fits, true);
  assert.equal(r.placed[0].label, "Read book");
  assert.equal(r.placed[0].end - r.placed[0].start, 60);
});

test("buildSchedule: task placed after fixed block (no overlap)", () => {
  const r = buildSchedule(simpleCfg({
    fixed: [{ label: "Work", start: "09:00", end: "17:00" }],
    tasks: [{ label: "Gym", category: "chore", priority: "high", dur: 60 }],
  }));
  // The task must not overlap with 09:00–17:00
  const task = r.placed.find(p => p.label === "Gym");
  assert.ok(task, "Gym should be placed");
  const workStart = toMin("09:00");
  const workEnd   = toMin("17:00");
  const noOverlap = task.end <= workStart || task.start >= workEnd;
  assert.ok(noOverlap, `Gym (${toHHMM(task.start)}–${toHHMM(task.end)}) overlaps Work block`);
});

test("buildSchedule: timeline is sorted chronologically", () => {
  const r = buildSchedule(simpleCfg({
    fixed: [{ label: "Lunch meeting", start: "12:00", end: "13:00" }],
    tasks: [
      { label: "Task A", category: "study", priority: "high", dur: 45 },
      { label: "Task B", category: "project", priority: "low", dur: 30 },
    ],
  }));
  for (let i = 1; i < r.timeline.length; i++) {
    assert.ok(
      r.timeline[i].start >= r.timeline[i - 1].start,
      `Timeline not sorted at index ${i}`
    );
  }
});

test("buildSchedule: task too big to fit → deferred", () => {
  // Wake 07:00, sleep 08:00 = 60 min free; task needs 120 min and is NOT splittable
  const r = buildSchedule({
    wake: "07:00",
    sleep: "08:00",
    fixed: [],
    meals: [],
    tasks: [{ label: "Big task", category: "chore", priority: "high", dur: 120 }],
  });
  assert.equal(r.deferred.length, 1);
  assert.equal(r.deferred[0].label, "Big task");
  assert.equal(r.summary.fits, false);
});

test("buildSchedule: study task is splittable across gaps", () => {
  // 07:00–08:00 free (60), 09:00–10:00 free (60) — fixed block 08:00–09:00
  const r = buildSchedule({
    wake: "07:00",
    sleep: "10:00",
    fixed: [{ label: "Meeting", start: "08:00", end: "09:00" }],
    meals: [],
    tasks: [{ label: "Study", category: "study", priority: "high", dur: 90 }],
  });
  // Should be placed across two gaps
  const studyPieces = r.placed.filter(p => p.label === "Study");
  assert.ok(studyPieces.length >= 1, "Study should be placed in at least one chunk");
  const totalPlaced = studyPieces.reduce((a, p) => a + (p.end - p.start), 0);
  assert.equal(totalPlaced, 90);
  assert.equal(r.deferred.length, 0);
});

test("buildSchedule: fixed block with end before start → warning", () => {
  const r = buildSchedule(simpleCfg({
    fixed: [{ label: "Bad block", start: "10:00", end: "09:00" }],
  }));
  assert.ok(r.warnings.some(w => w.includes("Bad block")));
});

test("buildSchedule: high-priority task scheduled before low-priority", () => {
  const r = buildSchedule(simpleCfg({
    tasks: [
      { label: "Low",  category: "chore",   priority: "low",  dur: 30 },
      { label: "High", category: "chore",   priority: "high", dur: 30 },
    ],
  }));
  const highIdx = r.placed.findIndex(p => p.label === "High");
  const lowIdx  = r.placed.findIndex(p => p.label === "Low");
  assert.ok(highIdx !== -1, "High priority task should be placed");
  assert.ok(lowIdx  !== -1, "Low priority task should be placed");
  assert.ok(r.placed[highIdx].start <= r.placed[lowIdx].start,
    "High priority task should start no later than low priority task");
});

test("buildSchedule: summary.deficit is positive when tasks overflow", () => {
  // Only 60 min free, requesting 2×60 non-splittable tasks
  const r = buildSchedule({
    wake: "07:00",
    sleep: "08:00",
    fixed: [],
    meals: [],
    tasks: [
      { label: "T1", category: "chore", priority: "high", dur: 60 },
      { label: "T2", category: "chore", priority: "med",  dur: 60 },
    ],
  });
  assert.ok(r.summary.deficit > 0);
});

// ── asText ───────────────────────────────────────────────────────────────────
test("asText returns a non-empty string containing wake time", () => {
  const r = buildSchedule(simpleCfg());
  const txt = asText(r);
  assert.ok(typeof txt === "string");
  assert.ok(txt.includes("07:00"));
});

test("asText mentions deferred tasks when they exist", () => {
  const r = buildSchedule({
    wake: "07:00",
    sleep: "07:30",
    fixed: [],
    meals: [],
    tasks: [{ label: "Huge", category: "chore", priority: "high", dur: 120 }],
  });
  const txt = asText(r);
  assert.ok(txt.includes("Huge"));
  assert.ok(txt.includes("OVER") || txt.includes("Didn't fit"));
});

// ── toHHMM / toMin edge cases ─────────────────────────────────────────────────
test("toHHMM wraps negative minutes correctly (-1 → 23:59)", () => {
  assert.equal(toHHMM(-1),  "23:59");
  assert.equal(toHHMM(-60), "23:00");
});

test("toMin: midnight string '00:00' returns 0", () => {
  assert.equal(toMin("00:00"), 0);
});

test("toMin: single-digit hour edge '01:00' = 60", () => {
  assert.equal(toMin("01:00"), 60);
});

// ── fmtDur edge cases ─────────────────────────────────────────────────────────
test("fmtDur: exactly 1 hour returns '1h' (no trailing 0m)", () => {
  assert.equal(fmtDur(60), "1h");
});

test("fmtDur: large value 1440 = 24h", () => {
  assert.equal(fmtDur(1440), "24h");
});

// ── buildSchedule with meals ──────────────────────────────────────────────────
test("buildSchedule: meal block is treated as immovable", () => {
  const r = buildSchedule(simpleCfg({
    meals: [{ label: "Lunch", time: "12:00", dur: 30 }],
    tasks: [{ label: "Work", category: "chore", priority: "high", dur: 60 }],
  }));
  // Work must not overlap with Lunch (12:00–12:30)
  const work = r.placed.find(p => p.label === "Work");
  assert.ok(work, "Work should be placed");
  const lunchStart = toMin("12:00");
  const lunchEnd   = lunchStart + 30;
  const noOverlap  = work.end <= lunchStart || work.start >= lunchEnd;
  assert.ok(noOverlap, `Work overlaps Lunch`);
});

test("buildSchedule: meal appears in timeline", () => {
  const r = buildSchedule(simpleCfg({
    meals: [{ label: "Breakfast", time: "07:30", dur: 20 }],
  }));
  const meal = r.timeline.find(b => b.label === "Breakfast");
  assert.ok(meal, "Breakfast should appear in timeline");
  assert.equal(meal.type, "meal");
});

// ── overlapping fixed blocks warning ─────────────────────────────────────────
test("buildSchedule: overlapping fixed blocks → warning", () => {
  const r = buildSchedule(simpleCfg({
    fixed: [
      { label: "Meeting A", start: "09:00", end: "11:00" },
      { label: "Meeting B", start: "10:00", end: "12:00" },
    ],
  }));
  assert.ok(r.warnings.some(w => w.includes("Meeting A") || w.includes("Meeting B")),
    "Expected an overlap warning");
});

// ── summary.mostUrgent ────────────────────────────────────────────────────────
test("buildSchedule: mostUrgent reflects the task with smallest deadlineDays", () => {
  const r = buildSchedule(simpleCfg({
    tasks: [
      { label: "Relaxed", category: "chore", priority: "low", dur: 10, deadlineDays: 10 },
      { label: "Pressing", category: "chore", priority: "med", dur: 10, deadlineDays: 1 },
    ],
  }));
  assert.ok(r.summary.mostUrgent !== null);
  assert.equal(r.summary.mostUrgent.label, "Pressing");
  assert.equal(r.summary.mostUrgent.days, 1);
});

test("buildSchedule: mostUrgent is null when there are no tasks", () => {
  const r = buildSchedule(simpleCfg());
  assert.equal(r.summary.mostUrgent, null);
});

// ── asText with split study task ──────────────────────────────────────────────
test("asText includes part notation (1/2) for split study tasks", () => {
  const r = buildSchedule({
    wake: "07:00",
    sleep: "10:00",
    fixed: [{ label: "Meeting", start: "08:00", end: "09:00" }],
    meals: [],
    tasks: [{ label: "Study", category: "study", priority: "high", dur: 90 }],
  });
  const txt = asText(r);
  // Split task should produce a "(1/2)" or "(2/2)" annotation
  assert.ok(txt.includes("(1/") || txt.includes("(2/"),
    "Expected part notation for split task");
});

// ── zero-duration task skipped ────────────────────────────────────────────────
test("buildSchedule: task with dur=0 is ignored", () => {
  const r = buildSchedule(simpleCfg({
    tasks: [{ label: "Ghost", category: "chore", priority: "high", dur: 0 }],
  }));
  assert.equal(r.placed.length, 0);
  assert.equal(r.deferred.length, 0);
});

// ── deadlineDays default (null / empty string) ────────────────────────────────
test("buildSchedule: task with deadlineDays=null defaults to 14", () => {
  const r = buildSchedule(simpleCfg({
    tasks: [{ label: "Anytime", category: "chore", priority: "low", dur: 30, deadlineDays: null }],
  }));
  assert.equal(r.placed.length, 1);
  assert.equal(r.summary.mostUrgent.days, 14);
});

// ── scheduled = placed total ──────────────────────────────────────────────────
test("buildSchedule: summary.scheduled equals sum of placed durations", () => {
  const r = buildSchedule(simpleCfg({
    tasks: [
      { label: "A", category: "chore", priority: "high", dur: 45 },
      { label: "B", category: "chore", priority: "low",  dur: 30 },
    ],
  }));
  const sumPlaced = r.placed.reduce((a, p) => a + (p.end - p.start), 0);
  assert.equal(r.summary.scheduled, sumPlaced);
});
