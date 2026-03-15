"use strict";

/**
 * Module: Login page controller.
 * Purpose: Validates login input, submits credentials to PHP auth endpoint,
 * and handles login UI states + redirect flow.
 */
(() => {
  // Contract: backend responds with plain text "success" on valid credentials.
  const LOGIN_URL = "api/login.php";
  const REDIRECT_TO = "/sales_overview.php";

  document.addEventListener("DOMContentLoaded", () => {
    const form =
      document.getElementById("loginForm") || document.querySelector("form");
    const usernameEl = document.getElementById("username");
    const passwordEl = document.getElementById("password");
    const submitBtn = form?.querySelector('button[type="submit"]');
    const msgEl = document.getElementById("feedbackLogin");

    // eye / eyeSlash toggle
    const toggleBtn = document.getElementById("togglePass");
    const toggleIcon = document.getElementById("toggleIcon");
    if (toggleBtn && toggleIcon && passwordEl) {
      toggleBtn.addEventListener("click", () => {
        const showing = passwordEl.type === "text";
        passwordEl.type = showing ? "password" : "text";
        toggleIcon.src = showing ? "./assets/eye.svg" : "./assets/eyeSlash.svg";
        toggleBtn.setAttribute(
          "aria-label",
          showing ? "Show password" : "Hide password"
        );
        toggleBtn.title = showing ? "Show password" : "Hide password";
        passwordEl.focus();
      });
    }

    /** Shows inline login feedback and applies success/error styling. */
    function showMsg(text, ok = false) {
      if (!msgEl) return;
      msgEl.textContent = text;
      msgEl.style.display = text ? "block" : "none";
      msgEl.style.color = ok ? "#7CF39E" : "#ff5a5a";
    }

    /** Reads and trims login form values. */
    function getVals() {
      return {
        username: (usernameEl?.value || "").trim(),
        password: passwordEl?.value || "",
      };
    }

    /** Performs minimal client-side validation before submit. */
    function validate() {
      // Keep this validation minimal; authoritative checks happen server-side.
      const { username, password } = getVals();
      if (!username) {
        showMsg("Username is required.");
        return false;
      }
      if (!password) {
        showMsg("Password is required.");
        return false;
      }
      showMsg("");
      return true;
    }

    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!validate()) return;

      const { username, password } = getVals();

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add("disableBtn");
      }

      let redirecting = false;

      try {
        // IMPORTANT: send form-encoded POST for PHP $_POST
        const body = new URLSearchParams();
        body.set("username", username);
        body.set("password", password);

        const res = await fetch(LOGIN_URL, {
          method: "POST",
          // Do NOT set Content-Type manually; URLSearchParams will set it properly.
          // Keep credentials default for same-origin; add credentials: 'include' if cross-origin.
          body,
          headers: { Accept: "text/plain" },
        });

        const text = (await res.text()).trim();

        // Backend convention: plain text response rather than JSON.
        if (!res.ok) {
          throw new Error(text || `Login failed (HTTP ${res.status})`);
        }
        if (text.toLowerCase() !== "success") {
          throw new Error(text || "Invalid username or password.");
        }

        // Success → brief loading state, then redirect
        showMsg("Login successful.", true);
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.classList.add("disableBtn");
          submitBtn.textContent = "Loading…";
          submitBtn.setAttribute("aria-busy", "true");
        }
        redirecting = true;
        await new Promise((r) => setTimeout(r, 800));
        window.location.assign(REDIRECT_TO);
      } catch (err) {
        showMsg(err.message || "Login failed.");
      } finally {
        if (!redirecting && submitBtn) {
          submitBtn.disabled = false;
          submitBtn.classList.remove("disableBtn");
          submitBtn.removeAttribute("aria-busy");
          submitBtn.textContent = "Log In";
        }
      }
    });

    [usernameEl, passwordEl].forEach((el) => {
      el?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") form?.requestSubmit?.();
      });
    });
  });
})();
