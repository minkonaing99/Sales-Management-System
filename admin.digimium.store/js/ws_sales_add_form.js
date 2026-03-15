"use strict";

/**
 * Module: Wholesale add-sale form workflow.
 * Purpose: Validates wholesale inputs (including quantity), submits to insert API,
 * then refreshes cached/rendered wholesale sales views.
 */
async function initWholesaleAddForm() {
  const $ = (id) => document.getElementById(id);

  // Get the wholesale form
  const form = document.querySelector("#add_ws_sales .inputSalesForm form");
  if (!form) return;
  if (form.dataset.submitBound === "1") return;
  form.dataset.submitBound = "1";

  const elProduct = $("ws_product");
  const elCustomer = $("ws_customer");
  const elEmail = $("ws_email");
  const elPurchase = $("ws_purchase_date");
  const elSeller = $("ws_seller");
  const elAmount = $("ws_amount");
  const elNotes = $("ws_Notes");
  const elRenew = $("ws_renew");
  const elDuration = $("ws_duration");
  const elEndDate = $("ws_end_date");
  const elQuantity = $("ws_quantity");
  const saveBtn = form.querySelector('button[type="submit"]');
  const feedback = $("feedback_addWsSale");
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
      Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
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
  const OPTIONS_URL = "./api/ws_product_options.php"; // adjust if different
  /** Loads wholesale product options and embeds pricing metadata in option datasets. */
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
  /** Validates required wholesale form fields and toggles visual error state. */
  function validate() {
    const opt = elProduct?.selectedOptions?.[0];
    const hasProduct = !!(opt && opt.value && !opt.disabled);
    setDanger(elProduct, !hasProduct);

    const customer = (elCustomer?.value || "").trim();
    setDanger(elCustomer, !customer);

    const pdate = elPurchase?.value;
    setDanger(elPurchase, !pdate);

    const valid = !!(hasProduct && customer && pdate);
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
  elPurchase?.addEventListener("change", (e) => {
    // Save the user's chosen date to localStorage
    if (e.target.value) {
      localStorage.setItem("ws_preferred_purchase_date", e.target.value);
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
    const quantity = toInt(elQuantity?.value) || 1;
    const retail = toMoney(opt.dataset.price);
    const wholesale = toMoney(opt.dataset.wcPrice);
    const typedAmt = toMoney(elAmount?.value);

    let price, profit;
    if (Number.isFinite(typedAmt)) {
      price = typedAmt * quantity;
      profit = Number.isFinite(wholesale)
        ? Math.round((typedAmt - wholesale) * quantity * 100) / 100
        : null;
    } else {
      price = Number.isFinite(retail) ? retail * quantity : null;
      profit =
        Number.isFinite(wholesale) && Number.isFinite(retail)
          ? Math.round((retail - wholesale) * quantity * 100) / 100
          : null;
    }

    if (price == null || profit == null) {
      showFeedback(
        "Missing product pricing data to compute price/profit.",
        false
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
      quantity: quantity,
      renew: finalRenew, // strict integer, never boolean
      customer: (elCustomer?.value || "").trim(),
      email: (elEmail?.value || "").trim() || null,
      purchased_date: elPurchase?.value,
      expired_date: elEndDate?.value || null,
      manager: (elSeller?.value || "").trim() || null,
      note: (elNotes?.value || "").trim() || null,
      price,
      profit,
    };

    try {
      isSubmitting = true;
      showFeedback("Saving...", true);
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.classList.add("disableBtn");
      }

      const resp = await fetch("api/ws_sale_insertion.php", {
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
        if (window.hideWholesaleForm) window.hideWholesaleForm();
      }, 800);

      // refresh table/cards (cache invalidation inside)
      if (typeof window.refreshWsSalesTable === "function") {
        await window.refreshWsSalesTable();
      }

      // Reset fields
      form.reset();
      if (elProduct) elProduct.selectedIndex = 0;
      // Use saved preferred date or today's date as fallback
      const savedDate = localStorage.getItem("ws_preferred_purchase_date");
      if (elPurchase) elPurchase.value = savedDate || todayDate();
      if (elEndDate) elEndDate.value = "";
      if (elQuantity) elQuantity.value = "1";
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

window.initWholesaleAddForm = initWholesaleAddForm;
initWholesaleAddForm();

