import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWeek, DOW } from "../js/week.js";

// DOW[0]=Sun … DOW[6]=Sat
// todayDow=1 means today is Monday

function baseState(overrides = {}) {
  return {
    wake:  "07:00",
    sleep: "23:00",
    fixed: [],
    meals: [],
    tasks: [],
    goals: [],
    ...overrides,
  };
}

test("buildWeek returns 7 days", () => {
  const r = buildWeek(baseState(), 1);
  assert.equal(r.days.length, 7);
});

test("buildWeek: each day has expected fields", () => {
  const r = buildWeek(baseState(), 1);
  for (const day of r.days) {
    assert.ok(typeof day.name === "string");
    assert.ok(typeof day.free === "number");
    assert.ok(Array.isArray(day.timeline));
    assert.ok(Array.isArray(day.placed));
  }
});

test("buildWeek: days are in correct weekday order", () => {
  const r = buildWeek(baseState(), 1); // today = Monday (1)
  assert.equal(r.days[0].name, "Mon");
  assert.equal(r.days[1].name, "Tue");
  assert.equal(r.days[6].name, "Sun");
});

test("buildWeek: no tasks/goals → nothing placed, no deferred", () => {
  const r = buildWeek(baseState(), 1);
  const totalPlaced = r.days.reduce((a, d) => a + d.placed.length, 0);
  assert.equal(totalPlaced, 0);
  assert.equal(r.deferred.length, 0);
  assert.equal(r.summary.scheduled, 0);
});

test("buildWeek: simple task placed within the week", () => {
  const r = buildWeek(baseState({
    tasks: [{ label: "Write report", category: "project", priority: "high", dur: 60, deadlineDays: 3 }],
  }), 1);
  const allPlaced = r.days.flatMap(d => d.placed);
  const found = allPlaced.find(p => p.label === "Write report");
  assert.ok(found, "Write report should be placed");
  assert.equal(r.summary.fits, true);
});

test("buildWeek: study goal placed across the week", () => {
  const r = buildWeek(baseState({
    goals: [{ name: "Japanese", hoursPerWeek: 1 }],
  }), 1);
  const allPlaced = r.days.flatMap(d => d.placed);
  const goalPieces = allPlaced.filter(p => p.goal === "Japanese");
  const totalMin = goalPieces.reduce((a, p) => a + (p.end - p.start), 0);
  assert.ok(totalMin >= 60, `Expected >=60 minutes scheduled for Japanese goal, got ${totalMin}`);
});

test("buildWeek: task not scheduled past its deadline day", () => {
  // deadlineDays=1 means task must fit in day 0 or day 1 only
  const r = buildWeek(baseState({
    tasks: [{ label: "Urgent", category: "chore", priority: "high", dur: 30, deadlineDays: 1 }],
  }), 1);
  const allPlaced = r.days.flatMap((d, i) => d.placed.map(p => ({ ...p, dayIdx: i })));
  const urgentPlacements = allPlaced.filter(p => p.label === "Urgent");
  urgentPlacements.forEach(p => {
    assert.ok(p.dayIdx <= 1, `Urgent placed on day ${p.dayIdx}, beyond deadline`);
  });
});

test("buildWeek: summary totalFree = sum of per-day free time", () => {
  const r = buildWeek(baseState(), 1);
  const sumFree = r.days.reduce((a, d) => a + d.free, 0);
  assert.equal(r.summary.totalFree, sumFree);
});

test("buildWeek: fixed block on certain days only is applied selectively", () => {
  // Fixed only on Sunday (0)
  const r = buildWeek(baseState({
    fixed: [{ label: "Church", start: "10:00", end: "12:00", days: [0] }],
  }), 1); // today = Mon
  // Day 0 = Mon (dow=1) — no church
  const monImmovable = r.days[0].immovable;
  assert.ok(!monImmovable.some(b => b.label === "Church"), "No church on Monday");
  // Day 6 = Sun (dow=0) — church should appear
  const sunImmovable = r.days[6].immovable;
  assert.ok(sunImmovable.some(b => b.label === "Church"), "Church should appear on Sunday");
});

test("buildWeek: goalProgress tracks scheduled vs target", () => {
  const r = buildWeek(baseState({
    goals: [{ name: "Reading", hoursPerWeek: 2 }],
  }), 1);
  assert.ok(Array.isArray(r.goalProgress));
  const gp = r.goalProgress.find(g => g.name === "Reading");
  assert.ok(gp, "Reading goal should appear in goalProgress");
  assert.equal(gp.target, 120); // 2h = 120 min
  assert.ok(typeof gp.scheduled === "number");
});

test("buildWeek: timeline per day is sorted chronologically", () => {
  const r = buildWeek(baseState({
    tasks: [{ label: "T1", category: "study", priority: "high", dur: 30 }],
  }), 1);
  for (const day of r.days) {
    for (let i = 1; i < day.timeline.length; i++) {
      assert.ok(
        day.timeline[i].start >= day.timeline[i - 1].start,
        `Day ${day.name} timeline not sorted at index ${i}`
      );
    }
  }
});

// ── todayDow variations ────────────────────────────────────────────────────────
test("buildWeek: todayDow=0 (Sunday) → first day is Sun", () => {
  const r = buildWeek(baseState(), 0);
  assert.equal(r.days[0].name, "Sun");
  assert.equal(r.days[1].name, "Mon");
  assert.equal(r.days[6].name, "Sat");
});

test("buildWeek: todayDow=6 (Saturday) → first day is Sat", () => {
  const r = buildWeek(baseState(), 6);
  assert.equal(r.days[0].name, "Sat");
  assert.equal(r.days[1].name, "Sun");
});

// ── deferred tasks ────────────────────────────────────────────────────────────
test("buildWeek: non-splittable task too big for any gap → deferred", () => {
  // Wake 22:00, sleep 23:00 = 60 min per day; task needs 90 min, 7 days not enough for non-splittable
  const r = buildWeek({
    wake: "22:00",
    sleep: "23:00",
    fixed: [],
    meals: [],
    tasks: [{ label: "Massive", category: "chore", priority: "high", dur: 90 }],
    goals: [],
  }, 1);
  assert.ok(r.deferred.some(d => d.label === "Massive"), "Massive should be deferred");
  assert.equal(r.summary.fits, false);
});

test("buildWeek: task with deadlineDays=0 only placed on day 0 or deferred", () => {
  const r = buildWeek(baseState({
    tasks: [{ label: "Today", category: "chore", priority: "high", dur: 30, deadlineDays: 0 }],
  }), 1);
  const allPlaced = r.days.flatMap((d, i) => d.placed.map(p => ({ ...p, dayIdx: i })));
  const todayPlacements = allPlaced.filter(p => p.label === "Today");
  // Must only appear on day 0 (today)
  todayPlacements.forEach(p => {
    assert.ok(p.dayIdx === 0, `"Today" task placed on day ${p.dayIdx}, not day 0`);
  });
});

// ── no goals → goalProgress empty ────────────────────────────────────────────
test("buildWeek: no goals → goalProgress is empty array", () => {
  const r = buildWeek(baseState(), 1);
  assert.deepEqual(r.goalProgress, []);
});

// ── multiple goals ─────────────────────────────────────────────────────────────
test("buildWeek: multiple goals each tracked separately in goalProgress", () => {
  const r = buildWeek(baseState({
    goals: [
      { name: "Japanese", hoursPerWeek: 1 },
      { name: "Running",  hoursPerWeek: 1 },
    ],
  }), 1);
  assert.equal(r.goalProgress.length, 2);
  const names = r.goalProgress.map(g => g.name);
  assert.ok(names.includes("Japanese"));
  assert.ok(names.includes("Running"));
});

// ── summary.deficit ───────────────────────────────────────────────────────────
test("buildWeek: summary.deficit is 0 when everything fits", () => {
  const r = buildWeek(baseState({
    tasks: [{ label: "Small", category: "chore", priority: "low", dur: 10 }],
  }), 1);
  assert.equal(r.summary.deficit, 0);
});

// ── meal reheat when not cook day ─────────────────────────────────────────────
test("buildWeek: meal on non-cook day is shortened and labelled (Reheat)", () => {
  // Meal only cooks on Sunday (dow=0); today=Mon(1), so Mon is not a cook day
  const r = buildWeek(baseState({
    meals: [{ label: "Dinner", time: "18:00", dur: 60, days: [0] }],
  }), 1);
  // day 0 is Mon (dow=1) — not cook day, so meal should be Reheat on Monday
  const monDay = r.days[0];
  const reheatBlock = monDay.immovable.find(b => b.label.includes("Reheat"));
  assert.ok(reheatBlock, "Dinner (Reheat) should appear on Monday");
  // Reheat duration is capped at 15 min
  const dur = reheatBlock.end - reheatBlock.start;
  assert.ok(dur <= 15, `Reheat duration ${dur} exceeds 15 min`);
});

// ── fixed block with days=[] applies to all days ──────────────────────────────
test("buildWeek: fixed block with empty days array applies to all 7 days", () => {
  const r = buildWeek(baseState({
    fixed: [{ label: "Morning walk", start: "07:00", end: "07:30", days: [] }],
  }), 1);
  for (const day of r.days) {
    const block = day.immovable.find(b => b.label === "Morning walk");
    assert.ok(block, `Morning walk missing on ${day.name}`);
  }
});

// ── summary.requested = sum of all task durations ─────────────────────────────
test("buildWeek: summary.requested equals total duration of all tasks", () => {
  const r = buildWeek(baseState({
    tasks: [
      { label: "A", category: "chore", priority: "high", dur: 30 },
      { label: "B", category: "study", priority: "low",  dur: 45 },
    ],
    goals: [{ name: "Japanese", hoursPerWeek: 1 }],
  }), 1);
  // 30 + 45 = 75 for tasks, plus goal 60 min = 135 total requested
  assert.equal(r.summary.requested, 135);
});
