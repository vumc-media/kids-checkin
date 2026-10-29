(function () {
  "use strict";

  /* ============================================================
     VUMC KIDS LOCAL PRINTER CLIENT
     Version 3.0

     Browser
       ↓
     http://127.0.0.1:8787
       ↓
     VUMC Windows Printer Service
       ↓
     DYMO LabelWriter 450 Turbo

     NO DYMO browser SDK is used.
     ============================================================ */


  const SERVICE_URL = "http://127.0.0.1:8787";

  const state = {
    ready: false,
    printerName: "",
    status: "Checking printer…",
    serviceVersion: "",
    qrReady: false,
    lastJob: null
  };


  /* ============================================================
     UI
     ============================================================ */

  function ensureUi() {

    if (!document.getElementById("dymoPrinterStyles")) {

      const style = document.createElement("style");

      style.id = "dymoPrinterStyles";

      style.textContent = `
        #dymoPrinterPill {
          display:inline-flex;
          align-items:center;
          gap:8px;
          padding:8px 12px;
          border:1px solid rgba(255,255,255,.2);
          border-radius:999px;
          background:rgba(255,255,255,.08);
          color:#fff;
          font-size:13px;
          white-space:nowrap;
        }

        #dymoPrinterPill .dymo-dot {
          width:9px;
          height:9px;
          border-radius:50%;
          background:#f3bd45;
        }

        #dymoPrinterPill.online .dymo-dot {
          background:#69d49b;
        }

        #dymoPrinterPill.offline .dymo-dot {
          background:#ff7d8c;
        }

        #dymoToast {
          position:fixed;
          right:18px;
          bottom:18px;
          z-index:9999;
          max-width:460px;
          padding:14px 16px;
          border-radius:14px;
          box-shadow:0 14px 34px rgba(0,0,0,.2);
          background:#0b2a52;
          color:#fff;
          font:700 14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;
        }

        #dymoToast.error {
          background:#9d2634;
        }

        #dymoToast.success {
          background:#1d704a;
        }

        #dymoReprintBtn {
          margin:16px 8px 0;
          min-height:46px;
          padding:11px 16px;
          border:0;
          border-radius:12px;
          background:#edf4fb;
          color:#0b2a52;
          font:800 15px system-ui,-apple-system,"Segoe UI",sans-serif;
          cursor:pointer;
        }

        #dymoReprintBtn:disabled {
          opacity:.6;
          cursor:wait;
        }
      `;

      document.head.appendChild(style);
    }


    /* ----------------------------------------------------------
       PRINTER STATUS PILL
       ---------------------------------------------------------- */

    if (!document.getElementById("dymoPrinterPill")) {

      const headerActions =
        document.querySelector(".header-actions");

      if (headerActions) {

        const pill =
          document.createElement("div");

        pill.id = "dymoPrinterPill";

        pill.innerHTML =
          '<span class="dymo-dot"></span>' +
          '<span id="dymoPrinterText">Checking printer…</span>';

        headerActions.appendChild(pill);
      }
    }


    /* ----------------------------------------------------------
       REPRINT BUTTON
       ---------------------------------------------------------- */

    if (!document.getElementById("dymoReprintBtn")) {

      const returnButton =
        document.getElementById("newCheckinBtn");

      const successScreen =
        document.getElementById("successScreen");

      if (successScreen) {

        const button =
          document.createElement("button");

        button.id = "dymoReprintBtn";
        button.type = "button";
        button.textContent = "Reprint Label";
        button.hidden = true;

        button.addEventListener(
          "click",
          async function () {

            if (!state.lastJob) {
              return;
            }

            button.disabled = true;
            button.textContent = "Reprinting…";

            try {

              await sendPrintJob(
                state.lastJob.children,
                {
                  mode: state.lastJob.mode,
                  isReprint: true
                }
              );

            } finally {

              button.disabled = false;
              button.textContent = "Reprint Label";
            }
          }
        );


        if (returnButton && returnButton.parentNode) {

          returnButton.parentNode.insertBefore(
            button,
            returnButton
          );

        } else {

          successScreen.appendChild(button);
        }
      }
    }
  }


  /* ============================================================
     STATUS DISPLAY
     ============================================================ */

  function updateStatus(message, type) {

    state.status = message;

    ensureUi();

    const pill =
      document.getElementById("dymoPrinterPill");

    const text =
      document.getElementById("dymoPrinterText");

    if (pill) {

      pill.classList.remove(
        "online",
        "offline"
      );

      if (type) {
        pill.classList.add(type);
      }
    }

    if (text) {
      text.textContent = message;
    }
  }


  /* ============================================================
     TOAST
     ============================================================ */

  function toast(message, type = "") {

    let el =
      document.getElementById("dymoToast");

    if (!el) {

      el = document.createElement("div");
      el.id = "dymoToast";

      document.body.appendChild(el);
    }

    el.className = type;
    el.textContent = message;
    el.hidden = false;

    clearTimeout(toast.timer);

    toast.timer =
      setTimeout(
        function () {
          el.hidden = true;
        },
        6500
      );
  }


  /* ============================================================
     REPRINT BUTTON
     ============================================================ */

  function revealReprint() {
    if (!state.lastJob) return;

    ensureUi();

    const button =
      document.getElementById("dymoReprintBtn");

    if (button) {
      button.hidden = false;
    }
  }


  /* ============================================================
     NORMALIZE CHILDREN
     ============================================================ */

  function normalizeChildren(children) {

    if (!Array.isArray(children)) {
      return [];
    }

    return children
      .filter(Boolean)
      .map(function (child) {

        return {
          id:
            child.id || "",

          name:
            String(
              child.name ||
              child.childName ||
              "Child"
            ).trim(),

          service:
            String(
              child.service ||
              child.room ||
              child.location ||
              "Kids Ministry"
            ).trim(),

          note:
            String(
              child.note ||
              child.notes ||
              ""
            ).trim()
        };
      });
  }


  /* ============================================================
     REFRESH PRINTER STATUS

     GET http://127.0.0.1:8787/status
     ============================================================ */

  async function refreshPrinter() {

    ensureUi();

    updateStatus(
      "Checking printer…",
      ""
    );

    try {

      const response =
        await fetch(
          SERVICE_URL + "/status",
          {
            method: "GET",
            cache: "no-store"
          }
        );

      if (!response.ok) {

        throw new Error(
          "Printer service returned HTTP " +
          response.status
        );
      }

      const result =
        await response.json();


      state.ready =
        result.ready === true;

      state.printerName =
        String(
          result.printerName || ""
        ).trim();

      state.serviceVersion =
        String(
          result.version || ""
        ).trim();

      state.qrReady =
        result.qrReady === true;


      if (state.ready) {

        updateStatus(
          state.printerName ||
          "DYMO ready",
          "online"
        );

      } else {

        updateStatus(
          "DYMO offline",
          "offline"
        );
      }


      return {
        ready: state.ready,
        printerName: state.printerName,
        status: state.status,
        version: state.serviceVersion,
        qrReady: state.qrReady
      };

    } catch (error) {

      state.ready = false;
      state.printerName = "";
      state.serviceVersion = "";
      state.qrReady = false;

      updateStatus(
        "Printer service offline",
        "offline"
      );

      console.warn(
        "VUMC printer service check failed:",
        error
      );

      return null;
    }
  }


  /* ============================================================
     SEND PRINT JOB

     mode = household
       ONE household pickup label

     mode = guest
       ONE parent pickup label
       PLUS child badge(s)
     ============================================================ */

  async function sendPrintJob(
    children,
    options = {}
  ) {

    const rows =
      normalizeChildren(children);

    if (!rows.length) {

      return {
        ok: false,
        printed: 0,
        reason:
          "No children were supplied for label printing."
      };
    }


    const mode =
      String(
        options.mode ||
        "household"
      )
        .trim()
        .toLowerCase();


    /*
     * Save everything needed for Reprint.
     */

    state.lastJob = {

      mode: mode,

      children:
        rows.map(function (child) {
          return {
            ...child
          };
        })
    };


    /*
     * Verify local printer service before printing.
     */

    await refreshPrinter();


    if (!state.ready) {

      revealReprint();

      toast(
        "Check-in is saved, but the label printer is unavailable. Use Reprint Label after the printer is ready.",
        "error"
      );

      return {
        ok: false,
        printed: 0,
        reason:
          "Local printer service unavailable."
      };
    }


    try {

      const response =
        await fetch(
          SERVICE_URL + "/print",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify({
                mode: mode,
                children: rows
              })
          }
        );


      let result = null;


      try {

        result =
          await response.json();

      } catch (jsonError) {

        result = {
          ok: false,
          error:
            "Printer service returned an invalid response."
        };
      }


      if (
        !response.ok ||
        !result ||
        result.ok !== true
      ) {

        throw new Error(
          result &&
          result.error
            ? result.error
            : "Label printing failed."
        );
      }


      state.ready = true;

      if (result.printerName) {

        state.printerName =
          String(result.printerName);
      }


      updateStatus(
        state.printerName ||
        "DYMO ready",
        "online"
      );


      revealReprint();


      const printed =
        Number(
          result.labelsPrinted || 0
        );


      if (options.isReprint) {

        toast(
          "Label reprinted.",
          "success"
        );

      } else if (mode === "guest") {

        toast(
          printed === 2
            ? "Parent pickup label and child badge printed."
            : `${printed} guest labels printed.`,
          "success"
        );

      } else {

        toast(
          "Household pickup label printed.",
          "success"
        );
      }


      return {
        ok: true,
        printed: printed,
        total: printed,
        mode: mode,
        printerName:
          state.printerName
      };


    } catch (error) {

      revealReprint();

      /*
       * CRITICAL:
       *
       * A printer failure NEVER reverses or cancels
       * the check-in. Printing is secondary.
       */

      toast(
        "Check-in is saved, but the label did not print. Use Reprint Label after checking the printer.",
        "error"
      );

      console.error(
        "VUMC label printing failed:",
        error
      );


      return {
        ok: false,
        printed: 0,
        mode: mode,
        reason:
          error.message ||
          "Label printing failed."
      };
    }
  }


  /* ============================================================
     LEGACY-COMPATIBLE PRINTLABELS

     Existing app.js can continue calling:

       KidsPrinter.printLabels(children)

     Default = household.

     New app.js can call:

       KidsPrinter.printLabels(
         children,
         { mode: "guest" }
       )
     ============================================================ */

  async function printLabels(
    children,
    options = {}
  ) {

    return sendPrintJob(
      children,
      options
    );
  }


  /* ============================================================
     PUBLIC API
     ============================================================ */

  window.KidsPrinter =
    Object.freeze({

      prepareReprint: function (children, options = {}) {
        state.lastJob = { children: normalizeChildren(children), mode: options.mode || "household" };
        if (state.lastJob.children.length) revealReprint();
      },

      reset: function () {
        state.lastJob = null;
        const button = document.getElementById("dymoReprintBtn");
        if (button) button.hidden = true;
      },

      printLabels:
        printLabels,

      refreshPrinter:
        refreshPrinter,

      getStatus:
        function () {

          return {

            ready:
              state.ready,

            status:
              state.status,

            printerName:
              state.printerName,

            version:
              state.serviceVersion,

            qrReady:
              state.qrReady
          };
        }
    });


  /* ============================================================
     INITIALIZE
     ============================================================ */

  function initialize() {

    ensureUi();

    refreshPrinter();


    /*
     * Periodically refresh printer readiness.
     *
     * This means the kiosk can notice if the
     * DYMO is unplugged/reconnected without
     * reloading the website.
     */

    setInterval(
      refreshPrinter,
      30000
    );
  }


  if (
    document.readyState === "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      initialize,
      {
        once: true
      }
    );

  } else {

    initialize();
  }

})();
