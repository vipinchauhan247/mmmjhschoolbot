// Madan Mohan Malviya Junior High School — ERP & Telegram Bot Frontend Logic

let allStudents = [];
let allRegistrations = [];

document.addEventListener('DOMContentLoaded', () => {
  refreshData();
  checkWebhookInfo();
});

// Tab Switcher
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));

  const activeBtn = document.querySelector(`.tab-btn[onclick="switchTab('${tabId}')"]`);
  if (activeBtn) activeBtn.classList.add('active');

  const activeContent = document.getElementById(`tab-${tabId}`);
  if (activeContent) activeContent.classList.add('active');
}

// Refresh all data
function refreshData() {
  loadStudents();
  loadRegistrations();
}

// Load Students from API
async function loadStudents() {
  const tbody = document.getElementById('studentsTbody');
  tbody.innerHTML = '<tr><td colspan="8" class="loading-cell">Loading student records...</td></tr>';

  try {
    const res = await fetch('/api/students');
    const data = await res.json();

    if (!data.ok) {
      tbody.innerHTML = `<tr><td colspan="8" class="loading-cell" style="color: var(--accent-red)">Error loading students: ${escapeHtml(data.error || 'Failed')}</td></tr>`;
      return;
    }

    allStudents = data.students || [];

    if (allStudents.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="loading-cell">No student records found in Google Sheet (Students tab). Please add data to Students tab.</td></tr>';
      populateNoticeStudentDropdown();
      return;
    }

    renderStudentsTable(allStudents);
    populateNoticeStudentDropdown();

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="loading-cell" style="color: var(--accent-red)">Failed to connect to backend server: ${escapeHtml(err.message)}</td></tr>`;
  }
}

// Render Students Table
function renderStudentsTable(students) {
  const tbody = document.getElementById('studentsTbody');
  if (students.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading-cell">No matching students found.</td></tr>';
    return;
  }

  tbody.innerHTML = students.map(s => {
    const adm = escapeHtml(s.AdmissionNo || 'N/A');
    const name = escapeHtml(s.StudentName || 'N/A');
    const className = escapeHtml(s.Class || 'N/A') + ' ' + escapeHtml(s.Section || '');
    const parentName = escapeHtml(s.ParentName || 'N/A');
    const parentPhone = escapeHtml(s.ParentPhone || 'N/A');
    const chatId = String(s.SchoolBotChatId || '').trim();
    const totalDue = parseFloat(s.TotalDue) || 0;

    const botStatusBadge = chatId 
      ? `<span class="badge badge-green">Linked (${escapeHtml(chatId)})</span>` 
      : '<span class="badge badge-red">Not Linked</span>';

    const dueFormatted = `₹${totalDue.toLocaleString('en-IN')}`;

    return `
      <tr>
        <td><strong>${adm}</strong></td>
        <td>${name}</td>
        <td>${className}</td>
        <td>${parentName}</td>
        <td>${parentPhone}</td>
        <td>${botStatusBadge}</td>
        <td><strong>${dueFormatted}</strong></td>
        <td>
          ${chatId ? `<button class="btn btn-secondary btn-sm" onclick="prepareNotice('${chatId}', '${adm}', '${name}')">📢 Fee Alert</button>` : '<span style="color: var(--text-muted); font-size: 12px;">Needs Register</span>'}
        </td>
      </tr>
    `;
  }).join('');
}

// Filter Students Search
function filterStudents() {
  const query = document.getElementById('studentSearch').value.toLowerCase().trim();
  if (!query) {
    renderStudentsTable(allStudents);
    return;
  }
  const filtered = allStudents.filter(s => {
    const name = String(s.StudentName || '').toLowerCase();
    const adm = String(s.AdmissionNo || '').toLowerCase();
    return name.includes(query) || adm.includes(query);
  });
  renderStudentsTable(filtered);
}

// Load Registrations from API
async function loadRegistrations() {
  const tbody = document.getElementById('registrationsTbody');
  tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">Loading bot registrations...</td></tr>';

  try {
    const res = await fetch('/api/registrations');
    const data = await res.json();

    if (!data.ok) {
      tbody.innerHTML = `<tr><td colspan="7" class="loading-cell" style="color: var(--accent-red)">Error: ${escapeHtml(data.error || 'Failed')}</td></tr>`;
      return;
    }

    allRegistrations = data.registrations || [];

    if (allRegistrations.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">No registration logs yet. Parents can link using /register &lt;AdmissionNo&gt; on Telegram.</td></tr>';
      return;
    }

    tbody.innerHTML = allRegistrations.map(r => `
      <tr>
        <td>${escapeHtml(r.Timestamp || 'N/A')}</td>
        <td><strong>${escapeHtml(r.AdmissionNo || 'N/A')}</strong></td>
        <td>${escapeHtml(r.StudentName || 'N/A')}</td>
        <td>${escapeHtml(r.Class || 'N/A')} ${escapeHtml(r.Section || '')}</td>
        <td>${escapeHtml(r.TelegramUserName || 'N/A')}</td>
        <td><code>${escapeHtml(r.SchoolBotChatId || 'N/A')}</code></td>
        <td><span class="badge badge-green">${escapeHtml(r.Status || 'Active')}</span></td>
      </tr>
    `).join('');

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="loading-cell" style="color: var(--accent-red)">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

// Populate Notice Student Dropdown
function populateNoticeStudentDropdown() {
  const select = document.getElementById('noticeStudentSelect');
  select.innerHTML = '<option value="">-- Choose Linked Student --</option>';

  const linkedStudents = allStudents.filter(s => String(s.SchoolBotChatId || '').trim());
  linkedStudents.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.SchoolBotChatId;
    opt.dataset.adm = s.AdmissionNo;
    opt.dataset.name = s.StudentName;
    opt.textContent = `${s.StudentName} (Adm: ${s.AdmissionNo}, Class: ${s.Class}) — ChatID: ${s.SchoolBotChatId}`;
    select.appendChild(opt);
  });
}

function onSelectNoticeStudent() {
  const select = document.getElementById('noticeStudentSelect');
  const chatId = select.value;
  if (chatId) {
    const selectedOpt = select.options[select.selectedIndex];
    document.getElementById('noticeChatId').value = chatId;
    document.getElementById('noticeTitle').value = `School Notice — ${selectedOpt.dataset.name} (Adm: ${selectedOpt.dataset.adm})`;
  }
}

function prepareNotice(chatId, adm, name) {
  switchTab('notices');
  document.getElementById('noticeChatId').value = chatId;
  document.getElementById('noticeTitle').value = `Fee Due Reminder — ${name} (Adm: ${adm})`;
  document.getElementById('noticeMessage').value = `Dear Parent,\nThis is a gentle reminder regarding the pending fee dues for ${name} (Admission No: ${adm}). Kindly clear the dues at the school office. Thank you!`;
}

// Send Notice via Bot
async function sendNotice() {
  const chatId = document.getElementById('noticeChatId').value.trim();
  const title = document.getElementById('noticeTitle').value.trim();
  const message = document.getElementById('noticeMessage').value.trim();
  const alertBox = document.getElementById('noticeAlert');

  if (!chatId || !message) {
    alertBox.className = 'alert-box alert-danger';
    alertBox.textContent = 'Please enter both Chat ID and Notice Message.';
    alertBox.style.display = 'block';
    return;
  }

  alertBox.className = 'alert-box';
  alertBox.textContent = 'Sending message via @mmmjhschoolbot...';
  alertBox.style.display = 'block';

  try {
    const res = await fetch('/api/send-notice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, title, message })
    });
    const data = await res.json();

    if (data.ok) {
      alertBox.className = 'alert-box alert-success';
      alertBox.textContent = '✅ Message sent successfully to parent on Telegram!';
      document.getElementById('noticeMessage').value = '';
    } else {
      alertBox.className = 'alert-box alert-danger';
      alertBox.textContent = `❌ Failed to send message: ${data.error}`;
    }
  } catch (err) {
    alertBox.className = 'alert-box alert-danger';
    alertBox.textContent = `❌ Connection Error: ${err.message}`;
  }
}

// Check Webhook Info
async function checkWebhookInfo() {
  const pre = document.getElementById('webhookInfoJson');
  pre.textContent = 'Fetching Telegram Webhook status...';

  try {
    const res = await fetch('/webhook-info');
    const data = await res.json();
    pre.textContent = JSON.stringify(data, null, 2);

    const badge = document.getElementById('botStatusBadge');
    if (data.ok && data.result && data.result.url) {
      badge.innerHTML = '<span class="status-dot green"></span> @mmmjhschoolbot Active Webhook';
    } else {
      badge.innerHTML = '<span class="status-dot" style="background: var(--accent-red); box-shadow: 0 0 8px var(--accent-red)"></span> Webhook Not Set';
    }
  } catch (err) {
    pre.textContent = `Error checking webhook: ${err.message}`;
  }
}

// Set Webhook Automatically
async function setWebhookAuto() {
  const pre = document.getElementById('webhookInfoJson');
  pre.textContent = 'Setting Telegram webhook...';

  try {
    const res = await fetch('/set-webhook');
    const data = await res.json();
    pre.textContent = JSON.stringify(data, null, 2);
    checkWebhookInfo();
  } catch (err) {
    pre.textContent = `Error setting webhook: ${err.message}`;
  }
}

// Initialize Google Sheet Tabs
async function initGoogleSheetTabs() {
  const alertBox = document.getElementById('initSheetAlert');
  alertBox.className = 'alert-box';
  alertBox.textContent = 'Sending initialization request to Google Apps Script...';
  alertBox.style.display = 'block';

  try {
    const res = await fetch('/api/init-sheets');
    const data = await res.json();

    if (data.ok) {
      alertBox.className = 'alert-box alert-success';
      alertBox.textContent = '✅ Google Sheet initialized! All 7 required tabs with headers are ready.';
    } else {
      alertBox.className = 'alert-box alert-danger';
      alertBox.textContent = `❌ Google Sheet Init Failed: ${data.error}`;
    }
  } catch (err) {
    alertBox.className = 'alert-box alert-danger';
    alertBox.textContent = `❌ Connection Error: ${err.message}`;
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
