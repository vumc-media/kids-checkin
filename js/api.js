(function () {
  "use strict";

  const config = window.KIDS_CONFIG;

  async function parseResponse(response) {
    const text = await response.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch (error) {
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

  async function post(payload) {
    // GAS is most dependable cross-origin when data is form encoded.
    const body = new URLSearchParams();

    Object.entries(payload).forEach(([key, value]) => {
      body.set(
        key,
        typeof value === "string" ? value : JSON.stringify(value)
      );
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

  window.KidsAPI = Object.freeze({
    health() {
      return get();
    },

    getPeople(forceRefresh = false) {
      return get({
        action: "getPeople",
        forceRefresh
      });
    },

    searchPeople(query, offset = 0, limit = config.SEARCH_LIMIT) {
      return get({
        action: "searchPeople",
        q: query,
        offset,
        limit
      });
    },

    submitAttendance({ people, noteText, label, isoDate }) {
      return post({
        action: "submitAttendance",
        people,
        noteText: noteText || "",
        label: label || config.APP_NAME,
        isoDate: isoDate || new Date().toISOString().slice(0, 10)
      });
    },

    verifyPickupCode(pickupCode) {
      return post({
        action: "verifyPickupCode",
        pickupCode
      });
    }
  });
})();
