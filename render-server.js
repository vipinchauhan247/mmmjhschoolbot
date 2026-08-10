/**
 * Madan Mohan Malviya Junior High School ERP & Telegram Webhook Server
 * ====================================================================
 * Main Entry Point for Render Deployment (node render-server.js)
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const axios = require('axios');
const botModule = require('./api/mmmjhs-bot');

const app = express();
const PORT = process.env.PORT || 3000;

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend ERP files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Logging middleware
app.use((req, res, next) => {
  if (req.path !== '/health') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// ============================================================================
// TELEGRAM BOT WEBHOOK ROUTES
// ============================================================================

// Main webhook endpoint for @mmmjhschoolbot
app.post('/webhook', botModule.handleWebhookPost);
app.post('/api/webhook', botModule.handleWebhookPost);
app.post('/api/mmmjhs-bot', botModule.handleWebhookPost);

// Helper endpoint to set Telegram webhook with 1-click
app.get('/set-webhook', async (req, res) => {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    return res.status(400).json({ ok: false, error: 'BOT_TOKEN environment variable is not set.' });
  }

  const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const host = req.headers.host;
  const customUrl = req.query.url;
  const webhookUrl = customUrl || `${protocol}://${host}/webhook`;

  try {
    const tgRes = await axios.get(`https://api.telegram.org/bot${token}/setWebhook`, {
      params: { url: webhookUrl }
    });
    return res.json({
      ok: tgRes.data.ok,
      webhook_url: webhookUrl,
      telegram_response: tgRes.data
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message,
      details: err.response ? err.response.data : null
    });
  }
});

// Webhook info inspector
app.get('/webhook-info', async (req, res) => {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    return res.status(400).json({ ok: false, error: 'BOT_TOKEN environment variable is not set.' });
  }
  try {
    const tgRes = await axios.get(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    return res.json(tgRes.data);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================================================
// ERP API PROXY ROUTES (Connect ERP frontend with Google Apps Script)
// ============================================================================

// 1. Fetch all student records & fee dues
app.get('/api/students', async (req, res) => {
  const result = await botModule.callAppsScriptGet({ action: 'get_all_students' });
  return res.json(result);
});

// 2. Fetch all parent bot registrations
app.get('/api/registrations', async (req, res) => {
  const result = await botModule.callAppsScriptGet({ action: 'get_registrations' });
  return res.json(result);
});

// 3. Initialize/repair all 7 Google Sheet tabs
app.get('/api/init-sheets', async (req, res) => {
  const result = await botModule.callAppsScriptGet({ action: 'init_sheets' });
  return res.json(result);
});

// 4. Send direct notification / broadcast to parent from ERP UI
app.post('/api/send-notice', async (req, res) => {
  const { chatId, admissionNo, title, message } = req.body;
  if (!chatId || !message) {
    return res.status(400).json({ ok: false, error: 'Missing chatId or message' });
  }

  const formattedMsg = `📢 <b>${botModule.escapeHtml ? title || 'School Announcement' : 'School Announcement'}</b>\n\n${message}`;
  const ok = await botModule.sendTelegramMessage(chatId, formattedMsg);

  if (ok) {
    // Log to School_Messages tab
    botModule.callAppsScriptPost({
      action: 'log_message',
      tabName: 'School_Messages',
      rowData: [new Date().toISOString(), 'Individual', admissionNo || '', chatId, title || '', message, 'Sent']
    }).catch(err => console.error('Failed to log message to sheet:', err));

    return res.json({ ok: true, message: 'Message sent successfully via @mmmjhschoolbot' });
  } else {
    return res.status(500).json({ ok: false, error: 'Failed to send Telegram message' });
  }
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ONLINE',
    bot: '@mmmjhschoolbot',
    uptime: process.uptime(),
    google_script_configured: Boolean(process.env.GOOGLE_SCRIPT_URL)
  });
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log('====================================================');
  console.log(`  MMM Jr High School ERP & Telegram Webhook Server`);
  console.log(`  Bot: @mmmjhschoolbot`);
  console.log(`  Server listening on port ${PORT}`);
  console.log(`  Health Check: http://localhost:${PORT}/health`);
  console.log('====================================================');
});
