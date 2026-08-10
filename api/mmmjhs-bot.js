const crypto = require('crypto');
const https = require('https');

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const SCHOOL_NAME = 'Madan Mohan Malviya Junior High School';

const SHEET_HEADERS = {
  Students: [
    'AdmissionNo', 'StudentName', 'Class', 'Section', 'ParentName', 'ParentPhone',
    'NfcUid', 'SchoolBotChatId', 'TelegramUserName', 'Status', 'DueMonths',
    'TuitionDue', 'ExamFeeDue', 'ComputerFeeDue', 'AnnualFeeDue', 'PreviousSessionDue', 'TotalDue'
  ],
  Registrations: [
    'DateTime', 'AdmissionNo', 'StudentName', 'Class', 'Section', 'ParentName',
    'ParentPhone', 'SchoolBotChatId', 'TelegramUserName', 'LinkSource', 'Status'
  ],
  Fee_Due_Messages: [
    'DateTime', 'AdmissionNo', 'StudentName', 'Class', 'Section', 'SchoolBotChatId',
    'DueMonths', 'TuitionDue', 'ExamFeeDue', 'ComputerFeeDue', 'AnnualFeeDue',
    'PreviousSessionDue', 'TotalDue', 'SentBy', 'Status', 'TelegramMessageId'
  ],
  Fee_Receipt_Messages: [
    'DateTime', 'ReceiptNo', 'AdmissionNo', 'StudentName', 'Class', 'Section',
    'SchoolBotChatId', 'AmountPaid', 'PaymentMode', 'ReceiptType', 'SentBy',
    'Status', 'TelegramMessageId'
  ],
  School_Messages: [
    'DateTime', 'MessageCategory', 'TargetType', 'TargetValue', 'AdmissionNos',
    'StudentNames', 'SchoolBotChatIds', 'MessageText', 'SentBy', 'Status',
    'TelegramMessageIds'
  ],
  Exam_Schedule_Messages: [
    'DateTime', 'ExamTerm', 'Class', 'Section', 'Subject', 'ExamDate', 'StartTime',
    'EndTime', 'MaxMarks', 'TargetType', 'SentBy', 'Status', 'TelegramMessageIds'
  ],
  Bot_Events: [
    'DateTime', 'ChatId', 'TelegramUserName', 'Command', 'AdmissionNo', 'Status', 'Message'
  ]
};

function getEnv(name) {
  return process.env[name] || '';
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function base64url(value) {
  return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function requestJson(method, hostname, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const req = https.request({
      method,
      hostname,
      path,
      headers: {
        ...headers,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, response => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function requestForm(method, hostname, path, form) {
  return new Promise((resolve, reject) => {
    const payload = new URLSearchParams(form).toString();
    const req = https.request({
      method,
      hostname,
      path,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, response => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

let cachedAccessToken = null;
let cachedAccessTokenExpiry = 0;

async function getAccessToken() {
  if (cachedAccessToken && Date.now() < cachedAccessTokenExpiry - 60000) return cachedAccessToken;

  const clientEmail = getEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const privateKey = getEnv('GOOGLE_PRIVATE_KEY').replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) throw new Error('Google service account env vars are missing.');

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(JSON.stringify({
    iss: clientEmail,
    scope: SHEETS_SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  }));
  const unsigned = `${header}.${claim}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const tokenResponse = await requestForm('POST', 'oauth2.googleapis.com', '/token', {
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: `${unsigned}.${signature}`
  });

  if (!tokenResponse.access_token) throw new Error(tokenResponse.error_description || 'Google token request failed.');
  cachedAccessToken = tokenResponse.access_token;
  cachedAccessTokenExpiry = Date.now() + (Number(tokenResponse.expires_in || 3600) * 1000);
  return cachedAccessToken;
}

async function sheetsRequest(method, path, body) {
  const token = await getAccessToken();
  return requestJson(method, 'sheets.googleapis.com', path, body, { Authorization: `Bearer ${token}` });
}

function sheetId() {
  const id = getEnv('GOOGLE_SHEET_ID');
  if (!id) throw new Error('GOOGLE_SHEET_ID is missing.');
  return id;
}

function asMap(headers, row) {
  const out = {};
  headers.forEach((header, index) => out[header] = row[index] || '');
  return out;
}

function rowFromMap(headers, row) {
  return headers.map(header => row[header] || '');
}

async function getRows(tab) {
  const encoded = encodeURIComponent(`${tab}!A:Z`);
  const result = await sheetsRequest('GET', `/v4/spreadsheets/${sheetId()}/values/${encoded}`, null);
  const values = result.values || [];
  const headers = values[0] && values[0].length ? values[0] : SHEET_HEADERS[tab];
  return {
    isEmpty: values.length === 0,
    headers,
    rows: values.slice(1).filter(row => row.some(Boolean)).map((row, index) => ({ index: index + 2, values: row, data: asMap(headers, row) }))
  };
}

async function updateRow(tab, rowIndex, headers, data) {
  const range = encodeURIComponent(`${tab}!A${rowIndex}:Z${rowIndex}`);
  await sheetsRequest('PUT', `/v4/spreadsheets/${sheetId()}/values/${range}?valueInputOption=USER_ENTERED`, {
    values: [rowFromMap(headers, data)]
  });
}

async function appendRow(tab, values) {
  const range = encodeURIComponent(`${tab}!A:Z`);
  await sheetsRequest('POST', `/v4/spreadsheets/${sheetId()}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    values: [values]
  });
}

async function logEvent(chatId, username, command, admissionNo, status, message) {
  try {
    await appendRow('Bot_Events', [new Date().toLocaleString('en-IN'), chatId, username, command, admissionNo || '', status, message]);
  } catch (error) {
    console.error('Bot event log failed:', error.message);
  }
}

function normalizeAdmission(value) {
  return String(value || '').replace(/^#/, '').trim();
}

function getTelegramName(from = {}) {
  return [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || 'Parent';
}

function classSection(row) {
  const cls = row.Class || '';
  const section = row.Section || '';
  return [cls, section].filter(Boolean).join(' - ');
}

function helpMessage(name) {
  return `Welcome to ${SCHOOL_NAME}!

Hello ${name || 'Parent'}!
This is the official school ERP message bot.

Parents - link for school messages:
/register <Admission No>
/link <Admission No>
Example: /register 2507

Check registration:
/status <Admission No>
Example: /status 2507

Check fee dues:
/fees <Admission No>
Example: /fees 2507

Check which child is linked to this chat:
/whoami

Attendance card commands are handled by the separate attendance bot only.`;
}

async function sendTelegram(chatId, text) {
  const token = getEnv('MMMJHS_BOT_TOKEN');
  if (!token) throw new Error('MMMJHS_BOT_TOKEN is missing.');
  return requestJson('POST', 'api.telegram.org', `/bot${token}/sendMessage`, {
    chat_id: chatId,
    text: `${SCHOOL_NAME}\n\n${text}`
  });
}

function findStudentMatches(students, admissionNo) {
  const clean = normalizeAdmission(admissionNo);
  return students.filter(item => normalizeAdmission(item.data.AdmissionNo) === clean);
}

async function handleRegister(chatId, from, admissionNo, command) {
  if (!admissionNo) {
    await sendTelegram(chatId, `Usage Error\n\nPlease send:\n/register <Admission No>\nExample: /register 2507`);
    return;
  }

  const studentsResult = await getRows('Students');
  const matches = findStudentMatches(studentsResult.rows, admissionNo);
  const username = getTelegramName(from);

  if (matches.length === 0) {
    const msg = `Student Not Found\n\nNo student registered with Admission No ${admissionNo}. Please check the admission number on your school ID card or fee receipt.`;
    await sendTelegram(chatId, msg);
    await logEvent(chatId, username, command, admissionNo, 'Not Found', msg);
    return;
  }

  if (matches.length > 1) {
    const msg = `Duplicate Admission Number\n\nAdmission No ${admissionNo} is found on more than one school sheet record. Please contact the school office before linking.`;
    await sendTelegram(chatId, msg);
    await logEvent(chatId, username, command, admissionNo, 'Duplicate Blocked', msg);
    return;
  }

  const studentRow = matches[0];
  const student = studentRow.data;
  const studentHeaders = studentsResult.headers && studentsResult.headers.length ? studentsResult.headers : SHEET_HEADERS.Students;
  student.SchoolBotChatId = String(chatId);
  student.TelegramUserName = username;
  student.Status = 'Linked';
  await updateRow('Students', studentRow.index, studentHeaders, student);

  const reg = {
    DateTime: new Date().toLocaleString('en-IN'),
    AdmissionNo: student.AdmissionNo,
    StudentName: student.StudentName,
    Class: student.Class,
    Section: student.Section,
    ParentName: student.ParentName,
    ParentPhone: student.ParentPhone,
    SchoolBotChatId: String(chatId),
    TelegramUserName: username,
    LinkSource: `Telegram /${command}`,
    Status: 'Linked'
  };

  try {
    const registrations = await getRows('Registrations');
    const existing = registrations.rows.find(row => normalizeAdmission(row.data.AdmissionNo) === normalizeAdmission(admissionNo));
    if (existing) await updateRow('Registrations', existing.index, registrations.headers, reg);
    else await appendRow('Registrations', rowFromMap(SHEET_HEADERS.Registrations, reg));
  } catch (error) {
    console.error('Registration sheet update failed:', error.message);
  }

  const msg = `Successfully Linked!

Dear ${username}, your ward ${student.StudentName} (${classSection(student)}) has been connected to @mmmjhschoolbot.

You will receive fee receipts, fee reminders, school notices, and exam report alerts on this phone.`;
  await sendTelegram(chatId, msg);
  await logEvent(chatId, username, command, admissionNo, 'Linked', `Linked ${student.StudentName}`);
}

async function handleStatus(chatId, from, admissionNo) {
  if (!admissionNo) {
    await sendTelegram(chatId, `Usage Error\n\nPlease send:\n/status <Admission No>\nExample: /status 2507`);
    return;
  }
  const name = getTelegramName(from);

  const studentsResult = await getRows('Students');
  const matches = findStudentMatches(studentsResult.rows, admissionNo);
  if (matches.length === 0) {
    await sendTelegram(chatId, `Student Not Found\n\nNo student registered with Admission No ${admissionNo}. Please check the admission number on your school ID card or fee receipt.`);
    await logEvent(chatId, name, 'status', admissionNo, 'Not Found', 'Status checked but student not found');
    return;
  }
  if (matches.length > 1) {
    await sendTelegram(chatId, `Duplicate Admission Number\n\nAdmission No ${admissionNo} is found on more than one school sheet record. Please contact the school office before linking.`);
    await logEvent(chatId, name, 'status', admissionNo, 'Duplicate Blocked', 'Status checked but duplicate admission found');
    return;
  }

  const student = matches[0].data;
  let registration = null;
  try {
    const registrations = await getRows('Registrations');
    registration = registrations.rows.find(row => normalizeAdmission(row.data.AdmissionNo) === normalizeAdmission(admissionNo));
  } catch (error) {
    console.error('Registration status lookup failed:', error.message);
  }

  const savedChatId = student.SchoolBotChatId || registration?.data?.SchoolBotChatId || '';
  const sameChat = String(savedChatId || '') === String(chatId);
  const statusText = savedChatId
    ? (sameChat ? 'This phone is linked.' : 'This admission is linked to another chat ID.')
    : `Not linked yet. Send /register ${admissionNo} to link this phone.`;

  await sendTelegram(chatId, `Registration Status

Student: ${student.StudentName}
Admission No: ${student.AdmissionNo}
Class: ${classSection(student)}
Status: ${statusText}`);
  await logEvent(chatId, name, 'status', admissionNo, 'Checked', 'Status checked');
}

async function handleFees(chatId, admissionNo) {
  if (!admissionNo) {
    await sendTelegram(chatId, `Usage Error\n\nPlease send:\n/fees <Admission No>\nExample: /fees 2507`);
    return;
  }
  const { rows } = await getRows('Students');
  const matches = findStudentMatches(rows, admissionNo);
  if (matches.length !== 1) {
    await sendTelegram(chatId, matches.length > 1 ? `Duplicate Admission Number\n\nAdmission No ${admissionNo} is duplicated. Please contact the school office.` : `Student Not Found\n\nNo student registered with Admission No ${admissionNo}.`);
    return;
  }
  const s = matches[0].data;
  const lines = [];
  if (s.DueMonths) lines.push(`Due Months: ${s.DueMonths}`);
  if (s.TuitionDue) lines.push(`Tuition Due: Rs ${s.TuitionDue}`);
  if (s.ExamFeeDue) lines.push(`Exam Fee Due: Rs ${s.ExamFeeDue}`);
  if (s.ComputerFeeDue) lines.push(`Computer Fee Due: Rs ${s.ComputerFeeDue}`);
  if (s.AnnualFeeDue) lines.push(`Annual Fee Due: Rs ${s.AnnualFeeDue}`);
  if (s.PreviousSessionDue) lines.push(`Previous Session Due: Rs ${s.PreviousSessionDue}`);
  if (s.TotalDue) lines.push(`Total Due: Rs ${s.TotalDue}`);
  await sendTelegram(chatId, `Fee Status

Student: ${s.StudentName}
Admission No: ${s.AdmissionNo}
Class: ${classSection(s)}

${lines.length ? lines.join('\n') : 'Fee due fields are not filled in the Google Sheet yet.'}`);
}

async function handleWhoAmI(chatId, from) {
  let linked = [];
  try {
    const { rows } = await getRows('Registrations');
    linked = rows.filter(row => String(row.data.SchoolBotChatId || '') === String(chatId));
  } catch (error) {
    console.error('Whoami registration lookup failed:', error.message);
  }
  if (!linked.length) {
    const { rows } = await getRows('Students');
    linked = rows.filter(row => String(row.data.SchoolBotChatId || '') === String(chatId));
  }
  if (!linked.length) {
    await sendTelegram(chatId, `No Student Linked\n\nDear ${getTelegramName(from)}, this chat is not linked with any ERP student yet.\n\nSend /register <Admission No> to link.`);
    return;
  }
  await sendTelegram(chatId, `Linked Student(s)\n\n${linked.map(row => `Admission ${row.data.AdmissionNo}: ${row.data.StudentName} (${classSection(row.data)})`).join('\n')}`);
}

async function handleTelegramUpdate(update) {
  const message = update.message || update.edited_message;
  if (!message || !message.chat || !message.text) return;

  const chatId = message.chat.id;
  const from = message.from || {};
  const text = String(message.text || '').trim();
  const parts = text.split(/\s+/);
  const command = String(parts[0] || '').replace(/^\/+/, '').split('@')[0].toLowerCase();
  const admissionNo = normalizeAdmission(parts[1] || (/^\d{1,6}$/.test(parts[0]) ? parts[0] : ''));
  const effectiveCommand = /^\d{1,6}$/.test(parts[0]) ? 'register' : command;

  if (['start', 'help', 'commands', 'menu'].includes(effectiveCommand) && !admissionNo) {
    await sendTelegram(chatId, helpMessage(getTelegramName(from)));
    await logEvent(chatId, getTelegramName(from), effectiveCommand, '', 'Help Sent', 'Help menu sent');
    return;
  }

  if (['register', 'link', 'start'].includes(effectiveCommand)) return handleRegister(chatId, from, admissionNo, effectiveCommand);
  if (effectiveCommand === 'status') return handleStatus(chatId, from, admissionNo);
  if (effectiveCommand === 'fees') return handleFees(chatId, admissionNo);
  if (['whoami', 'mychildren', 'myward'].includes(effectiveCommand)) return handleWhoAmI(chatId, from);

  await sendTelegram(chatId, helpMessage(getTelegramName(from)));
}

async function getRegistrations() {
  const { rows } = await getRows('Registrations');
  return rows.map(row => row.data);
}

async function logErpMessage(req, res) {
  const body = req.body || {};
  const type = String(body.type || '').trim();
  const payload = body.payload || {};
  const now = new Date().toLocaleString('en-IN');

  if (type === 'fee_due') {
    await appendRow('Fee_Due_Messages', [
      now,
      payload.AdmissionNo || '',
      payload.StudentName || '',
      payload.Class || '',
      payload.Section || '',
      payload.SchoolBotChatId || '',
      payload.DueMonths || '',
      payload.TuitionDue || '',
      payload.ExamFeeDue || '',
      payload.ComputerFeeDue || '',
      payload.AnnualFeeDue || '',
      payload.PreviousSessionDue || '',
      payload.TotalDue || '',
      payload.SentBy || 'ERP',
      payload.Status || 'Sent',
      payload.TelegramMessageId || ''
    ]);
    return json(res, 200, { ok: true, sheet: 'Fee_Due_Messages' });
  }

  if (type === 'fee_receipt') {
    await appendRow('Fee_Receipt_Messages', [
      now,
      payload.ReceiptNo || '',
      payload.AdmissionNo || '',
      payload.StudentName || '',
      payload.Class || '',
      payload.Section || '',
      payload.SchoolBotChatId || '',
      payload.AmountPaid || '',
      payload.PaymentMode || '',
      payload.ReceiptType || '',
      payload.SentBy || 'ERP',
      payload.Status || 'Sent',
      payload.TelegramMessageId || ''
    ]);
    return json(res, 200, { ok: true, sheet: 'Fee_Receipt_Messages' });
  }

  if (type === 'school_message') {
    await appendRow('School_Messages', [
      now,
      payload.MessageCategory || '',
      payload.TargetType || '',
      payload.TargetValue || '',
      payload.AdmissionNos || '',
      payload.StudentNames || '',
      payload.SchoolBotChatIds || '',
      payload.MessageText || '',
      payload.SentBy || 'ERP',
      payload.Status || 'Sent',
      payload.TelegramMessageIds || ''
    ]);
    return json(res, 200, { ok: true, sheet: 'School_Messages' });
  }

  if (type === 'exam_schedule') {
    await appendRow('Exam_Schedule_Messages', [
      now,
      payload.ExamTerm || '',
      payload.Class || '',
      payload.Section || '',
      payload.Subject || '',
      payload.ExamDate || '',
      payload.StartTime || '',
      payload.EndTime || '',
      payload.MaxMarks || '',
      payload.TargetType || '',
      payload.SentBy || 'ERP',
      payload.Status || 'Sent',
      payload.TelegramMessageIds || ''
    ]);
    return json(res, 200, { ok: true, sheet: 'Exam_Schedule_Messages' });
  }

  return json(res, 400, { ok: false, error: 'Unknown log type.' });
}

async function setupWebhook(req, res) {
  const secret = getEnv('BOT_ADMIN_SECRET');
  if (secret && req.query.secret !== secret) return json(res, 403, { ok: false, error: 'Forbidden' });
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const webhookUrl = `${proto}://${host}/api/mmmjhs-bot`;
  const token = getEnv('MMMJHS_BOT_TOKEN');
  const result = await requestJson('POST', 'api.telegram.org', `/bot${token}/setWebhook`, {
    url: webhookUrl,
    drop_pending_updates: false
  });
  return json(res, 200, { ok: true, webhookUrl, telegram: result });
}

async function setupSheet(req, res) {
  const secret = getEnv('BOT_ADMIN_SECRET');
  if (secret && req.query.secret !== secret) return json(res, 403, { ok: false, error: 'Forbidden' });
  const metadata = await sheetsRequest('GET', `/v4/spreadsheets/${sheetId()}`, null);
  const existingTitles = new Set((metadata.sheets || []).map(s => s.properties.title));
  const requests = Object.keys(SHEET_HEADERS)
    .filter(title => !existingTitles.has(title))
    .map(title => ({ addSheet: { properties: { title } } }));
  if (requests.length) await sheetsRequest('POST', `/v4/spreadsheets/${sheetId()}:batchUpdate`, { requests });
  for (const [tab, headers] of Object.entries(SHEET_HEADERS)) {
    const current = await getRows(tab).catch(() => ({ headers: [], rows: [] }));
    if (current.isEmpty || !current.headers.length || current.headers.join('|') !== headers.join('|')) {
      await sheetsRequest('PUT', `/v4/spreadsheets/${sheetId()}/values/${encodeURIComponent(`${tab}!A1:Z1`)}?valueInputOption=USER_ENTERED`, { values: [headers] });
    }
  }
  return json(res, 200, { ok: true, tabs: Object.keys(SHEET_HEADERS) });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      if (req.query.action === 'setupWebhook') return setupWebhook(req, res);
      if (req.query.action === 'setupSheet') return setupSheet(req, res);
      if (req.query.action === 'registrations') return json(res, 200, { ok: true, registrations: await getRegistrations() });
      return json(res, 200, { ok: true, service: '@mmmjhschoolbot webhook' });
    }

    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });
    if (req.query.action === 'logMessage') return logErpMessage(req, res);
    await handleTelegramUpdate(req.body || {});
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error(error);
    try {
      const message = req.body?.message || req.body?.edited_message;
      const chatId = message?.chat?.id;
      if (chatId) {
        await sendTelegram(chatId, `Server Error\n\nThe school bot received your message but could not complete it.\nReason: ${error.message}\n\nPlease tell the school office/admin to check Render environment variables and Google Sheet access.`);
      }
    } catch (replyError) {
      console.error('Could not send error reply:', replyError.message);
    }
    return json(res, 200, { ok: false, error: error.message });
  }
};
