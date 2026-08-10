(function () {
  "use strict";

  const config = window.KIDS_CONFIG;

  function loadLocalModule(src, marker) {
    if (document.querySelector(`script[data-${marker}="true"]`)) return;

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.setAttribute(`data-${marker}`, "true");
    document.head.appendChild(script);
  }

  loadLocalModule("./js/dymo-print.js?v=2.7.0", "kids-printer");
  loadLocalModule("./js/child-checkin.js?v=2.7.0", "child-checkin");

  async function parseResponse(response) {
    const text = await response.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error("The backend returned an invalid response.");
    }

    if (!response.ok || data.ok === false) {
      throw new Error(data.error || "The request failed.");
    }

    return data;
  }

  async function get(params = {}) {
    const url = new URL(config.API_URL);

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    });

    const response = await fetch(url.toString(), {
      method: "GET",
      redirect: "follow",
      cache: "no-store"
    });

    return parseResponse(response);
  }

  async function post(payload = {}) {
    const body = new URLSearchParams();

    Object.entries(payload).forEach(([key, value]) => {
      body.set(key, typeof value === "string" ? value : JSON.stringify(value));
    });

    const response = await fetch(config.API_URL, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body
    });

    return parseResponse(response);
  }

  async function waitForPrinterModule(timeoutMs = 3000) {
    const started = Date.now();

    while (!window.KidsPrinter && Date.now() - started < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return window.KidsPrinter || null;
  }

  window.KidsAPI = Object.freeze({

    health: () => get(),

    getPeople: async (forceRefresh = false) => {
      const result = forceRefresh
        ? await get({ action: "refreshRoster" })
        : await get({ action: "roster" });

      return {
        ok: true,
        rows: Array.isArray(result.roster) ? result.roster : [],
        lastRefresh: result.lastRefresh || ""
      };
    },

    submitAttendance: async ({
      people,
      children,
      noteText,
      note,
      skipPrint = false
    }) => {
      const selected = Array.isArray(children)
        ? children
        : Array.isArray(people)
          ? people
          : [];

      const finalNote = note ?? noteText ?? "";

      // Save attendance + send parent pickup email FIRST.
      const result = await post({
        action: "checkin",
        children: selected,
        note: finalNote
      });

      // Individual-child UI uses skipPrint so it can print each child
      // separately with that child's own allergy/care note.
      if (skipPrint) {
        result.labelPrint = {
          ok: true,
          skipped: true,
          printed: 0
        };
        return result;
      }

      try {
        const printer = await waitForPrinterModule();

        result.labelPrint = printer
          ? await printer.printLabels(selected, finalNote)
          : {
              ok: false,
              printed: 0,
              reason: "DYMO printing module did not load."
            };

      } catch (error) {
        result.labelPrint = {
          ok: false,
          printed: 0,
          reason: error.message || "DYMO label printing failed."
        };
      }

      return result;
    },

    verifyPickupCode: async (pickupCode) => {
      const result = await post({
        action: "checkout",
        code: pickupCode
      });

      return {
        ...result,
        message: result.message || "Pickup code verified.",
        record: result.record || {
          code: pickupCode,
          children: [],
          checkedOutAt: new Date().toLocaleString()
        }
      };
    },

    history: async () => post({ action: "history" }),

    adminAuthenticate: async (adminPin) =>
      post({ action: "adminAuthenticate", adminPin }),

    adminDashboard: async (adminPin) =>
      post({ action: "adminDashboard", adminPin }),

    adminRefreshRoster: async (adminPin) =>
      post({ action: "adminRefreshRoster", adminPin }),

    adminCheckout: async (adminPin, pickupCode) =>
      post({ action: "adminCheckout", adminPin, pickupCode }),

    adminInitializeSheet: async (adminPin) =>
      post({ action: "adminInitializeSheet", adminPin })

  });

})();