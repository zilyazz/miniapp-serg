// services/pBroadcastScheduled.js
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const telegramRelayService = require('./telegramRelayService');
const logger = require('../../logger');
const { WEB_APP_URL } = require('../../utils/constants');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const EMOJI = ["💌","🌟","✨","🪄","🔮","🧿","🌀","💜","⚡️","🔥"];
const pickEmoji = () => EMOJI[Math.floor(Math.random() * EMOJI.length)];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const VK_API_VERSION = process.env.VK_API_VERSION || '5.199';
const VK_BROADCAST_ACCESS_TOKEN = (
  process.env.VK_BROADCAST_ACCESS_TOKEN ||
  process.env.VK_GROUP_ACCESS_TOKEN ||
  process.env.VK_ACCESS_TOKEN ||
  ''
).trim();
const ALLOWED_CHANNELS = new Set(['tg', 'vk', 'both']);

async function claimDueJob() {
  const { data, error } = await supabase.rpc('claim_due_broadcast_job');
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return data[0];
}

function normalizeChannel(channel) {
  const normalized = String(channel || 'tg').trim().toLowerCase();
  return ALLOWED_CHANNELS.has(normalized) ? normalized : 'tg';
}

async function getRecipientsPaged(channel) {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  const select = channel === 'tg'
    ? 'telegram_real'
    : channel === 'vk'
      ? 'vk_real'
      : 'telegram_real, vk_real';

  while (true) {
    let query = supabase
      .from('users')
      .select(select)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (channel === 'tg') {
      query = query.not('telegram_real', 'is', null);
    } else if (channel === 'vk') {
      query = query.not('vk_real', 'is', null);
    } else {
      query = query.or('telegram_real.not.is.null,vk_real.not.is.null');
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const u of data) {
      if ((channel === 'tg' || channel === 'both') && u.telegram_real != null) {
        all.push({ channel: 'tg', recipientId: u.telegram_real });
      }
      if ((channel === 'vk' || channel === 'both') && u.vk_real != null) {
        all.push({ channel: 'vk', recipientId: u.vk_real });
      }
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all; // [{ channel, recipientId }, ...]
}

async function finishJob(jobId, status, errorText = null) {
  const { error } = await supabase.rpc('finish_broadcast_job', {
    p_job_id: jobId,
    p_status: status,
    p_error: errorText
  });
  if (error) throw error;
}

async function writeJobRun({ jobId, status, okCount, failCount, startedAt, finishedAt, fatalError }) {
  const { error } = await supabase
    .from('broadcast_job_runs')
    .insert([{
      job_id: jobId,
      status,
      ok_count: okCount,
      fail_count: failCount,
      started_at: startedAt,
      finished_at: finishedAt,
      fatal_error: fatalError || null
    }]);
  if (error) throw error;
}

function buildVKKeyboard() {
  return {
    inline: true,
    buttons: [[
      {
        action: {
          type: 'open_link',
          label: '🔮 Открыть приложение',
          link: WEB_APP_URL,
        },
      },
    ]],
  };
}

function normalizeVKText(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function normalizeTelegramPlainText(text) {
  return normalizeVKText(text);
}

async function sendTelegramBroadcastMessage(chatId, text, replyMarkup) {
  try {
    await telegramRelayService.sendMessageViaRelay({
      chatId,
      text,
      replyMarkup,
      parseMode: 'HTML',
      disableWebPagePreview: true,
    });
  } catch (error) {
    const description = String(error.telegramResponse?.description || error.message || '');
    const shouldRetryPlain = error.telegramStatus === 400 && (
      description.includes("can't parse entities") ||
      description.includes('Unsupported start tag') ||
      description.includes('Bad Request')
    );

    if (!shouldRetryPlain) {
      throw error;
    }

    logger.error(`[Broadcast] Telegram HTML send failed, retry plain text chat_id=${chatId}: ${description}`);
    await telegramRelayService.sendMessageViaRelay({
      chatId,
      text: normalizeTelegramPlainText(text),
      replyMarkup,
      disableWebPagePreview: true,
    });
  }
}

async function sendVKBroadcastMessage(userId, text) {
  if (!VK_BROADCAST_ACCESS_TOKEN) {
    const err = new Error('vk_broadcast_access_token_missing');
    err.code = 'vk_broadcast_access_token_missing';
    throw err;
  }

  const params = new URLSearchParams({
    access_token: VK_BROADCAST_ACCESS_TOKEN,
    v: VK_API_VERSION,
    user_id: String(userId),
    random_id: String(Date.now() + Math.floor(Math.random() * 1000000)),
    message: normalizeVKText(text),
    keyboard: JSON.stringify(buildVKKeyboard()),
  });

  const response = await axios.post('https://api.vk.com/method/messages.send', params);
  const data = response?.data || {};

  if (data.error) {
    const err = new Error(`vk_messages_send_failed: ${data.error.error_msg || data.error.error_code}`);
    err.code = 'vk_messages_send_failed';
    throw err;
  }

  return data.response;
}

async function sendBroadcastMessage(recipient, text, replyMarkup) {
  if (recipient.channel === 'tg') {
    return sendTelegramBroadcastMessage(recipient.recipientId, text, replyMarkup);
  }

  if (recipient.channel === 'vk') {
    return sendVKBroadcastMessage(recipient.recipientId, text);
  }

  const err = new Error(`unsupported_broadcast_channel: ${recipient.channel}`);
  err.code = 'unsupported_broadcast_channel';
  throw err;
}

// Главная функция: выполнить scheduled-рассылки, которые "пора"
async function pBroadcastScheduled() {
  const MAX_JOBS_PER_RUN = 10;

  const BATCH_SIZE = 100;
  const PAUSE_BETWEEN_MSG_MS = 200;
  const PAUSE_BETWEEN_BATCH_MS = 5000;

  // лог прогресса каждые N отправок
  const LOG_EVERY = 1000;

  const replyMarkup = {
    inline_keyboard: [[
      { text: '🔮 Открыть приложение', web_app: { url: WEB_APP_URL } }
    ]]
  };

  let processedJobs = 0;

  while (processedJobs < MAX_JOBS_PER_RUN) {
    const job = await claimDueJob();
    if (!job) return; // нечего отправлять

    processedJobs += 1;

    const startedAt = new Date().toISOString();
    const startedMs = Date.now();

    let ok = 0;
    let fail = 0;
    let processedUsers = 0;

    try {
      const channel = normalizeChannel(job.channel);
      const users = await getRecipientsPaged(channel);
      const totalUsers = users.length;

      console.log(`[Broadcast job ${job.id}] START channel=${channel} title="${job.title || ''}" users=${totalUsers} scheduled_at=${job.scheduled_at}`);

      for (let i = 0; i < totalUsers; i += BATCH_SIZE) {
        const batch = users.slice(i, i + BATCH_SIZE);

        for (const recipient of batch) {
          const text = String(job.body_html || '').replaceAll('${EMOJI}', pickEmoji());

          try {
            await sendBroadcastMessage(recipient, text, replyMarkup);
            ok++;
          } catch (err) {
            if (err?.parameters?.retry_after) {
              const wait = (err.parameters.retry_after + 1) * 1000;
              await sleep(wait);

              try {
                await sendBroadcastMessage(recipient, text, replyMarkup);
                ok++;
              } catch (retryError) {
                logger.error(`[Broadcast job ${job.id}] retry send failed channel=${recipient.channel} id=${recipient.recipientId}: ${retryError.message}`);
                fail++;
              }
            } else {
              logger.error(`[Broadcast job ${job.id}] send failed channel=${recipient.channel} id=${recipient.recipientId}: ${err.message}`);
              fail++;
            }
          }

          processedUsers++;

          // прогресс-лог каждые LOG_EVERY
          if (processedUsers % LOG_EVERY === 0) {
            const secs = Math.max(1, Math.floor((Date.now() - startedMs) / 1000));
            const rate = (processedUsers / secs).toFixed(2);
            console.log(`[Broadcast job ${job.id}] PROGRESS ${processedUsers}/${totalUsers} ok=${ok} fail=${fail} rate=${rate} msg/sec`);
          }

          await sleep(PAUSE_BETWEEN_MSG_MS);
        }

        if (i + BATCH_SIZE < totalUsers) {
          await sleep(PAUSE_BETWEEN_BATCH_MS);
        }
      }

      await finishJob(job.id, 'sent', null);

      const finishedAt = new Date().toISOString();
      await writeJobRun({
        jobId: job.id,
        status: 'sent',
        okCount: ok,
        failCount: fail,
        startedAt,
        finishedAt,
        fatalError: null
      });

      console.log(`[Broadcast job ${job.id}] DONE ok=${ok} fail=${fail}`);

    } catch (jobErr) {
      const fatal = jobErr?.stack ? String(jobErr.stack) : String(jobErr);

      // ВАЖНО: finishJob может тоже упасть — поэтому try/catch, чтобы хотя бы увидеть ошибку
      try {
        await finishJob(job.id, 'failed', fatal);
      } catch (e2) {
        console.error(`[Broadcast job ${job.id}] finishJob FAILED:`, e2?.stack || e2);
      }

      const finishedAt = new Date().toISOString();

      try {
        await writeJobRun({
          jobId: job.id,
          status: 'failed',
          okCount: ok,
          failCount: fail,
          startedAt,
          finishedAt,
          fatalError: fatal
        });
      } catch (e3) {
        console.error(`[Broadcast job ${job.id}] writeJobRun FAILED:`, e3?.stack || e3);
      }

      console.error(`[Broadcast job ${job.id}] FATAL:`, fatal);
    }
  }
}

module.exports = pBroadcastScheduled;
