/**
 * Module: Summary renew/expire tables renderer.
 * Purpose: Builds desktop + mobile "Expire Soon" and "Need Renew" views from
 * `api/sales_minimal.php` data and applies date-range filtering.
 */
(() => {
  "use strict";

  // ------------------------------ Config ------------------------------
  const API_URL = "api/sales_minimal.php";
  const CACHE_KEY = "summarySalesMinimal:v2";

  // ------------------------------ Date utils (UTC-only) ------------------------------
  const msPerDay = 86_400_000;

  /** Parse 'YYYY-MM-DD' to a UTC Date, or null */
  const toUTC = (ymd) => {
    if (!ymd || typeof ymd !== "string") return null;
    const [y, m, d] = ymd.split("-").map((n) => Number(n));
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d))
      return null;
    return new Date(Date.UTC(y, m - 1, d));
  };

  const ymd = (dtUTC) => {
    const y = dtUTC.getUTCFullYear();
    const m = String(dtUTC.getUTCMonth() + 1).padStart(2, "0");
    const d = String(dtUTC.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const todayUTC = (() => {
    const t = new Date();
    return new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()));
  })();

  const daysBetween = (aUTC, bUTC) => Math.round((aUTC - bUTC) / msPerDay);
  const addDaysUTC = (baseUTC, days) =>
    new Date(baseUTC.getTime() + days * msPerDay);

  const lastDayOf = (y, m0) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

  const addMonthsUTC = (baseUTC, delta) => {
    const y = baseUTC.getUTCFullYear();
    const m = baseUTC.getUTCMonth();
    const d = baseUTC.getUTCDate();
    const tgt = m + delta;
    const y2 = y + Math.floor(tgt / 12);
    const m2 = ((tgt % 12) + 12) % 12;
    const d2 = Math.min(d, lastDayOf(y2, m2));
    return new Date(Date.UTC(y2, m2, d2));
  };

  const fmt = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  const fmtDate = (ymdStr) => {
    const dt = toUTC(ymdStr);
    return dt ? fmt.format(dt) : "-";
  };

  const leftLabel = (n) =>
    n < 0 ? `${Math.abs(n)} days ago` : n === 0 ? "Today" : n === 1 ? "1 day" : `${n} days`;
  const fmtMoney = (n) =>
    `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
      Math.round(Number(n) || 0)
    )} Ks`;

  // ------------------------------ DOM helpers ------------------------------
  const qs = (id) => document.getElementById(id) || null;

  const placeholderRow = (text, colspan = 7) => {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.className = "era-muted";
    td.colSpan = colspan;
    td.textContent = text;
    tr.appendChild(td);
    return tr;
  };

  const setLoading = (tbody, text = "Loading…") => {
    if (!tbody) return;
    tbody.innerHTML = "";
    tbody.appendChild(placeholderRow(text));
  };

  const setMobilePlaceholder = (el, text) => {
    if (!el) return;
    el.innerHTML = `<div class="subs-card era-muted" style="text-align:center;">${text}</div>`;
  };

  const getStoreClass = (row) => {
    const storeValue = Number.parseInt(row?.store, 10);
    if (storeValue === 1) return "store-digimium";
    if (storeValue === 2) return "store-dmarwal";
    if (storeValue === 0) return "store-void";
    if (storeValue === 3) return "store-ember";
    if (storeValue === 4) return "store-violet";
    if (storeValue === 5) return "store-void";

    // Fallback for summary API rows that currently expose sale_type.
    if (row?.sale_type === "retail") return "store-digimium";
    if (row?.sale_type === "wholesale") return "store-dmarwal";

    return "store-default";
  };

  const getDefaultExpireRange = () => ({
    from: ymd(todayUTC),
    to: ymd(addDaysUTC(todayUTC, 3)),
  });

  let allRows = [];
  let expireRange = getDefaultExpireRange();

  function readCachePacket() {
    if (window.__salesMinimalCache && Array.isArray(window.__salesMinimalCache.data)) {
      return window.__salesMinimalCache;
    }
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return { data: null, etag: null };
    try {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.data)) {
        window.__salesMinimalCache = parsed;
        return parsed;
      }
    } catch {}
    return { data: null, etag: null };
  }

  function writeCachePacket(data, etag = null) {
    const packet = { data, etag, ts: Date.now() };
    window.__salesMinimalCache = packet;
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(packet));
  }

  async function fetchRowsFromApi(etag = null) {
    const headers = { Accept: "application/json" };
    if (etag) headers["If-None-Match"] = etag;
    const res = await fetch(API_URL, { headers });
    if (res.status === 304) {
      return { notModified: true, data: null, etag };
    }
    const json = await res.json().catch(() => ({ success: false }));
    if (!res.ok || !json || json.success !== true || !Array.isArray(json.data)) {
      throw new Error((json && json.error) || `HTTP ${res.status}`);
    }
    return { notModified: false, data: json.data, etag: res.headers.get("ETag") };
  }

  /** Updates expire-range helper text near filter controls. */
  function setExpireFilterInfo(count) {
    const info = qs("expire_filter_info");
    if (!info) return;
    const fromText = fmtDate(expireRange.from);
    const toText = fmtDate(expireRange.to);
    info.textContent = `${count} item(s) | ${fromText} - ${toText}`;
  }

  // ------------------------------ Business logic ------------------------------
  const within3Days = (dtUTC) => {
    const d = daysBetween(dtUTC, todayUTC);
    return d >= 0 && d < 4 ? d : null;
  };

  const computeExpiryUTC = (purchasedYMD, duration) => {
    const p = toUTC(purchasedYMD);
    if (!p || !Number.isInteger(duration) || duration < 1) return null;
    return addMonthsUTC(p, duration);
  };

  const nextDueFromAnchor = (purchaseYMD, renewMonths, base = todayUTC) => {
    const p = toUTC(purchaseYMD);
    if (!p || !Number.isInteger(renewMonths) || renewMonths <= 0) return null;
    let due = addMonthsUTC(p, renewMonths);
    while (due < base) due = addMonthsUTC(due, renewMonths);
    return due;
  };

  // ------------------------------ Selection & shaping ------------------------------
  /** Selects rows whose expiry falls within configured expire range. */
  function selectExpireSoon(rows, range = getDefaultExpireRange()) {
    const fromUTC = toUTC(range?.from);
    const toUTCDate = toUTC(range?.to);
    if (!fromUTC || !toUTCDate) return [];

    return (rows || [])
      .map((r) => {
        const expUTC = toUTC(r.expired_date);
        if (!expUTC) return null;
        if (expUTC < fromUTC || expUTC > toUTCDate) return null;
        const left = daysBetween(expUTC, todayUTC);
        return { ...r, _days: left };
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          a._days - b._days ||
          String(a.expired_date).localeCompare(String(b.expired_date))
      );
  }

  /** Selects rows that need renew attention within the next 3 days. */
  function selectNeedRenew(rows) {
    const out = [];
    (rows || []).forEach((r) => {
      const renew = Number.isFinite(+r.renew) ? parseInt(r.renew, 10) : 0;
      if (!Number.isInteger(renew) || renew <= 0) return;

      const duration = Number.isFinite(+r.duration)
        ? parseInt(r.duration, 10)
        : null;
      if (Number.isInteger(duration) && renew >= duration) return;

      const purUTC = toUTC(r.purchased_date);
      if (!purUTC) return;

      const expUTC =
        toUTC(r.expired_date) || computeExpiryUTC(r.purchased_date, duration);

      // Skip if already in "expire soon"
      if (expUTC) {
        const dToExp = within3Days(expUTC);
        if (dToExp !== null) return;
      }

      const due = nextDueFromAnchor(r.purchased_date, renew, todayUTC);
      if (!due) return;

      // Respect last cutoff relative to expiry (can't renew past final expiry window)
      if (expUTC) {
        const lastCutoff = addMonthsUTC(expUTC, -renew);
        if (due > lastCutoff) return;
      }

      if (due < purUTC) return;

      const left = within3Days(due);
      if (left === null) return;

      out.push({
        sale_product: r.sale_product,
        customer: r.customer,
        email: r.email,
        purchased_date: r.purchased_date,
        next_due: ymd(due),
        expiry_ymd: expUTC ? ymd(expUTC) : null,
        left,
        renew,
        store: r.store,
        sale_type: r.sale_type,
      });
    });

    return out.sort(
      (a, b) => a.left - b.left || a.next_due.localeCompare(b.next_due)
    );
  }

  // ------------------------------ Renderers ------------------------------
  /** Renders desktop "Expire Soon" table. */
  function renderExpireSoonDesktop(rows, range = expireRange) {
    const tbody = qs("expire_soon");
    if (!tbody) return;
    tbody.innerHTML = "";

    const soon = selectExpireSoon(rows, range);
    if (soon.length === 0) {
      tbody.appendChild(
        placeholderRow("No subscriptions in the selected date range.")
      );
      return;
    }

    const frag = document.createDocumentFragment();
    soon.forEach((r, i) => {
      const storeClass = getStoreClass(r);
      const tr = document.createElement("tr");
      tr.className = `era-row ${storeClass}`;
      tr.innerHTML = `
        <td class="era-num ${storeClass}">${i + 1}</td>
        <td class="${storeClass}">${r.sale_product ?? "-"}</td>
        <td class="${storeClass}" style="text-align: center;">${r.customer ?? "-"}</td>
        <td class="${storeClass}">${r.email ?? "-"}</td>
        <td class="${storeClass}" style="text-align: center;">${fmtDate(r.purchased_date)}</td>
        <td class="${storeClass}" style="text-align: center;">${fmtDate(r.expired_date)}</td>
        <td class="${storeClass}" style="text-align: right;">${leftLabel(r._days)}</td>
      `;
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
  }

  /** Renders desktop "Need Renew" table. */
  function renderNeedRenewDesktop(rows) {
    const tbody = qs("need_renew");
    if (!tbody) return;
    tbody.innerHTML = "";

    const out = selectNeedRenew(rows);
    if (out.length === 0) {
      tbody.appendChild(placeholderRow("No renewals due within 3 days."));
      return;
    }

    const frag = document.createDocumentFragment();
    out.forEach((r, i) => {
      const storeClass = getStoreClass(r);
      const tr = document.createElement("tr");
      tr.className = `era-row ${storeClass}`;
      tr.innerHTML = `
        <td class="era-num ${storeClass}">${i + 1}</td>
        <td class="${storeClass}">${r.sale_product ?? "-"}</td>
        <td class="${storeClass}" style="text-align: center;">${r.customer ?? "-"}</td>
        <td class="${storeClass}">${r.email ?? "-"}</td>
        <td class="${storeClass}" style="text-align: center;">${fmtDate(r.purchased_date)}</td>
        <td class="${storeClass}" style="text-align: center;">${fmtDate(r.next_due)}</td>
        <td class="${storeClass}" style="text-align: center;">${fmtDate(r.expiry_ymd)}</td>
        <td class="${storeClass}" style="text-align: right;">${leftLabel(r.left)}</td>
      `;
      frag.appendChild(tr);
    });
    tbody.appendChild(frag);
  }

  /** Renders mobile cards for "Expire Soon". */
  function renderExpireSoonMobile(rows, range = expireRange) {
    const wrap = qs("expired-item");
    if (!wrap) return;
    wrap.innerHTML = "";

    const soon = selectExpireSoon(rows, range);
    if (soon.length === 0) {
      setMobilePlaceholder(wrap, "No subscriptions in the selected date range.");
      return;
    }

    const frag = document.createDocumentFragment();
    soon.forEach((r) => {
      const storeClass = getStoreClass(r);
      const card = document.createElement("div");
      card.className = `subs-card ${storeClass}`;
      card.innerHTML = `
        <div class="subs-row subs-row-top">
          <div class="subs-product">${r.sale_product ?? "-"}</div>
        </div>
        <div class="subs-row subs-name">
          <span class="subs-label">Name:</span>
          <span>${r.customer ?? "-"}</span>
        </div>
        <div class="subs-row subs-email">
          <span class="subs-label">Email:</span>
          <span>${r.email ?? "-"}</span>
        </div>
        <div class="subs-row subs-dates">
          <div class="subs-purchased">
            <span class="subs-label">Purchased:</span>
            <span>${fmtDate(r.purchased_date)}</span>
          </div>
          <div class="subs-expire">
            <span class="subs-label">Expire:</span>
            <span>${fmtDate(r.expired_date)}</span>
          </div>
        </div>
        <div class="subs-row subs-price">
          <span class="subs-label">Day Left:</span>
          <span>${leftLabel(r._days)}</span>
        </div>
      `;
      frag.appendChild(card);
    });
    wrap.appendChild(frag);
  }

  /** Renders mobile cards for "Need Renew". */
  function renderNeedRenewMobile(rows) {
    const wrap = qs("renewal-item");
    if (!wrap) return;
    wrap.innerHTML = "";

    const out = selectNeedRenew(rows);
    if (out.length === 0) {
      setMobilePlaceholder(wrap, "No renewals due within 3 days.");
      return;
    }

    const frag = document.createDocumentFragment();
    out.forEach((r) => {
      const storeClass = getStoreClass(r);
      const card = document.createElement("div");
      card.className = `subs-card ${storeClass}`;
      card.innerHTML = `
        <div class="subs-row subs-row-top">
          <div class="subs-product">${r.sale_product ?? "-"}</div>
          <div class="subs-renew"><span class="subs-label">Every</span><span>${
            r.renew
          }</span><span class="subs-label">Months</span></div>
        </div>
        <div class="subs-row subs-name">
          <span class="subs-label">Name:</span>
          <span>${r.customer ?? "-"}</span>
        </div>
        <div class="subs-row subs-email">
          <span class="subs-label">Email:</span>
          <span>${r.email ?? "-"}</span>
        </div>
        <div class="subs-row subs-dates">
          <div class="subs-purchased">
            <span class="subs-label">Purchased:</span>
            <span>${fmtDate(r.purchased_date)}</span>
          </div>
          <div class="subs-expire">
            <span class="subs-label">Exprie:</span>
            <span>${fmtDate(r.expiry_ymd)}</span>
          </div>
        </div>
        <div class="subs-row subs-dates">
          <div class="subs-purchased">
            <span class="subs-label">Renew at:</span>
            <span>${fmtDate(r.next_due)}</span>
          </div>
          <div class="subs-expire">
            <span class="subs-label">Day Left: </span>
            <span style="font-size: 0.9rem;">${leftLabel(r.left)}</span>
          </div>
        </div>
      `;
      frag.appendChild(card);
    });
    wrap.appendChild(frag);
  }

  /** Computes and renders renewal risk counters. */
  function renderRenewalRisk(rows) {
    const buckets = {
      overdue: 0,
      today: 0,
      next3: 0,
      next7: 0,
    };

    (rows || []).forEach((r) => {
      const expUTC = toUTC(r.expired_date);
      if (!expUTC) return;
      const days = daysBetween(expUTC, todayUTC);

      if (days < 0) buckets.overdue += 1;
      else if (days === 0) buckets.today += 1;
      else if (days >= 1 && days <= 3) buckets.next3 += 1;
      else if (days >= 4 && days <= 7) buckets.next7 += 1;
    });

    const elOverdue = qs("risk_overdue");
    const elToday = qs("risk_today");
    const el3 = qs("risk_3days");
    const el7 = qs("risk_7days");
    if (elOverdue) elOverdue.textContent = String(buckets.overdue);
    if (elToday) elToday.textContent = String(buckets.today);
    if (el3) el3.textContent = String(buckets.next3);
    if (el7) el7.textContent = String(buckets.next7);
  }

  /** Calculates next valid renewal due date for one row. */
  function nextRenewDue(r) {
    const renew = Number.isFinite(+r.renew) ? parseInt(r.renew, 10) : 0;
    if (!Number.isInteger(renew) || renew <= 0) return null;

    const purchaseUTC = toUTC(r.purchased_date);
    if (!purchaseUTC) return null;

    const duration = Number.isFinite(+r.duration) ? parseInt(r.duration, 10) : null;
    const expiryUTC = toUTC(r.expired_date) || computeExpiryUTC(r.purchased_date, duration);

    let due = addMonthsUTC(purchaseUTC, renew);
    while (due < todayUTC) due = addMonthsUTC(due, renew);

    if (expiryUTC) {
      const lastCutoff = addMonthsUTC(expiryUTC, -renew);
      if (due > lastCutoff) return null;
    }
    return due;
  }

  /** Renders forecasted renewal revenue/count for 7 and 30 days. */
  function renderRenewalForecast(rows) {
    const calc = (horizonDays) => {
      const end = addDaysUTC(todayUTC, horizonDays);
      let amount = 0;
      let count = 0;

      (rows || []).forEach((r) => {
        const due = nextRenewDue(r);
        if (!due || due < todayUTC || due > end) return;
        const price = Number(r.price) || 0;
        amount += price;
        count += 1;
      });

      return { amount, count };
    };

    const f7 = calc(7);
    const f30 = calc(30);

    const a7 = qs("forecast_7_amount");
    const c7 = qs("forecast_7_count");
    const a30 = qs("forecast_30_amount");
    const c30 = qs("forecast_30_count");

    if (a7) a7.textContent = fmtMoney(f7.amount);
    if (c7) c7.textContent = `${f7.count} projected renewals`;
    if (a30) a30.textContent = fmtMoney(f30.amount);
    if (c30) c30.textContent = `${f30.count} projected renewals`;
  }

  /** Re-renders all desktop/mobile summary tables and range info. */
  function renderAll() {
    const expireRows = selectExpireSoon(allRows, expireRange);
    renderExpireSoonDesktop(allRows, expireRange);
    renderNeedRenewDesktop(allRows);
    renderExpireSoonMobile(allRows, expireRange);
    renderNeedRenewMobile(allRows);
    setExpireFilterInfo(expireRows.length);
  }

  /** Initializes expire date filter controls and default values. */
  function initExpireFilterControls() {
    const fromInput = qs("expire_from_date");
    const toInput = qs("expire_to_date");
    const applyBtn = qs("expire_filter_apply");
    const defaultBtn = qs("expire_filter_default");
    if (!fromInput || !toInput) return;

    const applyRange = () => {
      const rawFrom = fromInput.value || getDefaultExpireRange().from;
      const rawTo = toInput.value || getDefaultExpireRange().to;
      let from = rawFrom;
      let to = rawTo;

      if (toUTC(from) && toUTC(to) && toUTC(from) > toUTC(to)) {
        [from, to] = [to, from];
      }

      fromInput.value = from;
      toInput.value = to;
      expireRange = { from, to };
      renderAll();
    };

    const resetDefault = () => {
      const d = getDefaultExpireRange();
      expireRange = d;
      fromInput.value = d.from;
      toInput.value = d.to;
      renderAll();
    };

    const d = getDefaultExpireRange();
    fromInput.value = d.from;
    toInput.value = d.to;
    expireRange = d;

    if (applyBtn) applyBtn.addEventListener("click", applyRange);
    if (defaultBtn) defaultBtn.addEventListener("click", resetDefault);
    fromInput.addEventListener("change", applyRange);
    toInput.addEventListener("change", applyRange);
  }

  // ------------------------------ Orchestration ------------------------------
  /** Fetches summary rows from API and performs full render cycle. */
  async function loadAndRender() {
    const tExpire = qs("expire_soon");
    const tRenew = qs("need_renew");

    setLoading(tExpire);
    setLoading(tRenew);

    try {
      const packet = readCachePacket();
      if (packet.data) {
        allRows = packet.data;
        renderAll();

        fetchRowsFromApi(packet.etag)
          .then((result) => {
            if (result.notModified) return;
            writeCachePacket(result.data, result.etag || null);
            allRows = result.data;
            renderAll();
          })
          .catch((err) => console.error("Summary background refresh failed:", err));
        return;
      }

      const result = await fetchRowsFromApi(null);
      const rows = result.data || [];
      writeCachePacket(rows, result.etag || null);
      allRows = rows;
      renderAll();
    } catch (err) {
      console.error("Load failed:", err);

      if (tExpire) {
        tExpire.innerHTML = "";
        tExpire.appendChild(placeholderRow("Failed to load expiring items."));
      }
      if (tRenew) {
        tRenew.innerHTML = "";
        tRenew.appendChild(placeholderRow("Failed to load renewals."));
      }

      setMobilePlaceholder(
        qs("expired-item"),
        "Failed to load expiring items."
      );
      setMobilePlaceholder(qs("renewal-item"), "Failed to load renewals.");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initExpireFilterControls();
    loadAndRender();
  });
})();
