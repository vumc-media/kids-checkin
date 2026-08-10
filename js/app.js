(function () {
  "use strict";

  const state = {
    people: [],
    households: [],
    selected: new Map(),
    activeLetter: ""
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const refs = {};
  let nextFamilyTimer = null;

  function bindRefs() {
    [
      "landingScreen","appContent","landingCheckinBtn","landingGuestBtn","landingPickupBtn",
      "landingBackendDot","landingBackendText","homeBtn","backendDot","backendText",
      "searchInput","clearSearchBtn","refreshRosterBtn","resultsList","selectedList",
      "submitCheckinBtn","checkinNotice","guestForm","guestNotice","pickupCodeInput",
      "verifyPickupBtn","pickupNotice","pickupResult","successNames","successCode",
      "successEmailStatus","nextFamilyCountdown","newCheckinBtn"
    ].forEach((id) => refs[id] = document.getElementById(id));
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
    if (!button.dataset.defaultLabel) button.dataset.defaultLabel = button.textContent;
    button.disabled = busy;
    button.textContent = busy ? busyLabel : button.dataset.defaultLabel;
  }

  function switchView(id) {
    $$(".view").forEach((view) => view.classList.remove("active"));
    $$(".nav-btn").forEach((button) => button.classList.remove("active"));
    document.getElementById(id)?.classList.add("active");
    $(`.nav-btn[data-view="${id}"]`)?.classList.add("active");
  }

  function openApp(id) {
    refs.landingScreen.classList.add("hidden");
    refs.appContent.classList.remove("hidden");
    switchView(id);
    window.scrollTo({ top: 0 });
    setTimeout(() => {
      if (id === "checkinView") refs.searchInput?.focus();
      if (id === "pickupView") refs.pickupCodeInput?.focus();
    }, 120);
  }

  function clearNextFamilyTimer() {
    if (nextFamilyTimer) {
      clearInterval(nextFamilyTimer);
      nextFamilyTimer = null;
    }
  }

  function resetCheckinState() {
    state.selected.clear();
    state.activeLetter = "";
    refs.searchInput.value = "";
    hideNotice(refs.checkinNotice);
    renderSelected();
    filterRoster();
  }

  function prepareNextFamily() {
    clearNextFamilyTimer();
    resetCheckinState();
    refs.appContent.classList.remove("hidden");
    refs.landingScreen.classList.add("hidden");
    switchView("checkinView");
    window.scrollTo({ top: 0 });
    setTimeout(() => refs.searchInput?.focus(), 100);
  }

  function startNextFamilyCountdown() {
    clearNextFamilyTimer();
    let seconds = 8;

    const paint = () => {
      if (refs.nextFamilyCountdown) {
        refs.nextFamilyCountdown.textContent =
          `Ready for the next family in ${seconds} second${seconds === 1 ? "" : "s"}…`;
      }
    };

    paint();

    nextFamilyTimer = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        clearNextFamilyTimer();
        prepareNextFamily();
        return;
      }
      paint();
    }, 1000);
  }

  function returnHome() {
    clearNextFamilyTimer();
    refs.appContent.classList.add("hidden");
    refs.landingScreen.classList.remove("hidden");
    [refs.checkinNotice, refs.guestNotice, refs.pickupNotice].forEach(hideNotice);
    refs.pickupResult.classList.add("hidden");
    refs.pickupResult.innerHTML = "";
    refs.pickupCodeInput.value = "";
    resetCheckinState();
    window.scrollTo({ top: 0 });
  }

  async function checkBackend() {
    try {
      const result = await KidsAPI.health();
      refs.backendDot.className = "status-dot online";
      refs.backendText.textContent = result.message || "Backend online";
      refs.landingBackendDot.className = "status-dot online";
      refs.landingBackendText.textContent = "Check-in service ready";
    } catch (_) {
      refs.backendDot.className = "status-dot offline";
      refs.backendText.textContent = "Backend unavailable";
      refs.landingBackendDot.className = "status-dot offline";
      refs.landingBackendText.textContent = "Check-in service unavailable";
    }
  }

  function personName(person) {
    if (!person) return "";
    return (
      person.name ||
      [person.firstName || person.first_name, person.lastName || person.last_name]
        .filter(Boolean).join(" ")
    ).trim();
  }

  function personLastName(person) {
    return String(
      person?.lastName ||
      person?.last_name ||
      personName(person).split(" ").slice(-1)[0] ||
      ""
    ).trim();
  }

  function buildHouseholdIndex() {
    const households = new Map();
    const eligibleChildren = new Map(
      state.people.map((person) => [String(person.id), person])
    );

    state.people.forEach((person) => {
      const personHouseholds = Array.isArray(person.households) ? person.households : [];

      if (!personHouseholds.length) {
        const fallbackId = `person-${String(person.id)}`;
        if (!households.has(fallbackId)) {
          households.set(fallbackId, {
            id: fallbackId,
            name: `${personLastName(person) || "Unknown"} Household`,
            adults: [],
            children: [person]
          });
        }
        return;
      }

      personHouseholds.forEach((household) => {
        const id = String(household.id || `household-${personLastName(person)}`);
        if (!households.has(id)) {
          households.set(id, {
            id,
            name: household.name || `${personLastName(person)} Household`,
            adults: [],
            children: []
          });
        }

        const family = households.get(id);
        const members = Array.isArray(household.members) ? household.members : [];

        members.forEach((member) => {
          const memberId = String(member.id || "");
          if (member.child) {
            const eligibleChild = eligibleChildren.get(memberId);
            if (
              eligibleChild &&
              !family.children.some((child) => String(child.id) === memberId)
            ) {
              family.children.push(eligibleChild);
            }
          } else if (
            memberId &&
            !family.adults.some((adult) => String(adult.id) === memberId)
          ) {
            family.adults.push({ id: memberId, name: personName(member) });
          }
        });

        const currentId = String(person.id);
        if (!family.children.some((child) => String(child.id) === currentId)) {
          family.children.push(person);
        }
      });
    });

    state.households = [...households.values()]
      .filter((household) => household.children.length)
      .map((household) => ({
        ...household,
        adults: household.adults
          .filter((adult) => adult.name)
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
        children: household.children
          .sort((a, b) => personName(a).localeCompare(personName(b), undefined, { sensitivity: "base" }))
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  async function loadRoster(force = false) {
    refs.resultsList.innerHTML = '<div class="empty">Loading families…</div>';
    setBusy(refs.refreshRosterBtn, true, force ? "Refreshing…" : "Loading…");

    try {
      const result = await KidsAPI.getPeople(force);
      state.people = Array.isArray(result.rows)
        ? result.rows
        : Array.isArray(result.roster) ? result.roster : [];
      buildHouseholdIndex();
      filterRoster();
    } catch (error) {
      refs.resultsList.innerHTML = `
        <div class="empty">Unable to load the roster.<br>${escapeHtml(error.message)}</div>
      `;
    } finally {
      setBusy(refs.refreshRosterBtn, false);
    }
  }

  function renderAlphabet() {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    return `
      <div class="alphabet-filter">
        ${letters.map((letter) => `
          <button
            type="button"
            class="letter-filter ${state.activeLetter === letter ? "active" : ""}"
            data-letter="${letter}"
          >${letter}</button>
        `).join("")}
      </div>
    `;
  }

  function renderSearchPrompt() {
    refs.resultsList.innerHTML = `
      ${renderAlphabet()}
      <div class="empty household-search-prompt">
        Select the first letter of the family's last name, or begin typing above.
      </div>
    `;
  }

  function householdSearchText(household) {
    return [
      household.name,
      ...household.adults.map((adult) => adult.name),
      ...household.children.map((child) => personName(child))
    ].filter(Boolean).join(" ").toLowerCase();
  }

  function isHouseholdLoaded(household) {
    return household.children.some((child) => state.selected.has(String(child.id)));
  }

  function renderHouseholds(households) {
    if (!households.length) {
      refs.resultsList.innerHTML = `${renderAlphabet()}<div class="empty">No families matched your search.</div>`;
      return;
    }

    refs.resultsList.innerHTML = `
      ${renderAlphabet()}
      <div class="household-results">
        ${households.map((household) => {
          const loaded = isHouseholdLoaded(household);
          const adultNames = household.adults.map((adult) => adult.name).filter(Boolean);
          const childNames = household.children.map((child) => personName(child)).filter(Boolean);

          return `
            <article class="household-card">
              <div class="household-card-content">
                <div class="household-name">${escapeHtml(household.name)}</div>
                ${adultNames.length ? `
                  <div class="household-section">
                    <span class="household-label">Parent / Guardian</span>
                    <span>${escapeHtml(adultNames.join(" • "))}</span>
                  </div>` : ""}
                <div class="household-section">
                  <span class="household-label">Children</span>
                  <span>${escapeHtml(childNames.join(" • "))}</span>
                </div>
              </div>

              <button
                type="button"
                class="btn ${loaded ? "danger" : "primary"} select-household"
                data-household-id="${escapeHtml(household.id)}"
              >
                ${loaded ? "Remove Household" : "Select Household"}
              </button>
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function filterRoster() {
    const query = refs.searchInput.value.trim().toLowerCase();

    if (!query && !state.activeLetter) {
      renderSearchPrompt();
      return;
    }

    let filtered = state.households;

    if (state.activeLetter) {
      filtered = filtered.filter((household) => {
        const familyName = household.name.replace(/\s+Household$/i, "").trim();
        return familyName.toUpperCase().startsWith(state.activeLetter);
      });
    }

    if (query) {
      filtered = filtered.filter((household) =>
        householdSearchText(household).includes(query)
      );
    }

    renderHouseholds(filtered);
  }

  function toggleHousehold(householdId) {
    const household = state.households.find(
      (item) => String(item.id) === String(householdId)
    );
    if (!household) return;

    const loaded = isHouseholdLoaded(household);

    if (loaded) {
      household.children.forEach((child) => state.selected.delete(String(child.id)));
    } else {
      household.children.forEach((child) => {
        const id = String(child.id);
        state.selected.set(id, {
          ...child,
          name: personName(child),
          service: child.service || "Sunday School",
          note: "",
          present: false
        });
      });
    }

    renderSelected();
    filterRoster();
  }

  function presentChildren() {
    return [...state.selected.values()].filter((person) => person.present);
  }

  function updateSubmitState() {
    refs.submitCheckinBtn.disabled = presentChildren().length === 0;
  }

  function renderSelected() {
    const people = [...state.selected.values()];

    if (!people.length) {
      refs.selectedList.innerHTML = '<div class="empty">No family selected.</div>';
      refs.submitCheckinBtn.disabled = true;
      return;
    }

    refs.selectedList.innerHTML = people
      .sort((a, b) => personName(a).localeCompare(personName(b), undefined, { sensitivity: "base" }))
      .map((person) => {
        const id = escapeHtml(person.id);
        const present = !!person.present;

        return `
          <div class="selected-child-card ${present ? "" : "absent"}" data-child-card="${id}">
            <div class="selected-child-header">
              <div class="selected-child-title">
                <label class="present-check">
                  <input
                    type="checkbox"
                    class="child-present-check"
                    data-person-id="${id}"
                    ${present ? "checked" : ""}
                  >
                  <span>Present</span>
                </label>
                <strong>${escapeHtml(personName(person))}</strong>
              </div>

              <button
                class="btn danger remove-selected"
                type="button"
                data-person-id="${id}"
                aria-label="Remove ${escapeHtml(personName(person))}"
              >×</button>
            </div>

            <div class="child-fields ${present ? "" : "inactive"}">
              <div class="field">
                <label for="service-${id}">Service / Event</label>
                <select
                  class="child-service-select"
                  id="service-${id}"
                  data-person-id="${id}"
                >
                  ${["Sunday School","Children's Church","Nursery","Wednesday Kids","Other / General"]
                    .map((option) => `
                      <option value="${escapeHtml(option)}" ${person.service === option ? "selected" : ""}>
                        ${escapeHtml(option)}
                      </option>
                    `).join("")}
                </select>
              </div>

              <div class="field child-note">
                <label for="note-${id}">Allergies / Notes</label>
                <textarea
                  id="note-${id}"
                  class="child-note-input"
                  data-person-id="${id}"
                  rows="2"
                  placeholder="Allergy, medical note, room note, or other information"
                >${escapeHtml(person.note || "")}</textarea>
              </div>
            </div>
          </div>
        `;
      }).join("");

    updateSubmitState();
  }

  function removeSelectedPerson(id) {
    state.selected.delete(String(id));
    renderSelected();
    filterRoster();
  }

  async function submitSelectedCheckin() {
    const people = presentChildren().map((person) => ({
      id: String(person.id),
      name: personName(person),
      service: person.service || "Sunday School",
      note: String(person.note || "").trim()
    }));

    if (!people.length) return;

    hideNotice(refs.checkinNotice);
    setBusy(refs.submitCheckinBtn, true, "Checking In…");

    try {
      const aggregateNote = people
        .filter((person) => person.note)
        .map((person) => `${person.name}: ${person.note}`)
        .join(" | ");

      const result = await KidsAPI.submitAttendance({
        people,
        children: people,
        noteText: aggregateNote,
        note: aggregateNote
      });

      refs.successNames.textContent = people.map((person) => person.name).join(", ");
      refs.successCode.textContent = result.pickupCode || "—";

      if (refs.successEmailStatus) {
        refs.successEmailStatus.textContent = result.emailSent
          ? `Pickup code emailed${result.parentName ? ` to ${result.parentName}` : ""}.`
          : "Pickup email was not sent. Please give the parent the code shown above.";
        refs.successEmailStatus.style.color = result.emailSent ? "" : "#9d2634";
      }

      switchView("successScreen");
      startNextFamilyCountdown();
    } catch (error) {
      showNotice(refs.checkinNotice, error.message, "error");
    } finally {
      setBusy(refs.submitCheckinBtn, false);
      updateSubmitState();
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

    const people = [{
      id: `guest-${Date.now()}`,
      name: fullName,
      service: room,
      note: notes
    }];

    const button = refs.guestForm.querySelector('button[type="submit"]');
    setBusy(button, true, "Checking In…");

    try {
      const result = await KidsAPI.submitAttendance({
        people,
        children: people,
        noteText,
        note: noteText
      });

      refs.successNames.textContent = fullName;
      refs.successCode.textContent = result.pickupCode || "—";

      if (refs.successEmailStatus) {
        refs.successEmailStatus.textContent = result.emailSent
          ? "Pickup code emailed to parent."
          : "Pickup email was not sent. Please give the parent the code shown above.";
        refs.successEmailStatus.style.color = result.emailSent ? "" : "#9d2634";
      }

      refs.guestForm.reset();
      switchView("successScreen");
      startNextFamilyCountdown();
    } catch (error) {
      showNotice(refs.guestNotice, error.message, "error");
    } finally {
      setBusy(button, false);
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
      const result = await KidsAPI.verifyPickupCode(code);
      const record = result.record || {};
      const children = Array.isArray(record.children) ? record.children : [];

      refs.pickupResult.innerHTML = `
        <h3>Pickup Verified</h3>
        <p><strong>Children:</strong> ${escapeHtml(children.join(", ") || "Pickup completed")}</p>
        <p><strong>Code:</strong> ${escapeHtml(record.code || code)}</p>
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
    refs.landingCheckinBtn.onclick = () => openApp("checkinView");
    refs.landingGuestBtn.onclick = () => openApp("guestView");
    refs.landingPickupBtn.onclick = () => openApp("pickupView");
    refs.homeBtn.onclick = returnHome;

    $$(".nav-btn").forEach((button) => {
      button.onclick = () => {
        clearNextFamilyTimer();
        switchView(button.dataset.view);
      };
    });

    refs.searchInput.oninput = () => {
      state.activeLetter = "";
      filterRoster();
    };

    refs.clearSearchBtn.onclick = () => {
      refs.searchInput.value = "";
      state.activeLetter = "";
      filterRoster();
      refs.searchInput.focus();
    };

    refs.refreshRosterBtn.onclick = () => loadRoster(true);

    refs.resultsList.onclick = (event) => {
      const letterButton = event.target.closest(".letter-filter");
      if (letterButton) {
        const letter = letterButton.dataset.letter;
        state.activeLetter = state.activeLetter === letter ? "" : letter;
        refs.searchInput.value = "";
        filterRoster();
        return;
      }

      const householdButton = event.target.closest(".select-household");
      if (householdButton) toggleHousehold(householdButton.dataset.householdId);
    };

    refs.selectedList.onclick = (event) => {
      const button = event.target.closest(".remove-selected");
      if (button) removeSelectedPerson(button.dataset.personId);
    };

    refs.selectedList.onchange = (event) => {
      const presentCheck = event.target.closest(".child-present-check");
      if (presentCheck) {
        const id = String(presentCheck.dataset.personId);
        const person = state.selected.get(id);
        if (person) {
          person.present = presentCheck.checked;
          renderSelected();
        }
        return;
      }

      const select = event.target.closest(".child-service-select");
      if (select) {
        const person = state.selected.get(String(select.dataset.personId));
        if (person) person.service = select.value;
      }
    };

    refs.selectedList.oninput = (event) => {
      const note = event.target.closest(".child-note-input");
      if (!note) return;
      const person = state.selected.get(String(note.dataset.personId));
      if (person) person.note = note.value;
    };

    refs.submitCheckinBtn.onclick = submitSelectedCheckin;
    refs.guestForm.onsubmit = submitGuest;
    refs.verifyPickupBtn.onclick = verifyPickup;

    refs.pickupCodeInput.oninput = () => {
      refs.pickupCodeInput.value = refs.pickupCodeInput.value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 4);
    };

    refs.pickupCodeInput.onkeydown = (event) => {
      if (event.key === "Enter") verifyPickup();
    };

    refs.newCheckinBtn.onclick = prepareNextFamily;
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
        .register("./service-worker.js", { updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => {});
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
