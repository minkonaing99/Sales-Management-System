"use strict";

/**
 * Module: Sales form/tabs visibility controller.
 * Purpose: Coordinates retail/wholesale page tabs and which add-sale form is visible.
 * Used on: `sales_overview.php`.
 */
document.addEventListener("DOMContentLoaded", () => {
  const addSaleBtn = document.getElementById("addSaleBtn");
  const formMount = document.getElementById("salesFormMount");
  const retailTpl = document.getElementById("tpl_add_sales_retail");
  const wholesaleTpl = document.getElementById("tpl_add_sales_wholesale");

  const retailBtn = document.getElementById("retail_page");
  const wholesaleBtn = document.getElementById("wholesale_page");

  let formsRendered = false;

  const getAddSalesSection = () => document.getElementById("add_sales");
  const getAddWsSalesSection = () => document.getElementById("add_ws_sales");
  const getRetailSections = () => document.querySelectorAll(".retail_page");
  const getWholesaleSections = () => document.querySelectorAll(".wholesale_page");

  /** Injects retail + wholesale forms on first demand and initializes handlers. */
  const ensureFormsRendered = () => {
    if (formsRendered) return;
    if (!formMount || !retailTpl || !wholesaleTpl) return;

    formMount.appendChild(retailTpl.content.cloneNode(true));
    formMount.appendChild(wholesaleTpl.content.cloneNode(true));
    formsRendered = true;

    if (typeof window.initRetailAddForm === "function") {
      window.initRetailAddForm();
    }
    if (typeof window.initWholesaleAddForm === "function") {
      window.initWholesaleAddForm();
    }
    hideForms();
  };

  /** Hides both retail and wholesale add-sale forms. */
  const hideForms = () => {
    const addSalesSection = getAddSalesSection();
    const addWsSalesSection = getAddWsSalesSection();
    if (addSalesSection) addSalesSection.style.display = "none";
    if (addWsSalesSection) addWsSalesSection.style.display = "none";
  };

  /** Toggles visibility for one form section. */
  const toggleSection = (section) => {
    if (!section) return;
    const currentDisplay = section.style.display;
    section.style.display =
      currentDisplay === "none" || currentDisplay === "" ? "block" : "none";
  };

  /** Switches retail/wholesale tab state and visible sections. */
  const showPage = (page) => {
    if (!retailBtn || !wholesaleBtn) return;

    if (page === "retail") {
      retailBtn.classList.add("btn-active");
      retailBtn.classList.remove("btn-inactive");
      wholesaleBtn.classList.add("btn-inactive");
      wholesaleBtn.classList.remove("btn-active");

      getRetailSections().forEach((el) => (el.style.display = "block"));
      getWholesaleSections().forEach((el) => (el.style.display = "none"));
    } else {
      wholesaleBtn.classList.add("btn-active");
      wholesaleBtn.classList.remove("btn-inactive");
      retailBtn.classList.add("btn-inactive");
      retailBtn.classList.remove("btn-active");

      getWholesaleSections().forEach((el) => (el.style.display = "block"));
      getRetailSections().forEach((el) => (el.style.display = "none"));
    }

    hideForms();
  };

  // Default state: hide forms and start on retail view.
  hideForms();

  if (addSaleBtn) {
    addSaleBtn.addEventListener("click", () => {
      ensureFormsRendered();

      const addSalesSection = getAddSalesSection();
      const addWsSalesSection = getAddWsSalesSection();
      const isRetailActive = retailBtn?.classList.contains("btn-active");

      if (isRetailActive) {
        toggleSection(addSalesSection);
        if (addWsSalesSection) addWsSalesSection.style.display = "none";
      } else {
        toggleSection(addWsSalesSection);
        if (addSalesSection) addSalesSection.style.display = "none";
      }
    });
  }

  if (retailBtn) {
    retailBtn.addEventListener("click", () => showPage("retail"));
  }

  if (wholesaleBtn) {
    wholesaleBtn.addEventListener("click", () => showPage("wholesale"));
  }

  window.hideRetailForm = () => {
    const addSalesSection = getAddSalesSection();
    if (addSalesSection) addSalesSection.style.display = "none";
  };

  window.hideWholesaleForm = () => {
    const addWsSalesSection = getAddWsSalesSection();
    if (addWsSalesSection) addWsSalesSection.style.display = "none";
  };

  if (retailBtn && wholesaleBtn) {
    showPage("retail");
  }
});
