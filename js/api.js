(function () {
  "use strict";
  async function request(params, method = "GET") {
    const url = new URL(window.KIDS_CONFIG.API_URL);
    const encoded = new URLSearchParams();
    Object.entries(params || {}).forEach(([key,value]) => {
      if (value !== undefined && value !== null) encoded.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    });
    const options = { method, redirect: "follow", cache: "no-store" };
    if (method === "GET") url.search = encoded.toString();
    else options.body = encoded;
    const response = await fetch(url, options);
    let result;
    try { result = JSON.parse(await response.text()); } catch (_) { throw new Error("The backend returned an invalid response."); }
    if (!response.ok || result.ok === false) throw new Error(result.error || "The request failed.");
    return result;
  }
  const post = payload => request(payload, "POST");
  window.KidsAPI = Object.freeze({
    health: () => request({}),
    getPeople: async force => {
      const result = await request({ action: force ? "refreshRoster" : "roster" });
      return { rows: Array.isArray(result.roster) ? result.roster : [], lastRefresh: result.lastRefresh, rosterSchema: result.rosterSchema };
    },
    submitFamilyAttendance: payload => post({ action: "familyCheckin", ...payload }),
    submitAttendance: ({ children, people, note, noteText, guest, parentName, parentEmail, email, guestEmail }) =>
      post({ action: "checkin", children: children || people, note: note ?? noteText ?? "", guest: !!guest, parentName,
        parentEmail: parentEmail || guestEmail || email }),
    verifyPickupCode: code => post({ action: "checkout", code }),
    history: () => post({ action: "history" }),
    adminAuthenticate: adminPin => post({ action: "adminAuthenticate", adminPin }),
    adminDashboard: adminPin => post({ action: "adminDashboard", adminPin }),
    adminRefreshRoster: adminPin => post({ action: "adminRefreshRoster", adminPin }),
    adminCheckout: (adminPin, pickupCode) => post({ action: "adminCheckout", adminPin, pickupCode }),
    adminInitializeSheet: adminPin => post({ action: "adminInitializeSheet", adminPin })
  });
})();
