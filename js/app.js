(function () {
  "use strict";

  const state = {
    people: [],
    selected: new Map()
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const refs = {};

  function bindRefs() {
    [
      "landingScreen",
      "appContent",
      "landingCheckinBtn",
      "landingGuestBtn",
      "landingPickupBtn",
      "landingBackendDot",
      "landingBackendText",
      "homeBtn",
      "backendDot",
      "backendText",
      "searchInput",
      "clearSearchBtn",
      "refreshRosterBtn",
      "resultsList",
      "selectedList",
      "checkinNote",
      "submitCheckinBtn",
      "checkinNotice",
      "guestForm",
      "guestNotice",
      "pickupCodeInput",
      "verifyPickupBtn",
      "pickupNotice",
      "pickupResult",
      "successNames",
      "successCode",
      "newCheckinBtn"
    ].forEach((id) => {
      refs[id] = document.getElementById(id);
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showNotice(el, message, type = "") {
    if (!el) return;
    el.textContent = message;
    el.className = `notice ${type}`.trim();
  }

  function hideNotice(el) {
    if (!el) return;
    el.textContent = "";
    el.className = "notice hidden";
  }

  function setBusy(button, busy, busyLabel = "Working…") {
    if (!button) return;

    if (!button.dataset.defaultLabel) {
      button.dataset.defaultLabel = button.textContent;
    }

    button.disabled = busy;
    button.textContent = busy
      ? busyLabel
      : button.dataset.defaultLabel;
  }

  function switchView(id) {
    $$(".view").forEach((view) => {
      view.classList.remove("active");
    });

    $$(".nav-btn").forEach((button) => {
      button.classList.remove("active");
    });

    document.getElementById(id)?.classList.add("active");

    $(`.nav-btn[data-view="${id}"]`)?.classList.add("active");
  }

  function openApp(id) {
    refs.landingScreen.classList.add("hidden");
    refs.appContent.classList.remove("hidden");

    switchView(id);

    window.scrollTo({ top: 0 });

    setTimeout(() => {
      if (id === "checkinView") {
        refs.searchInput?.focus();
      }

      if (id === "pickupView") {
        refs.pickupCodeInput?.focus();
      }
    }, 120);
  }

  function returnHome() {
    refs.appContent.classList.add("hidden");
    refs.landingScreen.classList.remove("hidden");

    [
      refs.checkinNotice,
      refs.guestNotice,
      refs.pickupNotice
    ].forEach(hideNotice);

    refs.pickupResult.classList.add("hidden");
    refs.pickupResult.innerHTML = "";
    refs.pickupCodeInput.value = "";

    window.scrollTo({ top: 0 });
  }

  async function checkBackend() {
    try {
      const result = await KidsAPI.health();
      const message = result.message || "Backend online";

      refs.backendDot.className = "status-dot online";
      refs.backendText.textContent = message;

      refs.landingBackendDot.className = "status-dot online";
      refs.landingBackendText.textContent = "Check-in service ready";
    } catch (error) {
      refs.backendDot.className = "status-dot offline";
      refs.backendText.textContent = "Backend unavailable";

      refs.landingBackendDot.className = "status-dot offline";
      refs.landingBackendText.textContent =
        "Check-in service unavailable";
    }
  }

  async function loadRoster(force = false) {
    refs.resultsList.innerHTML =
      '<div class="empty">Loading the child roster…</div>';

    setBusy(
      refs.refreshRosterBtn,
      true,
      force ? "Refreshing…" : "Loading…"
    );

    try {
      const result = await KidsAPI.getPeople(force);

      state.people = Array.isArray(result.rows)
        ? result.rows
        : Array.isArray(result.roster)
          ? result.roster
          : [];

      filterRoster();
    } catch (error) {
      refs.resultsList.innerHTML = `
        <div class="empty">
          Unable to load the roster.<br>
          ${escapeHtml(error.message)}
        </div>
      `;
    } finally {
      setBusy(refs.refreshRosterBtn, false);
    }
  }

  function getPrimaryHousehold(person) {
    if (
      !person ||
      !Array.isArray(person.households) ||
      !person.households.length
    ) {
      return null;
    }

    return person.households[0];
  }

  function renderResults(rows) {
    if (!rows.length) {
      refs.resultsList.innerHTML =
        '<div class="empty">No children matched your search.</div>';
      return;
    }

    refs.resultsList.innerHTML = rows
      .map((person) => {
        const selected = state.selected.has(String(person.id));
        const household = getPrimaryHousehold(person);

        const householdName =
          household?.name || "Planning Center household";

        const familyMembers = Array.isArray(household?.members)
          ? household.members
          : [];

        const adults = familyMembers.filter(
          (member) => !member.child
        );

        const adultNames = adults
          .map((adult) => adult.name)
          .filter(Boolean)
          .join(" • ");

        const photo = person.photo || person.photoUrl || "";

        return `
          <article class="person-card">
            <div class="person-card-main">

              ${
                photo
                  ? `
                    <img
                      src="${escapeHtml(photo)}"
                      alt="${escapeHtml(person.name || "Child")}"
                      class="person-photo"
                    >
                  `
                  : ""
              }

              <div>
                <div class="person-name">
                  ${escapeHtml(person.name || "Unnamed child")}
                </div>

                <div class="person-meta">
                  ${escapeHtml(householdName)}
                </div>

                ${
                  adultNames
                    ? `
                      <div class="person-meta">
                        Parent / Guardian: ${escapeHtml(adultNames)}
                      </div>
                    `
                    : ""
                }

                ${
                  person.grade
                    ? `
                      <div class="person-meta">
                        Grade: ${escapeHtml(person.grade)}
                      </div>
                    `
                    : ""
                }
              </div>
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
      })
      .join("");
  }

  function renderSelected() {
    const people = [...state.selected.values()];

    if (!people.length) {
      refs.selectedList.innerHTML =
        '<div class="empty">No children selected.</div>';

      refs.submitCheckinBtn.disabled = true;
      return;
    }

    refs.selectedList.innerHTML = people
      .map((person) => {
        return `
          <div class="selected-child-card">

            <div class="selected-child-header">
              <strong>${escapeHtml(person.name)}</strong>

              <button
                class="btn danger remove-selected"
                type="button"
                data-person-id="${escapeHtml(person.id)}"
                aria-label="Remove ${escapeHtml(person.name)}"
              >
                ×
              </button>
            </div>

            <div class="field selected-service-field">
              <label for="service-${escapeHtml(person.id)}">
                Service / Event
              </label>

              <select
                class="child-service-select"
                id="service-${escapeHtml(person.id)}"
                data-person-id="${escapeHtml(person.id)}"
              >
                <option value="Sunday School"
                  ${
                    (person.service || "Sunday School") === "Sunday School"
                      ? "selected"
                      : ""
                  }>
                  Sunday School
                </option>

                <option value="Children's Church"
                  ${
                    person.service === "Children's Church"
                      ? "selected"
                      : ""
                  }>
                  Children's Church
                </option>

                <option value="Nursery"
                  ${person.service === "Nursery" ? "selected" : ""}>
                  Nursery
                </option>

                <option value="Wednesday Kids"
                  ${
                    person.service === "Wednesday Kids"
                      ? "selected"
                      : ""
                  }>
                  Wednesday Kids
                </option>

                <option value="Other / General"
                  ${
                    person.service === "Other / General"
                      ? "selected"
                      : ""
                  }>
                  Other / General
                </option>
              </select>
            </div>

          </div>
        `;
      })
      .join("");

    refs.submitCheckinBtn.disabled = false;
  }

  function togglePerson(id) {
    id = String(id);

    const person = state.people.find(
      (item) => String(item.id) === id
    );

    if (!person) return;

    if (state.selected.has(id)) {
      state.selected.delete(id);
    } else {
      state.selected.set(
        id,
        Object.assign({}, person, {
          service: person.service || "Sunday School"
        })
      );
    }

    filterRoster();
    renderSelected();
  }

  function filterRoster() {
    const query = refs.searchInput.value
      .trim()
      .toLowerCase();

    const filtered = state.people.filter((person) => {
      const household = getPrimaryHousehold(person);

      const familyNames = Array.isArray(household?.members)
        ? household.members
            .map((member) => member.name || "")
            .join(" ")
        : "";

      const searchable = [
        person.name,
        person.firstName,
        person.lastName,
        person.first_name,
        person.last_name,
        person.grade,
        household?.name,
        familyNames
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });

    renderResults(filtered);
  }

  async function submitSelectedCheckin() {
    const people = [...state.selected.values()].map(
      (person) => ({
        id: String(person.id),
        name: person.name,
        service: person.service || "Sunday School"
      })
    );

    if (!people.length) return;

    hideNotice(refs.checkinNotice);

    setBusy(
      refs.submitCheckinBtn,
      true,
      "Checking In…"
    );

    try {
      const result = await KidsAPI.submitAttendance({
        people,
        children: people,
        noteText: refs.checkinNote.value.trim(),
        note: refs.checkinNote.value.trim(),
        label: "VUMC Kids"
      });

      refs.successNames.textContent = people
        .map((person) => person.name)
        .join(", ");

      refs.successCode.textContent =
        result.pickupCode || "—";

      state.selected.clear();

      refs.checkinNote.value = "";
      refs.searchInput.value = "";

      renderSelected();
      filterRoster();

      switchView("successScreen");
    } catch (error) {
      showNotice(
        refs.checkinNotice,
        error.message,
        "error"
      );
    } finally {
      setBusy(refs.submitCheckinBtn, false);

      refs.submitCheckinBtn.disabled =
        state.selected.size === 0;
    }
  }

  async function submitGuest(event) {
    event.preventDefault();

    hideNotice(refs.guestNotice);

    const childFirst =
      $("#guestChildFirst").value.trim();

    const childLast =
      $("#guestChildLast").value.trim();

    const parentName =
      $("#guestParentName").value.trim();

    const phone =
      $("#guestPhone").value.trim();

    const grade =
      $("#guestGrade").value.trim();

    const room =
      $("#guestRoom").value;

    const notes =
      $("#guestNotes").value.trim();

    if (!childFirst || !parentName || !phone) {
      showNotice(
        refs.guestNotice,
        "Enter the child name, parent or guardian, and mobile number.",
        "error"
      );
      return;
    }

    const fullName = [childFirst, childLast]
      .filter(Boolean)
      .join(" ");

    const noteText = [
      `Guest parent/guardian: ${parentName}`,
      `Mobile: ${phone}`,
      grade ? `Age/grade: ${grade}` : "",
      notes ? `Notes: ${notes}` : ""
    ]
      .filter(Boolean)
      .join("\n");

    const people = [
      {
        id: `guest-${Date.now()}`,
        name: fullName,
        service: room
      }
    ];

    const button =
      refs.guestForm.querySelector(
        'button[type="submit"]'
      );

    setBusy(button, true, "Checking In…");

    try {
      const result =
        await KidsAPI.submitAttendance({
          people,
          children: people,
          noteText,
          note: noteText,
          label: `${room} • Guest`
        });

      refs.successNames.textContent =
        fullName;

      refs.successCode.textContent =
        result.pickupCode || "—";

      refs.guestForm.reset();

      switchView("successScreen");
    } catch (error) {
      showNotice(
        refs.guestNotice,
        error.message,
        "error"
      );
    } finally {
      setBusy(button, false);
    }
  }

  async function verifyPickup() {
    const code =
      refs.pickupCodeInput.value
        .trim()
        .toUpperCase();

    hideNotice(refs.pickupNotice);

    refs.pickupResult.classList.add("hidden");
    refs.pickupResult.innerHTML = "";

    if (code.length !== 4) {
      showNotice(
        refs.pickupNotice,
        "Enter the complete four-character pickup code.",
        "error"
      );
      return;
    }

    setBusy(
      refs.verifyPickupBtn,
      true,
      "Verifying…"
    );

    try {
      const result =
        await KidsAPI.verifyPickupCode(code);

      const record =
        result.record || {};

      const children =
        Array.isArray(record.children)
          ? record.children
          : [];

      refs.pickupResult.innerHTML = `
        <h3>Pickup Verified</h3>

        <p>
          <strong>Children:</strong>
          ${escapeHtml(
            children.join(", ") ||
            "No names returned"
          )}
        </p>

        <p>
          <strong>Code:</strong>
          ${escapeHtml(record.code || code)}
        </p>

        <p>
          <strong>Checked out:</strong>
          ${escapeHtml(
            record.checkedOutAt ||
            "Completed"
          )}
        </p>
      `;

      refs.pickupResult.classList.remove("hidden");

      showNotice(
        refs.pickupNotice,
        result.message ||
        "Pickup code verified.",
        "success"
      );

      refs.pickupCodeInput.value = "";
    } catch (error) {
      showNotice(
        refs.pickupNotice,
        error.message,
        "error"
      );
    } finally {
      setBusy(
        refs.verifyPickupBtn,
        false
      );
    }
  }

  function registerEvents() {
    refs.landingCheckinBtn.onclick =
      () => openApp("checkinView");

    refs.landingGuestBtn.onclick =
      () => openApp("guestView");

    refs.landingPickupBtn.onclick =
      () => openApp("pickupView");

    refs.homeBtn.onclick =
      returnHome;

    $$(".nav-btn").forEach((button) => {
      button.onclick =
        () => switchView(button.dataset.view);
    });

    refs.searchInput.oninput =
      filterRoster;

    refs.clearSearchBtn.onclick = () => {
      refs.searchInput.value = "";
      filterRoster();
      refs.searchInput.focus();
    };

    refs.refreshRosterBtn.onclick =
      () => loadRoster(true);

    refs.resultsList.onclick = (event) => {
      const button =
        event.target.closest(".select-person");

      if (button) {
        togglePerson(
          button.dataset.personId
        );
      }
    };

    refs.selectedList.onclick = (event) => {
      const button =
        event.target.closest(".remove-selected");

      if (button) {
        togglePerson(
          button.dataset.personId
        );
      }
    };

    refs.selectedList.onchange = (event) => {
      const select =
        event.target.closest(
          ".child-service-select"
        );

      if (!select) return;

      const person =
        state.selected.get(
          String(select.dataset.personId)
        );

      if (person) {
        person.service = select.value;
      }
    };

    refs.submitCheckinBtn.onclick =
      submitSelectedCheckin;

    refs.guestForm.onsubmit =
      submitGuest;

    refs.verifyPickupBtn.onclick =
      verifyPickup;

    refs.pickupCodeInput.oninput = () => {
      refs.pickupCodeInput.value =
        refs.pickupCodeInput.value
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
          .slice(0, 4);
    };

    refs.pickupCodeInput.onkeydown =
      (event) => {
        if (event.key === "Enter") {
          verifyPickup();
        }
      };

    refs.newCheckinBtn.onclick =
      returnHome;
  }

  async function init() {
    bindRefs();
    registerEvents();
    renderSelected();

    await Promise.all([
      checkBackend(),
      loadRoster(false)
    ]);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register(
          "./service-worker.js",
          { updateViaCache: "none" }
        )
        .then((registration) =>
          registration.update()
        )
        .catch(() => {});
    }
  }

  document.addEventListener(
    "DOMContentLoaded",
    init
  );
})();
