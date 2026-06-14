/**
 * tests/calendar.test.mjs
 *
 * Tests for js/calendar.js using node:test + node:assert.
 *
 * We test only the Node-safe exports: buildICS, timelineToEvents,
 * and googleCalendarUrl. downloadICS requires a DOM (document/URL)
 * and is guarded to be a no-op in Node, so we do not test its
 * download mechanics here — the guard itself is implicitly tested
 * by the fact that importing the module does not throw.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildICS, timelineToEvents, googleCalendarUrl } from "../js/calendar.js";

/* ── shared fixtures ──────────────────────────────────────────────────────── */

/** A known pair of Dates for deterministic assertions */
const D_START = new Date(2026, 5, 14, 9, 0, 0);   // 2026-06-14 09:00 local
const D_END   = new Date(2026, 5, 14, 10, 30, 0);  // 2026-06-14 10:30 local

const SIMPLE_EVENT = {
  title: "JLPT Study",
  start: D_START,
  end:   D_END,
};

/** Minimal single-event ICS string (reused across structure tests) */
const SIMPLE_ICS = buildICS([SIMPLE_EVENT]);

/* ── ICS structure ────────────────────────────────────────────────────────── */

describe("buildICS — calendar structure", () => {
  test("contains BEGIN:VCALENDAR and END:VCALENDAR", () => {
    assert.ok(SIMPLE_ICS.includes("BEGIN:VCALENDAR"), "missing BEGIN:VCALENDAR");
    assert.ok(SIMPLE_ICS.includes("END:VCALENDAR"),   "missing END:VCALENDAR");
  });

  test("contains VERSION:2.0", () => {
    assert.ok(SIMPLE_ICS.includes("VERSION:2.0"), "missing VERSION:2.0");
  });

  test("contains PRODID", () => {
    assert.ok(SIMPLE_ICS.includes("PRODID:"), "missing PRODID");
  });

  test("contains CALSCALE:GREGORIAN", () => {
    assert.ok(SIMPLE_ICS.includes("CALSCALE:GREGORIAN"), "missing CALSCALE:GREGORIAN");
  });

  test("contains BEGIN:VEVENT and END:VEVENT", () => {
    assert.ok(SIMPLE_ICS.includes("BEGIN:VEVENT"), "missing BEGIN:VEVENT");
    assert.ok(SIMPLE_ICS.includes("END:VEVENT"),   "missing END:VEVENT");
  });

  test("contains UID property", () => {
    assert.ok(SIMPLE_ICS.includes("UID:"), "missing UID");
  });

  test("contains DTSTAMP property", () => {
    assert.ok(SIMPLE_ICS.includes("DTSTAMP:"), "missing DTSTAMP");
  });

  test("contains SUMMARY with the event title", () => {
    assert.ok(SIMPLE_ICS.includes("SUMMARY:JLPT Study"), "missing SUMMARY");
  });

  test("contains DTSTART and DTEND properties", () => {
    assert.ok(SIMPLE_ICS.includes("DTSTART:"), "missing DTSTART");
    assert.ok(SIMPLE_ICS.includes("DTEND:"),   "missing DTEND");
  });

  test("produces one VEVENT per event", () => {
    const two = buildICS([SIMPLE_EVENT, { ...SIMPLE_EVENT, title: "Coding" }]);
    const count = (two.match(/BEGIN:VEVENT/g) || []).length;
    assert.equal(count, 2, "expected exactly 2 VEVENT blocks");
  });

  test("empty events array produces valid skeleton (no VEVENT)", () => {
    const ics = buildICS([]);
    assert.ok(ics.includes("BEGIN:VCALENDAR"));
    assert.ok(ics.includes("END:VCALENDAR"));
    assert.ok(!ics.includes("BEGIN:VEVENT"), "no VEVENT for empty array");
  });

  test("optional DESCRIPTION is included when provided", () => {
    const ics = buildICS([{ ...SIMPLE_EVENT, description: "Review N2 vocab" }]);
    assert.ok(ics.includes("DESCRIPTION:Review N2 vocab"));
  });

  test("optional LOCATION is included when provided", () => {
    const ics = buildICS([{ ...SIMPLE_EVENT, location: "Library" }]);
    assert.ok(ics.includes("LOCATION:Library"));
  });

  test("DESCRIPTION and LOCATION are absent when not provided", () => {
    assert.ok(!SIMPLE_ICS.includes("DESCRIPTION:"), "DESCRIPTION should be absent");
    assert.ok(!SIMPLE_ICS.includes("LOCATION:"),    "LOCATION should be absent");
  });

  test("custom PRODID is respected via opts", () => {
    const ics = buildICS([SIMPLE_EVENT], { prodId: "-//Test//Test//EN" });
    assert.ok(ics.includes("PRODID:-//Test//Test//EN"));
  });
});

/* ── CRLF line endings ────────────────────────────────────────────────────── */

describe("buildICS — CRLF line endings (RFC 5545 §3.1)", () => {
  test("all lines end with CRLF (\\r\\n)", () => {
    // The ICS string must contain \r\n
    assert.ok(SIMPLE_ICS.includes("\r\n"), "no \\r\\n found");
  });

  test("no bare LF (\\n) without a preceding \\r", () => {
    // Strip all \r\n, then check for stray \n
    const stripped = SIMPLE_ICS.replace(/\r\n/g, "");
    assert.ok(!stripped.includes("\n"), "found bare LF after removing all CRLF");
  });

  test("string ends with CRLF", () => {
    assert.ok(SIMPLE_ICS.endsWith("\r\n"), "ICS string does not end with CRLF");
  });
});

/* ── DTSTART / DTEND formatting ───────────────────────────────────────────── */

describe("buildICS — DTSTART/DTEND format", () => {
  test("DTSTART matches local datetime YYYYMMDDTHHMMSS (no Z)", () => {
    // 2026-06-14 09:00 local → 20260614T090000
    assert.ok(
      SIMPLE_ICS.includes("DTSTART:20260614T090000"),
      `Expected DTSTART:20260614T090000 in:\n${SIMPLE_ICS}`
    );
  });

  test("DTEND matches local datetime YYYYMMDDTHHMMSS (no Z)", () => {
    // 2026-06-14 10:30 local → 20260614T103000
    assert.ok(
      SIMPLE_ICS.includes("DTEND:20260614T103000"),
      `Expected DTEND:20260614T103000 in:\n${SIMPLE_ICS}`
    );
  });

  test("DTSTART has no trailing Z (floating/local time)", () => {
    const match = SIMPLE_ICS.match(/DTSTART:(\S+)/);
    assert.ok(match, "no DTSTART found");
    assert.ok(!match[1].endsWith("Z"), "DTSTART should not end with Z (floating time)");
  });

  test("DTSTAMP ends with Z (UTC, as required by RFC 5545)", () => {
    const match = SIMPLE_ICS.match(/DTSTAMP:(\S+)/);
    assert.ok(match, "no DTSTAMP found");
    // DTSTAMP may be folded — grab the actual stamp value
    const stampVal = match[1].replace(/\s/g, "");
    assert.ok(stampVal.endsWith("Z"), "DTSTAMP must be UTC (end with Z)");
  });
});

/* ── Text escaping ────────────────────────────────────────────────────────── */

describe("buildICS — text escaping (RFC 5545 §3.3.11)", () => {
  test("backslash in title is escaped as \\\\", () => {
    const ics = buildICS([{ ...SIMPLE_EVENT, title: "Path\\File" }]);
    assert.ok(ics.includes("SUMMARY:Path\\\\File"), "backslash not escaped");
  });

  test("semicolon in title is escaped as \\;", () => {
    const ics = buildICS([{ ...SIMPLE_EVENT, title: "A;B" }]);
    assert.ok(ics.includes("SUMMARY:A\\;B"), "semicolon not escaped");
  });

  test("comma in title is escaped as \\,", () => {
    const ics = buildICS([{ ...SIMPLE_EVENT, title: "Buy eggs, milk" }]);
    assert.ok(ics.includes("SUMMARY:Buy eggs\\, milk"), "comma not escaped");
  });

  test("newline in description is escaped as \\n", () => {
    const ics = buildICS([{ ...SIMPLE_EVENT, description: "Line1\nLine2" }]);
    assert.ok(ics.includes("DESCRIPTION:Line1\\nLine2"), "newline not escaped");
  });

  test("multiple special chars in one field are all escaped", () => {
    const ics = buildICS([{ ...SIMPLE_EVENT, title: "A\\B;C,D" }]);
    assert.ok(ics.includes("SUMMARY:A\\\\B\\;C\\,D"), "multiple specials not all escaped");
  });
});

/* ── Line folding ─────────────────────────────────────────────────────────── */

describe("buildICS — line folding (RFC 5545 §3.1)", () => {
  test("a SUMMARY longer than 75 chars is folded", () => {
    // "SUMMARY:" is 8 chars, so a 70-char title gives a 78-char line → must fold
    const longTitle = "A".repeat(70);
    const ics = buildICS([{ ...SIMPLE_EVENT, title: longTitle }]);
    // After folding, no raw (unescaped) line should exceed 75 chars
    const rawLines = ics.split("\r\n");
    for (const line of rawLines) {
      assert.ok(
        line.length <= 75,
        `Line exceeds 75 chars (${line.length}): "${line.slice(0, 80)}..."`
      );
    }
  });

  test("folded continuation lines start with a space", () => {
    const longTitle = "B".repeat(80);
    const ics = buildICS([{ ...SIMPLE_EVENT, title: longTitle }]);
    const rawLines = ics.split("\r\n");
    // At least one continuation line must start with a space
    const hasContinuation = rawLines.some(l => l.startsWith(" "));
    assert.ok(hasContinuation, "no folded continuation line (starts with space) found");
  });

  test("short lines are not folded", () => {
    // SUMMARY with short title: no continuation line should appear after SUMMARY
    const shortIcs = buildICS([SIMPLE_EVENT]);
    const lines = shortIcs.split("\r\n");
    const summaryIdx = lines.findIndex(l => l.startsWith("SUMMARY:"));
    assert.ok(summaryIdx !== -1, "SUMMARY not found");
    // The line after SUMMARY should NOT be a continuation (should not start with space)
    const next = lines[summaryIdx + 1] || "";
    assert.ok(!next.startsWith(" "), "short SUMMARY line should not be followed by continuation");
  });
});

/* ── UID stability ────────────────────────────────────────────────────────── */

describe("buildICS — UID stability", () => {
  test("same title+start produces the same UID on repeated calls", () => {
    const ics1 = buildICS([SIMPLE_EVENT]);
    const ics2 = buildICS([SIMPLE_EVENT]);
    const uid1 = ics1.match(/UID:(.+)/)?.[1]?.trim();
    const uid2 = ics2.match(/UID:(.+)/)?.[1]?.trim();
    assert.ok(uid1, "UID not found in first ICS");
    assert.ok(uid2, "UID not found in second ICS");
    assert.equal(uid1, uid2, "UIDs differ across calls for the same event");
  });

  test("different title produces different UID", () => {
    const ics1 = buildICS([SIMPLE_EVENT]);
    const ics2 = buildICS([{ ...SIMPLE_EVENT, title: "Something Else" }]);
    const uid1 = ics1.match(/UID:(.+)/)?.[1]?.trim();
    const uid2 = ics2.match(/UID:(.+)/)?.[1]?.trim();
    assert.notEqual(uid1, uid2, "UIDs should differ for different titles");
  });

  test("UID contains @dailyplanner.local domain", () => {
    const uid = SIMPLE_ICS.match(/UID:(.+)/)?.[1]?.trim();
    assert.ok(uid?.includes("@dailyplanner.local"), "UID missing domain suffix");
  });
});

/* ── timelineToEvents ─────────────────────────────────────────────────────── */

describe("timelineToEvents — mapping", () => {
  const BASE_DATE = new Date(2026, 5, 14); // 2026-06-14

  test("converts minutes-from-midnight to correct Date objects", () => {
    const timeline = [
      { label: "Study", start: 540, end: 600, type: "task", category: "study" },
      // 540 min = 09:00, 600 min = 10:00
    ];
    const events = timelineToEvents(timeline, BASE_DATE);
    assert.equal(events.length, 1);
    assert.equal(events[0].start.getHours(),   9, "start hour should be 9");
    assert.equal(events[0].start.getMinutes(), 0, "start minute should be 0");
    assert.equal(events[0].end.getHours(),   10, "end hour should be 10");
    assert.equal(events[0].end.getMinutes(), 0,  "end minute should be 0");
  });

  test("skips blocks with type 'free'", () => {
    const timeline = [
      { label: "Study",  start: 540, end: 600, type: "task", category: "study" },
      { label: "Free",   start: 600, end: 660, type: "free" },
      { label: "Coding", start: 660, end: 750, type: "task", category: "project" },
    ];
    const events = timelineToEvents(timeline, BASE_DATE);
    assert.equal(events.length, 2, "free block should be skipped");
    assert.ok(events.every(e => e.title !== "Free"), "'Free' block leaked through");
  });

  test("includes fixed and meal blocks", () => {
    const timeline = [
      { label: "Class",     start: 540, end: 630, type: "fixed" },
      { label: "Lunch",     start: 750, end: 790, type: "meal" },
    ];
    const events = timelineToEvents(timeline, BASE_DATE);
    assert.equal(events.length, 2);
    assert.equal(events[0].title, "Class");
    assert.equal(events[1].title, "Lunch");
  });

  test("returns correct title for simple (non-split) task", () => {
    const timeline = [
      { label: "Chore", start: 480, end: 510, type: "task", category: "chore", part: 1, parts: 1 },
    ];
    const events = timelineToEvents(timeline, BASE_DATE);
    // parts === 1, so no part indicator appended
    assert.equal(events[0].title, "Chore");
  });

  test("appends part/parts to title for split tasks", () => {
    const timeline = [
      { label: "JLPT", start: 480, end: 540, type: "task", category: "study", part: 1, parts: 2 },
      { label: "JLPT", start: 720, end: 780, type: "task", category: "study", part: 2, parts: 2 },
    ];
    const events = timelineToEvents(timeline, BASE_DATE);
    assert.equal(events[0].title, "JLPT (1/2)");
    assert.equal(events[1].title, "JLPT (2/2)");
  });

  test("returns events with description containing category for task blocks", () => {
    const timeline = [
      { label: "Study", start: 540, end: 600, type: "task", category: "study" },
    ];
    const events = timelineToEvents(timeline, BASE_DATE);
    assert.ok(events[0].description.includes("study"), "description should mention category");
  });

  test("empty timeline returns empty array", () => {
    const events = timelineToEvents([], BASE_DATE);
    assert.equal(events.length, 0);
  });

  test("all-free timeline returns empty array", () => {
    const timeline = [
      { label: "Free", start: 420, end: 540, type: "free" },
      { label: "Free", start: 540, end: 660, type: "free" },
    ];
    const events = timelineToEvents(timeline, BASE_DATE);
    assert.equal(events.length, 0);
  });

  test("produced events pass through buildICS without error", () => {
    const timeline = [
      { label: "Class",  start: 540, end: 630, type: "fixed" },
      { label: "Free",   start: 630, end: 660, type: "free" },
      { label: "Coding", start: 660, end: 750, type: "task", category: "project", part: 1, parts: 1 },
    ];
    const events = timelineToEvents(timeline, BASE_DATE);
    const ics = buildICS(events);
    // Should produce a valid ICS with exactly 2 VEVENTs (free skipped)
    const count = (ics.match(/BEGIN:VEVENT/g) || []).length;
    assert.equal(count, 2);
  });
});

/* ── googleCalendarUrl ────────────────────────────────────────────────────── */

describe("googleCalendarUrl — URL generation", () => {
  test("returns a URL starting with google.com/calendar", () => {
    const url = googleCalendarUrl(SIMPLE_EVENT);
    assert.ok(url.startsWith("https://calendar.google.com/calendar/render"), "wrong base URL");
  });

  test("includes action=TEMPLATE", () => {
    const url = googleCalendarUrl(SIMPLE_EVENT);
    assert.ok(url.includes("action=TEMPLATE"), "missing action=TEMPLATE");
  });

  test("includes URL-encoded title in text param", () => {
    const url = googleCalendarUrl(SIMPLE_EVENT);
    // URLSearchParams encodes spaces as +; decoding should recover the title
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("text"), "JLPT Study");
  });

  test("includes dates param in correct format", () => {
    const url = googleCalendarUrl(SIMPLE_EVENT);
    const parsed = new URL(url);
    const dates = parsed.searchParams.get("dates");
    assert.ok(dates, "no dates param");
    // dates should be two datetime strings separated by /
    assert.ok(dates.includes("/"), "dates param missing /");
    const [s, e] = dates.split("/");
    assert.equal(s, "20260614T090000", `start date wrong: ${s}`);
    assert.equal(e, "20260614T103000", `end date wrong: ${e}`);
  });

  test("includes details param when description is provided", () => {
    const url = googleCalendarUrl({ ...SIMPLE_EVENT, description: "Review vocab" });
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("details"), "Review vocab");
  });

  test("includes location param when location is provided", () => {
    const url = googleCalendarUrl({ ...SIMPLE_EVENT, location: "Library" });
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("location"), "Library");
  });

  test("omits details and location when not provided", () => {
    const url = googleCalendarUrl(SIMPLE_EVENT);
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("details"),  null, "details should be absent");
    assert.equal(parsed.searchParams.get("location"), null, "location should be absent");
  });
});

/* ── module-level smoke test: downloadICS is a no-op under Node ───────────── */

describe("downloadICS — Node.js guard", () => {
  test("importing the module under Node does not throw", async () => {
    // The import at the top of this file already succeeded; just assert that
    // downloadICS is exported and calling it in Node is safe (returns undefined).
    const mod = await import("../js/calendar.js");
    assert.equal(typeof mod.downloadICS, "function", "downloadICS should be exported");
    // Should not throw even though document/URL don't exist in Node
    assert.doesNotThrow(() => mod.downloadICS("test.ics", "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n"));
  });
});
