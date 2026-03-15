"use strict";

/**
 * Module: Product catalog tab and form visibility toggles.
 * Purpose: Switches between retail/wholesale views and opens/closes the add form.
 */

document.addEventListener("DOMContentLoaded", () => {
  // Get the button and form sections
  const addProductBtn = document.getElementById("addProductBtn");
  const addProductForm = document.getElementById("addProductForm");

  // Get the tab buttons to check which is active
  const retailBtn = document.getElementById("retail_page");
  const wholesaleBtn = document.getElementById("wholesale_page");

  // Initialize form visibility - ensure it starts hidden
  if (addProductForm) addProductForm.style.display = "none";

  if (addProductBtn) {
    addProductBtn.addEventListener("click", () => {
      // Toggle add product form
      if (addProductForm) {
        const currentDisplay = addProductForm.style.display;
        if (currentDisplay === "none" || currentDisplay === "") {
          addProductForm.style.display = "block";
          // Hide other forms
          const editForm = document.getElementById("editProductForm");
          const userSetting = document.getElementById("user_setting");
          if (editForm) editForm.style.display = "none";
          if (userSetting) userSetting.style.display = "none";
        } else {
          addProductForm.style.display = "none";
        }
      }
    });
  }

  // Also handle form hiding when switching tabs
  // This ensures forms are hidden when switching between retail/wholesale
  if (retailBtn) {
    retailBtn.addEventListener("click", () => {
      // Hide any open forms when switching to retail
      if (addProductForm) addProductForm.style.display = "none";
      const editForm = document.getElementById("editProductForm");
      const userSetting = document.getElementById("user_setting");
      if (editForm) editForm.style.display = "none";
      if (userSetting) userSetting.style.display = "none";
    });
  }

  if (wholesaleBtn) {
    wholesaleBtn.addEventListener("click", () => {
      // Hide any open forms when switching to wholesale
      if (addProductForm) addProductForm.style.display = "none";
      const editForm = document.getElementById("editProductForm");
      const userSetting = document.getElementById("user_setting");
      if (editForm) editForm.style.display = "none";
      if (userSetting) userSetting.style.display = "none";
    });
  }

  // Functions to hide forms after successful submission
  // These can be called from other JavaScript files
  window.hideAddProductForm = () => {
    if (addProductForm) addProductForm.style.display = "none";
  };

  window.hideEditProductForm = () => {
    const editForm = document.getElementById("editProductForm");
    if (editForm) editForm.style.display = "none";
  };

  // User Setting Button Handler
  const userSettingBtn = document.getElementById("userSettingBtn");
  const userSettingForm = document.getElementById("user_setting");

  if (userSettingBtn && userSettingForm) {
    userSettingBtn.addEventListener("click", () => {
      const currentDisplay = userSettingForm.style.display;
      if (currentDisplay === "none" || currentDisplay === "") {
        userSettingForm.style.display = "block";
        // Hide other forms
        const addForm = document.getElementById("addProductForm");
        const editForm = document.getElementById("editProductForm");
        if (addForm) addForm.style.display = "none";
        if (editForm) editForm.style.display = "none";
      } else {
        userSettingForm.style.display = "none";
      }
    });
  }
});

// Tab switching functionality
const retailBtn = document.getElementById("retail_page");
const wholesaleBtn = document.getElementById("wholesale_page");

// all content sections with these classes
const retailSections = document.querySelectorAll(".retail_page");
const wholesaleSections = document.querySelectorAll(".wholesale_page");

/** Switches retail/wholesale tab styles and section visibility. */
function showPage(page) {
  if (page === "retail") {
    retailBtn.classList.add("btn-active");
    retailBtn.classList.remove("btn-inactive");
    wholesaleBtn.classList.add("btn-inactive");
    wholesaleBtn.classList.remove("btn-active");

    // show retail, hide wholesale
    retailSections.forEach((el) => (el.style.display = "block"));
    wholesaleSections.forEach((el) => (el.style.display = "none"));

    // Hide any open forms when switching pages
    const addProductForm = document.getElementById("addProductForm");
    const editForm = document.getElementById("editProductForm");
    const userSetting = document.getElementById("user_setting");
    if (addProductForm) addProductForm.style.display = "none";
    if (editForm) editForm.style.display = "none";
    if (userSetting) userSetting.style.display = "none";
  } else {
    wholesaleBtn.classList.add("btn-active");
    wholesaleBtn.classList.remove("btn-inactive");
    retailBtn.classList.add("btn-inactive");
    retailBtn.classList.remove("btn-active");

    // show wholesale, hide retail
    wholesaleSections.forEach((el) => (el.style.display = "block"));
    retailSections.forEach((el) => (el.style.display = "none"));

    // Hide any open forms when switching pages
    const addProductForm = document.getElementById("addProductForm");
    const editForm = document.getElementById("editProductForm");
    const userSetting = document.getElementById("user_setting");
    if (addProductForm) addProductForm.style.display = "none";
    if (editForm) editForm.style.display = "none";
    if (userSetting) userSetting.style.display = "none";
  }
}

// attach events
if (retailBtn && wholesaleBtn) {
  retailBtn.addEventListener("click", () => showPage("retail"));
  wholesaleBtn.addEventListener("click", () => showPage("wholesale"));
}

// default load: show retail
showPage("retail");
