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


  /* ============================================================
     ELEMENT REFERENCES
     ============================================================ */

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
      "successEmailStatus",
      "nextFamilyCountdown",
      "newCheckinBtn"
    ].forEach((id) => {
      refs[id] = document.getElementById(id);
    });
  }


  /* ============================================================
     GENERAL HELPERS
     ============================================================ */

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

    button.textContent =
      busy
        ? busyLabel
        : button.dataset.defaultLabel;
  }


  /* ============================================================
     VIEW MANAGEMENT
     ============================================================ */

  function switchView(id) {

    $$(".view").forEach((view) => {
      view.classList.remove("active");
    });

    $$(".nav-btn").forEach((button) => {
      button.classList.remove("active");
    });

    document
      .getElementById(id)
      ?.classList
      .add("active");

    $(`.nav-btn[data-view="${id}"]`)
      ?.classList
      .add("active");
  }


  function openApp(id) {

    refs.landingScreen
      .classList
      .add("hidden");

    refs.appContent
      .classList
      .remove("hidden");

    switchView(id);

    window.scrollTo({
      top: 0
    });

    setTimeout(() => {

      if (id === "checkinView") {
        refs.searchInput?.focus();
      }

      if (id === "guestView") {
        $("#guestChildFirst")?.focus();
      }

      if (id === "pickupView") {
        refs.pickupCodeInput?.focus();
      }

    }, 120);
  }


  /* ============================================================
     NEXT FAMILY / RESET
     ============================================================ */

  function clearNextFamilyTimer() {

    if (nextFamilyTimer) {

      clearInterval(
        nextFamilyTimer
      );

      nextFamilyTimer = null;
    }
  }


  function resetCheckinState() {

    state.selected.clear();
    state.requestSignature = null;
    state.requestId = null;
    window.KidsPrinter?.reset();

    state.activeLetter = "";

    if (refs.searchInput) {
      refs.searchInput.value = "";
    }

    hideNotice(
      refs.checkinNotice
    );

    renderSelected();

    filterRoster();
  }


  function prepareNextFamily() {

    clearNextFamilyTimer();

    resetCheckinState();

    refs.appContent
      .classList
      .remove("hidden");

    refs.landingScreen
      .classList
      .add("hidden");

    switchView(
      "checkinView"
    );

    window.scrollTo({
      top: 0
    });

    setTimeout(() => {
      refs.searchInput?.focus();
    }, 100);
  }


  function startNextFamilyCountdown() {

    clearNextFamilyTimer();

    let seconds = 8;

    const paint = () => {

      if (!refs.nextFamilyCountdown) {
        return;
      }

      refs.nextFamilyCountdown.textContent =
        `Ready for the next family in ${seconds} second${seconds === 1 ? "" : "s"}…`;
    };

    paint();

    nextFamilyTimer =
      setInterval(() => {

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

    /*
     * Remove ?view=pickup when the
     * user intentionally returns Home.
     */

    const homeUrl =
      new URL(
        window.location.href
      );

    homeUrl
      .searchParams
      .delete("view");

    window.history.replaceState(
      {},
      "",
      homeUrl.pathname +
        homeUrl.search +
        homeUrl.hash
    );

    refs.appContent
      .classList
      .add("hidden");

    refs.landingScreen
      .classList
      .remove("hidden");

    [
      refs.checkinNotice,
      refs.guestNotice,
      refs.pickupNotice
    ].forEach(
      hideNotice
    );

    if (refs.pickupResult) {

      refs.pickupResult
        .classList
        .add("hidden");

      refs.pickupResult.innerHTML =
        "";
    }

    if (refs.pickupCodeInput) {

      refs.pickupCodeInput.value =
        "";
    }

    resetCheckinState();

    window.scrollTo({
      top: 0
    });
  }


  /* ============================================================
     BACKEND STATUS
     ============================================================ */

  async function checkBackend() {

    try {

      const result =
        await KidsAPI.health();

      refs.backendDot.className =
        "status-dot online";

      refs.backendText.textContent =
        result.message ||
        "Backend online";

      refs.landingBackendDot.className =
        "status-dot online";

      refs.landingBackendText.textContent =
        "Check-in service ready";

    } catch (_) {

      refs.backendDot.className =
        "status-dot offline";

      refs.backendText.textContent =
        "Backend unavailable";

      refs.landingBackendDot.className =
        "status-dot offline";

      refs.landingBackendText.textContent =
        "Check-in service unavailable";
    }
  }


  /* ============================================================
     PERSON HELPERS
     ============================================================ */

  function personName(person) {

    if (!person) {
      return "";
    }

    return (
      person.name ||
      [
        person.firstName ||
          person.first_name,

        person.lastName ||
          person.last_name
      ]
        .filter(Boolean)
        .join(" ")
    ).trim();
  }


  function personLastName(person) {

    return String(

      person?.lastName ||

      person?.last_name ||

      personName(person)
        .split(" ")
        .slice(-1)[0] ||

      ""

    ).trim();
  }


  /* ============================================================
     HOUSEHOLD INDEX
     ============================================================ */

  function buildHouseholdIndex() {
    const families = new Map();
    for (const person of state.people) {
      const homes = person.households?.length ? person.households : [{ id: `person-${person.id}`, name: personName(person) }];
      for (const home of homes) {
        const id = String(home.id);
        if (!families.has(id)) families.set(id, { id, name: home.name || `${personLastName(person)} Household`, adults: [], children: [] });
        const family = families.get(id);
        const members = person.child ? family.children : family.adults;
        if (!members.some(member => String(member.id) === String(person.id))) members.push(person);
      }
    }
    state.households = [...families.values()].map(family => ({ ...family,
      adults: family.adults.sort((a,b) => personName(a).localeCompare(personName(b))),
      children: family.children.sort((a,b) => personName(a).localeCompare(personName(b)))
    })).sort((a,b) => a.name.localeCompare(b.name));
  }

  async function loadRoster(force = false) {
    refs.resultsList.innerHTML = '<div class="empty">Loading families…</div>';
    setBusy(refs.refreshRosterBtn, true, force ? "Refreshing…" : "Loading…");
    try {
      const result = await KidsAPI.getPeople(force);
      if (result.rosterSchema !== "family-v1") throw new Error("The family check-in backend needs to be updated. Please ask a staff member.");
      state.people = result.rows.filter(person => person.status === "active" && typeof person.child === "boolean");
      // A refresh must not leave an inactive or removed person selected.
      const activePeople = new Map(state.people.map(p => [String(p.id), p]));
      for (const [id, selected] of state.selected) {
        if (!activePeople.has(id)) state.selected.delete(id);
        else state.selected.set(id, { ...selected, ...activePeople.get(id) });
      }
      buildHouseholdIndex(); renderSelected(); filterRoster();
    } catch (error) {
      state.people = []; state.households = []; state.selected.clear(); renderSelected();
      refs.resultsList.innerHTML = `<div class="empty">Unable to load the roster.<br>${escapeHtml(error.message)}</div>`;
    } finally { setBusy(refs.refreshRosterBtn, false); }
  }

  function renderAlphabet() {

    const letters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        .split("");

    return `
      <div class="alphabet-filter">

        ${
          letters.map(
            (letter) => `

              <button

                type="button"

                class="letter-filter ${
                  state.activeLetter ===
                  letter

                    ? "active"

                    : ""
                }"

                data-letter="${letter}"

              >

                ${letter}

              </button>

            `
          ).join("")
        }

      </div>
    `;
  }


  function renderSearchPrompt() {

    refs.resultsList.innerHTML =
      `
        ${renderAlphabet()}

        <div
          class="empty household-search-prompt"
        >
          Select the first letter of the family's last name,
          or begin typing above.
        </div>
      `;
  }


  function householdSearchText(
    household
  ) {

    return [

      household.name,

      ...household.adults.map(
        (adult) =>
          adult.name
      ),

      ...household.children.map(
        (child) =>
          personName(child)
      )

    ]

      .filter(Boolean)

      .join(" ")

      .toLowerCase();
  }


  function isHouseholdLoaded(household) {
    return [...household.adults, ...household.children].some(person => state.selected.has(String(person.id)));
  }

  function renderHouseholds(households) {
    refs.resultsList.innerHTML = `${renderAlphabet()}<div class="household-results">${households.length ? households.slice(0, window.KIDS_CONFIG.SEARCH_LIMIT || 100).map(home => {
      const loaded = isHouseholdLoaded(home);
      const names = members => escapeHtml(members.map(personName).join(" • "));
      return `<article class="household-card"><div class="household-card-content"><div class="household-name">${escapeHtml(home.name)}</div>
        ${home.adults.length ? `<div class="household-section"><span class="household-label">Adults</span><span>${names(home.adults)}</span></div>` : ""}
        ${home.children.length ? `<div class="household-section"><span class="household-label">Children</span><span>${names(home.children)}</span></div>` : ""}
        </div><button type="button" class="btn ${loaded ? 'secondary' : 'primary'} select-household" data-household-id="${escapeHtml(home.id)}">${loaded ? 'Remove Household' : 'Select Household'}</button></article>`;
    }).join("") : '<div class="empty">No families matched your search.</div>'}</div>`;
  }

  function filterRoster() {

    const query =
      refs.searchInput.value

        .trim()

        .toLowerCase();

    if (

      !query &&

      !state.activeLetter

    ) {

      renderSearchPrompt();

      return;
    }

    let filtered =
      state.households;

    if (
      state.activeLetter
    ) {

      filtered =
        filtered.filter(
          (household) => {

            const familyName =
              household.name

                .replace(
                  /\s+Household$/i,
                  ""
                )

                .trim();

            return familyName

              .toUpperCase()

              .startsWith(
                state.activeLetter
              );

          }
        );

    }

    if (query) {

      filtered =
        filtered.filter(
          (household) =>

            householdSearchText(
              household
            ).includes(
              query
            )
        );

    }

    renderHouseholds(
      filtered
    );
  }


  /* ============================================================
     HOUSEHOLD SELECTION
     ============================================================ */

  function toggleHousehold(householdId) {
    const home = state.households.find(item => String(item.id) === String(householdId));
    if (!home) return;
    const loaded = isHouseholdLoaded(home);
    state.selected.clear();
    if (!loaded) [...home.adults, ...home.children].forEach(person => state.selected.set(String(person.id), {
      ...person, name: personName(person), service: person.child ? "Sunday School" : "Worship", note: "", present: false
    }));
    renderSelected(); filterRoster();
  }

  function presentChildren() {

    return [
      ...state.selected.values()
    ]

      .filter(
        (person) =>
          person.present
      );
  }


  function updateSubmitState() {

    refs.submitCheckinBtn.disabled =
      presentChildren()
        .length === 0;
  }


  /* ============================================================
     SELECTED CHILDREN
     ============================================================ */

  function renderSelected() {
    const people = [...state.selected.values()];
    refs.selectedList.innerHTML = people.length ? people.map(person => {
      const id = escapeHtml(person.id);
      const options = person.child ? ["Sunday School", "Children's Church", "Nursery", "Wednesday Kids", "Worship", "Other / General"] : ["Worship", "Sunday School", "Small Group", "Other / General"];
      return `<div class="selected-child-card ${person.present ? '' : 'absent'}">
        <div class="selected-child-header"><label class="present-check"><input type="checkbox" class="child-present-check" data-person-id="${id}" ${person.present ? 'checked' : ''}>
        <span><strong>${escapeHtml(personName(person))}</strong><small class="person-kind">${person.child ? 'Child' : 'Adult'}</small></span></label>
        <button class="btn secondary remove-selected" type="button" data-person-id="${id}" aria-label="Remove ${escapeHtml(personName(person))}">×</button></div>
        <div class="child-fields ${person.present ? '' : 'inactive'}"><div class="field"><label for="service-${id}">${person.child ? 'Room / Service' : 'Service / Group'}</label>
        <select class="child-service-select" id="service-${id}" data-person-id="${id}">${options.map(option => `<option value="${escapeHtml(option)}" ${person.service === option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select></div>
        ${person.child ? `<div class="field"><label for="note-${id}">Allergies / notes</label><textarea id="note-${id}" class="child-note-input" data-person-id="${id}" rows="2">${escapeHtml(person.note || '')}</textarea></div>` : ''}</div></div>`;
    }).join('') : '<div class="empty">No family selected.</div>';
    const present = presentChildren();
    const kids = present.filter(p => p.child).length;
    const summary = document.getElementById('selectionSummary');
    if (summary) summary.textContent = !present.length ? 'Select everyone who is present.' : `${present.length} selected • ${kids ? `${kids} child${kids === 1 ? '' : 'ren'} — pickup label will print` : 'Attendance only — no label needed'}`;
    updateSubmitState();
  }

  function removeSelectedPerson(
    id
  ) {

    state.selected.delete(
      String(id)
    );

    renderSelected();

    filterRoster();
  }


  /* ============================================================
     REGULAR FAMILY CHECK-IN
     ============================================================ */

  async function submitSelectedCheckin() {
    const people = presentChildren().map(person => ({ id: String(person.id), name: personName(person), child: person.child, service: person.service, note: String(person.note || '').trim() }));
    if (!people.length || refs.submitCheckinBtn.disabled) return;
    const signature = JSON.stringify(people);
    if (state.requestSignature !== signature) { state.requestSignature = signature; state.requestId = crypto.randomUUID(); }
    hideNotice(refs.checkinNotice);
    setBusy(refs.submitCheckinBtn, true, 'Saving…');
    try {
      const result = await KidsAPI.submitFamilyAttendance({ people, requestId: state.requestId,
        note: people.filter(p => p.note).map(p => `${p.name}: ${p.note}`).join(' | ') });
      const children = result.labelChildren || [];
      refs.successNames.textContent = people.map(p => p.name).join(', ');
      refs.successCode.textContent = result.pickupCode || '';
      refs.successCode.hidden = !children.length;
      document.getElementById('pickupInstructions').hidden = !children.length;
      refs.successEmailStatus.textContent = children.length ? (result.emailSent ? `Pickup code emailed${result.parentName ? ' to ' + result.parentName : ''}.` : 'Please keep the pickup code shown. Pickup email was not sent for this request.') : 'Attendance saved. No label or pickup code is needed.';
      refs.successEmailStatus.style.color = children.length && !result.emailSent ? '#9d2634' : '';
      window.KidsPrinter?.reset();
      switchView('successScreen'); startNextFamilyCountdown();
      // One print call, only for present children; adults never enter the printer payload.
      if (children.length && result.duplicate) window.KidsPrinter?.prepareReprint(children, { mode: 'household' });
      if (children.length && !result.duplicate && window.KidsPrinter) window.KidsPrinter.printLabels(children, { mode: 'household' }).catch(console.error);
      // Keep the key until the next family's selection changes, so an immediate retry is idempotent.
    } catch (error) { showNotice(refs.checkinNotice, error.message, 'error'); }
    finally { setBusy(refs.submitCheckinBtn, false); updateSubmitState(); }
  }

  async function submitGuest(
    event
  ) {

    event.preventDefault();

    hideNotice(
      refs.guestNotice
    );

    const childFirst =
      $("#guestChildFirst")
        ?.value
        .trim() ||
      "";

    const childLast =
      $("#guestChildLast")
        ?.value
        .trim() ||
      "";

    const parentName =
      $("#guestParentName")
        ?.value
        .trim() ||
      "";

    const email =
      $("#guestEmail")
        ?.value
        .trim()
        .toLowerCase() ||
      "";

    const grade =
      $("#guestGrade")
        ?.value
        .trim() ||
      "";

    const room =
      $("#guestRoom")
        ?.value ||
      "Sunday School";

    const notes =
      $("#guestNotes")
        ?.value
        .trim() ||
      "";

    if (

      !childFirst ||

      !parentName ||

      !email

    ) {

      showNotice(
        refs.guestNotice,
        "Enter the child name, parent or guardian, and email address.",
        "error"
      );

      return;
    }

    const emailPattern =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      !emailPattern.test(
        email
      )
    ) {

      showNotice(
        refs.guestNotice,
        "Enter a valid parent or guardian email address.",
        "error"
      );

      $("#guestEmail")
        ?.focus();

      return;
    }

    const fullName =
      [
        childFirst,
        childLast
      ]

        .filter(Boolean)

        .join(" ");

    const noteText =
      [

        `Guest parent/guardian: ${parentName}`,

        `Email: ${email}`,

        grade
          ? `Age/grade: ${grade}`
          : "",

        notes
          ? `Notes: ${notes}`
          : ""

      ]

        .filter(Boolean)

        .join("\n");

    const people =
      [
        {

          id:
            `guest-${Date.now()}`,

          name:
            fullName,

          service:
            room,

          note:
            notes

        }
      ];

    const button =
      refs.guestForm
        .querySelector(
          'button[type="submit"]'
        );

    setBusy(
      button,
      true,
      "Checking In…"
    );

    try {

      const result =
        await KidsAPI
          .submitAttendance({

            people,

            children:
              people,

            noteText,

            note:
              noteText,

            guest:
              true,

            parentName:
              parentName,

            parentEmail:
              email,

            email:
              email,

            guestEmail:
              email

          });

      refs.successCode.hidden = false;
      document.getElementById('pickupInstructions').hidden = false;
      window.KidsPrinter?.reset();
      refs.successNames.textContent = fullName;

      refs.successCode.textContent =
        result.pickupCode ||
        "—";

      /*
       * ==========================================================
       * FIRST-TIME GUEST PRINTING
       * ==========================================================
       *
       * Guest mode tells the Windows printer service to print:
       *
       *   1 parent pickup label with QR
       *   PLUS
       *   1 child badge per guest child
       *
       * The child badge does NOT contain the pickup QR.
       *
       * IMPORTANT:
       * Attendance has already been successfully saved above.
       * Printer failure NEVER cancels the check-in.
       * ==========================================================
       */

      if (window.KidsPrinter) {

        window.KidsPrinter
          .printLabels(
            people,
            {
              mode: "guest"
            }
          )
          .catch((error) => {

            console.error(
              "Guest label printing failed:",
              error
            );

          });
      }

      if (
        refs.successEmailStatus
      ) {

        if (
          result.emailSent
        ) {

          refs.successEmailStatus.textContent =
            `Pickup code emailed to ${email}.`;

          refs.successEmailStatus.style.color =
            "";

        } else {

          refs.successEmailStatus.textContent =
            `Pickup email was not sent to ${email}. Please give the parent the code shown above.`;

          refs.successEmailStatus.style.color =
            "#9d2634";

        }
      }

      refs.guestForm.reset();

      switchView(
        "successScreen"
      );

      startNextFamilyCountdown();

    } catch (error) {

      showNotice(
        refs.guestNotice,
        error.message,
        "error"
      );

    } finally {

      setBusy(
        button,
        false
      );

    }
  }


  /* ============================================================
     PICKUP
     ============================================================ */

  async function verifyPickup() {

    const code =
      refs.pickupCodeInput.value

        .trim()

        .toUpperCase();

    hideNotice(
      refs.pickupNotice
    );

    refs.pickupResult
      .classList
      .add("hidden");

    refs.pickupResult.innerHTML =
      "";

    if (
      code.length !== 4
    ) {

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
        await KidsAPI
          .verifyPickupCode(
            code
          );

      const record =
        result.record ||
        {};

      const children =
        Array.isArray(
          record.children
        )

          ? record.children

          : [];

      refs.pickupResult.innerHTML =
        `

          <h3>
            Pickup Verified
          </h3>

          <p>

            <strong>
              Children:
            </strong>

            ${
              escapeHtml(

                children.join(
                  ", "
                ) ||

                "Pickup completed"

              )
            }

          </p>

          <p>

            <strong>
              Code:
            </strong>

            ${
              escapeHtml(

                record.code ||

                code

              )
            }

          </p>

        `;

      refs.pickupResult
        .classList
        .remove("hidden");

      showNotice(
        refs.pickupNotice,

        result.message ||
          "Pickup code verified.",

        "success"
      );

      refs.pickupCodeInput.value =
        "";

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


  /* ============================================================
     EVENTS
     ============================================================ */

  function registerEvents() {

    refs.landingCheckinBtn.onclick =
      () =>
        openApp(
          "checkinView"
        );

    refs.landingGuestBtn.onclick =
      () =>
        openApp(
          "guestView"
        );

    refs.landingPickupBtn.onclick =
      () =>
        openApp(
          "pickupView"
        );

    refs.homeBtn.onclick =
      returnHome;

    /*
     * Navigation tabs
     */

    $$(".nav-btn")
      .forEach(
        (button) => {

          button.onclick =
            () => {

              clearNextFamilyTimer();

              switchView(
                button.dataset.view
              );

            };

        }
      );

    /*
     * Family search
     */

    refs.searchInput.oninput =
      () => {

        state.activeLetter =
          "";

        filterRoster();

      };

    refs.clearSearchBtn.onclick =
      () => {

        refs.searchInput.value =
          "";

        state.activeLetter =
          "";

        filterRoster();

        refs.searchInput.focus();

      };

    /*
     * Roster refresh
     */

    refs.refreshRosterBtn.onclick =
      () =>
        loadRoster(
          true
        );

    /*
     * Household results
     */

    refs.resultsList.onclick =
      (event) => {

        const letterButton =
          event.target.closest(
            ".letter-filter"
          );

        if (
          letterButton
        ) {

          const letter =
            letterButton
              .dataset
              .letter;

          state.activeLetter =
            state.activeLetter ===
            letter

              ? ""

              : letter;

          refs.searchInput.value =
            "";

          filterRoster();

          return;
        }

        const householdButton =
          event.target.closest(
            ".select-household"
          );

        if (
          householdButton
        ) {

          toggleHousehold(
            householdButton
              .dataset
              .householdId
          );

        }

      };

    /*
     * Remove selected child
     */

    refs.selectedList.onclick =
      (event) => {

        const button =
          event.target.closest(
            ".remove-selected"
          );

        if (
          button
        ) {

          removeSelectedPerson(
            button.dataset.personId
          );

        }

      };

    /*
     * Selected child changes
     */

    refs.selectedList.onchange =
      (event) => {

        const presentCheck =
          event.target.closest(
            ".child-present-check"
          );

        if (
          presentCheck
        ) {

          const id =
            String(
              presentCheck
                .dataset
                .personId
            );

          const person =
            state.selected.get(
              id
            );

          if (
            person
          ) {

            person.present =
              presentCheck.checked;

            renderSelected();

          }

          return;
        }

        const select =
          event.target.closest(
            ".child-service-select"
          );

        if (
          select
        ) {

          const person =
            state.selected.get(

              String(
                select
                  .dataset
                  .personId
              )

            );

          if (
            person
          ) {

            person.service =
              select.value;

          }
        }
      };

    /*
     * Child notes
     */

    refs.selectedList.oninput =
      (event) => {

        const note =
          event.target.closest(
            ".child-note-input"
          );

        if (
          !note
        ) {
          return;
        }

        const person =
          state.selected.get(

            String(
              note
                .dataset
                .personId
            )

          );

        if (
          person
        ) {

          person.note =
            note.value;

        }

      };

    /*
     * Submit regular check-in
     */

    refs.submitCheckinBtn.onclick =
      submitSelectedCheckin;

    /*
     * Submit guest check-in
     */

    refs.guestForm.onsubmit =
      submitGuest;

    /*
     * Pickup
     */

    refs.verifyPickupBtn.onclick =
      verifyPickup;

    refs.pickupCodeInput.oninput =
      () => {

        refs.pickupCodeInput.value =
          refs.pickupCodeInput.value

            .toUpperCase()

            .replace(
              /[^A-Z0-9]/g,
              ""
            )

            .slice(
              0,
              4
            );

      };

    refs.pickupCodeInput.onkeydown =
      (event) => {

        if (
          event.key ===
          "Enter"
        ) {

          verifyPickup();

        }

      };

    /*
     * Next family
     */

    refs.newCheckinBtn.onclick =
      prepareNextFamily;
  }


  /* ============================================================
     INITIALIZATION
     ============================================================ */

  async function init() {

    bindRefs();

    registerEvents();

    renderSelected();

    /*
     * ==========================================================
     * DIRECT PICKUP LINK
     * ==========================================================
     *
     * This happens BEFORE the roster is downloaded.
     *
     * Therefore scanning:
     *
     * https://checkin.versaillesumc.org/?view=pickup
     *
     * immediately displays the Pickup screen.
     *
     * The backend and roster can continue loading afterward.
     * ==========================================================
     */

    const params =
      new URLSearchParams(
        window.location.search
      );

    const requestedView =
      String(
        params.get("view") ||
        ""
      )

        .trim()

        .toLowerCase();

    if (
      requestedView ===
      "pickup"
    ) {

      openApp(
        "pickupView"
      );

    }

    /*
     * Backend and roster initialization
     */

    await Promise.all([

      checkBackend(),

      loadRoster(false)

    ]);

    /*
     * Service Worker
     */

    if (
      "serviceWorker" in
      navigator
    ) {

      navigator
        .serviceWorker

        .register(
          "./service-worker.js",
          {

            updateViaCache:
              "none"

          }
        )

        .then(
          (registration) =>
            registration.update()
        )

        .catch(
          () => {}
        );

    }
  }


  document.addEventListener(
    "DOMContentLoaded",
    init
  );

})();
