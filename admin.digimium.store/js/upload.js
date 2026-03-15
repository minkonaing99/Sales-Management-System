/**
 * Module: CSV/text bulk upload modal.
 * Purpose: Provides upload UI, parsing/validation helpers, and submission flow
 * for batch sales insertion.
 */
class UploadModal {
  /** Initializes modal state and builds DOM shell. */
  constructor() {
    this.modal = null;
    this.textarea = null;
    this.isOpen = false;
    this.init();
  }

  /** Bootstraps modal markup and listeners. */
  init() {
    this.createModal();
    this.bindEvents();
  }

  /** Injects upload modal HTML into the page and caches element references. */
  createModal() {
    // Create modal HTML
    const modalHTML = `
            <div class="upload-modal" id="uploadModal">
                <div class="upload-modal-content">
                    <div class="upload-modal-header">
                        <h3 class="upload-modal-title">Upload Data</h3>
                        <button class="upload-modal-close" id="uploadModalClose">&times;</button>
                    </div>
                    <div class="upload-modal-body">
                                                 <textarea 
                             class="upload-textarea" 
                             id="uploadTextarea" 
            placeholder="Paste your data here in csv format...&#10;&#10;Required format:&#10;Product Name, Customer, Email, Purchase Date (YYYY-MM-DD), Manager, Note (optional), Price (optional)&#10;Note: Product name must match exactly with product catalog (with or without -M suffix)&#10;Limit: Maximum 10 data rows (plus header)"
                         ></textarea>
                    </div>
                    <div class="upload-modal-footer">
                        <button class="upload-btn upload-btn-secondary" id="uploadModalCancel">Cancel</button>
                        <button class="upload-btn upload-btn-primary" id="uploadModalSubmit">Upload</button>
                    </div>
                </div>
            </div>
        `;

    // Append modal to body
    document.body.insertAdjacentHTML("beforeend", modalHTML);

    // Get references
    this.modal = document.getElementById("uploadModal");
    this.textarea = document.getElementById("uploadTextarea");
  }

  /** Registers close/submit/keyboard/backdrop event handlers for modal UX. */
  bindEvents() {
    // Close button
    document
      .getElementById("uploadModalClose")
      ?.addEventListener("click", () => {
        this.close();
      });

    // Cancel button
    document
      .getElementById("uploadModalCancel")
      ?.addEventListener("click", () => {
        this.close();
      });

    // Submit button
    document
      .getElementById("uploadModalSubmit")
      ?.addEventListener("click", () => {
        this.handleSubmit();
      });

    // Close on backdrop click
    this.modal?.addEventListener("click", (e) => {
      if (e.target === this.modal) {
        this.close();
      }
    });

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isOpen) {
        this.close();
      }
    });

    // Prevent modal close when clicking inside content
    this.modal
      ?.querySelector(".upload-modal-content")
      ?.addEventListener("click", (e) => {
        e.stopPropagation();
      });
  }

  /** Opens upload modal and focuses textarea. */
  open() {
    if (this.modal) {
      this.modal.classList.add("active");
      this.isOpen = true;

      // Focus textarea after animation
      setTimeout(() => {
        this.textarea?.focus();
      }, 300);
    }
  }

  /** Closes modal and clears staged text input. */
  close() {
    if (this.modal) {
      this.modal.classList.remove("active");
      this.isOpen = false;

      // Clear textarea
      if (this.textarea) {
        this.textarea.value = "";
      }
    }
  }

  /** Parses textarea data, validates rows, and opens preview on success. */
  async handleSubmit() {
    const text = this.textarea?.value?.trim();

    if (!text) {
      this.showError("Please enter some data to upload.");
      return;
    }

    try {
      // Disable submit button
      const submitBtn = document.getElementById("uploadModalSubmit");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Processing...";
      }

      // Process the data for preview
      const result = await this.processUploadData(text);

      if (result.success) {
        // Show preview before submitting
        this.showPreview(result.data);
      } else {
        let errorMessage =
          result.error || "Upload failed. Please check your data format.";
        if (result.details && result.details.length > 0) {
          errorMessage += "\n\nDetails:\n" + result.details.join("\n");
        }
        this.showError(errorMessage);

        // Re-enable submit button
        const submitBtn = document.getElementById("uploadModalSubmit");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Upload";
        }
      }
    } catch (error) {
      console.error("Upload error:", error);
      this.showError("An error occurred during upload. Please try again.");

      // Re-enable submit button
      const submitBtn = document.getElementById("uploadModalSubmit");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Upload";
      }
    }
  }

  /** Parses CSV rows, validates fields, enriches product data, and builds payload rows. */
  async processUploadData(text) {
    // Parse CSV-like data
    const lines = text.split("\n").filter((line) => line.trim());

    if (lines.length === 0) {
      return { success: false, error: "No data found." };
    }

    // Skip header if it looks like a header (more specific check)
    const firstLine = lines[0].toLowerCase();
    const isHeader =
      firstLine.includes("sale_product") ||
      (firstLine.includes("product") &&
        firstLine.includes("customer") &&
        firstLine.includes("email") &&
        firstLine.includes("purchased_date"));

    const dataLines = isHeader ? lines.slice(1) : lines;

    // Validate maximum rows (10 data rows + 1 header = 11 total)
    const maxDataRows = 10;
    if (dataLines.length > maxDataRows) {
      return {
        success: false,
        error: `Too many rows. Maximum allowed: ${maxDataRows} data rows (plus header). You have ${dataLines.length} data rows.`,
      };
    }

    const salesData = [];
    const errors = [];

    // First, fetch product catalog data
    let productCatalog = [];
    try {
      const response = await fetch("api/products_table.php", {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          productCatalog = result.data;
        }
      }
    } catch (error) {
      console.error("Error fetching product catalog:", error);
      errors.push("Failed to fetch product catalog data");
    }

    dataLines.forEach((line, index) => {
      const rowNumber = index + 1;
      const columns = this.parseCSVLine(line);

      if (columns.length < 5) {
        errors.push(
          `Row ${rowNumber}: Insufficient data (expected at least 5 columns: Product, Customer, Email, Purchase Date, Manager)`
        );
        return;
      }

      try {
        const sale = {
          sale_product: columns[0]?.trim() || "",
          customer: columns[1]?.trim() || "",
          email: columns[2]?.trim() || "",
          purchased_date: this.normalizeDate(columns[3]?.trim()),
          manager: columns[4]?.trim() || "",
          note: columns[5]?.trim() || "",
          price: parseFloat(columns[6]) || 0,
        };

        // Validate required fields
        if (!sale.sale_product) {
          errors.push(`Row ${rowNumber}: Product name is required`);
          return;
        }
        if (!sale.customer) {
          errors.push(`Row ${rowNumber}: Customer name is required`);
          return;
        }
        if (!sale.purchased_date) {
          errors.push(`Row ${rowNumber}: Purchase date is required`);
          return;
        }

        // Validate product name against product catalog
        const matchedProduct = this.findMatchingProduct(
          sale.sale_product,
          productCatalog
        );

        if (!matchedProduct) {
          errors.push(
            `Row ${rowNumber}: Product "${sale.sale_product}" not found in catalog`
          );
          return;
        }

        // Get product details from catalog
        sale.duration = matchedProduct.duration || 0;
        sale.renew = matchedProduct.renew_int || 0; // Use renew_int instead of renew
        sale.retail_price = matchedProduct.retail || 0;
        sale.wholesale_price = matchedProduct.wholesale || 0;

        // Calculate expired date if duration is available
        if (sale.duration > 0 && sale.purchased_date) {
          sale.expired_date = this.calculateExpiredDate(
            sale.purchased_date,
            sale.duration
          );
        }

        // Use original price if no price provided
        if (sale.price <= 0) {
          sale.price = sale.retail_price;
        }

        // Calculate profit (assuming profit is 20% of price for now)
        sale.profit = Math.round(sale.price * 0.2);

        salesData.push(sale);
      } catch (error) {
        console.error(`Error processing row ${rowNumber}:`, error);
        errors.push(`Row ${rowNumber}: Invalid data format`);
      }
    });

    if (errors.length > 0) {
      return {
        success: false,
        error: `Validation errors:\n${errors.join("\n")}`,
      };
    }

    if (salesData.length === 0) {
      return { success: false, error: "No valid sales data found." };
    }

    // Return processed data for preview
    return {
      success: true,
      message: `Successfully processed ${salesData.length} sales records.`,
      data: salesData,
    };
  }

  /** Matches pasted product text to catalog rows using exact/fallback strategies. */
  findMatchingProduct(saleProductName, productCatalog) {
    // First try exact match
    let matchedProduct = productCatalog.find(
      (product) => product.product_name === saleProductName
    );

    if (matchedProduct) {
      return matchedProduct;
    }

    // Try matching with suffix pattern (e.g., "Product Name - M" matches "Product Name")
    const baseName = saleProductName.replace(/\s*-\s*\w+\s*$/, "").trim();
    matchedProduct = productCatalog.find(
      (product) => product.product_name === baseName
    );

    if (matchedProduct) {
      return matchedProduct;
    }

    // Try partial match (case insensitive)
    matchedProduct = productCatalog.find(
      (product) =>
        product.product_name
          .toLowerCase()
          .includes(saleProductName.toLowerCase()) ||
        saleProductName
          .toLowerCase()
          .includes(product.product_name.toLowerCase())
    );

    return matchedProduct;
  }

  /** Calculates expired date using purchase date + duration months. */
  calculateExpiredDate(purchasedDate, duration) {
    try {
      const date = new Date(purchasedDate);
      if (isNaN(date.getTime())) {
        return null;
      }

      // Add months to the date
      date.setMonth(date.getMonth() + duration);

      // Format as YYYY-MM-DD
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");

      return `${year}-${month}-${day}`;
    } catch (error) {
      console.error("Error calculating expired date:", error);
      return null;
    }
  }

  /** Normalizes multiple date formats into `YYYY-MM-DD`. */
  normalizeDate(dateString) {
    if (!dateString) return null;

    // Clean the date string
    const cleanDate = dateString.trim();

    // If already in YYYY-MM-DD format, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      return cleanDate;
    }

    // Handle MM/DD/YYYY format specifically
    const mmddyyyyMatch = cleanDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mmddyyyyMatch) {
      const [, month, day, year] = mmddyyyyMatch;
      const formattedMonth = month.padStart(2, "0");
      const formattedDay = day.padStart(2, "0");
      return `${year}-${formattedMonth}-${formattedDay}`;
    }

    // Handle MM-DD-YYYY format
    const mmddyyyyDashMatch = cleanDate.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (mmddyyyyDashMatch) {
      const [, month, day, year] = mmddyyyyDashMatch;
      const formattedMonth = month.padStart(2, "0");
      const formattedDay = day.padStart(2, "0");
      return `${year}-${formattedMonth}-${formattedDay}`;
    }

    // Try to parse the date string and convert to YYYY-MM-DD format
    const date = new Date(cleanDate);
    if (isNaN(date.getTime())) {
      console.warn(`Invalid date format: ${dateString}`);
      return null;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  /** Splits a CSV line while preserving comma content inside quotes. */
  parseCSVLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }

  /** Displays success feedback. */
  showSuccess(message) {
    // You can implement a toast notification here
    alert(message);
  }

  /** Displays error feedback. */
  showError(message) {
    // You can implement a toast notification here
    alert("Error: " + message);
  }

  /** Renders preview modal and confirms final bulk insert submission. */
  showPreview(salesData) {
    // Create preview modal HTML
    const previewHTML = `
      <div class="upload-modal" id="previewModal">
        <div class="upload-modal-content" style="max-width: 90vw; max-height: 80vh;">
          <div class="upload-modal-header">
            <h3 class="upload-modal-title">Preview Data (${
              salesData.length
            } records)</h3>
            <button class="upload-modal-close" id="previewModalClose">&times;</button>
          </div>
          <div class="upload-modal-body" style="overflow-y: auto; max-height: 60vh;">
            <div class="preview-table-container">
              <table class="preview-table" style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <thead>
                  <tr style="background-color: #0f1115; font-weight: bold;">
                    <th style="border: 1px solid #1b1f2a; padding: 8px; text-align: left; color: #99a1b3;">Product</th>
                    <th style="border: 1px solid #1b1f2a; padding: 8px; text-align: left; color: #99a1b3;">Customer</th>
                    <th style="border: 1px solid #1b1f2a; padding: 8px; text-align: left; color: #99a1b3;">Email</th>
                    <th style="border: 1px solid #1b1f2a; padding: 8px; text-align: left; color: #99a1b3;">Purchase Date</th>
                    <th style="border: 1px solid #1b1f2a; padding: 8px; text-align: left; color: #99a1b3;">Expired Date</th>
                    <th style="border: 1px solid #1b1f2a; padding: 8px; text-align: left; color: #99a1b3;">Manager</th>
                    <th style="border: 1px solid #1b1f2a; padding: 8px; text-align: left; color: #99a1b3;">Price</th>
                    <th style="border: 1px solid #1b1f2a; padding: 8px; text-align: left; color: #99a1b3;">Profit</th>
                    <th style="border: 1px solid #1b1f2a; padding: 8px; text-align: left; color: #99a1b3;">Note</th>
                  </tr>
                </thead>
                <tbody>
                  ${salesData
                    .map(
                      (sale, index) => `
                    <tr style="background-color: ${
                      index % 2 === 0 ? "#0f1115" : "#1b1f2a"
                    }; color: #e6e9ef;">
                      <td style="border: 1px solid #1b1f2a; padding: 6px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${
                        sale.sale_product
                      }">${sale.sale_product}</td>
                      <td style="border: 1px solid #1b1f2a; padding: 6px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${
                        sale.customer
                      }">${sale.customer}</td>
                      <td style="border: 1px solid #1b1f2a; padding: 6px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${
                        sale.email || "-"
                      }">${sale.email || "-"}</td>
                      <td style="border: 1px solid #1b1f2a; padding: 6px; text-align: center;">${
                        sale.purchased_date
                      }</td>
                      <td style="border: 1px solid #1b1f2a; padding: 6px; text-align: center;">${
                        sale.expired_date || "-"
                      }</td>
                      <td style="border: 1px solid #1b1f2a; padding: 6px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${
                        sale.manager || "-"
                      }">${sale.manager || "-"}</td>
                      <td style="border: 1px solid #1b1f2a; padding: 6px; text-align: right;">${sale.price.toLocaleString()} Ks</td>
                      <td style="border: 1px solid #1b1f2a; padding: 6px; text-align: right;">${sale.profit.toLocaleString()} Ks</td>
                      <td style="border: 1px solid #1b1f2a; padding: 6px; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${
                        sale.note || "-"
                      }">${sale.note || "-"}</td>
                    </tr>
                  `
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          </div>
          <div class="upload-modal-footer">
            <button class="upload-btn upload-btn-secondary" id="previewModalCancel">Cancel</button>
            <button class="upload-btn upload-btn-primary" id="previewModalConfirm">Confirm Upload</button>
          </div>
        </div>
      </div>
    `;

    // Append preview modal to body
    document.body.insertAdjacentHTML("beforeend", previewHTML);

    // Get references
    const previewModal = document.getElementById("previewModal");
    const closeBtn = document.getElementById("previewModalClose");
    const cancelBtn = document.getElementById("previewModalCancel");
    const confirmBtn = document.getElementById("previewModalConfirm");

    // Show preview modal
    previewModal.classList.add("active");

    // Bind events
    const closePreview = () => {
      previewModal.remove();
      // Re-enable submit button
      const submitBtn = document.getElementById("uploadModalSubmit");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Upload";
      }
    };

    const confirmUpload = async () => {
      try {
        // Disable confirm button
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Uploading...";

        // Submit to database
        const insertResponse = await fetch("api/sales_bulk_insert.php", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ sales: salesData }),
        });

        if (!insertResponse.ok) {
          const errorData = await insertResponse.json();
          console.error("API Error Response:", errorData);
          this.showError(errorData.error || "Failed to insert sales data");
          return;
        }

        const insertResult = await insertResponse.json();
        this.showSuccess(
          insertResult.message ||
            `Successfully inserted ${salesData.length} sales records.`
        );

        // Close both modals
        closePreview();
        this.close();

        // Refresh the sales table if the function exists
        if (typeof window.refreshSalesTable === "function") {
          window.refreshSalesTable();
        }
      } catch (error) {
        console.error("Error inserting sales data:", error);
        this.showError("Failed to connect to server. Please try again.");
      } finally {
        // Re-enable confirm button
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Confirm Upload";
      }
    };

    closeBtn?.addEventListener("click", closePreview);
    cancelBtn?.addEventListener("click", closePreview);
    confirmBtn?.addEventListener("click", confirmUpload);

    // Close on backdrop click
    previewModal?.addEventListener("click", (e) => {
      if (e.target === previewModal) {
        closePreview();
      }
    });

    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        closePreview();
        document.removeEventListener("keydown", handleEscape);
      }
    };
    document.addEventListener("keydown", handleEscape);

    // Prevent modal close when clicking inside content
    previewModal
      ?.querySelector(".upload-modal-content")
      ?.addEventListener("click", (e) => {
        e.stopPropagation();
      });
  }
}

// Initialize upload modal when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  const uploadModal = new UploadModal();

  // Bind upload button click
  const uploadBtn = document.getElementById("uploadCsv");
  if (uploadBtn) {
    uploadBtn.addEventListener("click", (e) => {
      e.preventDefault();
      uploadModal.open();
    });
  }

  // Hide upload button when wholesale tab is active
  const retailBtn = document.getElementById("retail_page");
  const wholesaleBtn = document.getElementById("wholesale_page");

  /** Shows upload action only when retail tab is active. */
  function updateUploadButtonVisibility() {
    if (uploadBtn) {
      const isWholesaleActive =
        wholesaleBtn && wholesaleBtn.classList.contains("btn-active");
      if (isWholesaleActive) {
        uploadBtn.style.display = "none";
      } else {
        uploadBtn.style.display = "inline-block";
      }
    }
  }

  // Initial check
  updateUploadButtonVisibility();

  // Listen for tab changes
  if (retailBtn) {
    retailBtn.addEventListener("click", updateUploadButtonVisibility);
  }

  if (wholesaleBtn) {
    wholesaleBtn.addEventListener("click", updateUploadButtonVisibility);
  }
});
