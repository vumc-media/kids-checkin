(function () {
  "use strict";

  const DYMO_PORTS = [
    41951,
    41952,
    41953,
    41954,
    41955,
    41956,
    41957,
    41958,
    41959,
    41960
  ];

  const state = {
    ready: false,
    printerName: "",
    port: null,
    lastJob: null,
    status: "Checking printer…"
  };


  /* ==========================================================================
  HELPERS
  ========================================================================== */

  function escapeXml(value) {

    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  }


  function ensureUi() {

    if (
      !document.getElementById(
        "dymoPrinterStyles"
      )
    ) {

      const style =
        document.createElement(
          "style"
        );

      style.id =
        "dymoPrinterStyles";

      style.textContent = `

        #dymoPrinterPill {
          display:inline-flex;
          align-items:center;
          gap:8px;
          padding:8px 12px;
          border:
            1px solid
            rgba(255,255,255,.2);
          border-radius:999px;
          background:
            rgba(255,255,255,.08);
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
          max-width:420px;
          padding:14px 16px;
          border-radius:14px;
          box-shadow:
            0 14px 34px
            rgba(0,0,0,.2);
          background:#0b2a52;
          color:#fff;
          font:
            700 14px/1.4
            system-ui,
            -apple-system,
            "Segoe UI",
            sans-serif;
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
          font:
            800 15px
            system-ui,
            -apple-system,
            "Segoe UI",
            sans-serif;
          cursor:pointer;
        }

      `;

      document.head.appendChild(
        style
      );

    }


    if (
      !document.getElementById(
        "dymoPrinterPill"
      )
    ) {

      const headerActions =
        document.querySelector(
          ".header-actions"
        );


      if (headerActions) {

        const pill =
          document.createElement(
            "div"
          );

        pill.id =
          "dymoPrinterPill";

        pill.innerHTML =
          '<span class="dymo-dot"></span>' +
          '<span id="dymoPrinterText">' +
          'Checking DYMO…' +
          '</span>';

        headerActions.appendChild(
          pill
        );

      }

    }


    if (
      !document.getElementById(
        "dymoReprintBtn"
      )
    ) {

      const successScreen =
        document.getElementById(
          "successScreen"
        );

      const returnButton =
        document.getElementById(
          "newCheckinBtn"
        );


      if (successScreen) {

        const button =
          document.createElement(
            "button"
          );

        button.id =
          "dymoReprintBtn";

        button.type =
          "button";

        button.textContent =
          "Reprint Child Label(s)";

        button.hidden =
          true;


        button.onclick =
          async function () {

            if (!state.lastJob) {
              return;
            }


            button.disabled =
              true;

            button.textContent =
              "Reprinting…";


            try {

              await printLabels(
                state.lastJob.children,
                state.lastJob.note,
                {
                  isReprint: true
                }
              );

            } finally {

              button.disabled =
                false;

              button.textContent =
                "Reprint Child Label(s)";

            }

          };


        if (
          returnButton &&
          returnButton.parentNode
        ) {

          returnButton.parentNode
            .insertBefore(
              button,
              returnButton
            );

        } else {

          successScreen.appendChild(
            button
          );

        }

      }

    }

  }


  function updateStatus(
    message,
    type
  ) {

    state.status =
      message;

    ensureUi();


    const pill =
      document.getElementById(
        "dymoPrinterPill"
      );

    const text =
      document.getElementById(
        "dymoPrinterText"
      );


    if (pill) {

      pill.classList.remove(
        "online",
        "offline"
      );


      if (type) {

        pill.classList.add(
          type
        );

      }

    }


    if (text) {

      text.textContent =
        message;

    }

  }


  function toast(
    message,
    type = ""
  ) {

    let el =
      document.getElementById(
        "dymoToast"
      );


    if (!el) {

      el =
        document.createElement(
          "div"
        );

      el.id =
        "dymoToast";

      document.body.appendChild(
        el
      );

    }


    el.className =
      type;

    el.textContent =
      message;

    el.hidden =
      false;


    clearTimeout(
      toast.timer
    );


    toast.timer =
      setTimeout(
        function () {

          el.hidden =
            true;

        },
        6500
      );

  }


  /* ==========================================================================
  DYMO LOCAL SERVICE
  ========================================================================== */

  function serviceUrl(
    port,
    command
  ) {

    return (
      "https://localhost:" +
      port +
      "/DYMO/DLS/Printing/" +
      command
    );

  }


  async function fetchWithTimeout(
    url,
    options,
    timeoutMs
  ) {

    const controller =
      new AbortController();


    const timer =
      setTimeout(
        function () {

          controller.abort();

        },
        timeoutMs || 2500
      );


    try {

      return await fetch(
        url,
        {
          ...options,
          signal:
            controller.signal
        }
      );

    } finally {

      clearTimeout(
        timer
      );

    }

  }


  /* ==========================================================================
  PARSE GETPRINTERS XML
  ========================================================================== */

  function parsePrintersXml(
    xmlText
  ) {

    const parser =
      new DOMParser();


    const doc =
      parser.parseFromString(
        xmlText,
        "application/xml"
      );


    const rows = [];


    [
      "LabelWriterPrinter",
      "TapePrinter",
      "DZPrinter"
    ].forEach(
      function (tagName) {

        const nodes =
          doc.getElementsByTagName(
            tagName
          );


        for (
          let i = 0;
          i < nodes.length;
          i++
        ) {

          const node =
            nodes[i];


          function text(name) {

            const item =
              node.getElementsByTagName(
                name
              )[0];

            return item
              ? item.textContent.trim()
              : "";

          }


          rows.push({

            name:
              text("Name"),

            modelName:
              text("ModelName"),

            isConnected:
              text(
                "IsConnected"
              )
                .toLowerCase() ===
              "true",

            isLocal:
              text(
                "IsLocal"
              )
                .toLowerCase() ===
              "true"

          });

        }

      }
    );


    return rows;

  }


  function selectPrinter(
    printers
  ) {

    if (
      !Array.isArray(printers) ||
      !printers.length
    ) {

      return null;

    }


    const connected =
      printers.filter(
        function (printer) {

          return (
            printer.isConnected !==
            false
          );

        }
      );


    const pool =
      connected.length
        ? connected
        : printers;


    return (

      pool.find(
        function (printer) {

          const text =
            (
              printer.name +
              " " +
              printer.modelName
            )
              .toLowerCase();


          return (
            text.includes(
              "labelwriter"
            ) &&
            text.includes(
              "450"
            ) &&
            text.includes(
              "turbo"
            )
          );

        }
      )

      ||

      pool.find(
        function (printer) {

          return (
            (
              printer.name +
              " " +
              printer.modelName
            )
              .toLowerCase()
              .includes(
                "labelwriter"
              )
          );

        }
      )

      ||

      pool[0]

    );

  }


  /* ==========================================================================
  FIND LOCAL DYMO SERVICE + PRINTER
  ========================================================================== */

  async function refreshPrinter() {

    ensureUi();


    updateStatus(
      "Checking DYMO…",
      ""
    );


    for (
      const port of DYMO_PORTS
    ) {

      try {

        const response =
          await fetchWithTimeout(
            serviceUrl(
              port,
              "GetPrinters"
            ),
            {
              method:
                "GET",

              cache:
                "no-store"
            },
            1800
          );


        if (
          !response.ok
        ) {

          continue;

        }


        const xml =
          await response.text();


        const printers =
          parsePrintersXml(
            xml
          );


        console.log(
          "DYMO port",
          port,
          "printers:",
          printers
        );


        const printer =
          selectPrinter(
            printers
          );


        if (!printer) {

          continue;

        }


        state.ready =
          true;

        state.port =
          port;

        state.printerName =
          printer.name;


        updateStatus(
          printer.name,
          "online"
        );


        console.log(
          "DYMO selected:",
          printer.name,
          "on port",
          port
        );


        return printer;

      } catch (error) {

        console.log(
          "DYMO port " +
          port +
          " unavailable."
        );

      }

    }


    state.ready =
      false;

    state.port =
      null;

    state.printerName =
      "";


    updateStatus(
      "DYMO not found",
      "offline"
    );


    return null;

  }


  /* ==========================================================================
  LABEL XML

  Pickup PIN intentionally excluded.
  ========================================================================== */

  function buildLabelXml(
    child,
    note
  ) {

    const childName =
      escapeXml(
        child &&
        child.name
          ? child.name
          : "Child"
      );


    const room =
      escapeXml(
        child &&
        child.service
          ? child.service
          : "VUMC Kids"
      );


    const cleanNote =
      String(
        note || ""
      ).trim();


    const noteText =
      cleanNote
        ? (
            "NOTE: " +
            cleanNote
          )
        : "";


    return `<?xml version="1.0" encoding="utf-8"?>

<DieCutLabel
  Version="8.0"
  Units="twips"
>

  <PaperOrientation>
    Landscape
  </PaperOrientation>

  <Id>
    Address
  </Id>

  <PaperName>
    30252 Address
  </PaperName>

  <DrawCommands />

  <ObjectInfo>

    <TextObject>

      <Name>
        ChildName
      </Name>

      <ForeColor
        Alpha="255"
        Red="0"
        Green="0"
        Blue="0"
      />

      <BackColor
        Alpha="0"
        Red="255"
        Green="255"
        Blue="255"
      />

      <LinkedObjectName>
      </LinkedObjectName>

      <Rotation>
        Rotation0
      </Rotation>

      <IsMirrored>
        False
      </IsMirrored>

      <IsVariable>
        True
      </IsVariable>

      <HorizontalAlignment>
        Left
      </HorizontalAlignment>

      <VerticalAlignment>
        Middle
      </VerticalAlignment>

      <TextFitMode>
        ShrinkToFit
      </TextFitMode>

      <UseFullFontHeight>
        True
      </UseFullFontHeight>

      <Verticalized>
        False
      </Verticalized>

      <StyledText>

        <Element>

          <String>
            ${childName}
          </String>

          <Attributes>

            <Font
              Family="Arial"
              Size="18"
              Bold="True"
              Italic="False"
              Underline="False"
              Strikeout="False"
            />

            <ForeColor
              Alpha="255"
              Red="0"
              Green="0"
              Blue="0"
            />

          </Attributes>

        </Element>

      </StyledText>

    </TextObject>

    <Bounds
      X="220"
      Y="120"
      Width="4600"
      Height="560"
    />

  </ObjectInfo>


  <ObjectInfo>

    <TextObject>

      <Name>
        Room
      </Name>

      <ForeColor
        Alpha="255"
        Red="0"
        Green="0"
        Blue="0"
      />

      <BackColor
        Alpha="0"
        Red="255"
        Green="255"
        Blue="255"
      />

      <LinkedObjectName>
      </LinkedObjectName>

      <Rotation>
        Rotation0
      </Rotation>

      <IsMirrored>
        False
      </IsMirrored>

      <IsVariable>
        True
      </IsVariable>

      <HorizontalAlignment>
        Left
      </HorizontalAlignment>

      <VerticalAlignment>
        Middle
      </VerticalAlignment>

      <TextFitMode>
        ShrinkToFit
      </TextFitMode>

      <UseFullFontHeight>
        True
      </UseFullFontHeight>

      <Verticalized>
        False
      </Verticalized>

      <StyledText>

        <Element>

          <String>
            ${room}
          </String>

          <Attributes>

            <Font
              Family="Arial"
              Size="11"
              Bold="True"
              Italic="False"
              Underline="False"
              Strikeout="False"
            />

            <ForeColor
              Alpha="255"
              Red="0"
              Green="0"
              Blue="0"
            />

          </Attributes>

        </Element>

      </StyledText>

    </TextObject>

    <Bounds
      X="220"
      Y="690"
      Width="4600"
      Height="330"
    />

  </ObjectInfo>


  <ObjectInfo>

    <TextObject>

      <Name>
        Notes
      </Name>

      <ForeColor
        Alpha="255"
        Red="0"
        Green="0"
        Blue="0"
      />

      <BackColor
        Alpha="0"
        Red="255"
        Green="255"
        Blue="255"
      />

      <LinkedObjectName>
      </LinkedObjectName>

      <Rotation>
        Rotation0
      </Rotation>

      <IsMirrored>
        False
      </IsMirrored>

      <IsVariable>
        True
      </IsVariable>

      <HorizontalAlignment>
        Left
      </HorizontalAlignment>

      <VerticalAlignment>
        Top
      </VerticalAlignment>

      <TextFitMode>
        ShrinkToFit
      </TextFitMode>

      <UseFullFontHeight>
        True
      </UseFullFontHeight>

      <Verticalized>
        False
      </Verticalized>

      <StyledText>

        <Element>

          <String>
            ${escapeXml(
              noteText
            )}
          </String>

          <Attributes>

            <Font
              Family="Arial"
              Size="9"
              Bold="True"
              Italic="False"
              Underline="False"
              Strikeout="False"
            />

            <ForeColor
              Alpha="255"
              Red="0"
              Green="0"
              Blue="0"
            />

          </Attributes>

        </Element>

      </StyledText>

    </TextObject>

    <Bounds
      X="220"
      Y="1020"
      Width="4600"
      Height="390"
    />

  </ObjectInfo>

</DieCutLabel>`;

  }


  /* ==========================================================================
  PRINT DIRECTLY TO LOCAL DYMO SERVICE
  ========================================================================== */

  async function printOne(
    child,
    note
  ) {

    if (
      !state.ready ||
      !state.port ||
      !state.printerName
    ) {

      await refreshPrinter();

    }


    if (
      !state.ready ||
      !state.port ||
      !state.printerName
    ) {

      throw new Error(
        "DYMO LabelWriter is unavailable."
      );

    }


    const body =
      new URLSearchParams();


    body.set(
      "printerName",
      state.printerName
    );


    body.set(
      "printParamsXml",
      ""
    );


    body.set(
      "labelXml",
      buildLabelXml(
        child,
        note
      )
    );


    body.set(
      "labelSetXml",
      ""
    );


    const response =
      await fetchWithTimeout(
        serviceUrl(
          state.port,
          "PrintLabel"
        ),
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded;charset=UTF-8"
          },

          body:
            body.toString()
        },
        10000
      );


    if (
      !response.ok
    ) {

      const message =
        await response.text();


      throw new Error(
        message ||
        "DYMO print request failed."
      );

    }

  }


  /* ==========================================================================
  PRINT ALL CHILD LABELS
  ========================================================================== */

  function revealReprint() {

    ensureUi();


    const button =
      document.getElementById(
        "dymoReprintBtn"
      );


    if (button) {

      button.hidden =
        false;

    }

  }


  async function printLabels(
    children,
    note,
    options = {}
  ) {

    const rows =
      Array.isArray(children)
        ? children
        : [];


    if (!rows.length) {

      return {
        ok: false,
        printed: 0,
        reason:
          "No children supplied."
      };

    }


    state.lastJob = {

      children:
        rows.map(
          function (child) {

            return {
              ...child
            };

          }
        ),

      note:
        String(
          note || ""
        )

    };


    if (!state.ready) {

      await refreshPrinter();

    }


    if (!state.ready) {

      revealReprint();


      toast(
        "Check-in is saved, but the DYMO printer is unavailable.",
        "error"
      );


      return {
        ok: false,
        printed: 0,
        reason:
          "DYMO unavailable."
      };

    }


    let printed =
      0;


    const errors =
      [];


    for (
      const child of rows
    ) {

      try {

        await printOne(
          child,
          note
        );


        printed++;

      } catch (error) {

        errors.push(
          (
            child.name ||
            "Child"
          ) +
          ": " +
          error.message
        );

      }

    }


    revealReprint();


    if (errors.length) {

      toast(
        "Check-in is saved. Printed " +
        printed +
        " of " +
        rows.length +
        " label(s). " +
        errors[0],
        "error"
      );


      return {

        ok:
          false,

        printed:
          printed,

        total:
          rows.length,

        reason:
          errors.join(
            " | "
          )

      };

    }


    toast(
      (
        options.isReprint
          ? "Reprinted "
          : "Printed "
      ) +
      printed +
      (
        printed === 1
          ? " child label."
          : " child labels."
      ),
      "success"
    );


    return {

      ok:
        true,

      printed:
        printed,

      total:
        rows.length,

      printerName:
        state.printerName

    };

  }


  /* ==========================================================================
  PUBLIC API
  ========================================================================== */

  window.KidsPrinter =
    Object.freeze({

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

            port:
              state.port

          };

        }

    });


  /* ==========================================================================
  START
  ========================================================================== */

  function start() {

    ensureUi();


    setTimeout(
      refreshPrinter,
      500
    );

  }


  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      start,
      {
        once: true
      }
    );

  } else {

    start();

  }

})();
