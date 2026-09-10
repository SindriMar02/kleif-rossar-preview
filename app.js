(() => {
  "use strict";
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const desktop = matchMedia("(min-width: 701px) and (pointer: fine)");
  let motionOff = false;
  try {
    motionOff = localStorage.getItem("kleif-motion") === "off";
  } catch {}
  let lenis, motionContext, ticker, activeDialog, dialogOpener;
  const originalHeadings = new Map();
  const photoData = JSON.parse($("#photo-data").textContent);
  const noMotion = () => reduced.matches || motionOff;
  // Set once, at parse time: the opening is decided before this file runs, by
  // the inline boot script that put the attribute on <html>.
  const introHold = document.documentElement.hasAttribute("data-intro") ? 1 : 0;
  // Held tweens the opening is responsible for starting. If it ends early —
  // skipped or failsafed — a headline still sitting on a one-second delay would
  // leave the hero blank for most of a second after the page is uncovered.
  const introHeld = [];
  const motionButton = $(".motion-toggle");

  function updateMotionButton() {
    document.documentElement.classList.toggle("no-motion", noMotion());
    motionButton.hidden = false;
    motionButton.textContent = reduced.matches
      ? "Motion: reduced by system"
      : `Motion: ${motionOff ? "off" : "on"}`;
    motionButton.setAttribute("aria-pressed", String(noMotion()));
    motionButton.disabled = reduced.matches;
  }
  function splitHeading(heading) {
    if (!originalHeadings.has(heading))
      originalHeadings.set(heading, heading.innerHTML);
    const readable = heading.cloneNode(true);
    readable.querySelectorAll("br").forEach((br) => br.replaceWith(" "));
    const label = readable.textContent.replace(/\s+/g, " ").trim();
    heading.setAttribute("aria-label", label);
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const fragment = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((word) => {
        if (!word.trim()) {
          fragment.append(document.createTextNode(word));
          return;
        }
        const wrap = document.createElement("span");
        wrap.className = "word";
        wrap.setAttribute("aria-hidden", "true");
        [...word].forEach((char) => {
          const span = document.createElement("span");
          span.className = "char";
          span.textContent = char;
          wrap.append(span);
        });
        fragment.append(wrap);
      });
      node.replaceWith(fragment);
    });
    // The label is read once; decorative descendants are hidden from assistive technology.
    $$("br", heading).forEach((br) => br.setAttribute("aria-hidden", "true"));
    return $$(".char", heading);
  }
  function resetMotion() {
    motionContext?.revert();
    motionContext = null;
    if (ticker && window.gsap) gsap.ticker.remove(ticker);
    ticker = null;
    lenis?.destroy();
    lenis = null;
    originalHeadings.forEach((html, heading) => {
      heading.innerHTML = html;
      heading.removeAttribute("aria-label");
    });
    originalHeadings.clear();
    $$(".curtain").forEach((el) => {
      el.style.display = "none";
    });
  }
  function setupMotion() {
    resetMotion();
    updateMotionButton();
    if (noMotion() || !window.gsap || !window.ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);
    if (desktop.matches && window.Lenis) {
      lenis = new Lenis({
        // Measured: at 0.14 the page kept coasting for 709ms after the wheel
        // stopped. Native scroll settles in roughly 200. Smooth scrolling is
        // the point, so this is not native — but three quarters of a second of
        // drift is the other half of what reads as scroll lag, alongside the
        // scrub:1 that used to sit on top of it. 0.2 settles in about half that
        // and still glides. Lower is floatier, higher is tighter.
        lerp: 0.2,
        smoothWheel: true,
        syncTouch: false,
        anchors: true,
      });
      lenis.on("scroll", ScrollTrigger.update);
      ticker = (time) => lenis?.raf(time * 1000);
      gsap.ticker.add(ticker);
      gsap.ticker.lagSmoothing(0);
      if (activeDialog) lenis.stop();
    }
    motionContext = gsap.context(() => {
      $$("[data-split]").forEach((heading) => {
        const rect = heading.getBoundingClientRect();
        // Never re-hide a headline already passed, e.g. when enabling motion in the footer.
        if (rect.bottom < 0) return;
        const chars = splitHeading(heading);
        const first = rect.top < innerHeight * 0.9;
        if (first) {
          const entrance = gsap.fromTo(
            chars,
            { opacity: 0, rotationX: (i) => (i % 2 ? -45 : 45) },
            {
              opacity: 1,
              rotationX: 0,
              duration: 2,
              ease: "sine.out",
              stagger: { amount: 0.4 },
              delay: introHold + 0.08,
              clearProps: "transform,opacity",
            },
          );
          if (introHold) introHeld.push(entrance);
        } else {
          // Scrubbed, but over a short band and with no smoothing, and it stops
          // existing once it has played.
          //
          // What was here mapped a 2s tween with a 0.1s-per-character stagger —
          // nearly six seconds of timeline on a long heading — across the whole
          // range from "top 90%" to "bottom 58%", so a heading only reached full
          // opacity as it was leaving. scrub:1 added a second of catch-up behind
          // the wheel on top of Lenis's own easing, and it ran backwards on the
          // way up. Measured over a 600px/s scroll, text was still resolving in
          // the readable top 70% of the viewport on 47% of frames.
          //
          // Replacing it with a timed entrance was worse, not better (80%): a
          // fixed duration can always be outrun, and at any real scroll speed a
          // heading crosses into the readable zone long before 1.25s of tween
          // has run. Tying progress to position instead means the heading is
          // finished by the time its top reaches 72% of the viewport, at every
          // scroll speed, and scrub:true carries no smoothing lag at all.
          const entrance = gsap.fromTo(
            chars,
            { opacity: 0.08, rotationX: (i) => (i % 2 ? -45 : 45) },
            {
              opacity: 1,
              rotationX: 0,
              ease: "sine.out",
              duration: 1,
              stagger: { amount: 0.5 },
              scrollTrigger: {
                trigger: heading,
                start: "top bottom",
                end: "top 66%",
                scrub: true,
                // Once it has played it is done: no reversing back out on the
                // way up, and no leaving 227 characters holding an inline
                // transform inside a perspective for the life of the page.
                onLeave: (self) => {
                  self.kill();
                  gsap.set(chars, { clearProps: "transform,opacity" });
                },
              },
            },
          );
          void entrance;
        }
      });
      $$("[data-reveal]").forEach((frame) => {
        if (frame.getBoundingClientRect().bottom < 0) return;
        const curtain = $(".curtain", frame),
          img = $("img", frame);
        gsap.set(curtain, { display: "block", scaleY: 1 });
        // Same reasoning as the headings above, and the same fix. This was a
        // 1.6s power3.inOut played once on entry; power3.inOut idles for the
        // first third of its run, so a photograph stayed a blank chalk
        // rectangle well after it was fully on screen — covered in the readable
        // top 70% of the viewport on 63% of frames at reading pace. Shortening
        // it to 0.9s took that to 15%, but a fixed duration is still something
        // a scroll can outrun: on a hard flick it was 92%.
        //
        // Tied to position over a short band instead, the photograph is
        // uncovered by the time its top reaches 78% of the viewport whatever
        // the scroll is doing, and the image's settle becomes the parallax it
        // always looked like. The trigger kills itself on the way past, so
        // nothing reverses on the way back up and no image keeps an inline
        // transform.
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: frame,
            start: "top bottom",
            end: "top 64%",
            scrub: true,
            onLeave: (self) => {
              self.kill();
              gsap.set(curtain, { display: "none" });
              gsap.set(img, { clearProps: "transform" });
            },
          },
        });
        tl.to(curtain, { scaleY: 0, ease: "power2.out" }, 0).fromTo(
          img,
          { yPercent: -18, scale: 1.2 },
          { yPercent: 0, scale: 1, ease: "power2.out" },
          0,
        );
      });
      // Entrance travel is confined to the image masks; page flow is never pinned.
    });
    document.fonts.ready.then(() => ScrollTrigger.refresh());
  }
  motionButton.addEventListener("click", () => {
    motionOff = !motionOff;
    try {
      localStorage.setItem("kleif-motion", motionOff ? "off" : "on");
    } catch {}
    setupMotion();
  });
  reduced.addEventListener("change", setupMotion);
  desktop.addEventListener("change", setupMotion);

  function openDialog(dialog, opener, event) {
    if (activeDialog) closeDialog(activeDialog);
    dialogOpener = opener;
    activeDialog = dialog;
    dialog.classList.toggle(
      "dialog-animate",
      !noMotion() && event?.detail !== 0,
    );
    dialog.showModal();
    document.body.classList.add("dialog-open");
    lenis?.stop();
    $(".close-button", dialog)?.focus({ preventScroll: true });
  }
  // The menu's exit is a CSS transition held open by allow-discrete on
  // display/overlay, so a plain close still plays it and Escape needs no
  // special case. See the menu reveal block in style.css.
  function closeDialog(dialog) {
    if (!dialog?.open) return;
    dialog.close();
  }
  $$("dialog").forEach((dialog) => {
    $$("[data-close]", dialog).forEach((button) =>
      button.addEventListener("click", () => closeDialog(dialog)),
    );
    dialog.addEventListener("close", () => {
      document.body.classList.remove("dialog-open");
      lenis?.start();
      activeDialog = null;
      dialogOpener?.focus({ preventScroll: true });
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog && dialog.id === "lightbox")
        closeDialog(dialog);
    });
    // Native modal dialog supplies focus containment, Escape and inert background.
  });
  $(".menu-toggle").addEventListener("click", (event) =>
    openDialog($("#site-menu"), event.currentTarget, event),
  );
  $$("a[href]", $("#site-menu")).forEach((a) => {
    if (a.getAttribute("href") === location.pathname)
      a.setAttribute("aria-current", "page");
  });

  $$(".gallery-section").forEach((section) => {
    const rail = $(".photo-rail", section),
      prev = $("[data-rail-prev]", section),
      next = $("[data-rail-next]", section);
    const sync = () => {
      prev.disabled = rail.scrollLeft < 3;
      next.disabled =
        rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 3;
    };
    const shift = (direction, event) =>
      rail.scrollBy({
        left:
          direction *
          ($(".photo-card", rail).getBoundingClientRect().width +
            (innerWidth <= 700 ? 12 : 25)),
        behavior: noMotion() || event.detail === 0 ? "instant" : "smooth",
      });
    prev.addEventListener("click", (e) => shift(-1, e));
    next.addEventListener("click", (e) => shift(1, e));
    rail.addEventListener("scroll", sync, { passive: true });
    new ResizeObserver(sync).observe(rail);
    sync();
    rail.addEventListener("keydown", (event) => {
      if (event.target !== rail) return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        shift(event.key === "ArrowRight" ? 1 : -1, { detail: 0 });
      }
    });
  });
  let galleryNames = [],
    galleryIndex = 0;
  const lightbox = $("#lightbox");
  function displayPhoto() {
    const name = galleryNames[galleryIndex],
      p = photoData[name],
      img = $("#lightbox-image");
    img.src = `/kleif-rossar-preview/assets/img/${name}.${p[5] || "webp"}`;
    img.alt = p[2];
    img.width = p[0];
    img.height = p[1];
    $("#lightbox-caption").textContent = p[3];
    $("#lightbox-count").textContent =
      `${galleryIndex + 1} / ${galleryNames.length}`;
  }
  const stepPhoto = (direction) => {
    galleryIndex =
      (galleryIndex + direction + galleryNames.length) % galleryNames.length;
    displayPhoto();
  };
  $$("[data-photo]").forEach((button) =>
    button.addEventListener("click", (event) => {
      const scope = button.closest(".photo-rail,.gallery-grid");
      galleryNames = $$("[data-photo]", scope)
        .filter((el) => !el.hidden)
        .map((el) => el.dataset.photo);
      galleryIndex = galleryNames.indexOf(button.dataset.photo);
      displayPhoto();
      openDialog(lightbox, button, event);
    }),
  );
  $("[data-lightbox-prev]").addEventListener("click", () => stepPhoto(-1));
  $("[data-lightbox-next]").addEventListener("click", () => stepPhoto(1));
  lightbox.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      stepPhoto(event.key === "ArrowRight" ? 1 : -1);
    }
  });
  $$("[data-filter]").forEach((button) =>
    button.addEventListener("click", () => {
      $$("[data-filter]").forEach((b) =>
        b.setAttribute("aria-pressed", String(b === button)),
      );
      let count = 0;
      $$(".gallery-tile").forEach((tile) => {
        tile.hidden =
          button.dataset.filter !== "all" &&
          button.dataset.filter !== tile.dataset.category;
        if (!tile.hidden) count++;
      });
      $("#gallery-count").textContent = `${count} photographs`;
      window.ScrollTrigger?.refresh();
    }),
  );

  const form = $("#enquiry-form");
  if (form) {
    const params = new URLSearchParams(location.search);
    ["stay", "occasion"].forEach((name) => {
      const field = $(`#${name}`);
      if ([...field.options].some((o) => o.value === params.get(name)))
        field.value = params.get(name);
    });
    ["arrival", "departure"].forEach((name) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(params.get(name) || ""))
        $(`#${name}`).value = params.get(name);
    });
    if (/^[1-9]\d{0,2}$/.test(params.get("guests") || ""))
      $("#guests").value = params.get("guests");
    const arrival = $("#arrival"),
      departure = $("#departure"),
      dateError = $("#date-error");
    const now = new Date(),
      today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    arrival.min = today;
    departure.min = today;
    function validateDates() {
      let message = "";
      if (arrival.value && departure.value && departure.value <= arrival.value)
        message = "Choose a departure date after your arrival.";
      departure.setCustomValidity(message);
      departure.setAttribute("aria-invalid", String(Boolean(message)));
      dateError.textContent = message;
      return !message;
    }
    arrival.addEventListener("input", validateDates);
    departure.addEventListener("input", validateDates);
    let enquiryText = "";
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!validateDates() || !form.reportValidity()) return;
      const data = new FormData(form),
        value = (name) => String(data.get(name) || "").trim();
      const label = (name) => $(`#${name}`).selectedOptions[0].textContent;
      enquiryText = `Hello Erla,\n\nI would like to enquire about ${label("occasion").toLowerCase()} at Kleif.\n\nName: ${value("name")}\nEmail: ${value("email")}\n${value("phone") ? `Phone: ${value("phone")}\n` : ""}House: ${label("stay")}\nArrival: ${value("arrival") || "To be discussed"}\nDeparture: ${value("departure") || "To be discussed"}\nOvernight guests: ${value("guests") || "To be discussed"}\n\n${value("message") || "Please let me know about the possibilities for our stay."}\n\nWarm regards,\n${value("name")}`;
      $("#enquiry-summary").textContent = enquiryText;
      $("#send-enquiry").href =
        `mailto:info@kleif.is?subject=${encodeURIComponent(`Kleif enquiry — ${label("occasion")}`)}&body=${encodeURIComponent(enquiryText)}`;
      form.hidden = true;
      $("#enquiry-result").hidden = false;
      $("#result-heading").focus({ preventScroll: true });
      $("#enquiry-result").scrollIntoView({
        block: "center",
        behavior: "instant",
      });
      window.ScrollTrigger?.refresh();
    });
    $("#edit-enquiry").addEventListener("click", () => {
      form.hidden = false;
      $("#enquiry-result").hidden = true;
      $("#name").focus();
      window.ScrollTrigger?.refresh();
    });
    $("#copy-enquiry").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(enquiryText);
        $("#copy-status").textContent =
          "Message copied. Paste it into your email to info@kleif.is.";
      } catch {
        $("#copy-status").textContent =
          "Copy was not available. Select and copy the message above, or use Open email app.";
      }
    });
  }
  function runIntro() {
    const root = document.documentElement;
    if (!root.hasAttribute("data-intro")) return;
    const curtain = $(".intro"),
      mark = $(".intro-mark"),
      markLogo = $(".logo", mark),
      seat = $(".site-header .brand .logo"),
      hero = $(".hero-photo");
    let released = false,
      tl = null;
    // Every path out of the opening ends here, and it is safe to call twice.
    // The page is held by a stylesheet rule, so a starved rAF in a background
    // tab, a hero that never decodes or a missing GSAP must not be able to
    // leave a visitor under a blank chalk field.
    const release = () => {
      if (released) return;
      released = true;
      clearTimeout(failsafe);
      impatient.forEach((type) => removeEventListener(type, skip));
      root.removeAttribute("data-intro");
      lenis?.start();
      // Manual restoration was for the opening only; leaving it set would stop
      // the browser restoring scroll on a later back navigation.
      try {
        history.scrollRestoration = "auto";
      } catch {}
      introHeld.forEach((tween) => {
        if (!tween.isActive() && tween.progress() === 0) tween.delay(0);
      });
      try {
        sessionStorage.setItem("kleif-intro", "seen");
      } catch {}
    };
    // Anyone who reaches for the page has said they are done watching. Send the
    // timeline to its end rather than cutting, so the hero lands where the
    // opening was going to put it either way.
    const impatient = ["pointerdown", "keydown", "wheel", "touchstart"];
    const skip = () => {
      if (released) return;
      // Run the rest of the opening out fast rather than cutting it: a curtain
      // that disappears mid-sweep reads as a glitch, not as a skip.
      if (tl && typeof gsap !== "undefined")
        gsap.to(tl, {
          progress: 1,
          duration: 0.25,
          ease: "power2.out",
          onComplete: release,
        });
      else release();
    };
    impatient.forEach((type) =>
      addEventListener(type, skip, { passive: true }),
    );
    const failsafe = setTimeout(release, 4000);
    try {
      history.scrollRestoration = "manual";
    } catch {}
    scrollTo(0, 0);
    lenis?.stop();
    // Open on a finished frame: an opening that lifts to reveal a blank hero
    // and a fallback typeface is worse than no opening. Capped, because a slow
    // connection must not extend the hold indefinitely.
    Promise.race([
      Promise.all([
        document.fonts.ready,
        hero?.decode ? hero.decode().catch(() => {}) : Promise.resolve(),
      ]),
      new Promise((resolve) => setTimeout(resolve, 900)),
    ]).then(() => {
      if (released) return;
      if (typeof gsap === "undefined") return release();
      tl = gsap.timeline();
      if (seat && markLogo) {
        const from = markLogo.getBoundingClientRect(),
          to = seat.getBoundingClientRect();
        tl.to(
          markLogo,
          {
            x: to.left + to.width / 2 - (from.left + from.width / 2),
            y: to.top + to.height / 2 - (from.top + from.height / 2),
            scale: to.width / from.width,
            duration: 0.85,
            ease: "power3.inOut",
          },
          0,
        );
      }
      tl.to(curtain, { scaleY: 0, duration: 0.8, ease: "power3.inOut" }, 0.45);
      if (hero)
        tl.fromTo(
          hero,
          { scale: 1.12 },
          {
            scale: 1,
            duration: 0.85,
            ease: "power3.inOut",
            clearProps: "transform",
          },
          0.4,
        );
      tl.to(mark, { autoAlpha: 0, duration: 0.25, ease: "none" }, 0.85).add(
        release,
        1.25,
      );
    });
  }

  // Restore native scrolling and animation state across browser back/forward cache.
  addEventListener("pagehide", resetMotion);
  addEventListener("pageshow", (event) => {
    if (event.persisted) setupMotion();
  });
  setupMotion();
  runIntro();
})();
