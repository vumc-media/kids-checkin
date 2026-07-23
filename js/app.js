(function () {
  "use strict";

  const state = {
    people: [],
    selected: new Map()
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const refs = {
    landingScreen: $("#landingScreen"),
    appContent: $("#appContent"),
    landingCheckinBtn: $("#landingCheckinBtn"),
    landingGuestBtn: $("#landingGuestBtn"),
    landingPickupBtn: $("#landingPickupBtn"),
    landingBackendDot: $("#landingBackendDot"),
    landingBackendText: $("#landingBackendText"),
    homeBtn: $("#homeBtn"),
    backendDot: $("#backendDot"),
    backendText: $("#backendText"),
    searchInput: $("#searchInput"),
    serviceSelect: $("#serviceSelect"),
    clearSearchBtn: $("#clearSearchBtn"),
    refreshRosterBtn: $("#refreshRosterBtn"),
    resultsList: $("#resultsList"),
    selectedList: $("#selectedList"),
    checkinNote: $("#checkinNote"),
    submitCheckinBtn: $("#submitCheckinBtn"),
    checkinNotice: $("#checkinNotice"),
    guestForm: $("#guestForm"),
    guestNotice: $("#guestNotice"),
    pickupCodeInput: $("#pickupCodeInput"),
    verifyPickupBtn: $("#verifyPickupBtn"),
    pickupNotice: $("#pickupNotice"),
    pickupResult: $("#pickupResult"),
    successNames: $("#successNames"),
    successCode: $("#successCode"),
    newCheckinBtn: $("#newCheckinBtn")
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showNotice(element, message, type = "") {
    element.textContent = message;
    element.className = `notice ${type}`.trim();
  }

  function hideNotice(element) {
    element.textContent = "";
    element.className = "notice hidden";
  }

  function setBusy(button, busy, busyLabel) {
    if (!button.dataset.defaultLabel) {
      button.dataset.defaultLabel = button.textContent;
    }

    button.disabled = busy;
    button.textContent = busy ? busyLabel : button.dataset.defaultLabel;
  }

  function switchView(viewId) {
    $$(".view").forEach((view) => view.classList.remove("active"));
    $$(".nav-btn").forEach((button) => button.classList.remove("active"));

    const view = document.getElementById(viewId);
    if (view) view.classList.add("active");

    const navButton = $(`.nav-btn[data-view="${viewId}"]`);
    if (navButton) navButton.classList.add("active");
  }

  function openApp(viewId) {
    refs.landingScreen.classList.add("hidden");
    refs.appContent.classList.remove("hidden");
    switchView(viewId);
    window.scrollTo({ top: 0, behavior: "auto" });

    window.setTimeout(() => {
      if (viewId === "checkinView") refs.searchInput.focus();
      if (viewId === "pickupView") refs.pickupCodeInput.focus();
    }, 120);
  }

  function returnHome() {
    refs.appContent.classList.add("hidden");
    refs.landingScreen.classList.remove("hidden");

    hideNotice(refs.checkinNotice);
    hideNotice(refs.guestNotice);
    hideNotice(refs.pickupNotice);

    refs.pickupResult.classList.add("hidden");
    refs.pickupResult.innerHTML = "";
    refs.pickupCodeInput.value = "";
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  async function checkBackend() {
    try {
      const result = await window.KidsAPI.health();
      const message = result.message || "Backend online";

      refs.backendDot.className = "status-dot online";
      refs.backendText.textContent = message;
      refs.landingBackendDot.className = "status-dot online";
      refs.landingBackendText.textContent = "Check-in service ready";
    } catch (error) {
      refs.backendDot.className = "status-dot offline";
      refs.backendText.textContent = "Backend unavailable";
      refs.landingBackendDot.className = "status-dot offline";
      refs.landingBackendText.textContent = "Check-in service unavailable";
    }
  }

  async function loadRoster(forceRefresh = false) {
    refs.resultsList.innerHTML = '<div class="empty">Loading the child roster…</div>';
    setBusy(refs.refreshRosterBtn, true, "Refreshing…");

    try {
      const result = await window.KidsAPI.getPeople(forceRefresh);
      state.people = Array.isArray(result.rows) ? result.rows : [];
      renderResults(state.people);
    } catch (error) {
      refs.resultsList.innerHTML =
        `<div class="empty">Unable to load the roster.<br>${escapeHtml(error.message)}</div>`;
    } finally {
      setBusy(refs.refreshRosterBtn, false);
    }
  }

  function renderResults(rows) {
    if (!rows.length) {
      refs.resultsList.innerHTML =
        '<div class="empty">No children matched your search.</div>';
      return;
    }

    refs.resultsList.innerHTML = rows.map((person) => {
      const selected = state.selected.has(String(person.id));
      const meta = [person.grade, person.phone].filter(Boolean).join(" • ");

      return `
        <article class="person-card">
          <div>
            <div class="person-name">${escapeHtml(person.name || "Unnamed child")}</div>
            <div class="person-meta">${escapeHtml(meta || "Planning Center child record")}</div>
          </div>
          <button
            class="btn ${selected ? "danger" : "primary"} select-person"
            type="button"
            data-person-id="${escapeHtml(person.id)}"
          >
            ${selected ? "Remove" : "Select"}
          </button>
        </article>
      `;
    }).join("");
  }

  function renderSelected() {
    const people = [...state.selected.values()];

    if (!people.length) {
      refs.selectedList.innerHTML =
        '<div class="empty">No children selected.</div>';
      refs.submitCheckinBtn.disabled = true;
      return;
    }

    refs.selectedList.innerHTML = people.map((person) => `
      <div class="selected-chip">
        <span>${escapeHtml(person.name)}</span>
        <button
          class="btn danger remove-selected"
          type="button"
          data-person-id="${escapeHtml(person.id)}"
          aria-label="Remove ${escapeHtml(person.name)}"
        >×</button>
      </div>
    `).join("");

    refs.submitCheckinBtn.disabled = false;
  }

  function togglePerson(personId) {
    const id = String(personId);
    const person = state.people.find((item) => String(item.id) === id);

    if (!person) return;

    if (state.selected.has(id)) {
      state.selected.delete(id);
    } else {
      state.selected.set(id, person);
    }

    filterRoster();
    renderSelected();
  }

  function filterRoster() {
    const query = refs.searchInput.value.trim().toLowerCase();

    const filtered = state.people.filter((person) => {
      const haystack = [
        person.name,
        person.first_name,
        person.last_name,
        person.grade,
        person.phone
      ].join(" ").toLowerCase();

      return haystack.includes(query);
    });

    renderResults(filtered);
  }

  async function submitSelectedCheckin() {
    const selectedPeople = [...state.selected.values()].map((person) => ({
      id: String(person.id),
      name: person.name
    }));

    if (!selectedPeople.length) return;

    hideNotice(refs.checkinNotice);
    setBusy(refs.submitCheckinBtn, true, "Submitting…");

    try {
      const result = await window.KidsAPI.submitAttendance({
        people: selectedPeople,
        noteText: refs.checkinNote.value.trim(),
        label: refs.serviceSelect.value
      });

      refs.successNames.textContent =
        selectedPeople.map((person) => person.name).join(", ");
      refs.successCode.textContent = result.pickupCode || "—";

      state.selected.clear();
      refs.checkinNote.value = "";
      refs.searchInput.value = "";
      renderSelected();
      renderResults(state.people);
      switchView("successScreen");
    } catch (error) {
      showNotice(refs.checkinNotice, error.message, "error");
    } finally {
      setBusy(refs.submitCheckinBtn, false);
      refs.submitCheckinBtn.disabled = state.selected.size === 0;
    }
  }

  async function submitGuest(event) {
    event.preventDefault();
    hideNotice(refs.guestNotice);

    const childFirst = $("#guestChildFirst").value.trim();
    const childLast = $("#guestChildLast").value.trim();
    const parentName = $("#guestParentName").value.trim();
    const phone = $("#guestPhone").value.trim();
    const grade = $("#guestGrade").value.trim();
    const room = $("#guestRoom").value;
    const notes = $("#guestNotes").value.trim();

    if (!childFirst || !parentName || !phone) {
      showNotice(
        refs.guestNotice,
        "Enter the child name, parent or guardian, and mobile number.",
        "error"
      );
      return;
    }

    const fullName = [childFirst, childLast].filter(Boolean).join(" ");
    const noteText = [
      `Guest parent/guardian: ${parentName}`,
      `Mobile: ${phone}`,
      grade ? `Age/grade: ${grade}` : "",
      notes ? `Notes: ${notes}` : ""
    ].filter(Boolean).join("\n");

    const submitButton = refs.guestForm.querySelector('button[type="submit"]');
    setBusy(submitButton, true, "Submitting…");

    try {
      const result = await window.KidsAPI.submitAttendance({
        people: [{ id: `guest-${Date.now()}`, name: fullName }],
        noteText,
        label: `${room} • Guest`
      });

      refs.successNames.textContent = fullName;
      refs.successCode.textContent = result.pickupCode || "—";
      refs.guestForm.reset();
      switchView("successScreen");
    } catch (error) {
      showNotice(refs.guestNotice, error.message, "error");
    } finally {
      setBusy(submitButton, false);
    }
  }

  async function verifyPickup() {
    const code = refs.pickupCodeInput.value.trim().toUpperCase();

    hideNotice(refs.pickupNotice);
    refs.pickupResult.classList.add("hidden");
    refs.pickupResult.innerHTML = "";

    if (code.length !== 4) {
      showNotice(refs.pickupNotice, "Enter the complete four-character pickup code.", "error");
      return;
    }

    setBusy(refs.verifyPickupBtn, true, "Verifying…");

    try {
      const result = await window.KidsAPI.verifyPickupCode(code);
      const record = result.record || {};
      const children = Array.isArray(record.children) ? record.children : [];

      refs.pickupResult.innerHTML = `
        <h3>Pickup Verified</h3>
        <p><strong>Children:</strong> ${escapeHtml(children.join(", ") || "No names returned")}</p>
        <p><strong>Code:</strong> ${escapeHtml(record.code || code)}</p>
        <p><strong>Checked out:</strong> ${escapeHtml(record.checkedOutAt || "Completed")}</p>
      `;
      refs.pickupResult.classList.remove("hidden");
      showNotice(refs.pickupNotice, result.message || "Pickup code verified.", "success");
      refs.pickupCodeInput.value = "";
    } catch (error) {
      showNotice(refs.pickupNotice, error.message, "error");
    } finally {
      setBusy(refs.verifyPickupBtn, false);
    }
  }

  function registerEvents() {
    refs.landingCheckinBtn.addEventListener("click", () => openApp("checkinView"));
    refs.landingGuestBtn.addEventListener("click", () => openApp("guestView"));
    refs.landingPickupBtn.addEventListener("click", () => openApp("pickupView"));
    refs.homeBtn.addEventListener("click", returnHome);

    $$(".nav-btn").forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.view));
    });

    refs.searchInput.addEventListener("input", filterRoster);

    refs.clearSearchBtn.addEventListener("click", () => {
      refs.searchInput.value = "";
      filterRoster();
      refs.searchInput.focus();
    });

    refs.refreshRosterBtn.addEventListener("click", () => loadRoster(true));

    refs.resultsList.addEventListener("click", (event) => {
      const button = event.target.closest(".select-person");
      if (button) togglePerson(button.dataset.personId);
    });

    refs.selectedList.addEventListener("click", (event) => {
      const button = event.target.closest(".remove-selected");
      if (button) togglePerson(button.dataset.personId);
    });

    refs.submitCheckinBtn.addEventListener("click", submitSelectedCheckin);
    refs.guestForm.addEventListener("submit", submitGuest);
    refs.verifyPickupBtn.addEventListener("click", verifyPickup);

    refs.pickupCodeInput.addEventListener("input", () => {
      refs.pickupCodeInput.value = refs.pickupCodeInput.value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 4);
    });

    refs.pickupCodeInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") verifyPickup();
    });

    refs.newCheckinBtn.addEventListener("click", returnHome);
  }

  async function init() {
    registerEvents();
    await Promise.all([checkBackend(), loadRoster(false)]);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
