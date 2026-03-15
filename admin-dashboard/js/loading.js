/**
 * Loading System for Digimium Application
 * Provides comprehensive loading utilities for buttons, forms, tables, and pages
 * Version: 2.0.0
 */

(() => {
  "use strict";

  // ====== CONFIGURATION ======
  const CONFIG = {
    defaultMessage: "Loading...",
    defaultDuration: 300,
    maxRetries: 3,
    retryDelay: 500,
    spinnerSize: {
      small: 20,
      medium: 50,
      large: 60,
    },
  };

  // ====== GLOBAL STATE ======
  let globalOverlay = null;
  let loadingCount = 0;
  let isOnline = navigator.onLine;

  // ====== UTILITY FUNCTIONS ======
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  /** Returns a debounced wrapper that delays execution until input settles. */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /** Returns a throttled wrapper that executes at most once per `limit`. */
  function throttle(func, limit) {
    let inThrottle;
    return function () {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }

  // ====== GLOBAL LOADING OVERLAY ======
  /** Creates or returns the singleton global loading overlay element. */
  function createGlobalOverlay() {
    if (globalOverlay) return globalOverlay;

    globalOverlay = document.createElement("div");
    globalOverlay.className = "loading-overlay";
    globalOverlay.innerHTML = `
            <div class="loading-content">
                <div class="loading-spinner"></div>
                <div class="loading-text">${CONFIG.defaultMessage}</div>
            </div>
        `;
    document.body.appendChild(globalOverlay);
    return globalOverlay;
  }

  /** Shows global overlay and increments loading reference counter. */
  function showGlobalLoading(message = CONFIG.defaultMessage) {
    const overlay = createGlobalOverlay();
    const textEl = overlay.querySelector(".loading-text");
    if (textEl) textEl.textContent = message;
    overlay.classList.add("active");
    loadingCount++;
  }

  /** Hides global overlay when reference count reaches zero. */
  function hideGlobalLoading() {
    if (globalOverlay) {
      loadingCount = Math.max(0, loadingCount - 1);
      if (loadingCount === 0) {
        globalOverlay.classList.remove("active");
      }
    }
  }

  // ====== BUTTON LOADING ======
  /** Toggles loading state and preserved content for a button element. */
  function setButtonLoading(button, loading = true, text = null) {
    if (!button) return;

    if (loading) {
      button.disabled = true;
      button.classList.add("btn-loading");

      // Store original text and content
      const originalContent = button.innerHTML;
      button.dataset.originalContent = originalContent;

      // Add loading text wrapper
      const textSpan = document.createElement("span");
      textSpan.className = "btn-text";
      textSpan.textContent = text || button.textContent || "Loading...";
      button.innerHTML = "";
      button.appendChild(textSpan);
    } else {
      button.disabled = false;
      button.classList.remove("btn-loading");

      // Restore original content
      const originalContent = button.dataset.originalContent;
      if (originalContent) {
        button.innerHTML = originalContent;
        delete button.dataset.originalContent;
      }
    }
  }

  // ====== FORM LOADING ======
  /** Toggles disabled/loading state for all interactive controls in a form. */
  function setFormLoading(form, loading = true) {
    if (!form) return;

    if (loading) {
      form.classList.add("form-loading");
      // Disable all interactive elements
      form
        .querySelectorAll("input, select, textarea, button, a")
        .forEach((el) => {
          el.disabled = true;
          el.classList.add("loading-disabled");
        });
    } else {
      form.classList.remove("form-loading");
      // Re-enable all interactive elements
      form
        .querySelectorAll("input, select, textarea, button, a")
        .forEach((el) => {
          el.disabled = false;
          el.classList.remove("loading-disabled");
        });
    }
  }

  // ====== TABLE LOADING ======
  /** Temporarily clears/restores table content while loading. */
  function setTableLoading(table, loading = true) {
    if (!table) return;

    if (loading) {
      table.classList.add("table-loading");
      // Store original content
      table.dataset.originalContent = table.innerHTML;
      table.innerHTML = "";
    } else {
      table.classList.remove("table-loading");
      // Restore original content if available
      if (table.dataset.originalContent) {
        table.innerHTML = table.dataset.originalContent;
        delete table.dataset.originalContent;
      }
    }
  }

  // ====== PAGE LOADING ======
  /** Renders a full-page loading blocker. */
  function showPageLoading(message = "Loading page...") {
    const pageLoader = document.createElement("div");
    pageLoader.className = "page-loading";
    pageLoader.innerHTML = `
            <div class="loading-content">
                <div class="loading-spinner"></div>
                <div class="loading-text">${message}</div>
            </div>
        `;
    pageLoader.id = "pageLoader";
    document.body.appendChild(pageLoader);
  }

  /** Removes full-page loading blocker if present. */
  function hidePageLoading() {
    const pageLoader = document.getElementById("pageLoader");
    if (pageLoader) {
      pageLoader.remove();
    }
  }

  // ====== SKELETON LOADING ======
  /** Builds one skeleton table row with the requested column count. */
  function createSkeletonRow(columns = 5) {
    const row = document.createElement("tr");
    for (let i = 0; i < columns; i++) {
      const cell = document.createElement("td");
      cell.className = "skeleton skeleton-text";
      row.appendChild(cell);
    }
    return row;
  }

  /** Replaces table body with skeleton rows and stores original markup. */
  function showSkeletonTable(table, rows = 5, columns = 5) {
    if (!table) return;

    // Store original content
    table.dataset.originalContent = table.innerHTML;

    const tbody = table.querySelector("tbody") || table;
    tbody.innerHTML = "";

    for (let i = 0; i < rows; i++) {
      tbody.appendChild(createSkeletonRow(columns));
    }
  }

  /** Restores original table markup after skeleton mode. */
  function hideSkeletonTable(table) {
    if (!table) return;

    if (table.dataset.originalContent) {
      table.innerHTML = table.dataset.originalContent;
      delete table.dataset.originalContent;
    }
  }

  // ====== PROGRESS LOADING ======
  /** Creates and optionally mounts an indeterminate progress bar. */
  function createProgressBar(container, options = {}) {
    const {
      height = "4px",
      color = "var(--primary)",
      backgroundColor = "rgba(106, 137, 167, 0.2)",
      borderRadius = "2px",
    } = options;

    const progressBar = document.createElement("div");
    progressBar.className = "progress-loading";
    progressBar.style.cssText = `
            width: 100%;
            height: ${height};
            background: ${backgroundColor};
            border-radius: ${borderRadius};
            overflow: hidden;
            position: relative;
        `;

    const progressFill = document.createElement("div");
    progressFill.style.cssText = `
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: ${color};
            animation: progress-slide 1.5s ease-in-out infinite;
        `;

    progressBar.appendChild(progressFill);

    if (container) {
      container.appendChild(progressBar);
    }

    return progressBar;
  }

  // ====== CUSTOM LOADING TYPES ======
  /** Creates a pulse loader node with configured size. */
  function createPulseLoader(size = "medium") {
    const pulse = document.createElement("div");
    pulse.className = "pulse-loading";
    pulse.style.width = pulse.style.height = CONFIG.spinnerSize[size] + "px";
    return pulse;
  }

  /** Creates a 3-dot animated loader node. */
  function createDotsLoader() {
    const dots = document.createElement("div");
    dots.className = "dots-loading";
    dots.innerHTML = "<span></span><span></span><span></span>";
    return dots;
  }

  // ====== ASYNC WRAPPER ======
  /** Executes async work with selected loading states and optional retries. */
  async function withLoading(asyncFn, options = {}) {
    const {
      showGlobal = false,
      globalMessage = CONFIG.defaultMessage,
      button = null,
      buttonText = null,
      form = null,
      table = null,
      showSkeleton = false,
      skeletonRows = 5,
      skeletonColumns = 5,
      retry = false,
      maxRetries = CONFIG.maxRetries,
    } = options;

    let retryCount = 0;

    const executeWithRetry = async () => {
      try {
        // Show loading states
        if (showGlobal) showGlobalLoading(globalMessage);
        if (button) setButtonLoading(button, true, buttonText);
        if (form) setFormLoading(form, true);
        if (table && showSkeleton)
          showSkeletonTable(table, skeletonRows, skeletonColumns);
        if (table && !showSkeleton) setTableLoading(table, true);

        // Execute the async function
        const result = await asyncFn();
        return result;
      } catch (error) {
        if (retry && retryCount < maxRetries) {
          retryCount++;
          console.warn(`Retry ${retryCount}/${maxRetries} after error:`, error);
          await new Promise((resolve) =>
            setTimeout(resolve, CONFIG.retryDelay)
          );
          return executeWithRetry();
        }
        throw error;
      } finally {
        // Hide loading states
        if (showGlobal) hideGlobalLoading();
        if (button) setButtonLoading(button, false);
        if (form) setFormLoading(form, false);
        if (table && showSkeleton) hideSkeletonTable(table);
        if (table && !showSkeleton) setTableLoading(table, false);
      }
    };

    return executeWithRetry();
  }

  // ====== NETWORK STATUS ======
  /** Reflects browser online/offline changes in global loading overlay. */
  function updateNetworkStatus() {
    isOnline = navigator.onLine;
    if (!isOnline) {
      showGlobalLoading("You are offline. Please check your connection.");
    } else {
      hideGlobalLoading();
    }
  }

  // ====== ERROR HANDLING ======
  /** Global error fallback that clears blocking loaders. */
  function handleGlobalError(error) {
    console.error("Global error:", error);
    hideGlobalLoading();
    hidePageLoading();
  }

  /** Unhandled promise rejection fallback that clears blocking loaders. */
  function handleUnhandledRejection(event) {
    console.error("Unhandled promise rejection:", event.reason);
    hideGlobalLoading();
    hidePageLoading();
  }

  // ====== EXPOSE TO GLOBAL SCOPE ======
  window.LoadingSystem = {
    // Global overlay
    showGlobalLoading,
    hideGlobalLoading,

    // Button loading
    setButtonLoading,

    // Form loading
    setFormLoading,

    // Table loading
    setTableLoading,
    showSkeletonTable,
    hideSkeletonTable,

    // Page loading
    showPageLoading,
    hidePageLoading,

    // Progress loading
    createProgressBar,

    // Custom loaders
    createPulseLoader,
    createDotsLoader,

    // Async wrapper
    withLoading,

    // Utilities
    debounce,
    throttle,

    // Configuration
    CONFIG,
  };

  // ====== EVENT LISTENERS ======
  // Auto-hide page loading when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hidePageLoading);
  } else {
    hidePageLoading();
  }

  // Network status
  window.addEventListener("online", updateNetworkStatus);
  window.addEventListener("offline", updateNetworkStatus);

  // Error handling
  window.addEventListener("error", (event) => handleGlobalError(event.error));
  window.addEventListener("unhandledrejection", handleUnhandledRejection);

  // ====== INITIALIZATION ======
  console.log("Loading System initialized successfully");
})();
