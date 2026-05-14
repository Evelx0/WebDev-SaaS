// Generic landing starter — minimal progressive enhancement.
// No tracking, no third-party requests, no cookies.
(function () {
  "use strict";

  // Year in footer
  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  // Smooth-scroll for in-page anchors — respects reduced motion
  var prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;
    var anchor = target.closest('a[href^="#"]');
    if (!anchor) return;
    var hash = anchor.getAttribute("href");
    if (!hash || hash === "#" || hash.length < 2) return;
    var el = document.querySelector(hash);
    if (!el) return;

    event.preventDefault();
    el.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
    if (!el.hasAttribute("tabindex")) {
      el.setAttribute("tabindex", "-1");
    }
    el.focus({ preventScroll: true });
    if (history && typeof history.replaceState === "function") {
      history.replaceState(null, "", hash);
    }
  });

  // Scroll-triggered reveals — added via JS so no-JS users always see content
  if ("IntersectionObserver" in window && !prefersReducedMotion) {
    var revealObs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.07, rootMargin: "0px 0px -32px 0px" }
    );

    var revealTargets = document.querySelectorAll(
      ".section, .hero-card, .service, .process li, .maint-list li, .places li"
    );
    revealTargets.forEach(function (el) {
      el.classList.add("reveal");
      revealObs.observe(el);
    });
  }

  // Nav scroll state
  var header = document.querySelector(".site-header");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("scrolled", window.scrollY > 16);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
})();
