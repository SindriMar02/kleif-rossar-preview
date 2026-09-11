(() => {
  "use strict";
  const hero = document.querySelector(".home-film");
  if (!hero) return;
  const video = hero.querySelector("video"),
    toggle = hero.querySelector(".home-film-toggle");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  let pausedByVisitor = false,
    blockedByAutoplay = false,
    inView = true,
    failed = false,
    openingHold = false;
  const motionAllowed = () =>
    !reduce.matches &&
    !document.documentElement.classList.contains("no-motion");
  // The element carries autoplay and its own <source media> pair, so the film
  // can start during parse with no JavaScript at all. This file no longer owns
  // the source or the first play; it owns pausing, the visitor's toggle, and
  // retrying when the browser refuses.
  function updateToggle() {
    toggle.setAttribute(
      "aria-label",
      video.paused ? "Play the film" : "Pause the film",
    );
    toggle.querySelector(".film-action").textContent = video.paused
      ? "Play film"
      : "Pause film";
    toggle.firstElementChild.textContent = video.paused ? "▷" : "Ⅱ";
  }
  function syncFilm() {
    if (!motionAllowed() || failed) {
      video.pause();
      // autoplay is on the element now, so a reduced-motion visitor would keep
      // pulling the file down in the background. Detach it.
      if (!failed && video.networkState !== HTMLMediaElement.NETWORK_EMPTY) {
        video.removeAttribute("autoplay");
        video.querySelectorAll("source").forEach((n) => n.remove());
        video.load();
      }
      hero.classList.remove("has-film");
      toggle.hidden = true;
      return;
    }
    toggle.hidden = false;
    if (pausedByVisitor || openingHold || !inView || document.hidden) {
      video.pause();
      return;
    }
    if (!video.paused) return;
    video.play().catch((error) => {
      if (
        error.name === "AbortError" ||
        !inView ||
        document.hidden ||
        !motionAllowed()
      )
        return;
      // The browser refusing is not the same as the visitor pausing, and this
      // used to be recorded as the latter. Low Power Mode on iOS and a source
      // that has not buffered yet both land here, and both recover on their own,
      // but once pausedByVisitor was set syncFilm returned early for the rest of
      // the visit and the film never started. Surface the control and keep
      // trying instead of giving up.
      blockedByAutoplay = true;
      updateToggle();
    });
  }
  video.addEventListener("playing", () => {
    blockedByAutoplay = false;
    hero.classList.add("has-film");
    updateToggle();
  });
  // Belt and braces on top of the attribute: if the browser refused, try again
  // as soon as there is something to play.
  video.addEventListener("loadeddata", syncFilm);
  video.addEventListener("canplay", syncFilm);
  // Last resort: iOS honours play() inside a user gesture even when it refused
  // the automatic attempt. Any touch anywhere starts it, and the listeners
  // remove themselves once it is running.
  const kickstart = () => {
    if (!blockedByAutoplay || pausedByVisitor) return;
    syncFilm();
  };
  ["pointerdown", "touchstart", "keydown"].forEach((type) =>
    addEventListener(type, kickstart, { passive: true }),
  );
  video.addEventListener("pause", updateToggle);
  video.addEventListener("error", () => {
    failed = true;
    hero.classList.remove("has-film");
    toggle.hidden = true;
  });
  toggle.addEventListener("click", () => {
    pausedByVisitor = !video.paused;
    syncFilm();
  });
  reduce.addEventListener("change", syncFilm);
  const observer = new MutationObserver(syncFilm);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  const visibility = new IntersectionObserver(
    ([entry]) => {
      inView = entry.isIntersecting;
      syncFilm();
    },
    { threshold: 0.05 },
  );
  visibility.observe(hero);
  document.addEventListener("visibilitychange", syncFilm);
  addEventListener("pagehide", () => video.pause());
  addEventListener("pageshow", syncFilm);
  if (motionAllowed() && !document.hidden) {
    openingHold = true;
    document.body.classList.add("home-opening");
    const ready = Promise.allSettled([
      hero.querySelector(".home-poster").decode(),
      hero.querySelector(".home-mark .logo").decode(),
    ]);
    Promise.race([
      ready,
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]).then(() => {
      if (!motionAllowed()) {
        openingHold = false;
        document.body.classList.remove("home-opening");
        return;
      }
      document.body.classList.add("home-enter");
      setTimeout(() => {
        openingHold = false;
        syncFilm();
      }, 180);
      setTimeout(
        () => {
          document.body.classList.remove("home-opening", "home-enter");
          openingComplete = true;
          beginScrollMotion();
        },
        1900,
      );
    });
  }
  // The homepage uses the scroll itself as the pacing device. Nothing is pinned
  // and the content resolves well before it reaches the reading zone. The hero
  // remains reversible so returning to the first frame still feels considered.
  let entranceContext,
    lastEntranceMotion = motionAllowed(),
    textObserver;
  function revealTextGroup(group) {
    group.dataset.textRevealed = "true";
    requestAnimationFrame(() => group.classList.add("is-revealed"));
  }
  function setupTextReveals() {
    textObserver?.disconnect();
    textObserver = null;
    const groups = document.querySelectorAll("[data-text-group]");
    document.documentElement.classList.toggle(
      "home-text-motion",
      motionAllowed(),
    );
    if (!motionAllowed() || !("IntersectionObserver" in window)) {
      groups.forEach((group) => group.classList.add("is-revealed"));
      return;
    }
    textObserver = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          revealTextGroup(entry.target);
          textObserver.unobserve(entry.target);
        }),
      { rootMargin: "0px 0px -14% 0px", threshold: 0.08 },
    );
    groups.forEach((group) => {
      if (
        group.dataset.textRevealed === "true" ||
        group.getBoundingClientRect().top < innerHeight * 0.82
      ) {
        group.classList.add("is-revealed");
        return;
      }
      group.classList.remove("is-revealed");
      textObserver.observe(group);
    });
  }
  function setupEntrances() {
    lastEntranceMotion = motionAllowed();
    entranceContext?.revert();
    entranceContext = null;
    if (!motionAllowed() || !window.gsap || !window.ScrollTrigger) return;
    entranceContext = gsap.context(() => {
      const heroMark = hero.querySelector(".home-mark");
      const heroFoot = hero.querySelector(".home-film-foot");
      const heroVisuals = hero.querySelectorAll(
        ".home-poster,.home-video,.home-film-shade",
      );
      const heroScroll = {
        trigger: hero,
        start: "top top",
        end: "bottom 38%",
        scrub: true,
        invalidateOnRefresh: true,
      };

      gsap.to(heroVisuals, {
        yPercent: 4,
        ease: "none",
        scrollTrigger: heroScroll,
      });
      gsap.to(heroMark, {
        yPercent: -13,
        scale: 0.965,
        opacity: 0.38,
        ease: "none",
        transformOrigin: "center center",
        scrollTrigger: { ...heroScroll },
      });
      gsap.to(heroFoot, {
        yPercent: 18,
        opacity: 0.3,
        ease: "none",
        scrollTrigger: { ...heroScroll },
      });

      const reveal = (el, y, start = "top 88%", end = "top 61%") => {
        if (el.getBoundingClientRect().top < innerHeight * 0.88) return;
        gsap.fromTo(
          el,
          { y, opacity: 0.16 },
          {
            y: 0,
            opacity: 1,
            ease: "none",
            scrollTrigger: {
              trigger: el,
              start,
              end,
              scrub: true,
              // Once the element is fully legible, release its compositing
              // layer and leave normal document flow untouched.
              onLeave(self) {
                self.kill();
                gsap.set(el, { clearProps: "transform,opacity" });
              },
            },
          },
        );
      };

      document.querySelectorAll(".home-stay").forEach((el, index) =>
        reveal(el, 26 + index * 7, "top 91%", "top 62%"),
      );
      document
        .querySelectorAll(".home-enquiry-form")
        .forEach((el) => reveal(el, 28));
    });
  }
  // The opening mark owns transform during its first frame. Do not compete with
  // it; the scroll layer starts after the opening is fully released.
  let openingComplete = !motionAllowed();
  function beginScrollMotion() {
    if (!openingComplete && motionAllowed()) return;
    setupEntrances();
  }
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      setupTextReveals();
      beginScrollMotion();
    },
    { once: true },
  );
  reduce.addEventListener("change", () => {
    if (!motionAllowed()) openingComplete = true;
    setupTextReveals();
    beginScrollMotion();
  });
  new MutationObserver(() => {
    // Lenis also changes root classes while scrolling; those are not a motion
    // preference change and must never restart the entrance animations.
    const nextMotion = motionAllowed();
    if (nextMotion !== lastEntranceMotion) {
      lastEntranceMotion = nextMotion;
      if (!motionAllowed()) openingComplete = true;
      setupTextReveals();
      beginScrollMotion();
    }
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  document.querySelectorAll("[data-enquire-space]").forEach((a) =>
    a.addEventListener("click", () => {
      document.querySelector("#home-space").value = a.dataset.enquireSpace;
    }),
  );
  // Keep the actual two-line button in the same visual position: move that
  // node into the native top-layer dialog, rather than swapping in an X glyph.
  const menu = document.querySelector("#site-menu");
  const menuButton = document.querySelector(".home-header .menu-toggle");
  const buttonParent = menuButton.parentNode;
  const buttonSeat = document.createElement("span");
  buttonSeat.className = "home-menu-button-seat";
  buttonSeat.setAttribute("aria-hidden", "true");
  let menuClosing;
  menuButton.setAttribute("aria-expanded", "false");
  function finishMenuClose() {
    clearTimeout(menuClosing);
    if (buttonSeat.isConnected) buttonSeat.replaceWith(menuButton);
    else buttonParent.append(menuButton);
    menu.close();
    document.body.classList.remove("dialog-open");
    menuButton.focus({ preventScroll: true });
  }
  function closeHomeMenu(instant = false) {
    clearTimeout(menuClosing);
    menu.classList.toggle("is-instant", instant || !motionAllowed());
    menu.classList.remove("is-expanded");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Open menu");
    if (instant || !motionAllowed()) finishMenuClose();
    else menuClosing = setTimeout(finishMenuClose, 290);
  }
  menuButton.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (menu.classList.contains("is-expanded")) {
        closeHomeMenu(event.detail === 0);
        return;
      }
      clearTimeout(menuClosing);
      menu.classList.toggle(
        "is-instant",
        event.detail === 0 || !motionAllowed(),
      );
      if (menuButton.parentNode === buttonParent)
        menuButton.replaceWith(buttonSeat);
      menu.querySelector(".home-menu-control").append(menuButton);
      if (!menu.open) menu.showModal();
      document.body.classList.add("dialog-open");
      void menu.offsetHeight;
      menu.classList.add("is-expanded");
      menuButton.setAttribute("aria-expanded", "true");
      menuButton.setAttribute("aria-label", "Close menu");
      menuButton.focus({ preventScroll: true });
    },
    true,
  );
  menu.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeHomeMenu(true);
  });
  menu.addEventListener("click", (event) => {
    if (event.target === menu) {
      const r = menu.getBoundingClientRect();
      if (event.clientY > r.bottom || event.clientY < r.top) closeHomeMenu();
    }
  });
  menu
    .querySelectorAll('a[href^="#"]')
    .forEach((a) => a.addEventListener("click", () => closeHomeMenu(true)));
  const form = document.querySelector("#home-enquiry");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form),
      v = (n) => String(data.get(n) || "").trim();
    const space =
      document.querySelector("#home-space").selectedOptions[0].textContent;
    const message = `Hello Erla,\n\nI would like to enquire about ${space.toLowerCase()} at Kleif.\n\nName: ${v("name")}\nEmail: ${v("email")}\nGuests: ${v("guests") || "To be discussed"}\nDates: ${v("dates") || "Flexible"}\n\n${v("message") || "Please tell me about the possibilities for our visit."}\n\nWarm regards,\n${v("name")}`;
    const link = document.querySelector("#home-email-link");
    link.href = `mailto:info@kleif.is?subject=${encodeURIComponent("A visit to Kleif — " + space)}&body=${encodeURIComponent(message)}`;
    document.querySelector("#home-email-ready").hidden = false;
    link.focus();
  });

  // ---- The docked header -------------------------------------------------
  // Appears once the film is half behind you and leaves again on the way back
  // up. An IntersectionObserver on a sentinel sitting at the hero's midpoint,
  // so nothing at all runs per frame while scrolling; the class it toggles is
  // what the CSS transitions off.
  const dock = document.querySelector("[data-home-dock]"),
    dockLine = hero.querySelector(".home-dock-line");
  if (dock && dockLine) {
    // One menu and one set of open/close behaviour: the dock's button forwards
    // to the hero header's own, which app.js has already wired and which this
    // file relocates into the dialog while it is open.
    dock
      .querySelector(".home-dock-toggle")
      ?.addEventListener("click", () => menuButton.click());
    new IntersectionObserver(
      ([entry]) => {
        dock.classList.toggle(
          "is-docked",
          !entry.isIntersecting && entry.boundingClientRect.top < 0,
        );
      },
      { threshold: 0 },
    ).observe(dockLine);
  }
})();
