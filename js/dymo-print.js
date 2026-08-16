(function () {
  "use strict";

  const SDK_URL =
    "https://cdn.jsdelivr.net/gh/dymosoftware/dymo-connect-framework@master/dymo.connect.framework.min.js";

  const state = {
    ready: false,
    printer: null,
    lastJob: null,
    status: "Checking printer…"
  };


  /* ============================================================
     XML ESCAPE
     ============================================================ */

  function escapeXml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }


  /* ============================================================
     UI
     ============================================================ */

  function ensureUi() {

    if (!document.getElementById("dymoPrinterStyles")) {

      const style =
        document.createElement("style");

      style.id =
        "dymoPrinterStyles";

      style.textContent = `
        #dymoPrinterPill{
          display:inline-flex;
          align-items:center;
          gap:8px;
          padding:8px 12px;
          border:1px solid rgba(255,255,255,.2);
          border-radius:999px;
          background:rgba(255,255,255,.08);
          color:#fff;
          font-size:13px;
          white-space:nowrap
        }

        #dymoPrinterPill .dymo-dot{
          width:9px;
          height:9px;
          border-radius:50%;
          background:#f3bd45
        }

        #dymoPrinterPill.online .dymo-dot{
          background:#69d49b
        }

        #dymoPrinterPill.offline .dymo-dot{
          background:#ff7d8c
        }

        #dymoToast{
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
          font:700 14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif
        }

        #dymoToast.error{
          background:#9d2634
        }

        #dymoToast.success{
          background:#1d704a
        }

        #dymoReprintBtn{
          margin:16px 8px 0;
          min-height:46px;
          padding:11px 16px;
          border:0;
          border-radius:12px;
          background:#edf4fb;
          color:#0b2a52;
          font:800 15px system-ui,-apple-system,"Segoe UI",sans-serif;
          cursor:pointer
        }
      `;

      document.head.appendChild(style);
    }


    if (!document.getElementById("dymoPrinterPill")) {

      const headerActions =
        document.querySelector(".header-actions");

      if (headerActions) {

        const pill =
          document.createElement("div");

        pill.id =
          "dymoPrinterPill";

        pill.innerHTML =
          '<span class="dymo-dot"></span>' +
          '<span id="dymoPrinterText">Checking DYMO…</span>';

        headerActions.appendChild(pill);
      }
    }


    if (!document.getElementById("dymoReprintBtn")) {

      const returnButton =
        document.getElementById("newCheckinBtn");

      const successScreen =
        document.getElementById("successScreen");


      if (successScreen) {

        const button =
          document.createElement("button");

        button.id =
          "dymoReprintBtn";

        button.type =
          "button";

        button.textContent =
          "Reprint Child Label(s)";

        button.hidden =
          true;


        button.addEventListener(
          "click",
          async () => {

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

          }
        );


        if (returnButton?.parentNode) {

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


  /* ============================================================
     STATUS
     ============================================================ */

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
        pill.classList.add(type);
      }
    }


    if (text) {
      text.textContent = message;
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
        document.createElement("div");

      el.id =
        "dymoToast";

      document.body.appendChild(el);
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
        () => {
          el.hidden = true;
        },
        6500
      );
  }


  /* ============================================================
     DYMO FRAMEWORK
     ============================================================ */

  function getFramework() {

    return (
      window.dymo?.label?.framework ||
      null
    );
  }


  function printerName(printer) {

    return String(
      printer &&
      (
        printer.name ||
        printer.modelName ||
        printer.printerName ||
        ""
      )
    ).trim();
  }


  function selectPrinter(printers) {

    if (
      !Array.isArray(printers) ||
      !printers.length
    ) {
      return null;
    }


    const connected =
      printers.filter(
        (printer) =>
          printer.isConnected !== false
      );


    const pool =
      connected.length
        ? connected
        : printers;


    return (

      pool.find((printer) =>
        `${
          printer.name || ""
        } ${
          printer.modelName || ""
        }`
          .toLowerCase()
          .includes(
            "dymo labelwriter 450 turbo"
          )
      )

      ||

      pool.find((printer) =>
        `${
          printer.name || ""
        } ${
          printer.modelName || ""
        }`
          .toLowerCase()
          .includes(
            "labelwriter"
          )
      )

      ||

      pool[0]

    );
  }


  /* ============================================================
     REFRESH PRINTER
     ============================================================ */

  async function refreshPrinter() {

    ensureUi();


    const framework =
      getFramework();


    if (!framework) {

      state.ready =
        false;

      state.printer =
        null;

      updateStatus(
        "DYMO unavailable",
        "offline"
      );

      return null;
    }


    try {

      if (
        typeof framework.init ===
        "function"
      ) {
        framework.init();
      }


      const printer =
        selectPrinter(
          framework.getPrinters()
        );


      if (!printer) {

        state.ready =
          false;

        state.printer =
          null;

        updateStatus(
          "DYMO not found",
          "offline"
        );

        return null;
      }


      state.printer =
        printer;

      state.ready =
        true;


      updateStatus(
        printerName(printer) ||
          "DYMO ready",
        "online"
      );


      return printer;


    } catch (error) {

      state.ready =
        false;

      state.printer =
        null;


      updateStatus(
        "DYMO unavailable",
        "offline"
      );


      console.warn(
        "DYMO printer check failed:",
        error
      );


      return null;
    }
  }


  /* ============================================================
     BUILD CHILD LABEL

     Label:
       3.5" x 1.25"
       DYMO 30252 Address

     Layout:
       CHILD NAME
       SERVICE / ROOM
       NOTES: allergy / instructions

     Pickup code is intentionally NOT printed.
     ============================================================ */

  function buildLabelXml(child) {

    const name =
      escapeXml(
        child?.name ||
        "Child"
      );


    const room =
      escapeXml(
        child?.service ||
        "VUMC Kids"
      );


    const rawNote =
      String(
        child?.note ||
        ""
      ).trim();


    /*
     * Only print the NOTES line when
     * an actual note exists.
     */

    const noteText =
      rawNote
        ? `NOTES: ${rawNote}`
        : "";


    return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips" MediaType="Default">

  <PaperOrientation>
    Landscape
  </PaperOrientation>

  <Id>
    Address
  </Id>

  <PaperName>
    30252 Address
  </PaperName>


  <DrawCommands>

    <RoundRectangle
      X="0"
      Y="0"
      Width="1581"
      Height="5040"
      Rx="0"
      Ry="0"
    />

  </DrawCommands>


  <!-- ========================================================
       CHILD NAME
       ======================================================== -->

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
        False
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

          <String>${name}</String>

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
      X="180"
      Y="70"
      Width="4560"
      Height="570"
    />

  </ObjectInfo>


  <!-- ========================================================
       SERVICE / ROOM
       ======================================================== -->

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
        False
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

          <String>${room}</String>

          <Attributes>

            <Font
              Family="Arial"
              Size="12"
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
      X="180"
      Y="625"
      Width="4560"
      Height="330"
    />

  </ObjectInfo>


  <!-- ========================================================
       NOTES / ALLERGY INFORMATION

       Empty when the child has no notes.
       ======================================================== -->

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
        False
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

          <String>${escapeXml(noteText)}</String>

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
      X="180"
      Y="970"
      Width="4560"
      Height="470"
    />

  </ObjectInfo>

</DieCutLabel>`;
  }


  /* ============================================================
     PRINT ONE CHILD LABEL
     ============================================================ */

  async function printOne(child) {

    const framework =
      getFramework();


    if (!framework) {

      throw new Error(
        "DYMO printing service is unavailable."
      );
    }


    const printer =
      state.printer ||
      await refreshPrinter();


    if (!printer) {

      throw new Error(
        "No DYMO LabelWriter printer was found."
      );
    }


    const name =
      printerName(printer);


    if (!name) {

      throw new Error(
        "DYMO printer name could not be determined."
      );
    }


    const labelXml =
      buildLabelXml(child);


    const label =
      framework.openLabelXml(
        labelXml
      );


    if (
      label &&
      typeof label.printAsync ===
        "function"
    ) {

      await label.printAsync(
        name,
        "",
        ""
      );

    } else if (
      label &&
      typeof label.print ===
        "function"
    ) {

      label.print(
        name,
        "",
        ""
      );

    } else {

      framework.printLabel(
        name,
        "",
        labelXml,
        ""
      );

    }
  }


  /* ============================================================
     REPRINT BUTTON
     ============================================================ */

  function revealReprint() {

    ensureUi();


    const button =
      document.getElementById(
        "dymoReprintBtn"
      );


    if (button) {
      button.hidden = false;
    }
  }


  /* ============================================================
     PRINT LABELS
     ============================================================ */

  async function printLabels(
    children,
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
          "No children were supplied for label printing."
      };

    }


    /*
     * Preserve full child data including
     * service and notes for reprinting.
     */

    state.lastJob = {

      children:
        rows.map(
          (child) => ({
            ...child
          })
        )

    };


    if (!state.ready) {
      await refreshPrinter();
    }


    if (
      !state.ready ||
      !state.printer
    ) {

      revealReprint();


      toast(
        "Check-in is saved, but the DYMO printer is unavailable. Reconnect it and use Reprint Child Label(s).",
        "error"
      );


      return {
        ok: false,
        printed: 0,
        reason:
          "DYMO printer unavailable."
      };
    }


    let printed =
      0;


    const errors =
      [];


    for (const child of rows) {

      try {

        await printOne(child);

        printed += 1;

      } catch (error) {

        errors.push(
          `${
            child.name ||
            "Child"
          }: ${
            error.message
          }`
        );

      }

    }


    revealReprint();


    if (errors.length) {

      toast(
        `Check-in is saved. Printed ${printed} of ${rows.length} label(s). ${errors[0]}`,
        "error"
      );


      return {

        ok: false,

        printed,

        total:
          rows.length,

        reason:
          errors.join(" | ")

      };
    }


    toast(
      `${
        options.isReprint
          ? "Reprinted"
          : "Printed"
      } ${printed} child label${
        printed === 1
          ? ""
          : "s"
      }.`,
      "success"
    );


    return {

      ok: true,

      printed,

      total:
        rows.length,

      printerName:
        printerName(
          state.printer
        )

    };
  }


  /* ============================================================
     LOAD DYMO SDK
     ============================================================ */

  function loadSdk() {

    ensureUi();


    if (getFramework()) {

      refreshPrinter();

      return;
    }


    if (
      document.querySelector(
        'script[data-dymo-sdk="true"]'
      )
    ) {
      return;
    }


    const script =
      document.createElement(
        "script"
      );


    script.src =
      SDK_URL;

    script.async =
      true;

    script.dataset.dymoSdk =
      "true";


    script.onload =
      () =>
        refreshPrinter();


    script.onerror =
      () =>
        updateStatus(
          "DYMO SDK unavailable",
          "offline"
        );


    document.head.appendChild(
      script
    );
  }


  /* ============================================================
     PUBLIC PRINTER API
     ============================================================ */

  window.KidsPrinter =
    Object.freeze({

      printLabels,

      refreshPrinter,

      getStatus:
        () => ({

          ready:
            state.ready,

          status:
            state.status,

          printerName:
            printerName(
              state.printer
            )

        })

    });


  /* ============================================================
     INITIALIZE
     ============================================================ */

  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      loadSdk,
      {
        once: true
      }
    );

  } else {

    loadSdk();

  }

})();
