// Main JavaScript for Digimium Website - Memory Optimized Version
document.addEventListener("DOMContentLoaded", function () {
  // Memory optimization: Throttle function
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

  // Memory optimization: Debounce function
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

  // Mobile Navigation Toggle
  const burger = document.querySelector("#burger");
  const navLinks = document.querySelector("#navLinks");

  if (burger && navLinks) {
    burger.addEventListener("click", () => {
      burger.classList.toggle("open");
      navLinks.classList.toggle("active");
      document.body.classList.toggle("menu-open");
    });

    // Close menu when clicking on a link
    navLinks.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        navLinks.classList.remove("active");
        burger.classList.remove("open");
        document.body.classList.remove("menu-open");
      });
    });
  }

  // Navbar scroll effect - MEMORY OPTIMIZED with throttling
  const navbar = document.querySelector("#navbar");
  if (navbar) {
    const handleScroll = throttle(() => {
      if (window.scrollY > 50) {
        navbar.classList.add("scrolled");
      } else {
        navbar.classList.remove("scrolled");
      }
    }, 30); // ~60fps

    window.addEventListener("scroll", handleScroll, { passive: true });
  }

  // Set active nav link based on current section - MEMORY OPTIMIZED
  const setActiveNav = throttle(() => {
    const sections = document.querySelectorAll("section[id]");
    const navLinks = document.querySelectorAll(".nav-links a[href^='#']");

    let current = "";
    sections.forEach((section) => {
      const sectionTop = section.offsetTop;
      const sectionHeight = section.clientHeight;
      if (window.scrollY >= sectionTop - 200) {
        current = section.getAttribute("id");
      }
    });

    navLinks.forEach((link) => {
      link.classList.remove("active");
      if (link.getAttribute("href") === `#${current}`) {
        link.classList.add("active");
      }
    });
  }, 100);

  window.addEventListener("scroll", setActiveNav, { passive: true });

  // Smooth Scrolling for Anchor Links - MEMORY OPTIMIZED
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute("href"));
      if (target) {
        target.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
  });

  // Admin contact tracking - MEMORY OPTIMIZED with delegation
  document.addEventListener("click", function (e) {
    if (e.target.matches(".admin-email, .admin-phone")) {
      const adminCard = e.target.closest(".admin-card");
      if (adminCard) {
        const adminName = adminCard.querySelector("h4").textContent;
        const contactType = e.target.classList.contains("admin-email")
          ? "email"
          : "phone";
        trackEvent("contact", "admin_contact", `${adminName} - ${contactType}`);
      }
    }
  });

  // Telegram link tracking - MEMORY OPTIMIZED
  document.addEventListener("click", function (e) {
    if (e.target.matches(".btn-telegram")) {
      trackEvent("contact", "telegram_click", "DigimiumSupport");
    }
  });

  // Service Card More Info functionality - MEMORY OPTIMIZED with delegation
  document.addEventListener("click", function (e) {
    if (e.target.matches(".more-info-btn")) {
      e.preventDefault();
      e.stopPropagation();

      const card = e.target.closest(".service-card");
      if (!card) return;

      const expandedInfo = card.querySelector(".expanded-info");
      if (!expandedInfo) return;

      // Close all other expanded cards first
      document
        .querySelectorAll(".service-card.expanded")
        .forEach((expandedCard) => {
          if (expandedCard !== card) {
            expandedCard.classList.remove("expanded");
          }
        });

      // Toggle current card
      card.classList.toggle("expanded");

      // Update button text
      const btn = e.target;
      btn.textContent = card.classList.contains("expanded")
        ? "Show Less"
        : "More Info";
    }
  });

  // Close expanded cards when clicking outside - MEMORY OPTIMIZED
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".service-card")) {
      document.querySelectorAll(".service-card.expanded").forEach((card) => {
        card.classList.remove("expanded");
        const btn = card.querySelector(".more-info-btn");
        if (btn) btn.textContent = "More Info";
      });
    }
  });

  // Hero mouse tracking - MEMORY OPTIMIZED with throttling
  const hero = document.querySelector(".hero");
  if (hero) {
    const handleMouseMove = throttle((e) => {
      const rect = hero.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      hero.style.setProperty("--mouse-x", `${x}px`);
      hero.style.setProperty("--mouse-y", `${y}px`);
    }, 16);

    hero.addEventListener("mousemove", handleMouseMove, { passive: true });
  }

  // Scroll animations - MEMORY OPTIMIZED with Intersection Observer
  const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px",
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("animate");
      }
    });
  }, observerOptions);

  // Observe all scroll-animate elements
  document.querySelectorAll(".scroll-animate").forEach((el) => {
    observer.observe(el);
  });

  // Memory cleanup function
  function cleanup() {
    // Remove event listeners when page unloads
    window.removeEventListener("scroll", handleScroll);
    window.removeEventListener("scroll", setActiveNav);
    observer.disconnect();
  }

  // Cleanup on page unload
  window.addEventListener("beforeunload", cleanup);

  // Track events function
  function trackEvent(category, action, label) {
    if (typeof gtag !== "undefined") {
      gtag("event", action, {
        event_category: category,
        event_label: label,
      });
    }
  }

  // Performance monitoring
  if ("performance" in window) {
    window.addEventListener("load", () => {
      setTimeout(() => {
        const perfData = performance.getEntriesByType("navigation")[0];
        if (perfData && perfData.loadEventEnd > 0) {
          console.log(
            `Page load time: ${
              perfData.loadEventEnd - perfData.loadEventStart
            }ms`
          );
        }
      }, 0);
    });
  }
});
