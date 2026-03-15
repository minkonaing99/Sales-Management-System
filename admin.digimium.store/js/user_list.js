/**
 * Module: User management screen controller.
 * Purpose: Loads web/bot users, renders desktop + mobile lists, and handles
 * user creation and delete actions.
 */

document.addEventListener("DOMContentLoaded", function () {
  loadAllUsers();
  setupUserSettingsToggle();
  setupUserCreationForm();
  setupDeleteUserHandler(); // Shared delete binding for desktop + mobile buttons.
});

/** Binds toggle behavior for user-settings panel visibility. */
function setupUserSettingsToggle() {
  const userSettingBtn = document.getElementById("userSettingBtn");
  const userSettingForm = document.getElementById("user_setting");

  if (userSettingBtn && userSettingForm) {
    userSettingBtn.addEventListener("click", () => {
      userSettingForm.style.display =
        userSettingForm.style.display === "block" ? "none" : "block";
    });
  }
}

// Fetches merged web/bot users from backend and refreshes both UI layouts.
async function loadAllUsers() {
  try {
    const response = await fetch("./api/user_list.php");
    const result = await response.json();

    if (result.success) {
      populateUserTable(result.data);
      populateUserMobile(result.data);
    } else {
      console.error("Failed to load users:", result.error);
    }
  } catch (error) {
    console.error("Error loading users:", error);
  }
}

// Desktop table renderer.
function populateUserTable(users) {
  const tbody = document.getElementById("user_list");
  if (!tbody) return;

  tbody.innerHTML = "";

  users.forEach((user, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
        <td class="era-num">${index + 1}</td>
        <td>${escapeHtml(user.username)}</td>
        <td>${escapeHtml(user.telegram_id)}</td>
        <td style="text-align: left;">
          <span class="status-badge ${user.is_active ? "active" : "inactive"}">
            ${user.is_active ? "Active" : "Inactive"}
          </span>
        </td>
        <td style="text-align: left;">${escapeHtml(user.role)}</td>
        <td style="text-align: left;">${escapeHtml(user.last_login)}</td>
        <td class="era-email">${escapeHtml(user.created_at)}</td>
        <td style="text-align: center;">
          <button class="era-icon-btn delete-user-btn" 
            data-id="${user.id}" 
            data-username="${escapeHtml(user.username)}" 
            data-type="${user.type}" 
            title="Delete user">
            <span class="era-icon"><img src="./assets/delete.svg" alt="Delete"></span>
          </button>
        </td>`;
    tbody.appendChild(row);
  });
}

// Mobile card renderer.
function populateUserMobile(users) {
  const container = document.getElementById("user-list");
  if (!container) return;

  container.innerHTML = "";

  users.forEach((user, index) => {
    const card = document.createElement("div");
    card.className = "user-card";
    card.innerHTML = `
        <div class="user-header">
          <span class="user-number">#${index + 1}</span>
          <div class="user-actions">
            <span class="status-badge ${
              user.is_active ? "active" : "inactive"
            }">
              ${user.is_active ? "Active" : "Inactive"}
            </span>
            <button class="era-icon-btn delete-user-btn"
              data-id="${user.id}" 
              data-username="${escapeHtml(user.username)}" 
              data-type="${user.type}" 
              title="Delete user">
              <span class="era-icon"><img src="./assets/delete.svg" alt="Delete"></span>
            </button>
          </div>
        </div>
        <div class="user-info">
          <div class="info-row"><strong>Username:</strong> <span>${escapeHtml(
            user.username
          )}</span></div>
          <div class="info-row"><strong>ID:</strong> <span>${escapeHtml(
            user.telegram_id
          )}</span></div>
          <div class="info-row"><strong>Role:</strong> <span>${escapeHtml(
            user.role
          )}</span></div>
          <div class="info-row"><strong>Last Login:</strong> <span>${escapeHtml(
            user.last_login
          )}</span></div>
          <div class="info-row"><strong>Created:</strong> <span>${escapeHtml(
            user.created_at
          )}</span></div>
        </div>`;
    container.appendChild(card);
  });
}

// Escapes user-provided fields before inserting HTML templates.
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Delegated click handler so newly-rendered rows/cards work without rebinding.
function setupDeleteUserHandler() {
  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest(".delete-user-btn");
    if (!btn) return;

    const userId = btn.dataset.id;
    const username = btn.dataset.username;
    const userType = btn.dataset.type;

    deleteUser(userId, username, userType);
  });
}

/** Deletes a selected web/bot user and refreshes list on success. */
async function deleteUser(userId, username, userType) {
  const userTypeText = userType === "bot" ? "bot user" : "user";

  if (
    !confirm(`Are you sure you want to delete ${userTypeText} \"${username}\"?`)
  ) {
    return;
  }

  try {
    const apiUrl =
      userType === "bot"
        ? "./api/bot_user_delete.php"
        : "./api/user_delete.php";
    const bodyData =
      userType === "bot" ? { bot_user_id: userId } : { user_id: userId };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyData),
    });

    const result = await response.json();

    if (result.success) {
      alert(
        `${
          userTypeText.charAt(0).toUpperCase() + userTypeText.slice(1)
        } deleted successfully`
      );
      loadAllUsers();
    } else {
      alert("Error: " + (result.error || `Failed to delete ${userTypeText}`));
    }
  } catch (error) {
    console.error(`Error deleting ${userTypeText}:`, error);
    alert(`Error: Failed to delete ${userTypeText}`);
  }
}

/**
 * Add-user form workflow:
 * - realtime field validation
 * - password rule hints
 * - API submission + UI refresh on success
 */
/** Wires add-user form validation, password checks, and create API submission. */
function setupUserCreationForm() {
  const form = document.querySelector("#addUserRow form");
  if (!form) return;

  const elUsername = document.getElementById("username");
  const elPassword = document.getElementById("password");
  const elRole = document.getElementById("role");
  const saveBtn = form.querySelector('button[type="submit"]');
  const feedback = document.getElementById("feedback_addUser");

  const setDanger = (el, on) => {
    if (!el) return;
    el.classList.toggle("text-danger", !!on);
    const label = el.id
      ? document.querySelector(`label[for="${el.id}"]`)
      : null;
    if (label) label.classList.toggle("text-danger", !!on);
  };

  const showFeedback = (msg, ok = true) => {
    if (!feedback) return;
    feedback.textContent = msg;
    feedback.style.display = "block";
    feedback.style.color = ok ? "white" : "red";
  };

  const clearFeedback = () => {
    if (feedback) feedback.style.display = "none";
  };

  /** Validates password complexity and returns unmet rule labels. */
  function validatePassword(pw) {
    const errors = [];
    if (pw.length < 10) errors.push("≥10 characters");
    if (!/[A-Z]/.test(pw)) errors.push("an uppercase letter");
    if (!/\d/.test(pw)) errors.push("a number");
    if (!/[^A-Za-z0-9]/.test(pw)) errors.push("a special character");
    return errors;
  }

  /** Updates password rule indicator UI based on current input value. */
  function updatePasswordRequirements(pw) {
    const reqRequired = document.getElementById("req-required");
    const reqLength = document.getElementById("req-length");
    const reqUppercase = document.getElementById("req-uppercase");
    const reqNumber = document.getElementById("req-number");
    const reqSpecial = document.getElementById("req-special");

    // Update each requirement based on password validation
    if (reqRequired) {
      reqRequired.className = pw.length > 0 ? "valid" : "invalid";
    }
    if (reqLength) {
      reqLength.className = pw.length >= 10 ? "valid" : "invalid";
    }
    if (reqUppercase) {
      reqUppercase.className = /[A-Z]/.test(pw) ? "valid" : "invalid";
    }
    if (reqNumber) {
      reqNumber.className = /\d/.test(pw) ? "valid" : "invalid";
    }
    if (reqSpecial) {
      reqSpecial.className = /[^A-Za-z0-9]/.test(pw) ? "valid" : "invalid";
    }
  }

  /** Sanitizes role input to allowed server values. */
  function normalizeRole(v) {
    const s = (v || "").toLowerCase().trim();
    if (["admin", "staff", "owner"].includes(s)) return s;
    return "staff";
  }

  /** Validates create-user form and returns either message or payload. */
  function validate() {
    clearFeedback();
    const u = (elUsername?.value || "").trim();
    const p = elPassword?.value || "";
    const r = normalizeRole(elRole?.value);

    const pwErrors = validatePassword(p);

    setDanger(elUsername, !u || u.length < 3);
    setDanger(elPassword, pwErrors.length > 0);
    const invalidRole = !elRole || elRole.selectedIndex === 0 || !r;
    setDanger(elRole, invalidRole);

    if (!u || u.length < 3)
      return { ok: false, msg: "Username must be at least 3 characters." };
    if (pwErrors.length)
      return {
        ok: false,
        msg: "Password must contain " + pwErrors.join(", ") + ".",
      };
    if (invalidRole) return { ok: false, msg: "Please choose a role." };

    return { ok: true, data: { username: u, password: p, role: r } };
  }

  elUsername?.addEventListener("input", validate);
  elPassword?.addEventListener("input", (e) => {
    validate();
    updatePasswordRequirements(e.target.value);
  });
  elRole?.addEventListener("change", validate);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = validate();
    if (!v.ok) {
      showFeedback(v.msg, false);
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.classList.add("disableBtn");
    }

    try {
      const resp = await fetch("api/user_create.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(v.data),
      });

      let json = {};
      try {
        json = await resp.json();
      } catch {
        throw new Error("Invalid server response");
      }

      if (!resp.ok || !json.success)
        throw new Error(json.error || `Request failed (HTTP ${resp.status})`);

      showFeedback("User created", true);
      form.reset();
      if (elRole && elRole.options.length) elRole.selectedIndex = 0;
      setDanger(elUsername, false);
      setDanger(elPassword, false);
      setDanger(elRole, false);

      const userSettingForm = document.getElementById("user_setting");
      if (userSettingForm) userSettingForm.style.display = "none";
      loadAllUsers();
      setTimeout(clearFeedback, 1200);
    } catch (err) {
      showFeedback(err.message || "Failed to create user.", false);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.classList.remove("disableBtn");
      }
    }
  });
}

