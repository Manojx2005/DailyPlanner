"use strict";
/* ---------- motion fx — powered by anime.js ----------
   Spring-physics animations for cards, panels, tab indicator, and modals.
   All guarded by prefers-reduced-motion. */

import anime from '../node_modules/animejs/lib/anime.es.js';

const reduce = () => window.matchMedia?.("(prefers-reduced-motion:reduce)").matches;

/* Track whether the tab indicator has been shown at least once.
   First appearance snaps into position (no spring from wrong coords);
   every subsequent switch uses the spring slide. */
let _indicatorReady = false;

/* Staggered spring entrance on every .card inside a panel */
export function staggerCards(panel) {
  if (!panel || reduce()) return;
  const cards = [...panel.querySelectorAll(".card")];
  if (!cards.length) return;
  cards.forEach(c => {
    c.style.opacity = "0";
    c.style.transform = "translateY(20px) scale(0.98)";
  });
  anime({
    targets: cards,
    opacity: [0, 1],
    translateY: [20, 0],
    scale: [0.98, 1],
    delay: anime.stagger(55, { easing: "easeOutQuad" }),
    duration: 600,
    easing: "spring(1, 80, 12, 0)",
  });
}

/* Position (and optionally spring-slide) the tab indicator pill.
   Call once at initial load to snap & fade in, then on every tab switch
   to spring-animate to the new tab's position. */
export function animateTabIndicator(tabEl) {
  const ind = document.getElementById("tabIndicator");
  const bar = document.getElementById("tabBar");
  if (!ind || !bar || !tabEl) return;

  const barRect = bar.getBoundingClientRect();
  const tabRect = tabEl.getBoundingClientRect();
  const left = tabRect.left - barRect.left;
  const width = tabRect.width;

  if (reduce()) {
    ind.style.left = left + "px";
    ind.style.width = width + "px";
    ind.style.opacity = "1";
    _indicatorReady = true;
    return;
  }

  if (!_indicatorReady) {
    /* First show: snap to position, then fade in */
    _indicatorReady = true;
    ind.style.left = left + "px";
    ind.style.width = width + "px";
    anime({ targets: ind, opacity: [0, 1], duration: 280, easing: "easeOutQuart" });
    return;
  }

  /* Subsequent switches: spring slide */
  anime({
    targets: ind,
    left,
    width,
    opacity: 1,
    duration: 500,
    easing: "spring(1, 90, 14, 0)",
  });
}

/* Fade-up entrance for a panel (replaces panelIn / panelFadeUp CSS) */
export function animatePanel(panel) {
  if (!panel || reduce()) return;
  panel.style.opacity = "0";
  panel.style.transform = "translateY(10px)";
  anime({
    targets: panel,
    opacity: [0, 1],
    translateY: [10, 0],
    duration: 320,
    easing: "spring(1, 80, 10, 0)",
  });
}

/* Spring-scale entrance for a modal dialog */
export function animateModal(el) {
  if (!el || reduce()) return;
  anime({
    targets: el,
    opacity: [0, 1],
    translateY: [16, 0],
    scale: [0.95, 1],
    duration: 400,
    easing: "spring(1, 80, 12, 0)",
  });
}
