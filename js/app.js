(function () {
  "use strict";

  const state = {
    people: [],
    selected: new Map(),
    pending: null,
    stream: null,
    facingMode: "user",
    captureTarget: "parent",
    capturePersonId: "",
    parentPhoto: "",
    childPhotos: {},
    existingParentFileId: "",
    existingChildFileIds: {}
  };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const refs = {};

  function bindRefs() {
    [
      "landingScreen","appContent","landingCheckinBtn","landingGuestBtn","landingPickupBtn",
      "landingBackendDot","landingBackendText","homeBtn","backendDot","backendText","searchInput",
      "clearSearchBtn","refreshRosterBtn","resultsList","selectedList","checkinNote",
      "submitCheckinBtn","checkinNotice","guestForm","guestNotice","pickupCodeInput","verifyPickupBtn",
      "pickupNotice","pickupResult","successNames","successCode","newCheckinBtn","cameraView",
      "cameraVideo","cameraCanvas","cameraTitle","cameraHelp","cameraNotice","captureBtn","switchCameraBtn",
      "retakeParentBtn","parentPreview","childPhotoList","useSavedPhotosBtn",
      "takeNewPhotosBtn","finishPhotoBtn","skipPhotosBtn","savedPhotosPanel"
    ].forEach(id => refs[id] = document.getElementById(id));
  }

  const escapeHtml = value => String(value ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");

  function showNotice(el, msg, type="") { el.textContent = msg; el.className = `notice ${type}`.trim(); }
  function hideNotice(el) { el.textContent = ""; el.className = "notice hidden"; }
  function setBusy(btn, busy, label) {
    if (!btn.dataset.defaultLabel) btn.dataset.defaultLabel = btn.textContent;
    btn.disabled = busy;
    btn.textContent = busy ? label : btn.dataset.defaultLabel;
  }
  function switchView(id) {
    $$(".view").forEach(v => v.classList.remove("active"));
    $$(".nav-btn").forEach(b => b.classList.remove("active"));
    document.getElementById(id)?.classList.add("active");
    $(`.nav-btn[data-view="${id}"]`)?.classList.add("active");
  }
  function openApp(id) {
    refs.landingScreen.classList.add("hidden");
    refs.appContent.classList.remove("hidden");
    switchView(id);
    window.scrollTo({top:0});
    setTimeout(() => id === "checkinView" ? refs.searchInput.focus() : id === "pickupView" && refs.pickupCodeInput.focus(), 120);
  }
  function stopCamera() {
    if (state.stream) state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
    if (refs.cameraVideo) refs.cameraVideo.srcObject = null;
  }
  function resetCameraState() {
    stopCamera();
    state.pending = null;
    state.parentPhoto = "";
    state.childPhotos = {};
    state.existingParentFileId = "";
    state.existingChildFileIds = {};
    refs.parentPreview.removeAttribute("src");
    refs.parentPreview.classList.add("hidden");
    refs.childPhotoList.innerHTML = "";
    refs.savedPhotosPanel.classList.add("hidden");
    hideNotice(refs.cameraNotice);
  }
  function returnHome() {
    resetCameraState();
    refs.appContent.classList.add("hidden");
    refs.landingScreen.classList.remove("hidden");
    [refs.checkinNotice,refs.guestNotice,refs.pickupNotice].forEach(hideNotice);
    refs.pickupResult.classList.add("hidden");
    refs.pickupResult.innerHTML = "";
    refs.pickupCodeInput.value = "";
    window.scrollTo({top:0});
  }
  async function checkBackend() {
    try {
      const r = await KidsAPI.health(), m = r.message || "Backend online";
      refs.backendDot.className = "status-dot online"; refs.backendText.textContent = m;
      refs.landingBackendDot.className = "status-dot online"; refs.landingBackendText.textContent = "Check-in service ready";
    } catch (_) {
      refs.backendDot.className = "status-dot offline"; refs.backendText.textContent = "Backend unavailable";
      refs.landingBackendDot.className = "status-dot offline"; refs.landingBackendText.textContent = "Check-in service unavailable";
    }
  }
  async function loadRoster(force=false) {
    refs.resultsList.innerHTML = '<div class="empty">Loading the child roster…</div>';
    setBusy(refs.refreshRosterBtn,true,"Refreshing…");
    try {
      const r = await KidsAPI.getPeople(force);
      state.people = Array.isArray(r.rows) ? r.rows : [];
      filterRoster();
    } catch(e) {
      refs.resultsList.innerHTML = `<div class="empty">Unable to load the roster.<br>${escapeHtml(e.message)}</div>`;
    } finally { setBusy(refs.refreshRosterBtn,false); }
  }
  function renderResults(rows) {
    if (!rows.length) { refs.resultsList.innerHTML='<div class="empty">No children matched your search.</div>'; return; }
    refs.resultsList.innerHTML = rows.map(p => {
      const selected = state.selected.has(String(p.id));
      const meta = [p.grade,p.phone].filter(Boolean).join(" • ");
      return `<article class="person-card"><div><div class="person-name">${escapeHtml(p.name||"Unnamed child")}</div>
      <div class="person-meta">${escapeHtml(meta||"Planning Center child record")}</div></div>
      <button class="btn ${selected?"danger":"primary"} select-person" type="button" data-person-id="${escapeHtml(p.id)}">${selected?"Remove":"Select"}</button></article>`;
    }).join("");
  }
  function renderSelected() {
    const people=[...state.selected.values()];
    if (!people.length) {
      refs.selectedList.innerHTML='<div class="empty">No children selected.</div>';
      refs.submitCheckinBtn.disabled=true; return;
    }
    refs.selectedList.innerHTML=people.map(p=>`
      <div class="selected-child-card">
        <div class="selected-child-header">
          <strong>${escapeHtml(p.name)}</strong>
          <button class="btn danger remove-selected" type="button" data-person-id="${escapeHtml(p.id)}" aria-label="Remove ${escapeHtml(p.name)}">×</button>
        </div>
        <div class="field selected-service-field">
          <label for="service-${escapeHtml(p.id)}">Service / Event</label>
          <select class="child-service-select" id="service-${escapeHtml(p.id)}" data-person-id="${escapeHtml(p.id)}">
            <option value="Sunday School" ${(p.service||"Sunday School")==="Sunday School"?"selected":""}>Sunday School</option>
            <option value="Children's Church" ${p.service==="Children's Church"?"selected":""}>Children's Church</option>
            <option value="Nursery" ${p.service==="Nursery"?"selected":""}>Nursery</option>
            <option value="Wednesday Kids" ${p.service==="Wednesday Kids"?"selected":""}>Wednesday Kids</option>
            <option value="Other / General" ${p.service==="Other / General"?"selected":""}>Other / General</option>
          </select>
        </div>
      </div>`).join("");
    refs.submitCheckinBtn.disabled=false;
  }
  function togglePerson(id) {
    id=String(id); const p=state.people.find(x=>String(x.id)===id); if(!p)return;
    if (state.selected.has(id)) {
      state.selected.delete(id);
    } else {
      state.selected.set(id, Object.assign({}, p, { service: p.service || "Sunday School" }));
    }
    filterRoster(); renderSelected();
  }
  function filterRoster() {
    const q=refs.searchInput.value.trim().toLowerCase();
    renderResults(state.people.filter(p=>[p.name,p.first_name,p.last_name,p.grade,p.phone].join(" ").toLowerCase().includes(q)));
  }

  function renderChildPhotoCards() {
    const people = state.pending ? state.pending.people : [];
    refs.childPhotoList.innerHTML = people.map(function (person) {
      const id = String(person.id);
      const photo = state.childPhotos[id] || "";
      return `
        <div class="photo-card child-photo-card" data-person-id="${escapeHtml(id)}">
          <h3>${escapeHtml(person.name)}</h3>
          <img class="child-preview ${photo ? "" : "hidden"}" src="${photo ? escapeHtml(photo) : ""}" alt="${escapeHtml(person.name)} photo">
          <button class="btn secondary full-btn retake-child-btn" type="button" data-person-id="${escapeHtml(id)}">
            ${photo ? "Retake Child Photo" : "Take Child Photo"}
          </button>
        </div>`;
    }).join("");
  }

  async function beginPhotoStep(pending) {
    state.pending = pending;
    state.parentPhoto = "";
    state.childPhotos = {};
    state.existingParentFileId = "";
    state.existingChildFileIds = {};

    switchView("cameraView");
    window.scrollTo({top:0});
    refs.cameraTitle.textContent = "Photo Confirmation";
    refs.cameraHelp.textContent = "Take one parent or guardian photo and a separate photo for each selected child.";
    refs.savedPhotosPanel.classList.add("hidden");
    hideNotice(refs.cameraNotice);
    renderChildPhotoCards();

    try {
      const saved = await KidsAPI.getSavedPhotos(pending.people.map(p=>String(p.id)));
      if (saved.parentFileId) {
        state.existingParentFileId = saved.parentFileId;
        state.parentPhoto = saved.parentPhotoData || "";
      }

      const savedChildren = saved.children || {};
      pending.people.forEach(function (person) {
        const id = String(person.id);
        if (savedChildren[id] && savedChildren[id].fileId) {
          state.existingChildFileIds[id] = savedChildren[id].fileId;
          state.childPhotos[id] = savedChildren[id].photoData || "";
        }
      });

      if (state.parentPhoto) {
        refs.parentPreview.src = state.parentPhoto;
        refs.parentPreview.classList.remove("hidden");
      }
      renderChildPhotoCards();

      const allChildrenSaved = pending.people.every(p => Boolean(state.childPhotos[String(p.id)]));
      if (state.parentPhoto && allChildrenSaved) {
        refs.savedPhotosPanel.classList.remove("hidden");
        stopCamera();
        return;
      }
    } catch (_) {}

    if (!state.parentPhoto) {
      await startCamera("parent");
    } else {
      const missing = pending.people.find(p => !state.childPhotos[String(p.id)]);
      if (missing) await startCamera("child", String(missing.id));
    }
  }

  async function startCamera(target, personId="") {
    stopCamera();
    state.captureTarget = target;
    state.capturePersonId = personId;
    refs.savedPhotosPanel.classList.add("hidden");

    if (target === "parent") {
      refs.cameraTitle.textContent = "Take Parent / Guardian Photo";
      refs.cameraHelp.textContent = "Center the authorized pickup adult in the frame.";
    } else {
      const person = state.pending.people.find(p => String(p.id) === String(personId));
      refs.cameraTitle.textContent = `Take Photo: ${person ? person.name : "Child"}`;
      refs.cameraHelp.textContent = "Take a separate photo for this child.";
    }

    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: state.facingMode }, width:{ideal:1280}, height:{ideal:720} },
        audio:false
      });
      refs.cameraVideo.srcObject = state.stream;
      await refs.cameraVideo.play();
      hideNotice(refs.cameraNotice);
    } catch(e) {
      showNotice(refs.cameraNotice, `${e.name || "CameraError"}: ${e.message || "Camera access failed."}`, "error");
    }
  }

  function nextMissingChild() {
    return state.pending.people.find(p => !state.childPhotos[String(p.id)]);
  }

  function captureFrame() {
    const video=refs.cameraVideo, canvas=refs.cameraCanvas;
    if (!video.videoWidth) {
      showNotice(refs.cameraNotice,"Camera is not ready yet.","error");
      return;
    }

    const max=900, scale=Math.min(1,max/video.videoWidth);
    canvas.width=Math.round(video.videoWidth*scale);
    canvas.height=Math.round(video.videoHeight*scale);
    canvas.getContext("2d").drawImage(video,0,0,canvas.width,canvas.height);
    const data=canvas.toDataURL("image/jpeg",0.78);

    if (state.captureTarget==="parent") {
      state.parentPhoto=data;
      state.existingParentFileId="";
      refs.parentPreview.src=data;
      refs.parentPreview.classList.remove("hidden");
      const missing=nextMissingChild();
      if (missing) startCamera("child", String(missing.id));
      else stopCamera();
    } else {
      const id=String(state.capturePersonId);
      state.childPhotos[id]=data;
      delete state.existingChildFileIds[id];
      renderChildPhotoCards();
      const missing=nextMissingChild();
      if (missing) startCamera("child", String(missing.id));
      else {
        stopCamera();
        refs.cameraTitle.textContent="Review Photos";
        refs.cameraHelp.textContent="Confirm the parent photo and each child photo, then finalize check-in.";
      }
    }
  }

  async function finishPhotos(useSaved=false) {
    if (!state.pending) return;

    const people = state.pending.people;
    const missingChild = people.find(p => !state.childPhotos[String(p.id)]);

    if (!state.parentPhoto || missingChild) {
      showNotice(
        refs.cameraNotice,
        !state.parentPhoto
          ? "Take or select a parent / guardian photo before finalizing."
          : `Take or select a photo for ${missingChild.name} before finalizing.`,
        "error"
      );
      return;
    }

    setBusy(refs.finishPhotoBtn, true, "Finalizing check-in…");
    setBusy(refs.useSavedPhotosBtn, true, "Finalizing check-in…");
    setBusy(refs.skipPhotosBtn, true, "Finalizing check-in…");

    try {
      const newChildPhotos = {};
      people.forEach(function (person) {
        const id = String(person.id);
        if (!state.existingChildFileIds[id]) newChildPhotos[id] = state.childPhotos[id] || "";
      });

      const result = await KidsAPI.finalizeCheckin({
        people: state.pending.submitPayload.people,
        noteText: state.pending.submitPayload.noteText,
        label: state.pending.submitPayload.label,
        parentPhoto: state.existingParentFileId ? "" : state.parentPhoto,
        childPhotos: newChildPhotos,
        existingParentFileId: state.existingParentFileId,
        existingChildFileIds: state.existingChildFileIds
      });

      state.pending.pickupCode = result.pickupCode || "";
      showSuccess();
    } catch (e) {
      showNotice(refs.cameraNotice, e.message, "error");
    } finally {
      setBusy(refs.finishPhotoBtn, false);
      setBusy(refs.useSavedPhotosBtn, false);
      setBusy(refs.skipPhotosBtn, false);
    }
  }

  async function skipPhotosAndFinish() {
    if (!state.pending) return;
    setBusy(refs.skipPhotosBtn, true, "Finalizing check-in…");
    hideNotice(refs.cameraNotice);

    try {
      const result = await KidsAPI.submitAttendance(state.pending.submitPayload);
      state.pending.pickupCode = result.pickupCode || "";
      showSuccess();
    } catch (e) {
      showNotice(refs.cameraNotice, e.message, "error");
    } finally {
      setBusy(refs.skipPhotosBtn, false);
    }
  }

  function showSuccess() {
    stopCamera();
    const p=state.pending;
    refs.successNames.textContent=p.people.map(x=>x.name).join(", ");
    refs.successCode.textContent=p.pickupCode||"—";
    if (p.afterSuccess) p.afterSuccess();
    state.pending=null;
    switchView("successScreen");
  }

  async function submitSelectedCheckin() {
    const people=[...state.selected.values()].map(p=>({
      id:String(p.id),
      name:p.name,
      service:p.service||"Sunday School"
    }));
    if(!people.length)return;

    hideNotice(refs.checkinNotice);
    setBusy(refs.submitCheckinBtn,true,"Opening camera…");

    try {
      await beginPhotoStep({
        people,
        pickupCode:"",
        submitPayload:{
          people,
          noteText:refs.checkinNote.value.trim(),
          label:"Multiple Services"
        },
        afterSuccess() {
          state.selected.clear();
          refs.checkinNote.value="";
          refs.searchInput.value="";
          renderSelected();
          renderResults(state.people);
        }
      });
    } catch(e) {
      showNotice(refs.checkinNotice,e.message,"error");
    } finally {
      setBusy(refs.submitCheckinBtn,false);
      refs.submitCheckinBtn.disabled=state.selected.size===0;
    }
  }

  async function submitGuest(event) {
    event.preventDefault(); hideNotice(refs.guestNotice);
    const childFirst=$("#guestChildFirst").value.trim(), childLast=$("#guestChildLast").value.trim();
    const parentName=$("#guestParentName").value.trim(), phone=$("#guestPhone").value.trim();
    const grade=$("#guestGrade").value.trim(), room=$("#guestRoom").value, notes=$("#guestNotes").value.trim();
    if(!childFirst||!parentName||!phone){showNotice(refs.guestNotice,"Enter the child name, parent or guardian, and mobile number.","error");return;}
    const fullName=[childFirst,childLast].filter(Boolean).join(" ");
    const noteText=[`Guest parent/guardian: ${parentName}`,`Mobile: ${phone}`,grade?`Age/grade: ${grade}`:"",notes?`Notes: ${notes}`:""].filter(Boolean).join("\n");
    const btn=refs.guestForm.querySelector('button[type="submit"]'); setBusy(btn,true,"Submitting…");
    try {
      const guestId=`guest-${Date.now()}`;
      const people=[{id:guestId,name:fullName,service:room}];
      await beginPhotoStep({
        people,
        pickupCode:"",
        submitPayload:{people,noteText,label:`${room} • Guest`},
        afterSuccess(){refs.guestForm.reset();}
      });
    } catch(e){showNotice(refs.guestNotice,e.message,"error");}
    finally{setBusy(btn,false);}
  }

  async function verifyPickup() {
    const code=refs.pickupCodeInput.value.trim().toUpperCase();
    hideNotice(refs.pickupNotice); refs.pickupResult.classList.add("hidden"); refs.pickupResult.innerHTML="";
    if(code.length!==4){showNotice(refs.pickupNotice,"Enter the complete four-character pickup code.","error");return;}
    setBusy(refs.verifyPickupBtn,true,"Verifying…");
    try {
      const r=await KidsAPI.verifyPickupCode(code), record=r.record||{}, children=Array.isArray(record.children)?record.children:[];
      refs.pickupResult.innerHTML=`<h3>Pickup Verified</h3><p><strong>Children:</strong> ${escapeHtml(children.join(", ")||"No names returned")}</p><p><strong>Code:</strong> ${escapeHtml(record.code||code)}</p><p><strong>Checked out:</strong> ${escapeHtml(record.checkedOutAt||"Completed")}</p>`;
      refs.pickupResult.classList.remove("hidden"); showNotice(refs.pickupNotice,r.message||"Pickup code verified.","success"); refs.pickupCodeInput.value="";
    } catch(e){showNotice(refs.pickupNotice,e.message,"error");}
    finally{setBusy(refs.verifyPickupBtn,false);}
  }

  function registerEvents() {
    refs.landingCheckinBtn.onclick=()=>openApp("checkinView");
    refs.landingGuestBtn.onclick=()=>openApp("guestView");
    refs.landingPickupBtn.onclick=()=>openApp("pickupView");
    refs.homeBtn.onclick=returnHome;
    $$(".nav-btn").forEach(b=>b.onclick=()=>switchView(b.dataset.view));
    refs.searchInput.oninput=filterRoster;
    refs.clearSearchBtn.onclick=()=>{refs.searchInput.value="";filterRoster();refs.searchInput.focus();};
    refs.refreshRosterBtn.onclick=()=>loadRoster(true);
    refs.resultsList.onclick=e=>{const b=e.target.closest(".select-person");if(b)togglePerson(b.dataset.personId);};
    refs.selectedList.onclick=e=>{const b=e.target.closest(".remove-selected");if(b)togglePerson(b.dataset.personId);};
    refs.selectedList.onchange=e=>{
      const select=e.target.closest(".child-service-select");
      if(!select)return;
      const person=state.selected.get(String(select.dataset.personId));
      if(person) person.service=select.value;
    };
    refs.submitCheckinBtn.onclick=submitSelectedCheckin;
    refs.guestForm.onsubmit=submitGuest;
    refs.verifyPickupBtn.onclick=verifyPickup;
    refs.pickupCodeInput.oninput=()=>refs.pickupCodeInput.value=refs.pickupCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,4);
    refs.pickupCodeInput.onkeydown=e=>{if(e.key==="Enter")verifyPickup();};
    refs.newCheckinBtn.onclick=returnHome;
    refs.captureBtn.onclick=captureFrame;
    refs.switchCameraBtn.onclick=()=>{state.facingMode=state.facingMode==="user"?"environment":"user";startCamera(state.captureTarget);};
    refs.retakeParentBtn.onclick=()=>startCamera("parent");
    refs.childPhotoList.onclick=e=>{const b=e.target.closest(".retake-child-btn");if(b)startCamera("child",String(b.dataset.personId));};
    refs.takeNewPhotosBtn.onclick=()=>{state.existingParentFileId="";state.existingChildFileIds={};state.parentPhoto="";state.childPhotos={};refs.parentPreview.classList.add("hidden");renderChildPhotoCards();startCamera("parent");};
    refs.useSavedPhotosBtn.onclick=()=>finishPhotos(true);
    refs.finishPhotoBtn.onclick=()=>finishPhotos(false);
    refs.skipPhotosBtn.onclick=skipPhotosAndFinish;
  }

  async function init() {
    bindRefs(); registerEvents(); renderSelected();
    await Promise.all([checkBackend(),loadRoster(false)]);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./service-worker.js", { updateViaCache: "none" })
        .then(function (registration) { return registration.update(); })
        .catch(function () {});
    }
  }
  document.addEventListener("DOMContentLoaded",init);
})();