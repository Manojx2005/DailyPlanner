"use strict";
/**
 * calendar.js — iCalendar (.ics) export module for DailyPlanner
 *
 * Exports:
 *   buildICS(events, opts)        → iCalendar string
 *   timelineToEvents(timeline, baseDate) → event objects from schedule blocks
 *   downloadICS(filename, icsString)     → triggers browser download
 *
 * Design decisions:
 *
 * FLOATING / LOCAL TIME (no "Z" suffix, no TZID):
 *   RFC 5545 §3.3.5 calls this "floating" or "local" time. The calendar client
 *   interprets the wall-clock value in whatever timezone the device is set to,
 *   which is exactly what we want: a study block at 09:00 should appear at 09:00
 *   on the user's phone in Tokyo, Seoul, or London without any timezone math.
 *   Format: DTSTART:YYYYMMDDTHHMMSS (no trailing Z).
 *
 * STABLE UIDs:
 *   Each event's UID is built from a lightweight djb2 hash of the event's
 *   ISO title+start string, plus a fixed domain suffix. The hash is deterministic
 *   for the same input, so re-exporting the same plan produces identical UIDs and
 *   most calendar apps will update the existing event rather than duplicate it.
 *   Format: <hex8>-<hex8>@dailyplanner.local
 *
 * LINE FOLDING (RFC 5545 §3.1):
 *   iCalendar lines are limited to 75 octets (bytes). Lines exceeding this must be
 *   folded by inserting CRLF + a single SPACE (WSP) before the 76th octet and
 *   continuing on the next line. This implementation folds at the character level
 *   (safe for pure ASCII; for multi-byte UTF-8 a byte-level fold would be needed
 *   but DailyPlanner labels are typically ASCII/short Japanese which stays within
 *   the 75-char limit on multi-byte runs).
 *
 * TEXT ESCAPING (RFC 5545 §3.3.11):
 *   Backslash → \\   Semicolon → \;   Comma → \,   Newline → \n
 */

/* ── helpers ──────────────────────────────────────────────────────────────── */

/**
 * djb2 hash (Daniel J. Bernstein) — fast, simple, good distribution for strings.
 * Returns an unsigned 32-bit integer.
 * @param {string} str
 * @returns {number}
 */
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0; // keep unsigned 32-bit
  }
  return h;
}

/**
 * Produce a stable UID for a calendar event.
 * Hashes the event's title + ISO start string so the same event always gets
 * the same UID and calendar apps can de-duplicate on re-import.
 * @param {string} title
 * @param {Date} start
 * @param {number} index  — fallback disambiguator when title+start collide
 * @returns {string}
 */
function makeUID(title, start, index) {
  const seed = `${title}|${start.toISOString()}|${index}`;
  const h1 = djb2(seed).toString(16).padStart(8, "0");
  const h2 = djb2(seed + "x").toString(16).padStart(8, "0");
  return `${h1}-${h2}@dailyplanner.local`;
}

/**
 * Escape special characters in an iCalendar TEXT value (RFC 5545 §3.3.11).
 * Order matters: backslash must be escaped first.
 * @param {string} str
 * @returns {string}
 */
function escICS(str) {
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/;/g,  "\\;")
    .replace(/,/g,  "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Format a Date as a local (floating) iCalendar datetime string.
 * Produces YYYYMMDDTHHMMSS — no trailing Z, no TZID prefix.
 * @param {Date} d
 * @returns {string}
 */
function fmtDT(d) {
  const pad = n => String(n).padStart(2, "0");
  return (
    String(d.getFullYear()) +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "T" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

/**
 * Format a Date as a UTC iCalendar datetime (for DTSTAMP only).
 * DTSTAMP must be UTC per RFC 5545 §3.8.7.2.
 * @param {Date} d
 * @returns {string}
 */
function fmtDTStamp(d) {
  const pad = n => String(n).padStart(2, "0");
  return (
    String(d.getUTCFullYear()) +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

/**
 * Fold a single iCalendar content line to max 75 octets per line (RFC 5545 §3.1).
 * A continuation line begins with a single space (WSP) character.
 * @param {string} line  — the unfolded content line (no CRLF)
 * @returns {string}     — folded line(s), no trailing CRLF
 */
function foldLine(line) {
  // Fast path: line is already short enough
  if (line.length <= 75) return line;

  const parts = [];
  // First chunk: up to 75 chars
  parts.push(line.slice(0, 75));
  let i = 75;
  // Subsequent chunks: up to 74 chars each (because a leading space occupies one)
  while (i < line.length) {
    parts.push(" " + line.slice(i, i + 74));
    i += 74;
  }
  return parts.join("\r\n");
}

/* ── public API ───────────────────────────────────────────────────────────── */

/**
 * Build a valid iCalendar string from an array of event objects.
 *
 * @param {Array<{
 *   title: string,
 *   start: Date,
 *   end: Date,
 *   description?: string,
 *   location?: string
 * }>} events
 * @param {object} [opts]
 * @param {string} [opts.prodId]  — custom PRODID (defaults to DailyPlanner)
 * @returns {string}  — complete iCalendar text with CRLF line endings
 */
export function buildICS(events, opts = {}) {
  const prodId = opts.prodId || "-//DailyPlanner//DailyPlanner 1.0//EN";
  const now = new Date();
  const dtstamp = fmtDTStamp(now);

  // Lines are accumulated unfolded, then folded + joined with CRLF at the end
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${prodId}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  events.forEach((ev, idx) => {
    const uid = makeUID(ev.title, ev.start, idx);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART:${fmtDT(ev.start)}`);
    lines.push(`DTEND:${fmtDT(ev.end)}`);
    lines.push(`SUMMARY:${escICS(ev.title)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escICS(ev.description)}`);
    if (ev.location)    lines.push(`LOCATION:${escICS(ev.location)}`);
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");

  // Fold each line and join with CRLF (RFC 5545 requires CRLF everywhere)
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/**
 * Convert DailyPlanner timeline blocks into calendar event objects.
 *
 * Each block in `timeline` has the shape:
 *   { label, start, end, type?, category?, part?, parts? }
 * where `start` and `end` are MINUTES from midnight.
 *
 * "free" blocks are skipped (no need to block them in the calendar).
 * Multi-part task blocks include "(part/parts)" in their title so the user
 * can see that a task was split.
 *
 * @param {Array<{label:string, start:number, end:number, type?:string, category?:string, part?:number, parts?:number}>} timeline
 * @param {Date} baseDate  — the calendar day (year/month/date used; time ignored)
 * @returns {Array<{title:string, start:Date, end:Date, description:string}>}
 */
export function timelineToEvents(timeline, baseDate) {
  // Build a clean midnight Date for the given day (local time)
  const midnight = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    0, 0, 0, 0
  );

  const results = [];

  for (const block of timeline) {
    // Skip free blocks — no point in exporting empty time
    if (block.type === "free") continue;

    // Build title, appending part indicator for split tasks
    let title = block.label;
    if (block.parts > 1) title += ` (${block.part}/${block.parts})`;

    // Build description from available metadata
    const descParts = [];
    if (block.type === "task" && block.category) {
      descParts.push(`Type: ${block.category}`);
    }
    if (block.type && block.type !== "task") {
      descParts.push(`Type: ${block.type}`);
    }
    const description = descParts.join("\\n"); // iCS newline escape

    // Convert minutes-from-midnight to absolute Date objects
    const startDate = new Date(midnight.getTime() + block.start * 60 * 1000);
    const endDate   = new Date(midnight.getTime() + block.end   * 60 * 1000);

    results.push({
      title,
      start: startDate,
      end:   endDate,
      description,
    });
  }

  return results;
}

/**
 * Trigger a browser file download of the given iCalendar string.
 *
 * Creates a temporary Blob URL, clicks a hidden <a> element to start the
 * download, then revokes the object URL to free memory. Guarded so that
 * importing this module under Node.js (for testing) does not crash — the
 * `document` and `URL` globals are only accessed when they exist.
 *
 * @param {string} filename    — e.g. "dayplan.ics"
 * @param {string} icsString   — the string returned by buildICS()
 */
export function downloadICS(filename, icsString) {
  // Guard: do nothing in non-browser environments (Node.js test runner, SSR)
  if (typeof document === "undefined" || typeof URL === "undefined") return;

  const blob = new Blob([icsString], { type: "text/calendar;charset=utf-8" });
  const url  = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Release the object URL immediately after click is dispatched
  URL.revokeObjectURL(url);
}

