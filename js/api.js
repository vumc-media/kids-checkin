(function () {
  "use strict";

  const config = window.KIDS_CONFIG;

  async function parseResponse(response) {
    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error("The backend returned an invalid response.");
    }

    if (!response.ok || data.ok === false) {
      throw new Error(
        data.error || "The request failed."
      );
    }

    return data;
  }

  async function get(params = {}) {
    const url = new URL(config.API_URL);

    Object.entries(params).forEach(([key, value]) => {
      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        url.searchParams.set(
          key,
          String(value)
        );
      }
    });

    const response = await fetch(
      url.toString(),
      {
        method: "GET",
        redirect: "follow",
        cache: "no-store"
      }
    );

    return parseResponse(response);
  }

  async function post(payload = {}) {
    const body = new URLSearchParams();

    Object.entries(payload).forEach(([key, value]) => {
      body.set(
        key,
        typeof value === "string"
          ? value
          : JSON.stringify(value)
      );
    });

    const response = await fetch(
      config.API_URL,
      {
        method: "POST",
        redirect: "follow",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded;charset=UTF-8"
        },
        body
      }
    );

    return parseResponse(response);
  }

  window.KidsAPI = Object.freeze({

    health: () => get(),

    getPeople: async (forceRefresh = false) => {
      const result = forceRefresh
        ? await get({
            action: "refreshRoster"
          })
        : await get({
            action: "roster"
          });

      return {
        ok: true,
        rows: Array.isArray(result.roster)
          ? result.roster
          : [],
        lastRefresh:
          result.lastRefresh || ""
      };
    },

    submitAttendance: async ({
      people,
      children,
      noteText,
      note
    }) => {
      const selected =
        Array.isArray(children)
          ? children
          : Array.isArray(people)
            ? people
            : [];

      return post({
        action: "checkin",
        children: selected,
        note:
          note ??
          noteText ??
          ""
      });
    },

    verifyPickupCode: async (
      pickupCode
    ) => {
      const result = await post({
        action: "checkout",
        code: pickupCode
      });

      return {
        ...result,
        message:
          result.message ||
          "Pickup code verified.",
        record:
          result.record || {
            code: pickupCode,
            children: [],
            checkedOutAt:
              new Date().toLocaleString()
          }
      };
    },

    history: async () => {
      return post({
        action: "history"
      });
    },

    adminAuthenticate: async (adminPin) => {
      return post({
        action: "adminAuthenticate",
        adminPin
      });
    },

    adminDashboard: async (adminPin) => {
      return post({
        action: "adminDashboard",
        adminPin
      });
    },

    adminRefreshRoster: async (adminPin) => {
      return post({
        action: "adminRefreshRoster",
        adminPin
      });
    },

    adminCheckout: async (
      adminPin,
      pickupCode
    ) => {
      return post({
        action: "adminCheckout",
        adminPin,
        pickupCode
      });
    },

    adminInitializeSheet: async (
      adminPin
    ) => {
      return post({
        action: "adminInitializeSheet",
        adminPin
      });
    }

  });

})();
