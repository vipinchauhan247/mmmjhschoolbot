/**
 * Madan Mohan Malviya Junior High School Bot Logic — @mmmjhschoolbot
 * =================================================================
 * Handles Telegram Webhook events & Google Apps Script Sheet Integration
 */

const axios = require('axios');

// Default fallback configuration (override with process.env)
const DEFAULT_BOT_TOKEN = process.env.BOT_TOKEN || '8012345678:AAF-ExampleSchoolBotToken';
const DEFAULT_GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || '';

function getBotToken() {
  return process.env.BOT_TOKEN || DEFAULT_BOT_TOKEN;
}

function getGoogleScriptUrl() {
  return process.env.GOOGLE_SCRIPT_URL || DEFAULT_GOOGLE_SCRIPT_URL;
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Send Telegram message
 */
async function sendTelegramMessage(chatId, text, parseMode = 'HTML') {
  const token = getBotToken();
  if (!token) {
    console.error('[BOT ERROR] Telegram BOT_TOKEN is missing!');
    return false;
  }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const response = await axios.post(url, {
      chat_id: String(chatId),
      text: text,
      parse_mode: parseMode
    }, { timeout: 10000 });
    return response.data && response.data.ok;
  } catch (err) {
    console.error('[BOT ERROR] sendTelegramMessage failed:', err.response ? err.response.data : err.message);
    return false;
  }
}

/**
 * Query Google Apps Script Web App
 */
async function callAppsScriptGet(params = {}) {
  const scriptUrl = getGoogleScriptUrl();
  if (!scriptUrl) {
    console.error('[SHEET ERROR] GOOGLE_SCRIPT_URL is not configured!');
    return { ok: false, error: 'GOOGLE_SCRIPT_URL not configured' };
  }
  try {
    const response = await axios.get(scriptUrl, { params, timeout: 20000 });
    return response.data;
  } catch (err) {
    console.error('[SHEET ERROR] callAppsScriptGet failed:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Send POST data to Google Apps Script Web App
 */
async function callAppsScriptPost(payload = {}) {
  const scriptUrl = getGoogleScriptUrl();
  if (!scriptUrl) {
    console.error('[SHEET ERROR] GOOGLE_SCRIPT_URL is not configured!');
    return { ok: false, error: 'GOOGLE_SCRIPT_URL not configured' };
  }
  try {
    const response = await axios.post(scriptUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 20000
    });
    return response.data;
  } catch (err) {
    console.error('[SHEET ERROR] callAppsScriptPost failed:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Formats help menu for /start or /help
 */
function getHelpMenuText() {
  return (
    '🏫 <b>Madan Mohan Malviya Junior High School Bot</b>\n' +
    '<i>Welcome to the official parent notification system!</i>\n\n' +
    '📋 <b>Available Bot Commands:</b>\n\n' +
    '🔹 <code>/register &lt;Admission No&gt;</code>\n' +
    'Link your Telegram account to receive student notices & fee alerts.\n' +
    '<i>Example:</i> <code>/register 1658</code>\n\n' +
    '🔹 <code>/link &lt;Admission No&gt;</code>\n' +
    'Same as register — links your child using their Admission Number.\n' +
    '<i>Example:</i> <code>/link 1658</code>\n\n' +
    '🔹 <code>/status &lt;Admission No&gt;</code>\n' +
    'Check if your child\'s admission number is linked.\n' +
    '<i>Example:</i> <code>/status 1658</code>\n\n' +
    '🔹 <code>/fees &lt;Admission No&gt;</code>\n' +
    'Check fee due summary & payment details.\n' +
    '<i>Example:</i> <code>/fees 1658</code>\n\n' +
    '🔹 <code>/whoami</code>\n' +
    'Show all student profiles currently linked to this Telegram account.'
  );
}

/**
 * Handle incoming Telegram command
 */
async function handleBotCommand(message) {
  if (!message || !message.text) return;

  const chatId = message.chat.id;
  const rawText = message.text.trim();
  const parts = rawText.split(/\s+/);
  
  // Extract command name without bot username (e.g. /register@mmmjhschoolbot -> register)
  const command = parts[0].toLowerCase().replace(/^\//, '').split('@')[0];
  const arg1 = parts[1] ? parts[1].trim() : '';

  const user = message.from || {};
  const userNameStr = user.username 
    ? `@${user.username}` 
    : [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Parent';

  console.log(`[BOT CMD] Command: /${command} | Arg: "${arg1}" | ChatID: ${chatId} | User: ${userNameStr}`);

  // 1. /start or /help
  if (command === 'start' && !arg1) {
    await sendTelegramMessage(chatId, getHelpMenuText());
    return;
  }

  if (command === 'help') {
    await sendTelegramMessage(chatId, getHelpMenuText());
    return;
  }

  // 2. /register <Admission No> OR /link <Admission No> OR /start <Admission No>
  if (command === 'register' || command === 'link' || (command === 'start' && arg1)) {
    const admissionNo = arg1;

    if (!admissionNo) {
      await sendTelegramMessage(
        chatId,
        '⚠️ <b>Usage Instructions:</b>\n\n' +
        'Please provide your student\'s Admission Number.\n' +
        'Send: <code>/register &lt;Admission No&gt;</code>\n\n' +
        '<i>Example:</i> <code>/register 1658</code>'
      );
      return;
    }

    // Call Google Apps Script to register student
    const result = await callAppsScriptPost({
      action: 'register_student',
      admissionNo: admissionNo,
      chatId: String(chatId),
      userName: userNameStr
    });

    if (!result.ok) {
      // Check reason
      if (result.reason === 'DUPLICATE') {
        // Requirement 3: Duplicate admission number rule
        await sendTelegramMessage(
          chatId,
          '⚠️ <b>Duplicate Admission Number Detected!</b>\n\n' +
          `Admission Number <code>${escapeHtml(admissionNo)}</code> is assigned to <b>multiple students</b> in our school database.\n\n` +
          '⛔ <b>For safety reasons, automatic linking has been blocked</b> so that wrong parents do not receive another student\'s messages.\n\n' +
          '📞 <b>Action Required:</b> Please contact the school office to verify and fix the duplicate admission number.'
        );
        return;
      }

      if (result.reason === 'NOT_FOUND') {
        // Requirement 4: Not found rule
        await sendTelegramMessage(
          chatId,
          '❌ <b>Student Not Found</b>\n\n' +
          `Admission Number <code>${escapeHtml(admissionNo)}</code> was not found in the school records.\n\n` +
          'Please verify the admission number from the school ID card or fee receipt and try again.'
        );
        return;
      }

      // Generic error fallback
      await sendTelegramMessage(
        chatId,
        '❌ <b>Registration Error</b>\n\n' +
        `Unable to complete registration for <code>${escapeHtml(admissionNo)}</code>.\n` +
        `<i>Error: ${escapeHtml(result.error || result.message || 'Server connection failed')}</i>\n\n` +
        'Please try again later or contact the school administration.'
      );
      return;
    }

    // Requirement 2: Reply success message
    const s = result.student || {};
    const nameDisplay = s.studentName ? escapeHtml(s.studentName) : 'Student';
    const classDisplay = s.className ? `${escapeHtml(s.className)} ${escapeHtml(s.section || '')}` : 'N/A';

    await sendTelegramMessage(
      chatId,
      '✅ <b>Registration Successful!</b>\n\n' +
      `👤 <b>Student Name:</b> ${nameDisplay}\n` +
      `🏫 <b>Class:</b> ${classDisplay}\n` +
      `🆔 <b>Admission No:</b> <code>${escapeHtml(s.admissionNo)}</code>\n` +
      `📱 <b>Linked Telegram:</b> ${escapeHtml(userNameStr)}\n\n` +
      '🎉 Your Telegram chat is now linked to receive automated fee receipts, attendance updates, and official school notices.'
    );
    return;
  }

  // 5. /status <Admission No>
  if (command === 'status') {
    const admissionNo = arg1;

    // If no admission number provided, search all students linked to this Telegram Chat ID
    if (!admissionNo) {
      const linkedData = await callAppsScriptGet({ action: 'get_linked_students', chatId: String(chatId) });
      if (linkedData.ok && linkedData.students && linkedData.students.length > 0) {
        let statusMsg = `📊 <b>Status for Linked Children (${linkedData.students.length}):</b>\n\n`;
        linkedData.students.forEach((s, idx) => {
          statusMsg += `<b>${idx + 1}. ${escapeHtml(s.StudentName || 'N/A')}</b>\n` +
                       `   • Class: ${escapeHtml(s.Class || 'N/A')} ${escapeHtml(s.Section || '')}\n` +
                       `   • Admission No: <code>${escapeHtml(s.AdmissionNo || 'N/A')}</code>\n` +
                       `   • Status: ✅ Linked\n\n`;
        });
        await sendTelegramMessage(chatId, statusMsg);
        return;
      }

      await sendTelegramMessage(
        chatId,
        '📊 <b>Check Link Status</b>\n\n' +
        'No children linked to this chat yet.\n' +
        'Send: <code>/status &lt;Admission No&gt;</code>\n' +
        '<i>Example:</i> <code>/status 1658</code>'
      );
      return;
    }

    const data = await callAppsScriptGet({ action: 'find_student', admissionNo: admissionNo });

    if (!data.ok) {
      await sendTelegramMessage(chatId, `❌ Error querying student status: ${escapeHtml(data.error || 'Server error')}`);
      return;
    }

    if (data.count === 0) {
      await sendTelegramMessage(chatId, `❌ Admission Number <code>${escapeHtml(admissionNo)}</code> not found.`);
      return;
    }

    if (data.isDuplicate || data.count > 1) {
      await sendTelegramMessage(
        chatId,
        '⚠️ <b>Duplicate Admission Number</b>\n\n' +
        `Multiple student records match Admission Number <code>${escapeHtml(admissionNo)}</code>.\n` +
        'Please contact the school office.'
      );
      return;
    }

    const s = data.students[0];
    const linkedChatId = String(s.SchoolBotChatId || '').trim();
    const isLinked = Boolean(linkedChatId);
    const statusTag = isLinked ? '✅ <b>Linked</b>' : '❌ <b>Not Linked</b>';

    await sendTelegramMessage(
      chatId,
      '📊 <b>Student Registration Status</b>\n\n' +
      `👤 <b>Student Name:</b> ${escapeHtml(s.StudentName || 'N/A')}\n` +
      `🏫 <b>Class:</b> ${escapeHtml(s.Class || 'N/A')} ${escapeHtml(s.Section || '')}\n` +
      `🆔 <b>Admission No:</b> <code>${escapeHtml(s.AdmissionNo || admissionNo)}</code>\n` +
      `🔗 <b>Bot Status:</b> ${statusTag}\n` +
      (isLinked ? `📱 <b>Linked Chat ID:</b> <code>${escapeHtml(linkedChatId)}</code>\n` : '\nUse <code>/register ' + escapeHtml(admissionNo) + '</code> to link.')
    );
    return;
  }

  // 6. /fees <Admission No>
  if (command === 'fees') {
    const admissionNo = arg1;
    const formatAmt = (val) => {
      const num = parseFloat(val);
      return isNaN(num) ? '0' : num.toLocaleString('en-IN');
    };

    // If no admission number provided, fetch fees for ALL linked children of this parent
    if (!admissionNo) {
      const linkedData = await callAppsScriptGet({ action: 'get_linked_students', chatId: String(chatId) });
      if (linkedData.ok && linkedData.students && linkedData.students.length > 0) {
        let multiFeeMsg = `💳 <b>Fee Due Summary for Your Children (${linkedData.students.length}):</b>\n\n`;
        let grandTotal = 0;

        linkedData.students.forEach((s, idx) => {
          const totalDue = parseFloat(s.TotalDue) || 0;
          grandTotal += totalDue;
          multiFeeMsg += `<b>${idx + 1}. ${escapeHtml(s.StudentName || 'N/A')}</b> (Class ${escapeHtml(s.Class || '')} ${escapeHtml(s.Section || '')})\n` +
                         `   • Admission No: <code>${escapeHtml(s.AdmissionNo || 'N/A')}</code>\n` +
                         `   • Due Months: ${escapeHtml(s.DueMonths || 'None')}\n` +
                         `   • Total Due: <b>₹${formatAmt(totalDue)}</b>\n\n`;
        });

        multiFeeMsg += `━━━━━━━━━━━━━━━━━━━━━\n` +
                       `🔴 <b>COMBINED TOTAL DUE: ₹${formatAmt(grandTotal)}</b>\n\n` +
                       `<i>Tip: Send <code>/fees &lt;Admission No&gt;</code> for detailed breakdown of a specific child.</i>`;

        await sendTelegramMessage(chatId, multiFeeMsg);
        return;
      }

      await sendTelegramMessage(
        chatId,
        '💰 <b>Check Fee Details</b>\n\n' +
        'No children linked to this chat yet.\n' +
        'Send: <code>/fees &lt;Admission No&gt;</code>\n' +
        '<i>Example:</i> <code>/fees 1658</code>'
      );
      return;
    }

    const data = await callAppsScriptGet({ action: 'find_student', admissionNo: admissionNo });

    if (!data.ok) {
      await sendTelegramMessage(chatId, `❌ Error querying fee details: ${escapeHtml(data.error || 'Server error')}`);
      return;
    }

    if (data.count === 0) {
      await sendTelegramMessage(chatId, `❌ Student with Admission Number <code>${escapeHtml(admissionNo)}</code> not found.`);
      return;
    }

    if (data.isDuplicate || data.count > 1) {
      await sendTelegramMessage(
        chatId,
        '⚠️ <b>Duplicate Admission Number</b>\n\n' +
        `Multiple student records match Admission Number <code>${escapeHtml(admissionNo)}</code>.\n` +
        'Please contact the school office.'
      );
      return;
    }

    const s = data.students[0];
    const dueMonths = s.DueMonths ? escapeHtml(s.DueMonths) : 'None';
    const totalDue = parseFloat(s.TotalDue) || 0;

    let feeMsg = 
      '💳 <b>School Fee Due Summary</b>\n\n' +
      `👤 <b>Student Name:</b> ${escapeHtml(s.StudentName || 'N/A')}\n` +
      `🏫 <b>Class:</b> ${escapeHtml(s.Class || 'N/A')} ${escapeHtml(s.Section || '')}\n` +
      `🆔 <b>Admission No:</b> <code>${escapeHtml(s.AdmissionNo || admissionNo)}</code>\n` +
      `📅 <b>Due Months:</b> ${dueMonths}\n\n` +
      '💵 <b>Fee Breakdown:</b>\n' +
      `• Tuition Fee: ₹${formatAmt(s.TuitionDue)}\n` +
      `• Exam Fee: ₹${formatAmt(s.ExamFeeDue)}\n` +
      `• Computer Fee: ₹${formatAmt(s.ComputerFeeDue)}\n` +
      `• Annual Fee: ₹${formatAmt(s.AnnualFeeDue)}\n` +
      `• Previous Session Due: ₹${formatAmt(s.PreviousSessionDue)}\n` +
      '━━━━━━━━━━━━━━━━━━━━━\n' +
      `🔴 <b>TOTAL FEE DUE: ₹${formatAmt(totalDue)}</b>\n\n`;

    if (totalDue === 0) {
      feeMsg += '✅ <i>All dues cleared! Thank you.</i>';
    } else {
      feeMsg += '⚠️ <i>Please clear the pending dues at the school fee counter or via online portal.</i>';
    }

    await sendTelegramMessage(chatId, feeMsg);
    return;
  }

  // 7. /whoami
  if (command === 'whoami') {
    const data = await callAppsScriptGet({ action: 'get_linked_students', chatId: String(chatId) });

    if (!data.ok) {
      await sendTelegramMessage(chatId, `❌ Error fetching linked profiles: ${escapeHtml(data.error || 'Server error')}`);
      return;
    }

    const students = data.students || [];

    if (students.length === 0) {
      await sendTelegramMessage(
        chatId,
        '👤 <b>Account Profile Info</b>\n\n' +
        `Telegram Chat ID: <code>${chatId}</code>\n\n` +
        '❌ <b>No student is currently linked to this Telegram account.</b>\n\n' +
        'To link your child, send:\n' +
        '<code>/register &lt;Admission No&gt;</code>'
      );
      return;
    }

    let listStr = '';
    students.forEach((s, idx) => {
      listStr += `<b>${idx + 1}. ${escapeHtml(s.StudentName || 'Student')}</b>\n` +
                 `   • Class: ${escapeHtml(s.Class || 'N/A')} ${escapeHtml(s.Section || '')}\n` +
                 `   • Admission No: <code>${escapeHtml(s.AdmissionNo || 'N/A')}</code>\n` +
                 `   • Parent Name: ${escapeHtml(s.ParentName || 'N/A')}\n\n`;
    });

    await sendTelegramMessage(
      chatId,
      '👤 <b>Linked Student Accounts</b>\n\n' +
      `📱 Telegram Chat ID: <code>${chatId}</code>\n` +
      `📊 Linked Students Count: <b>${students.length}</b>\n\n` +
      listStr +
      '✅ You will receive fee updates and official announcements for all linked students.'
    );
    return;
  }

  // Default fallback for unrecognized command
  await sendTelegramMessage(chatId, getHelpMenuText());
}

/**
 * Main Webhook Handler Endpoint for Express
 */
async function handleWebhookPost(req, res) {
  try {
    const update = req.body;
    if (update && update.message) {
      // Process in background to reply fast to Telegram
      handleBotCommand(update.message).catch(err => {
        console.error('[BOT ERROR] handleBotCommand uncaught error:', err);
      });
    }
  } catch (err) {
    console.error('[BOT ERROR] handleWebhookPost exception:', err);
  }
  // Telegram requires immediate 200 OK
  return res.status(200).send('OK');
}

module.exports = {
  handleWebhookPost,
  handleBotCommand,
  sendTelegramMessage,
  callAppsScriptGet,
  callAppsScriptPost
};
