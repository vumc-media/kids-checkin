(function () {
  "use strict";

  const childState = new Map();
  let observer = null;
  let installing = false;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function addStyles() {
    if (document.getElementById("individualChildCheckinStyles")) return;

    const style = document.createElement("style");
    style.id = "individualChildCheckinStyles";
    style.textContent = `
      .selected-child-card {
        border:1px solid #dce5ef;
        border-radius:14px;
        padding:14px;
        background:#fff;
      }

      .child-present-row {
        display:flex;
        align-items:center;
        gap:10px;
        margin:10px 0 14px;
        padding:10px 12px;
        border-radius:11px;
        background:#f4f8fc;
        border:1px solid #dce5ef;
        color:#0b2a52;
        font-weight:850;
      }

      .child-present-row input {
        width:22px;
        height:22px;
        accent-color:#2f9d68;
      }

      .child-note-field {
        margin-top:12px;
      }

      .child-note-field textarea {
        width:100%;
        min-height:74px;
        resize:vertical;
        padding:11px 12px;
        border:1px solid #cdd9e6;
        border-radius:11px;
        font:inherit;
      }

      .child-note-field textarea:focus {
        outline:none;
        border-color:#1976ff;
        box-shadow:0 0 0 3px rgba(25,118,255,.12);
      }

      .selected-child-card.child-not-present {
        opacity:.72;
      }

      .selected-child-card.child-not-present .selected-service-field,
      .selected-child-card.child-not-present .child-note-field {
        opacity:.65;
      }

      .individual-checkin-helper {
        margin:0 0 12px;
        padding:11px 12px;
        border-radius:11px;
        background:#fff7df;
        border:1px solid #f1d48a;
        color:#6e5312;
        font-size:13px;
        line-height:1.4;
      }

      #checkinNote,
      label[for="checkinNote"] {
        display:none !important;
      }
    `;

    document.head.appendChild(style);
  }

  function getCardId(card) {
    const select = card.querySelector(".child-service-select");
    return select ? String(select.dataset.personId || "") : "";
  }

  function ensureState(id, card) {
    if (!childState.has(id)) {
      childState.set(id, {
        present: false,
        note: "",
        name: (card.querySelector(".selected-child-header strong")?.textContent || "").trim()
      });
    }
    return childState.get(id);
  }

  function addHelper() {
    const list = document.getElementById("selectedList");
    if (!list || !list.children.length) return;

    const selectionCard = list.closest(".selection-card");
    if (!selectionCard || selectionCard.querySelector(".individual-checkin-helper")) return;

    const helper = document.createElement("div");
    helper.className = "individual-checkin-helper";
    helper.textContent =
      "Check only the children who are present. Each child can have a separate room/event and separate allergy or care note.";

    selectionCard.insertBefore(helper, list);
  }

  function decorateCard(card) {
    const id = getCardId(card);
    if (!id) return;

    const state = ensureState(id, card);

    if (!card.querySelector(".child-present-row")) {
      const header = card.querySelector(".selected-child-header");

      const row = document.createElement("label");
      row.className = "child-present-row";
      row.innerHTML = `
        <input
          type="checkbox"
          class="child-present-checkbox"
          data-person-id="${escapeHtml(id)}"
          ${state.present ? "checked" : ""}
        >
        <span>Present — Check In This Child</span>
      `;

      if (header && header.nextSibling) {
        header.parentNode.insertBefore(row, header.nextSibling);
      } else if (header) {
        header.parentNode.appendChild(row);
      } else {
        card.insertBefore(row, card.firstChild);
      }
    }

    if (!card.querySelector(".child-note-field")) {
      const field = document.createElement("div");
      field.className = "field child-note-field";
      field.innerHTML = `
        <label for="child-note-${escapeHtml(id)}">
          Allergies / notes for this child
        </label>
        <textarea
          id="child-note-${escapeHtml(id)}"
          class="child-note-input"
          data-person-id="${escapeHtml(id)}"
          rows="2"
          placeholder="Allergy, medical, care, or room note"
        >${escapeHtml(state.note)}</textarea>
      `;

      card.appendChild(field);
    }

    updateCardState(card, state.present);
  }

  function updateCardState(card, present) {
    card.classList.toggle("child-not-present", !present);

    const service = card.querySelector(".child-service-select");
    const note = card.querySelector(".child-note-input");

    if (service) service.disabled = !present;
    if (note) note.disabled = !present;
  }

  function selectedPresentCount() {
    let count = 0;
    childState.forEach((item, id) => {
      const card = document.querySelector(
        `.child-service-select[data-person-id="${CSS.escape(id)}"]`
      )?.closest(".selected-child-card");

      if (card && item.present) count += 1;
    });
    return count;
  }

  function syncCompleteButton() {
    const button = document.getElementById("submitCheckinBtn");
    if (!button) return;
    button.disabled = selectedPresentCount() === 0;
  }

  function decorateAll() {
    addStyles();
    addHelper();

    document
      .querySelectorAll("#selectedList .selected-child-card")
      .forEach(decorateCard);

    syncCompleteButton();
  }

  function aggregateNotes(children) {
    return children
      .filter((child) => child.note)
      .map((child) => `${child.name}: ${child.note}`)
      .join(" | ");
  }

  function collectPresentChildren() {
    const children = [];

    document
      .querySelectorAll("#selectedList .selected-child-card")
      .forEach((card) => {
        const id = getCardId(card);
        if (!id) return;

        const state = ensureState(id, card);
        if (!state.present) return;

        const service = card.querySelector(".child-service-select")?.value || "Sunday School";
        const name =
          (card.querySelector(".selected-child-header strong")?.textContent || state.name || "").trim();
        const note =
          (card.querySelector(".child-note-input")?.value || state.note || "").trim();

        children.push({
          id,
          name,
          service,
          note
        });
      });

    return children;
  }

  function showNotice(message, type) {
    const el = document.getElementById("checkinNotice");
    if (!el) return;

    el.textContent = message;
    el.className = `notice ${type || ""}`.trim();
  }

  function clearNotice() {
    const el = document.getElementById("checkinNotice");
    if (!el) return;
    el.textContent = "";
    el.className = "notice hidden";
  }

  function switchToSuccess(children, result) {
    document.querySelectorAll(".view").forEach((view) => {
      view.classList.remove("active");
    });

    document.querySelectorAll(".nav-btn").forEach((button) => {
      button.classList.remove("active");
    });

    const names = document.getElementById("successNames");
    const code = document.getElementById("successCode");
    const screen = document.getElementById("successScreen");

    if (names) {
      names.textContent = children.map((child) => child.name).join(", ");
    }

    if (code) {
      code.textContent = result.pickupCode || "—";
    }

    if (screen) {
      screen.classList.add("active");
    }

    window.scrollTo({ top: 0 });
  }

  function clearAppSelection() {
    const buttons = [
      ...document.querySelectorAll("#selectedList .remove-selected")
    ];

    buttons.forEach((button) => button.click());

    childState.clear();

    const search = document.getElementById("searchInput");
    if (search) search.value = "";

    const familyNote = document.getElementById("checkinNote");
    if (familyNote) familyNote.value = "";
  }

  async function printIndividualLabels(children) {
    if (!window.KidsPrinter) {
      return {
        ok: false,
        printed: 0,
        reason: "DYMO printer module is unavailable."
      };
    }

    let printed = 0;
    const errors = [];

    for (const child of children) {
      try {
        const result = await window.KidsPrinter.printLabels(
          [child],
          child.note || ""
        );

        if (result && result.ok) {
          printed += 1;
        } else {
          errors.push(
            `${child.name}: ${(result && result.reason) || "Label did not print."}`
          );
        }
      } catch (error) {
        errors.push(`${child.name}: ${error.message}`);
      }
    }

    return {
      ok: errors.length === 0,
      printed,
      total: children.length,
      reason: errors.join(" | ")
    };
  }

  async function submitPresentChildren(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const children = collectPresentChildren();

    if (!children.length) {
      showNotice("Check at least one child who is present.", "error");
      syncCompleteButton();
      return;
    }

    const button = document.getElementById("submitCheckinBtn");
    clearNotice();

    if (button) {
      button.disabled = true;
      button.textContent = "Checking In…";
    }

    try {
      const result = await window.KidsAPI.submitAttendance({
        people: children,
        children,
        note: aggregateNotes(children),
        noteText: aggregateNotes(children),
        skipPrint: true
      });

      // Attendance is already safely saved at this point.
      // Print only the children explicitly marked present.
      result.labelPrint = await printIndividualLabels(children);

      switchToSuccess(children, result);
      clearAppSelection();

    } catch (error) {
      showNotice(error.message || "Unable to complete check-in.", "error");
    } finally {
      if (button) {
        button.textContent = "Complete Check-In";
      }
      syncCompleteButton();
    }
  }

  function installEvents() {
    if (installing) return;
    installing = true;

    const list = document.getElementById("selectedList");
    const button = document.getElementById("submitCheckinBtn");

    if (!list || !button || !window.KidsAPI) {
      installing = false;
      setTimeout(installEvents, 250);
      return;
    }

    list.addEventListener("change", (event) => {
      const checkbox = event.target.closest(".child-present-checkbox");

      if (checkbox) {
        const id = String(checkbox.dataset.personId || "");
        const card = checkbox.closest(".selected-child-card");
        const state = ensureState(id, card);

        state.present = checkbox.checked;
        updateCardState(card, state.present);
        syncCompleteButton();
        return;
      }

      const note = event.target.closest(".child-note-input");
      if (note) {
        const id = String(note.dataset.personId || "");
        const card = note.closest(".selected-child-card");
        const state = ensureState(id, card);
        state.note = note.value;
      }
    });

    list.addEventListener("input", (event) => {
      const note = event.target.closest(".child-note-input");
      if (!note) return;

      const id = String(note.dataset.personId || "");
      const card = note.closest(".selected-child-card");
      const state = ensureState(id, card);
      state.note = note.value;
    });

    // The original app uses button.onclick. Replace it after app initialization.
    button.onclick = submitPresentChildren;

    observer = new MutationObserver(() => {
      requestAnimationFrame(decorateAll);
    });

    observer.observe(list, {
      childList: true,
      subtree: true
    });

    decorateAll();
    installing = false;
  }

  function start() {
    addStyles();

    // Run after app.js has processed DOMContentLoaded and assigned its handlers.
    setTimeout(installEvents, 0);
    setTimeout(installEvents, 300);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

})();