(function () {
  "use strict";

  const config = window.KIDS_CONFIG;

  (function loadPrinterModule() {
    if (document.querySelector('script[data-kids-printer="true"]')) return;
    const script = document.createElement("script");
    script.src = "./js/dymo-print.js?v=2.7.0";
    script.async = true;
    script.dataset.kidsPrinter = "true";
    document.head.appendChild(script);
  })();

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

    submitAttendance: async ({ people, children, noteText, note }) => {
      const selected = Array.isArray(children)
        ? children
        : Array.isArray(people) ? people : [];

      const finalNote = note ?? noteText ?? "";

      const result = await post({
        action: "checkin",
        children: selected,
        note: finalNote
      });

      try {
        const printer = await waitForPrinterModule();

        if (printer) {
          result.labelPrint = await printer.printLabels(selected);
        } else {
          result.labelPrint = {
            ok: false,
            printed: 0,
            reason: "DYMO printing module did not load."
          };
        }
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
    adminAuthenticate: async (adminPin) => post({ action: "adminAuthenticate", adminPin }),
    adminDashboard: async (adminPin) => post({ action: "adminDashboard", adminPin }),
    adminRefreshRoster: async (adminPin) => post({ action: "adminRefreshRoster", adminPin }),
    adminCheckout: async (adminPin, pickupCode) => post({ action: "adminCheckout", adminPin, pickupCode }),
    adminInitializeSheet: async (adminPin) => post({ action: "adminInitializeSheet", adminPin })
  });
})();
