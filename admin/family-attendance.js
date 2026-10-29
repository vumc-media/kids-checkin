/* General attendance is separate from children's active pickup records. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let records = [];
  const tab = document.createElement('button');
  tab.type = 'button'; tab.className = 'tab'; tab.dataset.tab = 'attendance'; tab.textContent = 'Family Attendance';
  document.querySelector('.tabs').appendChild(tab);
  const panel = document.createElement('section');
  panel.id = 'attendanceTab'; panel.className = 'tab-panel card'; panel.hidden = true;
  panel.innerHTML = `<div class="section-head"><div><h2>Family Attendance</h2><p>Adults and children checked in together. Child pickup records remain in the other tabs.</p></div>
    <div class="filters"><input id="attendanceDate" type="date" aria-label="Filter family attendance by date"><input id="attendanceSearch" class="search" placeholder="Search person or group" aria-label="Search family attendance"><button id="attendanceExport" class="secondary">Export CSV</button></div></div>
    <p id="attendanceStatus" role="status"></p><div id="attendanceList" class="records"></div>`;
  $('dashboard').appendChild(panel);
  function filtered() {
    const query = $('attendanceSearch').value.trim().toLowerCase();
    return records.filter(r => (!$('attendanceDate').value || r.date === $('attendanceDate').value) && (!query || [r.names,r.services].join(' ').toLowerCase().includes(query)));
  }
  function render() {
    $('attendanceList').innerHTML = filtered().map(r => `<article class="record"><div><h3>${escape(r.names)}</h3><p>${escape(r.submitted)}</p><p>${escape(r.services)}</p>
      ${r.adults ? `<p>Adults: ${escape(r.adults)}</p>` : ''}${r.children ? `<p>Children: ${escape(r.children)}</p>` : ''}</div></article>`).join('') || '<div class="empty">No matching attendance.</div>';
  }
  async function load() {
    $('attendanceStatus').textContent = 'Loading attendance…';
    try {
      const response = await fetch(window.VUMC_ADMIN_CONFIG.scriptUrl, {method:'POST',body:new URLSearchParams({action:'familyAttendance',adminPin:sessionStorage.getItem('vumcAdminPin') || ''})});
      const data = await response.json();
      if (!response.ok || data.ok !== true) throw new Error(data.error || 'Unable to load attendance.');
      records = data.attendance || []; render();
      $('attendanceStatus').textContent = 'Most recent 500 family submissions. Older records remain in the FamilyAttendance sheet.';
    } catch(error) { records=[]; render(); $('attendanceStatus').textContent=error.message; }
  }
  document.addEventListener('click', event => {
    if (!event.target.matches('.tab')) return;
    panel.hidden = event.target.dataset.tab !== 'attendance';
    if (!panel.hidden) load();
  });
  $('attendanceDate').onchange = render; $('attendanceSearch').oninput = render;
  $('refreshBtn').addEventListener('click',()=>{if(!panel.hidden)load();});
  $('logoutBtn').addEventListener('click',()=>{records=[];render();panel.hidden=true;});
  $('attendanceExport').onclick = () => {
    const cell = value => '"' + String(value ?? '').replace(/^[=+@\-]/,"'$&").replace(/"/g,'""') + '"';
    const lines = [['Date','People','Adults','Children','Check-In Time','Services / Groups'],...filtered().map(r=>[r.date,r.names,r.adults,r.children,r.submitted,r.services])];
    const url = URL.createObjectURL(new Blob([lines.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='vumc-family-attendance.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
})();
