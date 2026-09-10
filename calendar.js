// Original vanilla implementation informed by cnippet-dev's Two-Month Range Picker on 21st.dev.
// See THIRD-PARTY.md. No copied React runtime, external service, live inventory or payment.
(() => {
  "use strict";
  if (!document.querySelector("#calendar-months")) return;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const rate = JSON.parse($("#published-rate-data").textContent);
  const dayMs = 86400000;
  const iso = (date) =>
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  const fromISO = (s) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s || "") ? new Date(s + "T12:00:00Z") : null;
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12),
  );
  const firstMonth = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 12),
  );
  const lastDate = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 18, 0, 12),
  );
  const nice = (date) =>
    date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  const monthName = (date) =>
    date.toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  const money = (n) =>
    new Intl.NumberFormat("en-IE", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(n);
  const monthOffset = (date) =>
    (date.getUTCFullYear() - firstMonth.getUTCFullYear()) * 12 +
    date.getUTCMonth() -
    firstMonth.getUTCMonth();
  const mobile = matchMedia("(max-width: 700px)");
  let month = 0,
    start = null,
    end = null,
    focusDate = iso(today),
    house = "farm";
  const arrival = $("#plan-arrival"),
    departure = $("#plan-departure");
  arrival.min = departure.min = iso(today);
  arrival.max = departure.max = iso(lastDate);
  const params = new URLSearchParams(location.search);
  if (["farm", "barn", "together"].includes(params.get("stay")))
    house = params.get("stay");
  $(`input[name="booking-house"][value="${house}"]`).checked = true;
  function dateAllowed(date) {
    return date && !Number.isNaN(+date) && date >= today && date <= lastDate;
  }
  function error(message) {
    $("#booking-error").textContent = message;
  }
  function monthHTML(offset) {
    const date = new Date(
      Date.UTC(
        firstMonth.getUTCFullYear(),
        firstMonth.getUTCMonth() + offset,
        1,
        12,
      ),
    );
    const days = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12),
    ).getUTCDate();
    const blanks = (date.getUTCDay() + 6) % 7;
    let cells = Array.from({ length: blanks }, () => "<td></td>");
    for (let day = 1; day <= days; day++) {
      const current = new Date(
          Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), day, 12),
        ),
        id = iso(current);
      const selected = !!(
        (start && id === iso(start)) ||
        (end && id === iso(end))
      );
      const between = !!(start && end && current > start && current < end);
      const disabled = !dateAllowed(current);
      const classes = [
        selected ? "selected" : "",
        between ? "in-range" : "",
        start && id === iso(start) ? "range-start" : "",
        end && id === iso(end) ? "range-end" : "",
        id === iso(today) ? "today" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const suffix =
        start && id === iso(start)
          ? ", arrival selected"
          : end && id === iso(end)
            ? ", departure selected"
            : between
              ? ", within selected stay"
              : "";
      cells.push(
        `<td role="gridcell" class="${classes}" aria-selected="${selected || between}"><button type="button" data-date="${id}" aria-label="${nice(current)}${suffix}" ${disabled ? "disabled" : ""} tabindex="${id === focusDate && !disabled ? "0" : "-1"}" ${id === iso(today) ? 'aria-current="date"' : ""}>${day}</button></td>`,
      );
    }
    while (cells.length % 7) cells.push("<td></td>");
    const rows = [];
    for (let i = 0; i < cells.length; i += 7)
      rows.push(`<tr role="row">${cells.slice(i, i + 7).join("")}</tr>`);
    return `<table role="grid" aria-label="${monthName(date)}" aria-multiselectable="true"><caption>${monthName(date)}</caption><thead><tr role="row">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<th scope="col" role="columnheader">${d}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
  }
  function renderCalendar(focus = false) {
    const count = mobile.matches ? 1 : 2;
    month = Math.min(month, 18 - count);
    if (
      monthOffset(fromISO(focusDate)) < month ||
      monthOffset(fromISO(focusDate)) >= month + count
    ) {
      const target = new Date(
        Date.UTC(
          firstMonth.getUTCFullYear(),
          firstMonth.getUTCMonth() + month,
          1,
          12,
        ),
      );
      focusDate = iso(target < today ? today : target);
    }
    $("#calendar-months").innerHTML = Array.from({ length: count }, (_, i) =>
      monthHTML(month + i),
    ).join("");
    $("#calendar-prev").disabled = month === 0;
    $("#calendar-next").disabled = month >= 18 - count;
    $("#calendar-period").textContent = mobile.matches
      ? "Select your stay"
      : "Two months, a little more possibility";
    $$("[data-date]").forEach((button) => {
      button.addEventListener("click", () => selectDate(button.dataset.date));
      button.addEventListener("keydown", handleKeys);
    });
    if (focus) $(`[data-date="${focusDate}"]`)?.focus({ preventScroll: true });
  }
  function selectDate(value) {
    const date = fromISO(value);
    if (!dateAllowed(date)) return;
    if (!start || end || date <= start) {
      start = date;
      end = null;
    } else end = date;
    focusDate = value;
    arrival.value = start ? iso(start) : "";
    departure.value = end ? iso(end) : "";
    departure.setCustomValidity("");
    error("");
    renderCalendar(true);
    renderSummary();
  }
  function handleKeys(event) {
    const date = fromISO(event.currentTarget.dataset.date);
    let delta;
    if (event.key === "ArrowLeft") delta = -1;
    else if (event.key === "ArrowRight") delta = 1;
    else if (event.key === "ArrowUp") delta = -7;
    else if (event.key === "ArrowDown") delta = 7;
    else if (event.key === "Home") delta = -((date.getUTCDay() + 6) % 7);
    else if (event.key === "End") delta = 6 - ((date.getUTCDay() + 6) % 7);
    else if (event.key === "PageUp" || event.key === "PageDown") {
      const direction = event.key === "PageUp" ? -1 : 1;
      const target = new Date(date);
      target.setUTCDate(1);
      target.setUTCMonth(
        target.getUTCMonth() + direction * (event.shiftKey ? 12 : 1),
      );
      const last = new Date(
        Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12),
      ).getUTCDate();
      target.setUTCDate(Math.min(date.getUTCDate(), last));
      delta = (target - date) / dayMs;
    } else return;
    event.preventDefault();
    let target = new Date(+date + delta * dayMs);
    if (target < today) target = today;
    if (target > lastDate) target = lastDate;
    focusDate = iso(target);
    const offset = monthOffset(target),
      count = mobile.matches ? 1 : 2;
    if (offset < month) month = offset;
    else if (offset >= month + count) month = offset - count + 1;
    renderCalendar(true);
  }
  function renderSummary() {
    const nights = start && end ? Math.round((end - start) / dayMs) : 0;
    $("#night-count").textContent = nights
      ? `${nights} night${nights === 1 ? "" : "s"}`
      : "Your dates";
    $("#calendar-instruction").textContent =
      start && end
        ? `${nice(start)} to ${nice(end)}. Select another date to start again.`
        : start
          ? "Now select your departure date."
          : "Select an arrival date, then a departure date.";
    $("#estimate-label").textContent = nights
      ? `Illustrative ${nights}-night accommodation range`
      : "Nightly guide";
    $("#booking-estimate").textContent =
      house === "farm"
        ? `${money(rate.low * (nights || 1))}–${money(rate.high * (nights || 1))}`
        : "On enquiry";
    $("#estimate-note").textContent =
      house === "farm"
        ? nights
          ? `${nights} × the published nightly range, not a date-specific quote. Final price, deposit, extras and terms require host confirmation.${nights < 2 ? " Published minimums are normally 2–3 nights; ask about a shorter stay." : ""}`
          : "Select dates to see an illustrative stay estimate. Final rate, deposit, extras and terms are confirmed by your host."
        : "The Barn and combined-house rates are not publicly verified. Erla will confirm a quote and the right arrangement for your group.";
    $("#clear-dates").disabled = !start && !end;
  }
  function updateHouse() {
    house = $('input[name="booking-house"]:checked').value;
    const data = {
      farm: [
        "camp-farmhouse",
        "Your private farmhouse",
        "Farm",
        "Five ensuite bedrooms, a firelit living room and your own outdoor hot tub.",
      ],
      barn: [
        "camp-barn",
        "A new life for old buildings",
        "Barn",
        "A characterful private villa, a game barn and an outdoor hot tub. Ask Erla about your group’s sleeping arrangements.",
      ],
      together: [
        "plate-hero",
        "Your people, together",
        "Farm & Barn",
        "Both houses, one shared setting. Plan a gathering with room to settle in. Capacities and combined rates are confirmed personally.",
      ],
    }[house];
    const photo = $("#booking-photo");
    photo.src = `/kleif-rossar-preview/assets/img/${data[0]}.webp`;
    photo.alt =
      house === "farm"
        ? "Kleif Farm living room"
        : house === "barn"
          ? "Kleif game barn"
          : "The houses in Kleif’s valley";
    $("#booking-house-label").textContent = data[1];
    $("#booking-house-name").innerHTML = `Kleif <em>${data[2]}</em>`;
    $("#booking-house-description").textContent = data[3];
    $("#booking-rate").innerHTML =
      house === "farm"
        ? `<span class="booking-price">${money(rate.low)}–${money(rate.high)}</span><span>per night · whole house</span>`
        : '<span class="booking-price">On enquiry</span><span>A quote for your stay</span>';
    $("#booking-source").hidden = house !== "farm";
    $("#booking-house-link").href =
      house === "together" ? "/kleif-rossar-preview/houses/" : `/kleif-rossar-preview/houses/${house}/`;
    const guests = $("#plan-guests");
    guests.max = house === "farm" ? "10" : "99";
    if (+guests.value > +guests.max) guests.value = guests.max;
    $("#guest-help").textContent =
      house === "farm"
        ? "The Farm accommodates up to 10 guests."
        : "Group size and sleeping capacity must be confirmed with Erla. The selector is an enquiry, not a capacity guarantee.";
    updateGuests();
    renderSummary();
  }
  function updateGuests() {
    const el = $("#plan-guests"),
      value = +el.value;
    $("#guest-minus").disabled = value <= 1;
    $("#guest-plus").disabled = value >= +el.max;
  }
  $("#guest-minus").addEventListener("click", () => {
    $("#plan-guests").stepDown();
    updateGuests();
  });
  $("#guest-plus").addEventListener("click", () => {
    $("#plan-guests").stepUp();
    updateGuests();
  });
  $("#plan-guests").addEventListener("input", updateGuests);
  $$('input[name="booking-house"]').forEach((el) =>
    el.addEventListener("change", updateHouse),
  );
  $("#calendar-prev").addEventListener("click", () => {
    month--;
    renderCalendar();
  });
  $("#calendar-next").addEventListener("click", () => {
    month++;
    renderCalendar();
  });
  $("#clear-dates").addEventListener("click", () => {
    start = end = null;
    arrival.value = departure.value = "";
    departure.setCustomValidity("");
    focusDate = iso(today);
    month = 0;
    error("");
    renderCalendar();
    renderSummary();
  });
  [arrival, departure].forEach((input) =>
    input.addEventListener("change", () => {
      const a = fromISO(arrival.value),
        b = fromISO(departure.value);
      if ((a && !dateAllowed(a)) || (b && !dateAllowed(b))) {
        error("Choose dates from today through the next 18 months.");
        return;
      }
      if (a && b && b <= a) {
        error("Departure must be after arrival.");
        departure.setCustomValidity("Departure must be after arrival.");
        return;
      }
      departure.setCustomValidity("");
      start = a;
      end = b;
      focusDate = iso(a || b || today);
      month = Math.max(0, monthOffset(a || b || today));
      error("");
      renderCalendar();
      renderSummary();
    }),
  );
  $("#continue-enquiry").addEventListener("click", () => {
    if (!arrival.reportValidity() || !departure.reportValidity()) return;
    if (!start || !end) {
      error(
        "Choose an arrival and departure date, or contact Erla below if your plans are flexible.",
      );
      (!start ? arrival : departure).focus();
      return;
    }
    const guests = $("#plan-guests");
    if (!guests.value || !guests.reportValidity()) {
      error("Please choose a valid number of overnight guests.");
      guests.focus();
      return;
    }
    const query = new URLSearchParams({
      stay: house,
      arrival: iso(start),
      departure: iso(end),
      guests: guests.value,
    });
    location.href = "/kleif-rossar-preview/contact/?" + query.toString();
  });
  mobile.addEventListener("change", () => renderCalendar());
  updateHouse();
  renderCalendar();
  renderSummary();
})();
