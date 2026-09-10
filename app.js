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
        lerp: 0.14,
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
          gsap.fromTo(
            chars,
            { opacity: 0, rotationX: (i) => (i % 2 ? -45 : 45) },
            {
              opacity: 1,
              rotationX: 0,
              duration: 2,
              ease: "sine.out",
              stagger: { amount: 0.4 },
              delay: 0.08,
              clearProps: "transform,opacity",
            },
          );
        } else {
          gsap.fromTo(
            chars,
            { opacity: 0.08, rotationX: (i) => (i % 2 ? -45 : 45) },
            {
              opacity: 1,
              rotationX: 0,
              ease: "sine.out",
              duration: 2,
              stagger: 0.1,
              scrollTrigger: {
                trigger: heading,
                start: "top 90%",
                end: "bottom 58%",
                scrub: 1,
              },
            },
          );
        }
      });
      $$("[data-reveal]").forEach((frame) => {
        if (frame.getBoundingClientRect().bottom < 0) return;
        const curtain = $(".curtain", frame),
          img = $("img", frame);
        gsap.set(curtain, { display: "block", scaleY: 1 });
        const tl = gsap.timeline({
          scrollTrigger: { trigger: frame, start: "top 93%", once: true },
        });
        tl.to(curtain, { scaleY: 0, duration: 1.6, ease: "power3.inOut" }, 0)
          .fromTo(
            img,
            { yPercent: -18, scale: 1.2 },
            {
              yPercent: 0,
              scale: 1,
              duration: 1.6,
              ease: "power3.inOut",
              clearProps: "transform",
            },
            0,
          )
          .set(curtain, { display: "none" });
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
  // Restore native scrolling and animation state across browser back/forward cache.
  addEventListener("pagehide", resetMotion);
  addEventListener("pageshow", (event) => {
    if (event.persisted) setupMotion();
  });
  setupMotion();
})();
