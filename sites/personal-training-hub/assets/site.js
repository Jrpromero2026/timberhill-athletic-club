/* ──────────────────────────────────────────────────────────────────────────
   site.js — the four interactive behaviours on the Personal Training routes.

   No dependencies, no build step. Every behaviour is progressive: the markup
   it enhances is complete and readable with JavaScript disabled, which is why
   the trainer roster and the FAQ are server-rendered HTML rather than
   client-rendered from data/trainers.json. That file is the source of truth
   for the WordPress `trainer` post type import; it is not fetched at runtime,
   so the roster and the FAQ stay in the crawlable document.

     1 · navigation    mobile menu, and the Personal Training dropdown
     2 · disclosures   FAQ accordions and trainer philosophy expanders
     3 · filter        trainers index, by specialty
     4 · sticky CTA    mobile, suppressed beside an in-page primary CTA
     5 · analytics     one CTA event, source section as a parameter
   ────────────────────────────────────────────────────────────────────────── */

(function () {
  "use strict";

  /* ═══ 1 · navigation ═══════════════════════════════════════════════════ */

  function initNav() {
    var toggle = document.querySelector("[data-menu-toggle]");
    var menu = document.getElementById("mobile-menu");

    if (toggle && menu) {
      toggle.addEventListener("click", function () {
        var open = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!open));
        menu.hidden = open;
      });
    }

    // The Personal Training parent is a real link; this control only opens the
    // submenu. On a pointer device hover opens it as well, which is what a
    // promoted Divi dropdown does — but hover and click must not cancel each
    // other out. Clicking pins the menu open so it survives the pointer
    // leaving; clicking again unpins and closes it.
    var canHover = window.matchMedia && window.matchMedia("(hover: hover)").matches;

    document.querySelectorAll("[data-disclose]").forEach(function (btn) {
      var panel = document.getElementById(btn.getAttribute("data-disclose"));
      if (!panel) return;
      var host = btn.closest(".nav-has-drop");
      var pinned = false;

      function set(open) {
        btn.setAttribute("aria-expanded", String(open));
        panel.hidden = !open;
      }

      btn.addEventListener("click", function () {
        pinned = !pinned;
        set(pinned);
      });

      if (host && canHover) {
        host.addEventListener("mouseenter", function () { set(true); });
        host.addEventListener("mouseleave", function () { if (!pinned) set(false); });
      }

      if (host) {
        host.addEventListener("focusout", function (e) {
          if (!host.contains(e.relatedTarget)) { pinned = false; set(false); }
        });
      }

      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && !panel.hidden) {
          pinned = false;
          set(false);
          btn.focus();
        }
      });
    });
  }

  /* ═══ 2 · disclosures ══════════════════════════════════════════════════ */

  /* One panel open at a time within a group, matching the design. A group
     with data-open-index starts with that item open; without it, all start
     collapsed — which is what the hub FAQ requires on mobile. */
  function initDisclosures() {
    document.querySelectorAll("[data-disclosure-group]").forEach(function (group) {
      var triggers = Array.prototype.slice.call(
        group.querySelectorAll("[data-disclosure]")
      );

      function panelFor(trigger) {
        return document.getElementById(trigger.getAttribute("aria-controls"));
      }

      function set(trigger, open) {
        var panel = panelFor(trigger);
        if (!panel) return;
        trigger.setAttribute("aria-expanded", String(open));
        panel.hidden = !open;

        var chev = trigger.querySelector("[data-chev]");
        if (chev) chev.textContent = open ? "–" : "+";

        var label = trigger.querySelector("[data-label]");
        if (label) {
          label.textContent = open
            ? label.getAttribute("data-label-open")
            : label.getAttribute("data-label-closed");
        }
      }

      triggers.forEach(function (trigger, i) {
        set(trigger, String(i) === group.getAttribute("data-open-index"));

        trigger.addEventListener("click", function () {
          var willOpen = trigger.getAttribute("aria-expanded") !== "true";
          triggers.forEach(function (other) { set(other, false); });
          if (willOpen) set(trigger, true);
        });
      });
    });
  }

  /* ═══ 3 · specialty filter ═════════════════════════════════════════════ */

  /* Filters the cards already in the document. The specialty vocabulary is
     fixed — free text breaks this filter, which is why the taxonomy is a
     closed list on the post type. BUILD_BRIEF §6. */
  function initFilter() {
    var bar = document.querySelector("[data-filter-bar]");
    var roster = document.querySelector("[data-roster]");
    if (!bar || !roster) return;

    var chips = Array.prototype.slice.call(bar.querySelectorAll("[data-specialty]"));
    var cards = Array.prototype.slice.call(roster.querySelectorAll("[data-trainer]"));
    var count = document.querySelector("[data-roster-count]");
    var empty = document.querySelector("[data-roster-empty]");
    var emptyTitle = document.querySelector("[data-roster-empty-title]");
    var total = cards.length;

    function apply(specialty) {
      var shown = 0;

      cards.forEach(function (card) {
        var list = (card.getAttribute("data-specialties") || "").split("|");
        var match = !specialty || list.indexOf(specialty) !== -1;
        card.hidden = !match;
        if (match) shown++;
      });

      chips.forEach(function (chip) {
        chip.setAttribute(
          "aria-pressed",
          String((chip.getAttribute("data-specialty") || "") === (specialty || ""))
        );
      });

      if (count) {
        count.textContent = specialty
          ? shown + (shown === 1 ? " trainer" : " trainers") + " · " + specialty
          : total + " trainers published";
      }
      if (empty) empty.hidden = shown !== 0;
      if (emptyTitle && specialty) {
        emptyTitle.textContent = "No trainer currently lists " + specialty;
      }
      if (roster) roster.hidden = shown === 0;
    }

    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        apply(chip.getAttribute("data-specialty") || null);
      });
    });

    apply(null);
  }

  /* ═══ 4 · sticky CTA ═══════════════════════════════════════════════════ */

  /* Shown once the hero has left the viewport, and hidden again whenever any
     in-page primary CTA is on screen — so a visitor never sees two primary
     CTAs at once. BUILD_BRIEF §2 and §9. */
  function initStickyCta() {
    var bar = document.querySelector("[data-sticky-cta]");
    if (!bar) return;

    var hero = document.querySelector("[data-hero]");
    var inPage = Array.prototype.slice.call(document.querySelectorAll("[data-primary-cta]"));

    if (!("IntersectionObserver" in window)) {
      // Without the observer, showing the bar unconditionally is the safer
      // failure: the primary CTA stays reachable.
      bar.classList.add("is-on");
      return;
    }

    var heroVisible = !!hero;
    var ctaVisible = false;
    var visibleCtas = new Set();

    function update() {
      bar.classList.toggle("is-on", !heroVisible && !ctaVisible);
    }

    if (hero) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { heroVisible = e.isIntersecting; });
        update();
      }).observe(hero);
    }

    if (inPage.length) {
      var ctaObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) visibleCtas.add(e.target);
          else visibleCtas.delete(e.target);
        });
        ctaVisible = visibleCtas.size > 0;
        update();
      });
      inPage.forEach(function (el) { ctaObserver.observe(el); });
    }

    update();
  }

  /* ═══ 5 · analytics ════════════════════════════════════════════════════ */

  /* One event for the primary CTA, with the source section as a parameter:
     hero · how-it-works · team · options · final · sticky. Without the
     parameter the placement map cannot be evaluated after launch.
     BUILD_BRIEF §9. */
  function initAnalytics() {
    document.addEventListener("click", function (e) {
      var el = e.target.closest ? e.target.closest("[data-cta-section]") : null;
      if (!el) return;

      var payload = {
        event: "consultation_cta_click",
        cta_section: el.getAttribute("data-cta-section"),
        page_route: window.location.pathname
      };

      if (typeof window.gtag === "function") {
        window.gtag("event", payload.event, {
          cta_section: payload.cta_section,
          page_route: payload.page_route
        });
      } else if (Array.isArray(window.dataLayer)) {
        window.dataLayer.push(payload);
      }
    });
  }

  function init() {
    initNav();
    initDisclosures();
    initFilter();
    initStickyCta();
    initAnalytics();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
