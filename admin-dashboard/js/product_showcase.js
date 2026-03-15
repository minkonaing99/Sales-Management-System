/**
 * Module: Product Showcase visual editor.
 * Purpose: Loads services JSON, renders draggable cards, and handles create/edit/delete
 * operations against `api_json/*` endpoints used by the storefront.
 */

class ProductShowcase {
  /** Initializes showcase state and triggers first render pipeline. */
  constructor() {
    this.servicesData = [];
    this.currentTab = "visual";
    this.draggedElement = null;
    this.init();
  }

  /** Bootstraps service data and UI listeners. */
  async init() {
    await this.loadServices();
    this.setupEventListeners();
    this.renderServices();
  }

  /** Loads showcase JSON data from backend. */
  async loadServices() {
    try {
      const response = await fetch("./api_json/get_services.php");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const text = await response.text();
      console.log("API Response:", text); // Debug log

      if (!text.trim()) {
        throw new Error("Empty response from server");
      }

      this.servicesData = JSON.parse(text);
    } catch (error) {
      console.error("Error loading services:", error);
      this.showAlert("Error loading services: " + error.message, "error");
    }
  }

  /** Wires tab/form buttons, validation hooks, and close actions. */
  setupEventListeners() {
    // Tab switching - Product catalog style
    const visualBtn = document.getElementById("visual_editor");
    const addServiceBtn = document.getElementById("addServiceBtn");

    // Get all sections
    const visualSections = document.querySelectorAll(".visual_page");
    const addSections = document.querySelectorAll(".add_page");

    if (visualBtn) {
      visualBtn.addEventListener("click", () => this.showTab("visual"));
    }

    // Add Service Button - Show add service section
    if (addServiceBtn) {
      addServiceBtn.addEventListener("click", () => this.showTab("add"));
    }

    // Initialize with visual tab
    this.showTab("visual");

    // Add service form
    const serviceFormElement = document.getElementById("serviceForm");
    if (serviceFormElement) {
      serviceFormElement.addEventListener("submit", (e) =>
        this.handleAddService(e)
      );

      // Real-time validation
      this.setupRealTimeValidation(serviceFormElement);

      // Add event listeners for dynamic row buttons
      this.setupDynamicRowButtons();
    }

    // Close form button
    const closeFormBtn = document.getElementById("closeFormBtn");
    if (closeFormBtn) {
      closeFormBtn.addEventListener("click", () => this.closeForm());
    }
  }

  /** Switches between visual and add/edit tabs. */
  showTab(tab) {
    const visualBtn = document.getElementById("visual_editor");
    const addServiceBtn = document.getElementById("addServiceBtn");

    // Get all sections
    const visualSections = document.querySelectorAll(".visual_page");
    const addSections = document.querySelectorAll(".add_page");

    // Reset all button states
    if (visualBtn) {
      visualBtn.classList.remove("btn-active");
      visualBtn.classList.add("btn-inactive");
    }

    // Hide all sections first
    visualSections.forEach((el) => (el.style.display = "none"));
    addSections.forEach((el) => (el.style.display = "none"));

    if (tab === "visual") {
      // Update button states
      if (visualBtn) {
        visualBtn.classList.add("btn-active");
        visualBtn.classList.remove("btn-inactive");
      }

      // Show visual sections
      visualSections.forEach((el) => (el.style.display = "block"));

      this.currentTab = "visual";
      this.renderServices();
    } else if (tab === "add") {
      // Show add service sections
      addSections.forEach((el) => (el.style.display = "block"));

      this.currentTab = "add";
    }
  }

  /** Resets form/edit state and returns to visual tab. */
  closeForm() {
    // Reset the form
    const serviceFormElement = document.getElementById("serviceForm");
    if (serviceFormElement) {
      serviceFormElement.reset();
    }

    // Clear photo preview
    const photoPreview = document.getElementById("photo_preview");
    if (photoPreview) {
      photoPreview.innerHTML = "";
    }

    // Reset edit state if editing
    this.resetEditState();

    // Switch to visual editor
    this.showTab("visual");
  }

  /** Renders both popular and other service card groups. */
  renderServices() {
    const popularContainer = document.getElementById("popularServices");
    const otherContainer = document.getElementById("otherServices");

    if (popularContainer) {
      popularContainer.innerHTML = this.renderServiceCards("popular");
    }

    if (otherContainer) {
      otherContainer.innerHTML = this.renderServiceCards("other");
    }

    // Setup drag and drop after rendering
    this.setupDragAndDrop();
  }

  /** Returns service card HTML for a specific category. */
  renderServiceCards(category) {
    if (
      !this.servicesData ||
      !this.servicesData[0] ||
      !this.servicesData[0][category]
    ) {
      return "<p>No services found in this category.</p>";
    }

    return this.servicesData[0][category]
      .map((service, index) => {
        const prices = service.price || {};
        const priceEntries = Object.entries(prices);
        const hasPrices = priceEntries.length > 0;
        const hasNoPrices = priceEntries.length === 0;

        return `
                 <div class="service-card" data-category="${category}" data-index="${index}" draggable="false">
                     <div class="drag-handle" draggable="true">⋮⋮</div>
                     ${
                       service.photo_url
                         ? `
                     <div class="service-photo">
                         <img src="${this.escapeHtml(
                           this.getImageUrl(service.photo_url)
                         )}" alt="${this.escapeHtml(
                             service.name
                           )}" onerror="this.style.display='none'">
                     </div>
                     `
                         : ""
                     }
                     <div class="service-card-content">
                         <div class="service-header">
                             <div class="service-name">${this.escapeHtml(
                               service.name
                             )}</div>
                             ${
                               hasNoPrices
                                 ? `<div class="service-price-unavailable">Contact Us</div>`
                                 : ""
                             }
                         </div>
                         <div class="service-description">${this.escapeHtml(
                           service.description
                         )}</div>
                         ${
                           hasPrices
                             ? `
                         <div class="service-pricing">
                             <h4>Pricing Plans</h4>
                             <ul class="pricing-list">
                                 ${priceEntries
                                   .map(
                                     ([duration, price]) => `
                                     <li><strong>${this.formatDuration(
                                       duration
                                     )}:</strong> ${this.escapeHtml(price)}</li>
                                 `
                                   )
                                   .join("")}
                             </ul>
                         </div>
                         `
                             : ""
                         }
                         <div class="service-features">
                             <h4>Features</h4>
                             <ul>
                                 ${(service.features || [])
                                   .map(
                                     (feature) =>
                                       `<li>${this.escapeHtml(feature)}</li>`
                                   )
                                   .join("")}
                             </ul>
                         </div>
                     </div>
                     <div class="service-actions">
                         <button class="btn btn-primary" onclick="productShowcase.editService('${category}', ${index})">
                             Edit
                         </button>
                         <button class="btn btn-danger" onclick="productShowcase.deleteService('${category}', ${index})">
                             Delete
                         </button>
                     </div>
                 </div>
             `;
      })
      .join("");
  }

  /** Attaches drag and drop events for service reordering. */
  setupDragAndDrop() {
    const dragHandles = document.querySelectorAll(".drag-handle");
    const serviceCards = document.querySelectorAll(".service-card");

    // Add drag events to drag handles
    dragHandles.forEach((handle) => {
      handle.addEventListener("dragstart", (e) => this.handleDragStart(e));
      handle.addEventListener("dragend", (e) => this.handleDragEnd(e));
    });

    // Add drop events to service cards
    serviceCards.forEach((card) => {
      card.addEventListener("dragover", (e) => this.handleDragOver(e));
      card.addEventListener("drop", (e) => this.handleDrop(e));
      card.addEventListener("dragenter", (e) => this.handleDragEnter(e));
      card.addEventListener("dragleave", (e) => this.handleDragLeave(e));
    });
  }

  /** Stores currently dragged card context. */
  handleDragStart(e) {
    // Find the parent service card
    const serviceCard = e.target.closest(".service-card");
    if (!serviceCard) return;

    this.draggedElement = serviceCard;
    serviceCard.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/html", serviceCard.outerHTML);
  }

  /** Cleans drag state and visual indicators after drag completion. */
  handleDragEnd(e) {
    // Find the parent service card
    const serviceCard = e.target.closest(".service-card");
    if (serviceCard) {
      serviceCard.classList.remove("dragging");
    }
    this.draggedElement = null;

    // Remove all drop indicators
    document.querySelectorAll(".service-card").forEach((card) => {
      card.classList.remove("drag-over");
    });
  }

  /** Allows dropping by preventing default drag-over behavior. */
  handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  /** Highlights potential drop target card on drag enter. */
  handleDragEnter(e) {
    e.preventDefault();
    if (
      e.target.closest(".service-card") &&
      e.target.closest(".service-card") !== this.draggedElement
    ) {
      e.target.closest(".service-card").classList.add("drag-over");
    }
  }

  /** Removes drop-target highlight when drag leaves a card. */
  handleDragLeave(e) {
    if (e.target.closest(".service-card")) {
      e.target.closest(".service-card").classList.remove("drag-over");
    }
  }

  /** Finalizes same-category reorder and persists new order. */
  handleDrop(e) {
    e.preventDefault();

    const dropTarget = e.target.closest(".service-card");
    if (!dropTarget || dropTarget === this.draggedElement) {
      return;
    }

    dropTarget.classList.remove("drag-over");

    const draggedCategory = this.draggedElement.dataset.category;
    const draggedIndex = parseInt(this.draggedElement.dataset.index);
    const dropCategory = dropTarget.dataset.category;
    const dropIndex = parseInt(dropTarget.dataset.index);

    // Only allow reordering within the same category
    if (draggedCategory !== dropCategory) {
      this.showAlert(
        "Services can only be reordered within their own category!",
        "error"
      );
      return;
    }

    // Reorder the data
    this.reorderService(draggedCategory, draggedIndex, dropCategory, dropIndex);

    // Re-render to reflect the new order
    this.renderServices();

    // Save the new order
    this.saveNewOrder();
  }

  /** Reorders service arrays in memory after drag-drop. */
  reorderService(fromCategory, fromIndex, toCategory, toIndex) {
    if (
      !this.servicesData[0][fromCategory] ||
      !this.servicesData[0][toCategory]
    ) {
      return;
    }

    // Remove the service from its original position
    const [movedService] = this.servicesData[0][fromCategory].splice(
      fromIndex,
      1
    );

    // Add it to the new position (same category only)
    this.servicesData[0][toCategory].splice(toIndex, 0, movedService);
  }

  /** Persists reordered service JSON to backend. */
  async saveNewOrder() {
    try {
      const response = await fetch("./api_json/save_services.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(this.servicesData),
      });

      const result = await response.json();

      if (result.success) {
        this.showAlert("Service order updated successfully!", "success");
      } else {
        this.showAlert(result.error || "Failed to save new order", "error");
      }
    } catch (error) {
      console.error("Error saving new order:", error);
      this.showAlert("Error saving new order: " + error.message, "error");
    }
  }

  /** Handles add/update form submit and sends multipart payload. */
  async handleAddService(event) {
    event.preventDefault();

    const formData = new FormData(event.target);

    // Check if we're editing or adding
    const isEditing = this.editingService !== undefined;

    // Validation
    const validationResult = this.validateForm(formData, isEditing);
    if (!validationResult.isValid) {
      this.showAlert(validationResult.message, "error");
      return;
    }

    // Collect pricing data with formatting
    const price = {};
    const pricingRows = document.querySelectorAll(".pricing-row");
    pricingRows.forEach((row) => {
      const durationSelect = row.querySelector(
        'select[name="pricing_duration[]"]'
      );
      const priceInput = row.querySelector('input[name="pricing_price[]"]');
      if (
        durationSelect &&
        priceInput &&
        durationSelect.value &&
        priceInput.value.trim()
      ) {
        price[durationSelect.value] = this.formatPrice(priceInput.value.trim());
      }
    });

    // Collect features data
    const features = [];
    const featureRows = document.querySelectorAll(".features-row");
    featureRows.forEach((row) => {
      const featureInput = row.querySelector('input[name="features[]"]');
      if (featureInput && featureInput.value.trim()) {
        features.push(featureInput.value.trim());
      }
    });

    // Handle photo upload
    const photoFile = formData.get("services_photo");
    let photoUrl = "";

    if (photoFile && photoFile.size > 0) {
      // New photo uploaded
      const serviceName = formData.get("services_name").trim().toLowerCase();
      const fileExtension = photoFile.name.split(".").pop();
      const fileName = `${serviceName}.${fileExtension}`;
      photoUrl = `/images/services/${fileName}`;
    } else if (isEditing && this.editingService.service.photo_url) {
      // Keep existing photo when editing
      photoUrl = this.editingService.service.photo_url;
    }

    // Get placement/category
    const placement = formData.get("services_placement");
    let category = "other";
    if (placement === "popularServices") {
      category = "popular";
    } else if (placement === "otherServices") {
      category = "other";
    }

    const serviceData = {
      name: formData.get("services_name").trim(),
      description: formData.get("services_description").trim(),
      price: price,
      features: features,
      photo_url: photoUrl,
      category: category,
    };

    try {
      // Create FormData for file upload
      const formDataToSend = new FormData();
      formDataToSend.append("name", serviceData.name);
      formDataToSend.append("description", serviceData.description);
      formDataToSend.append("category", serviceData.category);

      if (photoFile && photoFile.size > 0) {
        formDataToSend.append("photo", photoFile);
      }

      // Add pricing data
      Object.entries(serviceData.price).forEach(([duration, price]) => {
        formDataToSend.append(`price[${duration}]`, price);
      });

      // Add features data
      serviceData.features.forEach((feature, index) => {
        formDataToSend.append(`features[${index}]`, feature);
      });

      // Add editing info if updating
      if (isEditing) {
        formDataToSend.append("is_editing", "true");
        formDataToSend.append(
          "original_category",
          this.editingService.category
        );
        formDataToSend.append("original_index", this.editingService.index);
      }

      const response = await fetch("./api_json/add_service.php", {
        method: "POST",
        body: formDataToSend,
      });

      const result = await response.json();

      if (result.success) {
        await this.loadServices();
        this.renderServices();
        this.showAlert(result.message, "success");

        // Reset form and editing state
        event.target.reset();
        this.resetEditState();

        // Switch back to visual tab
        this.showTab("visual");
      } else {
        this.showAlert(
          result.error || `Failed to ${isEditing ? "update" : "add"} service`,
          "error"
        );
      }
    } catch (error) {
      console.error(
        `Error ${isEditing ? "updating" : "adding"} service:`,
        error
      );
      this.showAlert(
        `Error ${isEditing ? "updating" : "adding"} service: ` + error.message,
        "error"
      );
    }
  }

  /** Resets edit mode flags and form heading/button labels. */
  resetEditState() {
    this.editingService = undefined;

    // Reset form header and button
    const formHeader = document.querySelector(".form-header h3");
    if (formHeader) {
      formHeader.textContent = "Add New Service";
    }

    const submitBtn = document.querySelector(".btn-primary");
    if (submitBtn) {
      submitBtn.textContent = "Add Service";
    }

    // Clear photo preview
    const photoPreview = document.getElementById("photo_preview");
    if (photoPreview) {
      photoPreview.innerHTML = "";
    }
  }

  /** Deletes one service entry by category/index. */
  async deleteService(category, index) {
    if (!confirm("Are you sure you want to delete this service?")) {
      return;
    }

    try {
      const response = await fetch("./api_json/delete_service.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ category, index }),
      });

      const result = await response.json();

      if (result.success) {
        await this.loadServices(); // Reload data
        this.renderServices();
        this.showAlert(result.message, "success");
      } else {
        this.showAlert(result.error || "Failed to delete service", "error");
      }
    } catch (error) {
      console.error("Error deleting service:", error);
      this.showAlert("Error deleting service: " + error.message, "error");
    }
  }

  /** Enters edit mode for a selected service and pre-fills form data. */
  editService(category, index) {
    const service = this.servicesData[0][category][index];
    if (!service) return;

    // Store editing info
    this.editingService = { category, index, service };

    // Populate the form with existing service data
    this.populateEditForm(service);

    // Switch to the add service tab (which will be used for editing)
    this.showTab("add");

    // Change the form header to indicate editing
    const formHeader = document.querySelector(".form-header h3");
    if (formHeader) {
      formHeader.textContent = "Edit Service";
    }

    // Change the submit button text
    const submitBtn = document.querySelector(".btn-primary");
    if (submitBtn) {
      submitBtn.textContent = "Update Service";
    }
  }

  /** Populates the editor form with existing service content. */
  populateEditForm(service) {
    // Basic information
    const nameInput = document.getElementById("services_name");
    const descriptionInput = document.getElementById("services_description");
    const placementSelect = document.getElementById("services_placement");
    const photoInput = document.getElementById("services_photo");

    if (nameInput) nameInput.value = service.name || "";
    if (descriptionInput) descriptionInput.value = service.description || "";
    if (placementSelect) placementSelect.value = service.category || "other";

    // Clear existing pricing rows except the first one
    const pricingContainer = document.querySelector(".pricing-table");
    if (pricingContainer) {
      const pricingRows = pricingContainer.querySelectorAll(".pricing-row");
      for (let i = 1; i < pricingRows.length; i++) {
        pricingRows[i].remove();
      }

      // Populate pricing data
      if (service.price && typeof service.price === "object") {
        const priceEntries = Object.entries(service.price);
        priceEntries.forEach(([duration, price], index) => {
          if (index === 0) {
            // Use existing first row
            const firstRow = pricingContainer.querySelector(".pricing-row");
            const durationSelect = firstRow.querySelector(
              'select[name="pricing_duration[]"]'
            );
            const priceInput = firstRow.querySelector(
              'input[name="pricing_price[]"]'
            );
            if (durationSelect) durationSelect.value = duration;
            if (priceInput) {
              // Convert formatted price back to raw number
              const rawPrice = this.convertFormattedPriceToRaw(price);
              priceInput.value = rawPrice;
            }
          } else {
            // Add new rows for additional prices
            this.addPricingRow();
            const newRow =
              pricingContainer.querySelectorAll(".pricing-row")[index];
            const durationSelect = newRow.querySelector(
              'select[name="pricing_duration[]"]'
            );
            const priceInput = newRow.querySelector(
              'input[name="pricing_price[]"]'
            );
            if (durationSelect) durationSelect.value = duration;
            if (priceInput) {
              // Convert formatted price back to raw number
              const rawPrice = this.convertFormattedPriceToRaw(price);
              priceInput.value = rawPrice;
            }
          }
        });
      }
    }

    // Clear existing features except the first one
    const featuresContainer = document.querySelector(".features-table");
    if (featuresContainer) {
      const featureRows = featuresContainer.querySelectorAll(".features-row");
      for (let i = 1; i < featureRows.length; i++) {
        featureRows[i].remove();
      }

      // Populate features data
      if (service.features && Array.isArray(service.features)) {
        service.features.forEach((feature, index) => {
          if (index === 0) {
            // Use existing first row
            const firstRow = featuresContainer.querySelector(".features-row");
            const featureInput = firstRow.querySelector(
              'input[name="features[]"]'
            );
            if (featureInput) featureInput.value = feature;
          } else {
            // Add new rows for additional features
            this.addFeatureRow();
            const newRow =
              featuresContainer.querySelectorAll(".features-row")[index];
            const featureInput = newRow.querySelector(
              'input[name="features[]"]'
            );
            if (featureInput) featureInput.value = feature;
          }
        });
      }
    }

    // Show current photo preview
    if (service.photo_url) {
      this.showPhotoPreview(service.photo_url);
    }
  }

  /** Shows currently stored service photo in the editor. */
  showPhotoPreview(photoUrl) {
    const photoPreview = document.getElementById("photo_preview");
    if (photoPreview) {
      photoPreview.innerHTML = `
        <div style="margin-top: 1rem;">
          <p style="color: rgba(255, 255, 255, 0.7); font-size: 0.9rem; margin-bottom: 0.5rem;">Current Photo:</p>
          <img src="${this.getImageUrl(
            photoUrl
          )}" alt="Current service photo" style="width: 100px; height: 100px; object-fit: cover; border-radius: 6px; border: 1px solid var(--line);">
        </div>
      `;
    }
  }

  /** Appends one dynamic pricing row to the form. */
  addPricingRow() {
    const pricingContainer = document.querySelector(".pricing-table");
    if (!pricingContainer) return;

    const newRow = document.createElement("div");
    newRow.className = "pricing-row";
    newRow.innerHTML = `
      <div class="pricing-col">
        <select name="pricing_duration[]" required>
          <option value="">Select Duration</option>
          <option value="1_month">1 Month</option>
          <option value="2_months">2 Months</option>
          <option value="3_months">3 Months</option>
          <option value="6_months">6 Months</option>
          <option value="12_months">12 Months</option>
        </select>
      </div>
      <div class="pricing-col">
        <input type="number" name="pricing_price[]" placeholder="90000" required>
      </div>
      <div class="pricing-col">
        <button type="button" class="btn btn-danger" onclick="this.parentElement.parentElement.remove()">Remove</button>
      </div>
    `;

    pricingContainer.appendChild(newRow);
  }

  /** Appends one dynamic feature row to the form. */
  addFeatureRow() {
    const featuresContainer = document.querySelector(".features-table");
    if (!featuresContainer) return;

    const newRow = document.createElement("div");
    newRow.className = "features-row";
    newRow.innerHTML = `
      <div class="features-col">
        <input type="text" name="features[]" placeholder="Enter feature" required>
      </div>
      <div class="features-col">
        <button type="button" class="btn btn-danger" onclick="this.parentElement.parentElement.remove()">Remove</button>
      </div>
    `;

    featuresContainer.appendChild(newRow);
  }

  /** Binds add-row buttons for pricing/features sections. */
  setupDynamicRowButtons() {
    // Add pricing row button
    const addPricingBtn = document.getElementById("addPricingBtn");
    if (addPricingBtn) {
      addPricingBtn.addEventListener("click", () => this.addPricingRow());
    }

    // Add feature row button
    const addFeatureBtn = document.getElementById("addFeatureBtn");
    if (addFeatureBtn) {
      addFeatureBtn.addEventListener("click", () => this.addFeatureRow());
    }
  }

  /** Safely parses a JSON string field with empty fallback. */
  parseJsonField(value) {
    if (!value) return {};
    try {
      return JSON.parse(value);
    } catch (e) {
      return {};
    }
  }

  /** Escapes plain text before injecting into HTML templates. */
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /** Normalizes stored photo paths to public image URLs. */
  getImageUrl(photoUrl) {
    // Convert relative path to absolute URL for browser access
    if (photoUrl && photoUrl.startsWith("../../storefront/")) {
      // Convert to cross-domain URL
      const convertedUrl = photoUrl.replace(
        "../../storefront/",
        "https://digimium.store/"
      );
      return convertedUrl;
    }
    // For new format: /images/services/filename.jpg
    if (photoUrl && photoUrl.startsWith("/images/services/")) {
      const fileName = photoUrl.split("/").pop();
      const fixedUrl = `https://digimium.store/images/services/${fileName}`;
      return fixedUrl;
    }
    // If it doesn't start with the expected path, try to fix it
    if (photoUrl && photoUrl.includes("images/services/")) {
      const fileName = photoUrl.split("/").pop();
      const fixedUrl = `https://digimium.store/images/services/${fileName}`;
      return fixedUrl;
    }
    return photoUrl;
  }

  /** Formats duration keys into human-readable labels. */
  formatDuration(duration) {
    const durationMap = {
      "1_month": "1 Month",
      "2_months": "2 Months",
      "3_months": "3 Months",
      "6_months": "6 Months",
      "12_months": "12 Months",
    };
    return (
      durationMap[duration] ||
      duration.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())
    );
  }

  /** Displays a transient alert banner in page main content. */
  showAlert(message, type = "info") {
    // Remove existing alerts
    const existingAlerts = document.querySelectorAll(".alert");
    existingAlerts.forEach((alert) => alert.remove());

    // Create new alert
    const alertDiv = document.createElement("div");
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;

    // Insert at the top of the main content
    const main = document.querySelector("main");
    if (main) {
      main.insertBefore(alertDiv, main.firstChild);
    }

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (alertDiv.parentNode) {
        alertDiv.remove();
      }
    }, 5000);
  }

  /** Validates service form fields and file constraints. */
  validateForm(formData, isEditing = false) {
    // Check required fields
    const photoFile = formData.get("services_photo");
    const name = formData.get("services_name")?.trim();
    const description = formData.get("services_description")?.trim();

    // Photo validation (only required when adding new service)
    if (!isEditing && (!photoFile || photoFile.size === 0)) {
      return { isValid: false, message: "Service photo is required." };
    }

    // Check file type if photo is provided
    if (photoFile && photoFile.size > 0) {
      const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];
      if (!allowedTypes.includes(photoFile.type)) {
        return { isValid: false, message: "Photo must be JPG or PNG format." };
      }

      // Check file size (1MB = 1024 * 1024 bytes)
      const maxSize = 1024 * 1024; // 1MB
      if (photoFile.size > maxSize) {
        return { isValid: false, message: "Photo must be less than 1MB." };
      }
    }

    // Name validation
    if (!name) {
      return { isValid: false, message: "Service name is required." };
    }

    if (name.length < 3) {
      return {
        isValid: false,
        message: "Service name must be at least 3 characters long.",
      };
    }

    // Description validation
    if (!description) {
      return { isValid: false, message: "Service description is required." };
    }

    if (description.length < 10) {
      return {
        isValid: false,
        message: "Service description must be at least 10 characters long.",
      };
    }

    // Features validation - at least one feature required
    let hasFeatures = false;
    const featureRows = document.querySelectorAll(".features-row");
    featureRows.forEach((row) => {
      const featureInput = row.querySelector('input[name="features[]"]');
      if (featureInput && featureInput.value.trim()) {
        hasFeatures = true;
      }
    });

    if (!hasFeatures) {
      return { isValid: false, message: "At least one feature is required." };
    }

    return { isValid: true, message: "Validation passed." };
  }

  /** Converts numeric price text to UI-styled masked format. */
  formatPrice(priceValue) {
    // Remove any non-numeric characters except decimal point
    const numericValue = priceValue.toString().replace(/[^\d.]/g, "");

    // Convert to number
    const number = parseFloat(numericValue);

    if (isNaN(number)) {
      return priceValue; // Return original if not a valid number
    }

    // Convert to string and replace all zeros with asterisks
    const numberStr = Math.floor(number).toString();
    const formattedNumber = numberStr.replace(/0/g, "*");

    // Add comma for thousands
    let result = formattedNumber;
    if (formattedNumber.length > 3) {
      result = formattedNumber.slice(0, -3) + "," + formattedNumber.slice(-3);
    }

    return `Ks ${result}`;
  }

  /** Converts masked UI price back to raw numeric string. */
  convertFormattedPriceToRaw(formattedPrice) {
    // Remove "Ks " prefix and any commas
    let priceStr = formattedPrice
      .toString()
      .replace(/^Ks\s*/, "")
      .replace(/,/g, "");

    // Replace asterisks with zeros to get the original number
    priceStr = priceStr.replace(/\*/g, "0");

    // Convert to number
    const number = parseInt(priceStr, 10);

    return isNaN(number) ? "" : number.toString();
  }

  /** Attaches live validation handlers for critical form inputs. */
  setupRealTimeValidation(form) {
    // Photo validation
    const photoInput = form.querySelector("#services_photo");
    if (photoInput) {
      photoInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
          // Check file type
          const allowedTypes = ["image/jpeg", "image/jpg", "image/png"];
          if (!allowedTypes.includes(file.type)) {
            this.showFieldError(photoInput, "Please select a JPG or PNG file.");
            return;
          }

          // Check file size
          const maxSize = 1024 * 1024; // 1MB
          if (file.size > maxSize) {
            this.showFieldError(photoInput, "File size must be less than 1MB.");
            return;
          }

          this.clearFieldError(photoInput);
        }
      });
    }

    // Name validation
    const nameInput = form.querySelector("#services_name");
    if (nameInput) {
      nameInput.addEventListener("blur", (e) => {
        const value = e.target.value.trim();
        if (!value) {
          this.showFieldError(nameInput, "Service name is required.");
        } else if (value.length < 3) {
          this.showFieldError(
            nameInput,
            "Service name must be at least 3 characters."
          );
        } else {
          this.clearFieldError(nameInput);
        }
      });
    }

    // Description validation
    const descInput = form.querySelector("#services_description");
    if (descInput) {
      descInput.addEventListener("blur", (e) => {
        const value = e.target.value.trim();
        if (!value) {
          this.showFieldError(descInput, "Service description is required.");
        } else if (value.length < 10) {
          this.showFieldError(
            descInput,
            "Description must be at least 10 characters."
          );
        } else {
          this.clearFieldError(descInput);
        }
      });
    }

    // Features validation
    for (let i = 1; i <= 5; i++) {
      const featureInput = form.querySelector(`#services_features_${i}`);
      if (featureInput) {
        featureInput.addEventListener("blur", () => {
          this.validateFeatures(form);
        });
      }
    }
  }

  /** Applies error styling to a single form input. */
  showFieldError(input, message) {
    // Remove existing error
    this.clearFieldError(input);

    // Add error styling (red border)
    input.style.borderColor = "#dc3545";
  }

  /** Clears error styling from a single form input. */
  clearFieldError(input) {
    // Remove error styling (red border)
    input.style.borderColor = "";
  }

  /** Ensures at least one feature row has a non-empty value. */
  validateFeatures(form) {
    let hasFeatures = false;
    for (let i = 1; i <= 5; i++) {
      const featureInput = form.querySelector(`#services_features_${i}`);
      if (featureInput && featureInput.value.trim()) {
        hasFeatures = true;
        break;
      }
    }

    // Show/hide error on first feature input
    const firstFeatureInput = form.querySelector("#services_features_1");
    if (firstFeatureInput) {
      if (!hasFeatures) {
        this.showFieldError(
          firstFeatureInput,
          "At least one feature is required."
        );
      } else {
        this.clearFieldError(firstFeatureInput);
      }
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  window.productShowcase = new ProductShowcase();
});
