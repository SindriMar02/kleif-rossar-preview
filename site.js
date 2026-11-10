// Kleif Farm site interactions (Nov 2026): maps, filters, floor-plan dialog, entrance sequences.
// app.js keeps the Rossar page choreography, menu and lightbox. MOTION.md lists every surface.
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const html = document.documentElement;
  html.classList.add("k-js");
  const reduceQuery = matchMedia("(prefers-reduced-motion: reduce)");
  const still = () => reduceQuery.matches || html.classList.contains("no-motion");
  const refresh = () => window.ScrollTrigger?.refresh();

  // ---- entrance sequences (facts bars) ----
  const seq = new IntersectionObserver(
    (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); seq.unobserve(e.target); } }),
    { rootMargin: "0px 0px -12% 0px" },
  );
  $$(".k-starline").forEach((el) => seq.observe(el));
  $$("[data-k-seq]").forEach((el) => {
    [...el.children].forEach((c, i) => c.style.setProperty("--i", i));
    seq.observe(el);
  });

  // ---- filters: gallery and reviews ----
  $$("[data-k-filter]").forEach((button) => {
    const section = button.closest("section");
    const list = $("[data-k-list]", section);
    const count = $("[data-k-count]", section);
    const noun = list.classList.contains("k-reviews") ? ["review", "reviews"] : ["photograph", "photographs"];
    button.addEventListener("click", () => {
      if (button.getAttribute("aria-pressed") === "true") return;
      $$("[data-k-filter]", section).forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      const want = button.dataset.kFilter;
      let shown = 0;
      const entering = [];
      [...list.children].forEach((item) => {
        const match = want === "all" || item.dataset.kGroup === want;
        if (match) { if (item.hidden) entering.push(item); item.hidden = false; shown++; }
        else item.hidden = true;
      });
      count.textContent = `${shown} ${shown === 1 ? noun[0] : noun[1]}`;
      const url = new URL(location.href);
      if (want === "all") url.searchParams.delete("show"); else url.searchParams.set("show", want);
      history.replaceState(history.state, "", url);
      if (!still()) {
        [...list.children].filter((c) => !c.hidden).slice(0, 16).forEach((item, i) => {
          item.getAnimations().forEach((a) => a.cancel());
          item.animate([{ opacity: 0, transform: "scale(.985)" }, { opacity: 1, transform: "none" }], { duration: 260, delay: Math.min(i, 14) * 18, easing: "cubic-bezier(.23,1,.32,1)", fill: "backwards" });
        });
      }
      refresh();
    });
  });

  // a shared link opens on the same filter (?show=barn)
  const show = new URLSearchParams(location.search).get("show");
  if (show) $(`[data-k-filter="${CSS.escape(show)}"]`)?.click();

  // ---- floor plan dialog ----
  const planDialog = $("#k-plan-dialog");
  if (planDialog) {
    let opener = null, closeTimer = 0;
    const close = () => {
      if (!planDialog.open || closeTimer) return;
      if (still()) { planDialog.close(); return; }
      planDialog.classList.add("is-closing");
      closeTimer = setTimeout(() => { closeTimer = 0; planDialog.classList.remove("is-closing"); planDialog.close(); }, 200);
    };
    $$("[data-k-plan]").forEach((b) =>
      b.addEventListener("click", (event) => {
        const img = $("img", b);
        const big = $("#k-plan-image");
        big.src = img.currentSrc || img.src;
        big.alt = img.alt;
        big.width = img.width; big.height = img.height;
        $("#k-plan-title").textContent = $("span", b).textContent.replace(/^Open the /, "").trim();
        const scroller = $(".k-plan-scroll", planDialog); if (scroller) scroller.scrollLeft = scroller.scrollTop = 0;
        opener = b;
        // reopening during the close animation cancels the close instead of losing the click
        if (closeTimer) { clearTimeout(closeTimer); closeTimer = 0; planDialog.classList.remove("is-closing"); }
        if (!planDialog.open) planDialog.showModal();
        document.body.classList.add("dialog-open");
        // pointer: focus the dialog itself (no ring on Safari/iOS); keyboard: the close button
        (event.detail === 0 ? $(".close-button", planDialog) : planDialog).focus({ preventScroll: true });
      }),
    );
    $(".close-button", planDialog).addEventListener("click", (e) => { e.stopImmediatePropagation(); close(); });
    planDialog.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
    planDialog.addEventListener("click", (e) => { if (e.target === planDialog) close(); });
    planDialog.addEventListener("close", () => { document.body.classList.remove("dialog-open"); opener?.focus({ preventScroll: true }); });
  }

  // ---- maps ----
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  $$("[data-k-map]").forEach((module) => {
    const svg = $("svg.k-map", module);
    const frame = $(".k-map-frame", module);
    const W = +svg.dataset.w, H = +svg.dataset.h;
    const home = $(".k-home", svg);
    const [hx, hy] = home.getAttribute("transform").match(/-?[\d.]+/g).map(Number);
    const pins = new Map($$(".k-pin", svg).map((p) => [p.dataset.pin, p]));
    const routes = new Map($$(".k-route", svg).map((r) => [r.dataset.route, r]));
    const buttons = $$("[data-place]", module);
    const reset = $(".k-map-reset", module);
    let cam = { x: 0, y: 0, w: W, h: H };
    let anim = 0, active = null;

    const aspect = () => frame.clientWidth / Math.max(1, frame.clientHeight);
    // Fit a box to the frame's aspect, never smaller than a sensible zoom, kept inside the map where possible.
    const fit = (b, minW = W * 0.16) => {
      const a = aspect();
      let w = Math.max(b.w, minW), h = Math.max(b.h, minW / a);
      if (w / h > a) h = w / a; else w = h * a;
      let x = b.x + b.w / 2 - w / 2, y = b.y + b.h / 2 - h / 2;
      // inside the map where it fits; centred on the subject where it cannot
      if (w <= W) x = Math.min(Math.max(x, 0), W - w);
      if (h <= H) y = Math.min(Math.max(y, 0), H - h);
      return { x, y, w, h };
    };
    const whole = () => {
      const a = aspect();
      if (a >= W / H) { const h = W / a; return fit({ x: 0, y: hy - h / 2, w: W, h }); }
      const w = H * a; return fit({ x: hx - w / 2, y: 0, w, h: H });
    };
    const apply = (c) => {
      cam = c;
      svg.setAttribute("viewBox", `${c.x.toFixed(2)} ${c.y.toFixed(2)} ${c.w.toFixed(2)} ${c.h.toFixed(2)}`);
      const u = c.w / Math.max(1, frame.clientWidth); // map units per screen pixel
      $$(".k-pin-s", svg).forEach((g) => g.setAttribute("transform", `scale(${u.toFixed(4)})`));
      routes.forEach((r) => r.setAttribute("stroke-width", (3.2 * u).toFixed(3)));
    };
    const go = (target, instant) => {
      cancelAnimationFrame(anim);
      if (instant || still()) { apply(target); return; }
      const from = { ...cam }, t0 = performance.now(), dur = 750;
      const step = (now) => {
        const k = ease(Math.min(1, (now - t0) / dur));
        apply({ x: from.x + (target.x - from.x) * k, y: from.y + (target.y - from.y) * k, w: from.w + (target.w - from.w) * k, h: from.h + (target.h - from.h) * k });
        if (k < 1) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    };
    const boxFor = (id) => {
      const p = pins.get(id), r = routes.get(id);
      const px = +p.dataset.x, py = +p.dataset.y;
      let x0 = Math.min(hx, px), y0 = Math.min(hy, py), x1 = Math.max(hx, px), y1 = Math.max(hy, py);
      if (r) { const b = r.getBBox(); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height); }
      const pad = Math.max(x1 - x0, y1 - y0) * 0.18 + W * 0.02;
      return fit({ x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad });
    };
    // A label sits right of its pin unless that would run off the frame.
    const placeLabel = (p, target) => {
      const label = $(".k-pin-label", p); if (!label) return;
      const text = $("text", label), rect = $("rect", label);
      const tw = text.getComputedTextLength() + 18;
      rect.setAttribute("width", tw.toFixed(1));
      const sx = ((+p.dataset.x - target.x) / target.w) * frame.clientWidth;
      const flip = sx + 24 + tw > frame.clientWidth - 8;
      rect.setAttribute("x", flip ? (-18 - tw).toFixed(1) : "18");
      text.setAttribute("x", flip ? (-18 - tw + 9).toFixed(1) : "27");
    };
    const select = (id, { fromList = false, viaKey = false } = {}) => {
      if (active === id) id = null;
      active = id;
      buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.place === id)));
      pins.forEach((p, key) => p.classList.toggle("is-active", key === id));
      routes.forEach((r, key) => {
        if (key !== id) { r.classList.remove("is-active"); return; }
        r.classList.remove("is-active");
        void r.getBoundingClientRect(); // restart the draw from the farm
        r.classList.add("is-active");
      });
      if (id) { pins.get(id).parentNode.appendChild(pins.get(id)); }
      reset.hidden = !id;
      const url = new URL(location.href);
      const key = module.dataset.kMap; // one parameter per map, so two maps on a page never fight
      if (id) url.searchParams.set(key, id); else url.searchParams.delete(key);
      history.replaceState(history.state, "", url);
      const target = id ? boxFor(id) : whole();
      if (id) placeLabel(pins.get(id), target);
      go(target);
      if (fromList && id && innerWidth <= 1100) {
        const top = frame.getBoundingClientRect().top;
        if (top < 70 || top > innerHeight * 0.35) scrollTo({ top: scrollY + top - 84, behavior: still() || viaKey ? "auto" : "smooth" });
      }
    };
    buttons.forEach((b) => {
      b.addEventListener("click", (e) => select(b.dataset.place, { fromList: true, viaKey: e.detail === 0 }));
      b.addEventListener("pointerenter", () => { if (matchMedia("(hover: hover)").matches) { pins.get(b.dataset.place)?.classList.add("is-hover"); placeLabel(pins.get(b.dataset.place), cam); } });
      b.addEventListener("pointerleave", () => pins.get(b.dataset.place)?.classList.remove("is-hover"));
    });
    pins.forEach((p, id) => {
      p.addEventListener("click", () => select(id));
      p.addEventListener("pointerenter", () => { $(`[data-place="${id}"]`, module)?.classList.add("is-hover"); });
      p.addEventListener("pointerleave", () => { $(`[data-place="${id}"]`, module)?.classList.remove("is-hover"); });
    });
    reset.addEventListener("click", () => { select(null); buttons[0]?.focus({ preventScroll: true }); });
    module.addEventListener("keydown", (e) => { if (e.key === "Escape" && active) { e.preventDefault(); select(null); } });

    apply(whole());
    const wanted = new URLSearchParams(location.search).get(module.dataset.kMap);
    if (wanted && pins.has(wanted)) requestAnimationFrame(() => select(wanted));
    new ResizeObserver(() => { cancelAnimationFrame(anim); const t = active ? boxFor(active) : whole(); apply(t); if (active) placeLabel(pins.get(active), t); }).observe(frame);
    const arrive = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { module.classList.add("is-in"); arrive.disconnect(); } }), { threshold: 0.25 });
    arrive.observe(module);
  });
})();
