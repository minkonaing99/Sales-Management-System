/**
 * Module: Wholesale product catalog CRUD controller.
 * Purpose: Manages wholesale-only product rows, form validation, and API sync.
 */
(() => {
  "use strict";

  // ====== Config ======
  const API = {
    list: "api/ws_products_table.php",
    insert: "api/ws_product_insertion.php",
    update: "api/ws_product_update.php",
    delete: "api/ws_product_delete.php",
  };
  const COLSPAN = 10;
  const ALLOWED_RENEW = new Set([0, 1, 2, 3, 4, 5, 6, 12]); // numbers only

  // ====== DOM refs ======
  const $ = (id) => document.getElementById(id);
  const tbody = $("ws_product_table");

  // Add form
  const addForm = document.querySelector("#inputRow form");
  const addEls = addForm
    ? {
        form: addForm,
        product: $("product"),
        duration: $("duration"),
        supplier: $("supplier"),
        renewable: $("renewable"), // MUST have values: 0,1,2,3,4,5,6,12
        note: $("note"),
        link: $("link"),
        wholesale: $("wholesale_amount"),
        retail: $("retail_amount"),
        saveBtn: addForm.querySelector('button[type="submit"]'),
        feedback: $("feedback_addProduct"),
      }
    : null;

  // Edit form
  const editForm = $("editForm");
  const editEls = editForm
    ? {
        form: editForm,
        id: $("edit_product_id"),
        product: $("edit_product"),
        duration: $("edit_duration"),
        supplier: $("edit_supplier"),
        renewable: $("edit_renewable"), // MUST have values: 0,1,2,3,4,5,6,12
        note: $("edit_note"),
        link: $("edit_link"),
        wholesale: $("edit_wholesale_amount"),
        retail: $("edit_retail_amount"),
        saveBtn: editForm.querySelector('button[type="submit"]'),
        feedback: $("feedback_editProduct"),
      }
    : null;

  // ====== Utils ======
  /** Toggles danger styling on an input and its label. */
  function setDanger(el, on) {
    if (!el) return;
    el.classList.toggle("text-danger", !!on);
    const label = el.id
      ? document.querySelector(`label[for="${el.id}"]`)
      : null;
    if (label) label.classList.toggle("text-danger", !!on);
  }
  const toInt = (v) =>
    v === "" || v == null ? NaN : Number.isInteger(+v) ? +v : NaN;
  const toMoney = (v) =>
    v === "" || v == null
      ? NaN
      : Number.isFinite(+v)
      ? Math.round(+v * 100) / 100
      : NaN;

  // renew helpers (numbers only)
  /** Parses renew months from a control and enforces allowed integer values. */
  function parseRenewInt(el) {
    const n = Number((el?.value ?? "").toString().trim());
    if (!Number.isInteger(n)) return null;
    return ALLOWED_RENEW.has(n) ? n : null;
  }
  /** Coerces renew value to a safe allowed integer fallback. */
  function coerceRenewInt(v) {
    const n = Number((v ?? "").toString().trim());
    return Number.isInteger(n) && ALLOWED_RENEW.has(n) ? n : 0;
  }
  /** Sets the renew control value using allowed options only. */
  function setRenewableControlValue(el, intVal) {
    if (!el) return;
    const v = ALLOWED_RENEW.has(intVal) ? intVal : 0;
    el.value = String(v);
  }
  // Put this with your utils
  /** Removes trailing duration suffixes from display product names. */
  function stripDurationSuffix(name) {
    // remove one or more trailing " - 3M" or "(3m)" suffixes, case-insensitive
    return (name || "")
      .replace(/\s*(?:-\s*\d+\s*M|\(\s*\d+\s*m\s*\))+$/i, "")
      .trim();
  }

  /** Builds canonical product name format: `<name> - <duration>M`. */
  function formatProductName(rawName, duration) {
    const base = (rawName || "").replace(/\s*\(\s*\d+\s*m\s*\)$/i, "").trim();
    return `${base} - ${duration}M`;
  }
  /** Normalizes URL input and adds protocol if missing. */
  function normalizeLink(s) {
    const v = (s || "").trim();
    if (!v) return null;
    return /^https?:\/\//i.test(v) ? v : `https://${v}`;
  }
  /** Formats number as rounded Kyat text. */
  function formatKyat(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return "-";
    return (
      new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
        Math.round(num)
      ) + " Ks"
    );
  }
  const svgTrash = () =>
    `<span class="era-icon"><img src="./assets/delete.svg" alt=""></span>`;
  const svgEdit = () =>
    `<span class="era-icon"><img src="./assets/edit.svg" alt=""></span>`;

  // ====== Validation (shared) ======
  /** Shared validator for add/edit catalog forms and API payload shaping. */
  function validateProductForm(refs, { formatName = true } = {}) {
    const errors = {};

    const productRaw = (refs.product?.value || "").trim();
    if (!productRaw) errors.product = true;
    setDanger(refs.product, !productRaw);

    const duration = toInt(refs.duration?.value);
    if (!Number.isInteger(duration) || duration < 1) {
      errors.duration = true;
      setDanger(refs.duration, true);
    } else setDanger(refs.duration, false);

    const wholesale = toMoney(refs.wholesale?.value);
    if (!Number.isFinite(wholesale) || wholesale < 0) {
      errors.wholesale = true;
      setDanger(refs.wholesale, true);
    } else setDanger(refs.wholesale, false);

    const retail = toMoney(refs.retail?.value);
    if (!Number.isFinite(retail) || !(retail > wholesale)) {
      errors.retail = true;
      setDanger(refs.retail, true);
    } else setDanger(refs.retail, false);

    const renewableInt = parseRenewInt(refs.renewable);
    if (
      renewableInt == null || // parseRenewInt returns null when invalid
      !Number.isInteger(duration) || // guard if duration isn't valid yet
      renewableInt >= duration // must be strictly less than duration
    ) {
      errors.renew = true;
      setDanger(refs.renewable, true);
    } else {
      setDanger(refs.renewable, false);
    }

    const valid = Object.keys(errors).length === 0;

    if (refs.saveBtn) {
      refs.saveBtn.disabled = !valid;
      refs.saveBtn.classList.toggle("disableBtn", !valid);
    }

    const product_name = formatName
      ? formatProductName(productRaw, duration)
      : productRaw;

    const payload = valid
      ? {
          product_name,
          duration,
          renew: renewableInt, // <- send exact integer (no defaulting to 0)
          supplier: (refs.supplier?.value || "").trim() || null,
          wholesale,
          retail,
          note: (refs.note?.value || "").trim() || null,
          link: normalizeLink(refs.link?.value),
        }
      : null;

    return { valid, payload };
  }

  /** Attaches validation handlers and runs initial validation pass. */
  function attachValidation(refs, validator) {
    ["input", "blur"].forEach((evt) => {
      refs.product?.addEventListener(evt, validator);
      refs.duration?.addEventListener(evt, validator);
      refs.wholesale?.addEventListener(evt, validator);
      refs.retail?.addEventListener(evt, validator);
      refs.renewable?.addEventListener(evt, validator); // <-- add this (input)
    });
    refs.renewable?.addEventListener("change", validator);
    validator(); // initial
  }

  // ====== Table render ======
  /** Returns a full-width table placeholder row. */
  function placeholderRow(text) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.className = "era-muted";
    td.colSpan = COLSPAN;
    td.textContent = text;
    tr.appendChild(td);
    return tr;
  }

  /** Renders wholesale product rows into table body. */
  function renderRows(rows) {
    tbody.innerHTML = "";
    if (!Array.isArray(rows) || rows.length === 0) {
      tbody.appendChild(placeholderRow("No products found."));
      return;
    }
    const frag = document.createDocumentFragment();

    rows.forEach((p, i) => {
      const tr = document.createElement("tr");
      tr.className = "era-row";
      if (p.product_id != null) tr.dataset.id = String(p.product_id);

      const tdNum = document.createElement("td");
      tdNum.className = "era-num";
      tdNum.textContent = String(i + 1);

      const tdProduct = document.createElement("td");
      tdProduct.className = "era-product";
      tdProduct.textContent = p.product_name ?? "-";

      const tdDur = document.createElement("td");
      tdDur.className = "era-dur";
      const badge = document.createElement("span");
      badge.className = "era-badge";
      badge.textContent = (p.duration ?? "-") + "";
      tdDur.appendChild(badge);

      const tdRenew = document.createElement("td");
      tdRenew.className = "era-renew";
      const renewInt =
        "renew_int" in p
          ? coerceRenewInt(p.renew_int)
          : coerceRenewInt(p.renew);
      tdRenew.textContent = String(renewInt); // show the numeric value

      const tdSupplier = document.createElement("td");
      tdSupplier.className = "era-supplier";
      tdSupplier.textContent = p.supplier ?? "-";

      const tdNote = document.createElement("td");
      tdNote.className = "era-muted column-hide";
      tdNote.title = p.note ?? "";
      tdNote.textContent = p.note ?? "-";

      const tdLink = document.createElement("td");
      tdLink.className = "era-muted column-hide";
      tdLink.textContent = p.link ? p.link : "-";

      const tdWholesale = document.createElement("td");
      tdWholesale.className = "era-price";
      tdWholesale.textContent = formatKyat(p.wholesale);

      const tdRetail = document.createElement("td");
      tdRetail.className = "era-price";
      tdRetail.textContent = formatKyat(p.retail);

      const tdActions = document.createElement("td");
      tdActions.className = "era-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "era-icon-btn";
      editBtn.type = "button";
      editBtn.title = "Edit";
      editBtn.setAttribute("aria-label", `Edit row ${i + 1}`);
      editBtn.innerHTML = svgEdit();
      editBtn.addEventListener("click", () => openEditForm(p));

      const delBtn = document.createElement("button");
      delBtn.className = "era-icon-btn";
      delBtn.type = "button";
      delBtn.dataset.action = "delete";
      delBtn.title = "Delete";
      delBtn.setAttribute("aria-label", `Delete row ${i + 1}`);
      delBtn.innerHTML = svgTrash();

      tdActions.append(editBtn, delBtn);

      tr.append(
        tdNum,
        tdProduct,
        tdDur,
        tdRenew,
        tdSupplier,
        tdNote,
        tdLink,
        tdWholesale,
        tdRetail,
        tdActions
      );
      frag.appendChild(tr);
    });

    tbody.appendChild(frag);
  }

  /** Loads wholesale products from API and renders table content. */
  async function loadProducts() {
    tbody.innerHTML = "";
    tbody.appendChild(placeholderRow("Loading…"));
    try {
      const r = await fetch(API.list, {
        headers: { Accept: "application/json" },
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success)
        throw new Error(json.error || `HTTP ${r.status}`);
      renderRows(json.data || []);
    } catch (err) {
      console.error("Failed to load products:", err);
      tbody.innerHTML = "";
      tbody.appendChild(placeholderRow(`Failed to load: ${err.message}`));
    }
  }
  /** Recomputes row numbering after a client-side delete. */
  function renumberRows() {
    tbody.querySelectorAll("tr.era-row").forEach((tr, idx) => {
      const cell = tr.querySelector(".era-num");
      if (cell) cell.textContent = String(idx + 1);
    });
  }

  // ====== Delete (delegated) ======
  tbody.addEventListener("click", async (e) => {
    const btn = e.target.closest('button.era-icon-btn[data-action="delete"]');
    if (!btn) return;
    const tr = btn.closest("tr.era-row");
    if (!tr) return;
    const id = Number(tr.dataset.id);
    if (!id) return alert("Missing product_id for this row.");

    const name =
      tr.querySelector(".era-product")?.textContent?.trim() || `#${id}`;
    if (!confirm(`Delete "${name}"?\nThis cannot be undone.`)) return;

    btn.disabled = true;
    btn.classList.add("disableBtn");
    try {
      const resp = await fetch(API.delete, {
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
      tr.remove();
      if (!tbody.querySelector("tr.era-row")) {
        tbody.innerHTML = "";
        tbody.appendChild(placeholderRow("No products found."));
      } else {
        renumberRows();
      }
    } catch (err) {
      console.error("Delete failed:", err);
      alert(`Delete failed: ${err.message}`);
      btn.disabled = false;
      btn.classList.remove("disableBtn");
    }
  });

  // ====== Add form wiring ======
  if (addEls) {
    const validateAdd = () => validateProductForm(addEls, { formatName: true });
    attachValidation(addEls, validateAdd);
  }

  // ====== Edit form wiring + openEditForm ======
  if (editEls) {
    const validateEdit = () => {
      const { valid, payload } = validateProductForm(editEls, {
        formatName: true,
      });
      if (payload) payload.id = Number(editEls.id.value);
      return { valid, payload };
    };
    attachValidation(editEls, validateEdit);

    window.openEditForm = function openEditForm(p) {
      const editSec = $("editProductForm"),
        addSec = $("addProductForm"),
        userSec = $("user_setting");
      if (addSec) addSec.style.display = "none";
      if (userSec) userSec.style.display = "none";
      if (editSec) editSec.style.display = "block";

      editEls.id.value = p.product_id ?? "";
      editEls.product.value = stripDurationSuffix(p.product_name ?? "");
      editEls.duration.value = p.duration ?? "";
      editEls.supplier.value = p.supplier ?? "";

      const renewInt2 =
        "renew_int" in p
          ? coerceRenewInt(p.renew_int)
          : coerceRenewInt(p.renew);
      setRenewableControlValue(editEls.renewable, renewInt2);

      editEls.note.value = p.note ?? "";
      editEls.link.value = p.link ?? "";
      editEls.wholesale.value = p.wholesale ?? "";
      editEls.retail.value = p.retail ?? "";

      validateEdit();
    };
  }

  // ====== Initial load ======
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadProducts);
  } else {
    loadProducts();
  }

  // exposed for external calls
  window.refreshWsProductTable = loadProducts;
})();
