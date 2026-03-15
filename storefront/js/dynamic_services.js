// Dynamic Services Renderer
class DynamicServicesRenderer {
  constructor() {
    this.services = [];
    this.popularServices = [];
    this.otherServices = [];
    this.init();
  }

  async init() {
    try {
      await this.fetchServices();
      this.categorizeServices();
      this.renderServices();
    } catch (error) {
      console.error("Error initializing dynamic services:", error);
      this.showFallbackMessage();
    }
  }

  async fetchServices() {
    try {
      const response = await fetch("./data/services.json");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Handle new JSON structure with popular/other categories
      if (
        Array.isArray(data) &&
        data.length > 0 &&
        data[0].popular &&
        data[0].other
      ) {
        // New structure - categorized object
        this.services = [...data[0].popular, ...data[0].other];
        this.popularServices = data[0].popular;
        this.otherServices = data[0].other;
      } else if (Array.isArray(data)) {
        // Old structure - flat array (fallback)
        this.services = data;
      } else {
        throw new Error("Invalid JSON structure");
      }
    } catch (error) {
      console.error("Error fetching services:", error);
      throw error;
    }
  }

  categorizeServices() {
    // If services were already categorized during fetch, skip this
    if (this.popularServices.length > 0 && this.otherServices.length > 0) {
      return;
    }

    // Fallback to old categorization method if needed
    const popularServiceNames = [
      "Netflix Premium",
      "Spotify Premium",
      "YouTube Premium",
      "ChatGPT Plus",
    ];

    this.popularServices = this.services.filter((service) =>
      popularServiceNames.includes(service.name)
    );

    this.otherServices = this.services.filter(
      (service) => !popularServiceNames.includes(service.name)
    );
  }

  renderServices() {
    this.renderPopularServices();
    this.renderOtherServices();
    // Re-initialize "More Info" functionality after rendering
    setTimeout(() => {
      this.reinitializeMoreInfoButtons();
    }, 100);
  }

  renderPopularServices() {
    const allContainers = document.querySelectorAll(
      ".services-category .services-grid"
    );
    if (allContainers.length > 0) {
      allContainers[0].innerHTML = this.popularServices
        .map((service) => this.createServiceCard(service))
        .join("");
    } else {
      console.error("Popular services container not found");
    }
  }

  renderOtherServices() {
    const allContainers = document.querySelectorAll(
      ".services-category .services-grid"
    );
    if (allContainers.length > 1) {
      allContainers[1].innerHTML = this.otherServices
        .map((service) => this.createServiceCard(service))
        .join("");
    } else {
      console.error("Other services container not found");
    }
  }

  createServiceCard(service) {
    let priceRows = "";

    if (service.price && Object.keys(service.price).length > 0) {
      // Limit to maximum 4 price rows
      const priceEntries = Object.entries(service.price).slice(0, 4);
      priceRows = priceEntries
        .map(
          ([duration, price]) => `
              <div class="price-row">
                  <span class="duration">${this.formatDuration(duration)}</span>
                  <span class="price">${price}</span>
              </div>
          `
        )
        .join("");
    } else {
      priceRows = `
        <div class="price-row">
            <span class="price">Contact for more</span>
        </div>
      `;
    }

    const features = service.features
      .map((feature) => `<li>${feature}</li>`)
      .join("");

    return `
            <article class="service-card">
                <div class="service-image">
                    <img src="${service.photo_url}" alt="${service.name}" loading="lazy">
                </div>
                <h3>${service.name}</h3>
                                           <div class="pricing-info">
                               ${priceRows}
                           </div>
                           <div class="expanded-info">
                    <h3>${service.name}</h3>
                    <p><strong>Features:</strong></p>
                    <ul>
                        ${features}
                    </ul>
                    <p><strong>Perfect for:</strong> ${service.description}</p>
                </div>
            </article>
        `;
  }

  formatDuration(duration) {
    return duration.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());
  }

  showFallbackMessage() {
    const containers = document.querySelectorAll(".services-grid");
    containers.forEach((container) => {
      container.innerHTML = `
                <div class="error-message">
                    <p>Unable to load services at the moment. Please try again later.</p>
                </div>
            `;
    });
  }

  reinitializeMoreInfoButtons() {
    const serviceCards = document.querySelectorAll(".service-card");

    serviceCards.forEach((card) => {
      const expandedInfo = card.querySelector(".expanded-info");

      if (expandedInfo) {
        // Add card click handler
        card.addEventListener("click", function (e) {
          // If already expanded, collapse it
          if (this.classList.contains("expanded")) {
            this.classList.remove("expanded");
            return;
          }

          // Collapse all other cards first
          serviceCards.forEach((otherCard) => {
            if (
              otherCard !== this &&
              otherCard.classList.contains("expanded")
            ) {
              otherCard.classList.remove("expanded");
            }
          });

          // Expand the current card
          this.classList.add("expanded");

          // Auto-hide after 5 seconds
          setTimeout(() => {
            if (this.classList.contains("expanded")) {
              this.classList.remove("expanded");
            }
          }, 5000);

          // Track the interaction
          const serviceName = this.querySelector("h3").textContent;
          if (window.trackEvent) {
            window.trackEvent("service", "card_click", serviceName);
          }
        });
      }
    });
  }
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new DynamicServicesRenderer();
});

// Export for potential use in other scripts
window.DynamicServicesRenderer = DynamicServicesRenderer;
