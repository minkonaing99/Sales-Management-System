"use strict";

/**
 * Module: Retail sales table/cards controller.
 * Purpose: Loads retail sales data, supports search/infinite render/inline edit/delete,
 * and keeps desktop + mobile views synchronized.
 */
/* -----------------------------
   Small utilities (global)
----------------------------- */
/** Returns today's local date as `YYYY-MM-DD`. */
function todayDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* -----------------------------
   Add Sale section toggle + search UI
----------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  // Search reveal/hide
  const btn = document.getElementById("searchBtn");
  const wrap = document.getElementById("searchCustomerWrapper");
  const input = document.getElementById("search_customer");
  if (btn && wrap && input) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      btn.classList.add("is-hidden");
      wrap.classList.add("is-visible");
      setTimeout(() => input.focus(), 10);
    });

    input.addEventListener("blur", () => {
      setTimeout(() => {
        input.value = "";
        wrap.classList.remove("is-visible");
        btn.classList.remove("is-hidden");
      }, 120);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        input.value = "";
        input.blur();
      }
    });
  }
});

// Manual refresh button (optional)
document
  .getElementById("refreshBtn")
  ?.addEventListener("click", async function () {
    this.style.setProperty("display", "none", "important");
    this.disabled = true;
    try {
      await (window.refreshSalesTable?.() ?? Promise.resolve());
    } finally {
      setTimeout(() => {
        this.disabled = false;
        this.style.setProperty("display", "inline-block", "important");
      }, 5000);
    }
  });

/* -----------------------------
   Sales table/cards: cache-first + 100-per-view + daily subtotals + inline edit + search
----------------------------- */
(() => {
  const API_LIST_URL = "api/sales_table.php";
  const API_DELETE_URL = "api/sale_delete.php";
  const API_INLINE_URL = "api/sale_update_inline.php";
  const API_FETCH_LIMIT = 500;

  // Desktop (table)
  const tbody = document.getElementById("sales_table");
  // Mobile (cards)
  const subsList = document.getElementById("subsList");
  const tableWrap = document.querySelector(".era-table-wrap");
  if (!tbody && !subsList) return; // not on this page

  const MQ_MOBILE = window.matchMedia("(max-width: 640px)");

  const COLSPAN = 10;
  const CACHE_KEY = "cachedSales:v2";
  const PAGE_SIZE = 100;

  // --- data cache ---
  let allRows = []; // master dataset (from API / cache)

  // --- TABLE state ---
  let flatRowsTable = [];
  let renderedCountTable = 0;
  let totalsByDate = new Map();
  let countsByDate = new Map();
  let renderedByDate = new Map();
  let rowNumBase = 0;
  let ioTable = null;

  // --- CARDS state ---
  let flatRowsCards = [];
  let renderedCountCards = 0;
  let ioCards = null;

  // --- inline editor state (table only) ---
  let activeEditor = null; // { td, input, span, prev }

  // --- search state ---
  let currentQuery = ""; // the text currently filtering

  function readCachePacket() {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return { data: null, etag: null };
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return { data: parsed, etag: null };
      if (parsed && Array.isArray(parsed.data)) {
        return { data: parsed.data, etag: parsed.etag || null };
      }
    } catch {}
    return { data: null, etag: null };
  }

  function writeCachePacket(data, etag = null) {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, etag, ts: Date.now() }));
  }

  // ---------------- helpers ----------------
  const svgTrash = () =>
    `<span class="era-icon"><img src="./assets/delete.svg" alt=""></span>`;

  /** Formats a numeric amount as rounded Kyat display text. */
  function formatKyat(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return "-";
    return (
      new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
        Math.round(num),
      ) + " Ks"
    );
  }

  /** Formats a `YYYY-MM-DD` string to `DD Mon YYYY` (UTC-safe). */
  function formatDate(d) {
    if (!d) return "-";
    const parts = String(d).split("-");
    if (parts.length !== 3) return "-";
    const dt = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]));
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(dt);
  }

  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[m],
    );

  /** Builds a full-width placeholder row for loading/empty/error states. */
  function placeholderRow(text) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.className = "era-muted";
    td.colSpan = COLSPAN;
    td.textContent = text;
    tr.appendChild(td);
    return tr;
  }

  // simple trailing debounce (used for search)
  /** Trailing debounce helper for input-driven rendering. */
  function debounce(fn, ms = 1000) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  /** Precomputes normalized search tokens for a sales row. */
  function buildSearchKey(r) {
    const tokenizeDate = (ymd) => {
      if (!ymd) return [];
      const parts = String(ymd).split("-");
      if (parts.length !== 3) return [];
      const [y, m, d] = parts.map((n) => parseInt(n, 10));
      if (!y || !m || !d) return [];

      const dt = new Date(Date.UTC(y, m - 1, d));
      const monShort = dt
        .toLocaleString("en-US", { month: "short" })
        .toLowerCase(); // "aug"
      const monLong = dt
        .toLocaleString("en-US", { month: "long" })
        .toLowerCase(); // "august"
      const mm = String(m).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      const yyyy = String(y);

      // Build lots of variants so substring matching “just works”
      return [
        `${dd} ${monShort} ${yyyy}`, // "15 aug 2025"
        `${dd} ${monLong} ${yyyy}`, // "15 august 2025"
        `${monShort} ${yyyy}`, // "aug 2025"
        `${monLong} ${yyyy}`, // "august 2025"
        `${mm} ${yyyy}`, // "08 2025"
        `${yyyy}-${mm}`, // "2025-08"
        `${yyyy}-${mm}-${dd}`, // "2025-08-15"
        monShort, // "aug"
        monLong, // "august"
        mm, // "08"
        yyyy, // "2025"
      ];
    };

    const purchasedTokens = tokenizeDate(r.purchased_date);
    const expiredTokens = tokenizeDate(r.expired_date);

    // field-specific keys
    r._qPD = purchasedTokens.join("|").toLowerCase();
    r._qED = expiredTokens.join("|").toLowerCase();

    // everything key (keeps your existing fields + both date token sets)
    r._qAll = [
      r.customer ?? "",
      r.email ?? "",
      r.sale_product ?? "",
      r.manager ?? "",
      ...purchasedTokens,
      ...expiredTokens,
    ]
      .join("|")
      .toLowerCase();

    // backwards-compat in case something still reads r._q
    r._q = r._qAll;
  }

  // Update local/cache row
  /** Updates one row in memory and in session cache after inline edits. */
  function updateLocalRow(id, patch) {
    const idStr = String(id);
    const touchesSearch =
      "customer" in patch ||
      "email" in patch ||
      "manager" in patch ||
      "sale_product" in patch ||
      "renew" in patch ||
      "purchased_date" in patch ||
      "expired_date" in patch;

    // update in-memory
    allRows = allRows.map((r) => {
      if (String(r.sale_id) === idStr) {
        const nr = { ...r, ...patch };
        if (touchesSearch) buildSearchKey(nr);
        return nr;
      }
      return r;
    });

    // update session cache
    const packet = readCachePacket();
    if (packet.data) {
      try {
        const data = packet.data;
        const idx = data.findIndex((r) => String(r.sale_id) === idStr);
        if (idx >= 0) {
          data[idx] = { ...data[idx], ...patch };
          if (touchesSearch) buildSearchKey(data[idx]);
          writeCachePacket(data, packet.etag);
        }
      } catch {}
    }
  }

  // ---------------- TABLE ROW BUILDERS (desktop) ----------------
  /** Builds one desktop table row element for a sale record. */
  function buildSaleTr(s, displayNum) {
    const tr = document.createElement("tr");

    // ✅ FIRST define storeClass
    const storeValue = s.store ?? 0;
    const storeClass =
      storeValue === 1
        ? "store-digimium"
        : storeValue === 2
          ? "store-dmarwal"
          : storeValue === 0
            ? "store-void"
          : storeValue === 3
            ? "store-ember"
            : storeValue === 4
              ? "store-violet"
              : storeValue === 5
                ? "store-void"
                : "store-default";

    // ✅ NOW it's safe to use
    tr.className = `era-row ${storeClass}`;
    if (s.sale_id != null) tr.dataset.id = String(s.sale_id);

    const tdNum = document.createElement("td");
    tdNum.className = `era-num ${storeClass}`;
    tdNum.textContent = String(displayNum);

    const tdProd = document.createElement("td");
    tdProd.className = storeClass;
    tdProd.textContent = s.sale_product ?? "-";

    const makeEditable = (field, text, extraClass = "") => {
      const td = document.createElement("td");
      td.className =
        `td-scrollable editable-cell editable-${field} ${storeClass} ${extraClass}`.trim();
      td.dataset.id = String(s.sale_id || "");
      td.dataset.field = field;
      const span = document.createElement("span");
      span.className = "inline-text";
      span.textContent = text ?? "-";
      td.appendChild(span);
      if (field === "note" || field === "customer") td.title = text ?? "";
      return td;
    };

    const tdCustomer = makeEditable("customer", s.customer, "era-muted-customer");
    const tdEmail = makeEditable("email", s.email, "era-muted");

    const tdPurchased = document.createElement("td");
    tdPurchased.className = `text-center ${storeClass}`;
    tdPurchased.textContent = formatDate(s.purchased_date);

    const tdExpired = document.createElement("td");
    tdExpired.className = `text-center ${storeClass}`;
    tdExpired.textContent = formatDate(s.expired_date);

    const tdManager = makeEditable(
      "manager",
      s.manager,
      "era-muted column-hide",
    );
    const tdNote = makeEditable("note", s.note, "era-muted column-hide");

    const tdPrice = document.createElement("td");
    tdPrice.className = `era-price ${storeClass}`;
    tdPrice.textContent = formatKyat(s.price);

    const tdActions = document.createElement("td");
    tdActions.className = `era-actions ${storeClass}`;
    const delBtn = document.createElement("button");
    delBtn.className = "era-icon-btn";
    delBtn.type = "button";
    delBtn.dataset.action = "delete";
    delBtn.title = "Delete";
    delBtn.setAttribute("aria-label", `Delete row ${displayNum}`);
    delBtn.innerHTML = svgTrash();
    tdActions.appendChild(delBtn);

    tr.append(
      tdNum,
      tdProd,
      tdCustomer,
      tdEmail,
      tdPurchased,
      tdExpired,
      tdManager,
      tdNote,
      tdPrice,
      tdActions,
    );

    return tr;
  }

  // Keep these in sync with your table:
  // total columns = 10, price is the 2nd-to-last column.
  const TOTAL_COLS = 10;
  const PRICE_COL_INDEX = TOTAL_COLS - 2; // 8

  /** Builds a subtotal row shown after the last row of each purchase date. */
  function buildSubtotalTr(dateKey) {
    const tr = document.createElement("tr");
    tr.className = "era-row era-subtotal";

    // Label spans the columns that are ALWAYS visible before Price on mobile:
    // (Num, Product, Customer, Email, Purchased, Expired) = 6 cols
    const tdLabel = document.createElement("td");
    tdLabel.colSpan = 6;
    tdLabel.textContent = `Total for ${formatDate(dateKey)}`;
    tr.appendChild(tdLabel);

    // Add filler cells for the columns that are hidden on mobile
    // but visible on desktop BEFORE the Price column:
    // Manager (idx 7), Note (idx 8) → 2 fillers.
    // Give them the same "column-hide" class so they disappear on narrow view.
    for (let i = 0; i < 2; i++) {
      const tdFill = document.createElement("td");
      tdFill.className = "column-hide";
      tr.appendChild(tdFill);
    }

    // Price column (aligns exactly with header "Price")
    const tdSum = document.createElement("td");
    tdSum.className = "era-price";
    tdSum.style.padding = "0.4rem 0.4rem";
    tdSum.textContent = formatKyat(totalsByDate.get(dateKey) || 0);
    tr.appendChild(tdSum);

    // Actions column placeholder (keeps grid intact)
    const tdEmpty = document.createElement("td");
    tr.appendChild(tdEmpty);

    return tr;
  }

  /** Computes per-day totals and counts used by subtotal rendering. */
  function buildDailyStats(rows) {
    totalsByDate = new Map();
    countsByDate = new Map();
    renderedByDate = new Map();
    rows.forEach((r) => {
      const d = r.purchased_date || "";
      const p = Number(r.price) || 0;
      totalsByDate.set(d, (totalsByDate.get(d) || 0) + p);
      countsByDate.set(d, (countsByDate.get(d) || 0) + 1);
    });
  }

  // ---------------- INLINE EDITING (table only) ----------------
  /** Converts an editable cell into input mode. */
  function startInlineEdit(td) {
    if (!td || td.classList.contains("editing")) return;

    // close other editor
    if (activeEditor && activeEditor.td !== td) cancelInline(activeEditor.td);

    const span = td.querySelector(".inline-text");
    if (!span) return;

    const field = td.dataset.field; // customer|email|manager|note
    const initial = (span.textContent || "").trim();

    td.classList.add("editing");
    span.style.display = "none";

    const input = document.createElement("input");
    input.type = field === "email" ? "email" : "text";
    input.className = "form-control form-control-sm inline-input";
    input.value = initial === "-" ? "" : initial;
    input.style.width = "100%";
    input.style.boxSizing = "border-box";

    td.appendChild(input);
    activeEditor = { td, input, span, prev: initial };

    input.focus();
    input.select();
  }

  /** Cancels inline editing and restores previous text. */
  function cancelInline(td) {
    if (!td || !td.classList.contains("editing")) return;
    const input = td.querySelector(".inline-input");
    const span = td.querySelector(".inline-text");

    if (input) td.removeChild(input);
    if (span) {
      span.textContent = activeEditor?.prev ?? span.textContent;
      span.style.display = "";
    }

    if (td.dataset.field === "note" || td.dataset.field === "customer") {
      td.title = activeEditor?.prev || "";
    }

    td.classList.remove("editing");
    if (activeEditor?.td === td) activeEditor = null;
  }

  /** Saves inline cell updates with optimistic UI and rollback on failure. */
  async function saveInline(td) {
    const input = td.querySelector(".inline-input");
    const span = td.querySelector(".inline-text");
    const id = td.dataset.id;
    const field = td.dataset.field;
    if (!input || !span || !id || !field) return;

    const next = input.value.trim();
    const prev = activeEditor?.prev ?? span.textContent.trim();

    // no change → just show and exit
    if (next === prev) {
      td.removeChild(input);
      span.style.display = "";
      td.classList.remove("editing");
      if (activeEditor?.td === td) activeEditor = null;
      return;
    }

    // tiny validation
    if (field === "email" && next && !/^\S+@\S+\.\S+$/.test(next)) {
      alert("Please enter a valid email.");
      input.focus();
      return;
    }
    if (field === "customer" && !next) {
      alert("Customer cannot be empty.");
      input.focus();
      return;
    }

    // optimistic UI
    span.textContent = next || "-";
    span.style.display = "";
    if (field === "note" || field === "customer") td.title = next || "";
    td.removeChild(input);
    td.classList.remove("editing");
    if (activeEditor?.td === td) activeEditor = null;

    // update local + cache copy
    updateLocalRow(id, { [field]: next || null });

    // persist to backend
    try {
      const payload = { id };
      payload[field] = next || null;

      // Show loading on the cell being edited
      if (window.LoadingSystem) {
        window.LoadingSystem.setButtonLoading(td, true);
      }

      const res = await fetch(API_INLINE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success)
        throw new Error(json.error || `HTTP ${res.status}`);

      // keep filtered view consistent (row may fall out/in due to edit)
      if (currentQuery) {
        renderViewport(filterRowsByQuery(allRows, currentQuery));
      }
    } catch (err) {
      // rollback on error
      span.textContent = prev || "-";
      if (field === "note" || field === "customer") td.title = prev || "";
      updateLocalRow(id, { [field]: prev || null });
      alert(`Failed to save ${field}: ${err.message}`);
    } finally {
      if (window.LoadingSystem) {
        window.LoadingSystem.setButtonLoading(td, false);
      }
    }
  }

  /** Binds double-click/edit keyboard/blur handlers for editable table cells. */
  function initInlineEditing() {
    if (!tbody) return;
    tbody.addEventListener("dblclick", (e) => {
      const td = e.target.closest(".editable-cell");
      if (td) startInlineEdit(td);
    });

    tbody.addEventListener("keydown", (e) => {
      if (!e.target.matches(".inline-input")) return;
      if (e.key === "Enter") {
        e.preventDefault();
        const td = e.target.closest(".editable-cell");
        if (td) saveInline(td);
      } else if (e.key === "Escape") {
        const td = e.target.closest(".editable-cell");
        if (td) cancelInline(td);
      }
    });

    // blur cancels (do not save on blur)
    tbody.addEventListener(
      "blur",
      (e) => {
        if (e.target.matches(".inline-input")) {
          const td = e.target.closest(".editable-cell");
          setTimeout(() => td && cancelInline(td), 100);
        }
      },
      true,
    );
  }

  // ---------------- search (client-side, cached) ----------------
  /** Applies all-field or prefix-based (`pd:`/`ed:`) filtering to row data. */
  function filterRowsByQuery(rows, q) {
    if (!q) return rows;
    let raw = q.trim().toLowerCase();
    if (!raw) return rows;

    let mode = "all"; // "pd" | "ed" | "all"
    if (raw.startsWith("pd:")) {
      mode = "pd";
      raw = raw.slice(3).trim();
    } else if (raw.startsWith("ed:")) {
      mode = "ed";
      raw = raw.slice(3).trim();
    }

    // If user typed only "pd:" or "ed:" with nothing after, just return all.
    if (!raw) return rows;

    const getter =
      mode === "pd"
        ? (r) => r._qPD || ""
        : mode === "ed"
          ? (r) => r._qED || ""
          : (r) => r._qAll || r._q || "";

    return rows.filter((r) => getter(r).includes(raw));
  }

  /** Reads search text and re-renders filtered rows/cards. */
  function applySearchRender() {
    const input = document.getElementById("search_customer");
    currentQuery = (input?.value || "").trim();

    // Re-render filtered list (starts at 100)
    renderViewport(filterRowsByQuery(allRows, currentQuery));

    // Optional: reset scroll so the observer doesn’t instantly fire
    const wrap = document.querySelector(".era-table-wrap");
    if (wrap) wrap.scrollTo({ top: 0, behavior: "instant" });
  }

  /** Wires search input events with debounce and enter-to-search behavior. */
  function setupCustomerSearch() {
    const input = document.getElementById("search_customer");
    if (!input) return;

    // 1s debounce while typing
    input.addEventListener("input", debounce(applySearchRender, 1000));

    // Enter triggers immediate search
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        applySearchRender();
      }
    });

    // When your UI hides/clears the input, reset the view
    // input.addEventListener("blur", () => {
    //   setTimeout(() => {
    //     if (!input.value) {
    //       currentQuery = "";
    //       renderViewport(allRows);
    //     }
    //   }, 140);
    // });
  }

  // ---------------- TABLE RENDER (desktop) ----------------
  /** Appends the next paged chunk of desktop table rows. */
  function appendNextChunkTable() {
    if (!tbody) return;
    if (renderedCountTable >= flatRowsTable.length) return;

    const frag = document.createDocumentFragment();
    const start = renderedCountTable;
    const end = Math.min(flatRowsTable.length, start + PAGE_SIZE);

    for (let i = start; i < end; i++) {
      const s = flatRowsTable[i];
      const d = s.purchased_date || "";

      frag.appendChild(buildSaleTr(s, ++rowNumBase));

      renderedByDate.set(d, (renderedByDate.get(d) || 0) + 1);
      const finished = renderedByDate.get(d) === (countsByDate.get(d) || 0);
      if (finished) frag.appendChild(buildSubtotalTr(d));
    }

    tbody.appendChild(frag);
    hideLoader();
    renderedCountTable = end;

    if (renderedCountTable >= flatRowsTable.length && ioTable) {
      ioTable.disconnect();
      ioTable = null;
    }
  }

  /** Initializes and progressively renders the desktop table viewport. */
  function renderRowsProgressive(rows) {
    if (!tbody) return;

    // kill cards observer if switching
    if (ioCards) {
      ioCards.disconnect();
      ioCards = null;
    }

    tbody.innerHTML = "";
    if (!Array.isArray(rows) || rows.length === 0) {
      tbody.appendChild(placeholderRow("No sales found."));
      flatRowsTable = [];
      return;
    }

    flatRowsTable = rows.slice();
    buildDailyStats(flatRowsTable);

    renderedCountTable = 0;
    rowNumBase = 0;
    appendNextChunkTable();

    const sentinel = document.getElementById("scrollSentinel");
    if (!sentinel) return;

    if (ioTable) ioTable.disconnect();
    ioTable = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => e.isIntersecting && appendNextChunkTable()),
      { root: null, rootMargin: "0px 0px 200px 0px", threshold: 0 },
    );
    ioTable.observe(sentinel);
  }

  // ---------------- CARD RENDER (mobile) ----------------
  /** Appends the next paged chunk of mobile cards. */
  function appendNextChunkCards() {
    if (!subsList) return;
    if (renderedCountCards >= flatRowsCards.length) return;

    const frag = document.createDocumentFragment();
    const start = renderedCountCards;
    const end = Math.min(flatRowsCards.length, start + PAGE_SIZE);

    for (let i = start; i < end; i++) {
      const r = flatRowsCards[i];
      const product = esc(r.sale_product ?? "-");
      const renew = Number.isFinite(+r.renew) ? +r.renew : (r.renew ?? "-");
      const name = esc(r.customer ?? "-");
      const email = esc(r.email ?? "-");
      const manager = esc(r.manager ?? "-");
      const purchased = formatDate(r.purchased_date);
      const expired = formatDate(r.expired_date);
      const price = formatKyat(r.price);

      const article = document.createElement("article");
      article.className = "subs-card";
      article.innerHTML = `
        <div class="subs-row subs-row-top">
          <div class="subs-product">${product}</div>
          <div class="subs-renew"><span class="subs-label">Renew: </span><span>${esc(
            renew,
          )}</span></div>
        </div>

        <div class="subs-row subs-name">
          <span class="subs-label">Name:</span>
          <span class="subs-customer-value" title="${name}">${name}</span>
        </div>
        <div class="subs-row subs-name">
          <span class="subs-label">Email:</span>
          <span>${email}</span>
        </div>
        <div class="subs-row subs-name">
          <span class="subs-label">Manager:</span>
          <span>${manager}</span>
        </div>

        <div class="subs-row subs-dates">
          <div class="subs-purchased">
            <span class="subs-label">Purchased:</span>
            <span>${purchased}</span>
          </div>
          <div class="subs-expire">
            <span class="subs-label">Expire: </span>
            <span>${expired}</span>
          </div>
        </div>

        <div class="subs-row subs-price">${price}</div>
      `;
      frag.appendChild(article);
    }

    subsList.appendChild(frag);
    hideLoader();
    renderedCountCards = end;

    if (renderedCountCards >= flatRowsCards.length && ioCards) {
      ioCards.disconnect();
      ioCards = null;
    }
  }

  /** Initializes and progressively renders the mobile card viewport. */
  function renderCardsProgressive(rows) {
    if (!subsList) return;

    // kill table observer if switching
    if (ioTable) {
      ioTable.disconnect();
      ioTable = null;
    }

    subsList.innerHTML = "";
    if (!rows || rows.length === 0) {
      subsList.innerHTML = `<article class="subs-card"><div class="subs-row">No sales found.</div></article>`;
      flatRowsCards = [];
      return;
    }

    flatRowsCards = rows.slice();
    renderedCountCards = 0;
    appendNextChunkCards();

    const sentinel = document.getElementById("scrollSentinel");
    if (!sentinel) return;

    if (ioCards) ioCards.disconnect();
    ioCards = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => e.isIntersecting && appendNextChunkCards()),
      { root: null, rootMargin: "0px 0px 200px 0px", threshold: 0 },
    );
    ioCards.observe(sentinel);
  }

  // ---------------- Viewport dispatcher ----------------
  /** Ensures desktop/mobile containers match current media query state. */
  function setContainersForViewport() {
    // Optional: enforce visibility to avoid CSS conflicts
    if (tableWrap)
      tableWrap.style.display = MQ_MOBILE.matches ? "none" : "block";
    if (subsList) subsList.style.display = MQ_MOBILE.matches ? "block" : "none";
  }

  /** Dispatches rendering to desktop table or mobile cards. */
  function renderViewport(rows) {
    setContainersForViewport();
    if (MQ_MOBILE.matches) {
      renderCardsProgressive(rows);
    } else {
      renderRowsProgressive(rows);
    }
  }

  // ---------------- data ----------------
  /** Fetches latest retail sales rows from API. */
  async function fetchSalesFromNetwork(etag = null) {
    let cursor = null;
    let firstEtag = etag || null;
    let isFirst = true;
    const all = [];

    while (true) {
      const params = new URLSearchParams();
      params.set("limit", String(API_FETCH_LIMIT));
      if (cursor) params.set("cursor", cursor);
      const headers = { Accept: "application/json" };
      if (isFirst && etag) headers["If-None-Match"] = etag;

      const r = await fetch(`${API_LIST_URL}?${params.toString()}`, { headers });
      if (isFirst && r.status === 304) {
        return { notModified: true, data: null, etag };
      }

      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success) throw new Error(json.error || `HTTP ${r.status}`);

      const pageRows = Array.isArray(json.data) ? json.data : [];
      all.push(...pageRows);
      if (isFirst) firstEtag = r.headers.get("ETag");

      const meta = json.meta || {};
      const hasMore = !!meta.has_more;
      const nextCursor = meta.next_cursor || null;
      if (!hasMore || !nextCursor) break;

      cursor = nextCursor;
      isFirst = false;
    }

    return { notModified: false, data: all, etag: firstEtag };
  }

  /** Loads rows from cache/network and renders active viewport. */
  async function loadSales() {
    // Start loading with minimum 1 second display
    const loadingStartTime = Date.now();
    const minLoadingTime = 1000; // 1 second minimum

    // Show global loading overlay
    if (window.LoadingSystem) {
      window.LoadingSystem.showGlobalLoading("Loading sales data...");
    }

    // Show placeholder in whichever view is active
    showLoader();

    if (!MQ_MOBILE.matches && tbody) {
      tbody.innerHTML = "";
      tbody.appendChild(placeholderRow("Loading…"));
    } else if (subsList) {
      subsList.innerHTML = `<article class="subs-card"><div class="subs-row">Loading…</div></article>`;
    }

    const cachePacket = readCachePacket();
    if (cachePacket.data) {
      try {
        const data = cachePacket.data;
        allRows = Array.isArray(data) ? data : [];
        allRows.forEach(buildSearchKey);
        renderViewport(filterRowsByQuery(allRows, currentQuery));

        // background refresh
        fetchSalesFromNetwork(cachePacket.etag)
          .then((freshResult) => {
            if (freshResult.notModified) return;
            const fresh = freshResult.data || [];
            writeCachePacket(fresh, freshResult.etag || null);
            allRows = Array.isArray(fresh) ? fresh : [];
            allRows.forEach(buildSearchKey);
            renderViewport(filterRowsByQuery(allRows, currentQuery));
          })
          .catch(() => {});

        // Ensure minimum loading time for cached data
        const elapsed = Date.now() - loadingStartTime;
        if (elapsed < minLoadingTime) {
          setTimeout(() => {
            if (window.LoadingSystem) {
              window.LoadingSystem.hideGlobalLoading();
            }
            hideLoader();
          }, minLoadingTime - elapsed);
        } else {
          if (window.LoadingSystem) {
            window.LoadingSystem.hideGlobalLoading();
          }
          hideLoader();
        }
        return;
      } catch {
        sessionStorage.removeItem(CACHE_KEY);
      }
    }

    try {
      const freshResult = await fetchSalesFromNetwork();
      const fresh = freshResult.data || [];
      writeCachePacket(fresh, freshResult.etag || null);
      allRows = Array.isArray(fresh) ? fresh : [];
      allRows.forEach(buildSearchKey);
      renderViewport(filterRowsByQuery(allRows, currentQuery));

      // Ensure minimum loading time for fresh data
      const elapsed = Date.now() - loadingStartTime;
      if (elapsed < minLoadingTime) {
        setTimeout(() => {
          if (window.LoadingSystem) {
            window.LoadingSystem.hideGlobalLoading();
          }
          hideLoader();
        }, minLoadingTime - elapsed);
      } else {
        if (window.LoadingSystem) {
          window.LoadingSystem.hideGlobalLoading();
        }
        hideLoader();
      }
    } catch (err) {
      console.error("Failed to load sales:", err);
      if (!MQ_MOBILE.matches && tbody) {
        tbody.innerHTML = "";
        tbody.appendChild(placeholderRow(`Failed to load: ${err.message}`));
      } else if (subsList) {
        subsList.innerHTML = `<article class="subs-card"><div class="subs-row">Failed to load: ${esc(
          err.message,
        )}</div></article>`;
      }

      // Hide loading on error
      if (window.LoadingSystem) {
        window.LoadingSystem.hideGlobalLoading();
      }
      hideLoader();
    }
  }

  /** Clears cached rows and performs a full reload from API/cache flow. */
  function refreshCacheAndReload() {
    sessionStorage.removeItem(CACHE_KEY);
    return loadSales();
  }

  // ---------------- delete (delegated) ----------------
  // Table delete
  tbody?.addEventListener("click", async (e) => {
    const btn = e.target.closest('button.era-icon-btn[data-action="delete"]');
    if (!btn) return;

    const tr = btn.closest("tr.era-row");
    if (!tr) return;

    const id = Number(tr.dataset.id);
    if (!id) return alert("Missing sale_id for this row.");

    const name = tr.children[1]?.textContent?.trim() || `#${id}`;
    if (!confirm(`Delete "${name}"?\nThis cannot be undone.`)) return;

    btn.disabled = true;
    btn.classList.add("disableBtn");

    try {
      const resp = await fetch(API_DELETE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ id }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.success)
        throw new Error(json.error || `HTTP ${resp.status}`);
      await refreshCacheAndReload(); // keeps subtotals/numbering right
    } catch (err) {
      console.error("Delete failed:", err);
      alert(`Delete failed: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.classList.remove("disableBtn");
    }
  });

  // (Optional) If you add delete buttons inside cards, wire them here:
  subsList?.addEventListener("click", async (e) => {
    const btn = e.target.closest('button.era-icon-btn[data-action="delete"]');
    if (!btn) return;
    const article = btn.closest(".subs-card");
    const id = Number(article?.dataset?.id);
    if (!id) return; // Only works if you render data-id on the card
    if (!confirm(`Delete #${id}? This cannot be undone.`)) return;

    btn.disabled = true;
    btn.classList.add("disableBtn");

    try {
      const resp = await fetch(API_DELETE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ id }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json.success)
        throw new Error(json.error || `HTTP ${resp.status}`);
      await refreshCacheAndReload();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.classList.remove("disableBtn");
    }
  });

  // ---------------- init ----------------
  // re-render when crossing the breakpoint
  MQ_MOBILE.addEventListener("change", () => {
    renderViewport(filterRowsByQuery(allRows, currentQuery));
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadSales);
  } else {
    loadSales();
  }

  setupCustomerSearch(); // debounced search
  initInlineEditing(); // applies to table only
  window.refreshSalesTable = refreshCacheAndReload;
})();

