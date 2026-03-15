"use strict";

/**
 * Module: Retail add-sale form workflow.
 * Purpose: Validates inputs, derives hidden sales fields, submits to insert API,
 * then refreshes cached/rendered sales views.
 */
async function initRetailAddForm() {
  const $ = (id) => document.getElementById(id);

  const form = document.querySelector("#add_sales .inputSalesForm form");
  if (!form) return;
  if (form.dataset.submitBound === "1") return;
  form.dataset.submitBound = "1";

  const elProduct = $("product");
  const elCustomer = $("customer");
  const elEmail = $("email");
  const elPurchase = $("purchase_date");
  const elSeller = $("seller");
  const elAmount = $("amount");
  const elNotes = $("Notes");
  const elRenew = $("renew");
  const elDuration = $("duration");
  const elEndDate = $("end_date");
  const elStore = $("store");
  const saveBtn = form.querySelector('button[type="submit"]');
  const feedback = $("feedback_addSale");
  let isSubmitting = false;

  const setDanger = (el, on) => {
    if (!el) return;
    el.classList.toggle("text-danger", !!on);
    const label = el.id
      ? document.querySelector(`label[for="${el.id}"]`)
      : null;
    if (label) label.classList.toggle("text-danger", !!on);
  };
  const toInt = (v) => (v === "" || v == null ? NaN : parseInt(v, 10));
  const toMoney = (v) =>
    v === "" || v == null ? NaN : Math.round(Number(v) * 100) / 100;

  /** Computes expiry date by adding N months while preserving end-of-month logic. */
  function computeEndDate(ymd, months) {
    if (!ymd || !Number.isFinite(months)) return "";
    const [y, m, d] = ymd.split("-").map(Number);
    if (!y || !m || !d) return "";
    const start = new Date(Date.UTC(y, m - 1, d));
    const target = new Date(start);
    const origDay = target.getUTCDate();
    target.setUTCDate(1);
    target.setUTCMonth(target.getUTCMonth() + months);
    const lastDay = new Date(
      Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
    ).getUTCDate();
    target.setUTCDate(Math.min(origDay, lastDay));
    const yy = target.getUTCFullYear();
    const mm = String(target.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(target.getUTCDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  }

  /** Enables/disables the submit button from current validation state. */
  function setBtn(valid) {
    if (!saveBtn) return;
    saveBtn.disabled = !valid;
    saveBtn.classList.toggle("disableBtn", !valid);
  }
  /** Displays add-sale feedback text with success/error coloring. */
  function showFeedback(msg, ok = true) {
    if (!feedback) return;
    feedback.textContent = msg;
    feedback.style.color = ok ? "white" : "red";
    feedback.style.display = "block";
  }

  // Product options
  const OPTIONS_URL = "./api/product_options.php"; // adjust if different
  /** Loads product select options and embeds pricing metadata in option datasets. */
  async function loadProductOptions() {
    try {
      const r = await fetch(OPTIONS_URL, {
        headers: { Accept: "application/json" },
        method: "POST",
      });
      const data = await r.json().catch(() => ({}));
      if (!elProduct) return;
      elProduct.replaceChildren(new Option("Choose...", "", true, false));
      if (data.status === "success" && Array.isArray(data.products)) {
        for (const p of data.products) {
          const opt = new Option(p.product_name, p.product_id);
          opt.dataset.duration = p.duration; // months
          opt.dataset.price = p.retail_price; // retail
          opt.dataset.wcPrice = p.wc_price; // wholesale
          opt.dataset.renew = String(p.renew); // <-- keep 0/1/2/3/4/5/12
          elProduct.add(opt);
        }
      }
    } catch {
      // optional: toast/log
    }
  }

  // Validation
  /** Validates required retail form fields and toggles visual error state. */
  function validate() {
    const opt = elProduct?.selectedOptions?.[0];
    const hasProduct = !!(opt && opt.value && !opt.disabled);
    setDanger(elProduct, !hasProduct);

    const customer = (elCustomer?.value || "").trim();
    setDanger(elCustomer, !customer);

    const pdate = elPurchase?.value;
    setDanger(elPurchase, !pdate);

    const store = toInt(elStore?.value);
    const hasStore = [0, 1, 2, 3, 4, 5].includes(store);
    setDanger(elStore, !hasStore);

    const valid = !!(hasProduct && customer && pdate && hasStore);
    setBtn(valid);
    return valid;
  }

  /** Syncs renew/duration/end-date fields when product selection changes. */
  function onProductChange() {
    const opt = elProduct?.selectedOptions?.[0];
    if (!opt || !opt.value) {
      if (elRenew) elRenew.value = "";
      if (elDuration) elDuration.value = "";
      if (elEndDate) elEndDate.value = "";
      setBtn(false);
      return;
    }

    const duration = toInt(opt.dataset.duration);
    const renewInt = toInt(opt.dataset.renew);

    if (elRenew)
      elRenew.value = Number.isInteger(renewInt) ? String(renewInt) : "0";
    if (elDuration)
      elDuration.value = Number.isFinite(duration) ? String(duration) : "";

    if (elEndDate) {
      elEndDate.value =
        elPurchase?.value && Number.isFinite(duration)
          ? computeEndDate(elPurchase.value, duration)
          : "";
    }

    validate();
  }

  /** Recalculates end-date after purchase date changes. */
  function onPurchaseDateChange() {
    const opt = elProduct?.selectedOptions?.[0];
    const duration = toInt(elDuration?.value) || toInt(opt?.dataset.duration);
    if (elEndDate) {
      elEndDate.value =
        elPurchase?.value && Number.isFinite(duration)
          ? computeEndDate(elPurchase.value, duration)
          : "";
    }
    validate();
  }

  // Init
  // On page refresh, always use today's date as default
  if (elPurchase && !elPurchase.value) {
    elPurchase.value = todayDate();
  }
  await loadProductOptions();
  validate();

  elProduct?.addEventListener("change", onProductChange);
  elCustomer?.addEventListener("input", validate);
  elStore?.addEventListener("change", validate);
  elPurchase?.addEventListener("change", (e) => {
    // Save the user's chosen date to localStorage
    if (e.target.value) {
      localStorage.setItem("retail_preferred_purchase_date", e.target.value);
    }
    onPurchaseDateChange();
  });

  // Submit
  // Allowed renew integers for sales insert
  const ALLOWED_RENEW_SALE = new Set([0, 1, 2, 3, 4, 5, 6, 12]);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!validate()) return;

    const opt = elProduct.selectedOptions[0];
    const saleName = opt.textContent.trim();
    const duration = toInt(elDuration?.value) || toInt(opt.dataset.duration);
    const retail = toMoney(opt.dataset.price);
    const wholesale = toMoney(opt.dataset.wcPrice);
    const typedAmt = toMoney(elAmount?.value);

    let price, profit;
    if (Number.isFinite(typedAmt)) {
      price = typedAmt;
      profit = Number.isFinite(wholesale)
        ? Math.round((price - wholesale) * 100) / 100
        : null;
    } else {
      price = Number.isFinite(retail) ? retail : null;
      profit =
        Number.isFinite(wholesale) && Number.isFinite(retail)
          ? Math.round((retail - wholesale) * 100) / 100
          : null;
    }

    if (price == null || profit == null) {
      showFeedback(
        "Missing product pricing data to compute price/profit.",
        false,
      );
      return;
    }

    // before payload:
    const chosenRenew = toInt(elRenew?.value);
    const productRenew = toInt(elProduct?.selectedOptions?.[0]?.dataset?.renew);
    const finalRenew = ALLOWED_RENEW_SALE.has(chosenRenew)
      ? chosenRenew
      : ALLOWED_RENEW_SALE.has(productRenew)
        ? productRenew
        : 0;

    // payload:
    const payload = {
      sale_product: saleName,
      duration: Number.isFinite(duration) ? duration : null,
      renew: finalRenew, // strict integer, never boolean
      customer: (elCustomer?.value || "").trim(),
      email: (elEmail?.value || "").trim() || null,
      purchased_date: elPurchase?.value,
      expired_date: elEndDate?.value || null,
      manager: (elSeller?.value || "").trim() || null,
      note: (elNotes?.value || "").trim() || null,
      price,
      profit,
      store: toInt(elStore.value),
    };

    try {
      isSubmitting = true;
      showFeedback("Saving...", true);
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.classList.add("disableBtn");
      }

      const resp = await fetch("api/sale_insertion.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      const json = await resp.json().catch(() => ({}));

      if (resp.status === 422) {
        const msg = json.errors
          ? Object.values(json.errors).join(" | ")
          : "Validation failed.";
        throw new Error(msg);
      }
      if (!resp.ok || !json.success)
        throw new Error(json.error || `HTTP ${resp.status}`);

      showFeedback("Successfully Saved", true);
      setTimeout(() => {
        if (feedback) feedback.style.display = "none";
        if (window.hideRetailForm) window.hideRetailForm();
      }, 800);

      // refresh table/cards (cache invalidation inside)
      if (typeof window.refreshSalesTable === "function") {
        await window.refreshSalesTable();
      }

      // Reset fields
      form.reset();
      if (elProduct) elProduct.selectedIndex = 0;
      // Use saved preferred date or today's date as fallback
      const savedDate = localStorage.getItem("retail_preferred_purchase_date");
      if (elPurchase) elPurchase.value = savedDate || todayDate();
      if (elEndDate) elEndDate.value = "";
      validate();
    } catch (err) {
      console.error("Sale save failed:", err);
      showFeedback(`Save failed: ${err.message}`, false);
    } finally {
      isSubmitting = false;
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.classList.remove("disableBtn");
      }
    }
  });
}

window.initRetailAddForm = initRetailAddForm;
initRetailAddForm();

