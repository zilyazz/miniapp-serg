// services/pBroadcastScheduled.js
const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const webAppUrl = 'https://runessheps.ru/';

const EMOJI = ["💌","🌟","✨","🪄","🔮","🧿","🌀","💜","⚡️","🔥"];
const pickEmoji = () => EMOJI[Math.floor(Math.random() * EMOJI.length)];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function claimDueJob() {
  const { data, error } = await supabase.rpc('claim_due_broadcast_job');
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return data[0];
}

async function getRecipientsPaged() {
  const pageSize = 1000;
  let from = 0;
  const all = [];

  while (true) {
    const { data, error } = await supabase
      .from('users')
      .select('telegram_real')
      .not('telegram_real', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const u of data) {
      if (u.telegram_real != null) all.push(u.telegram_real);
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all; // [telegram_real, ...]
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
      { text: '🔮 Открыть приложение', web_app: { url: webAppUrl } }
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
      const users = await getRecipientsPaged();
      const totalUsers = users.length;

      console.log(`[Broadcast job ${job.id}] START title="${job.title || ''}" users=${totalUsers} scheduled_at=${job.scheduled_at}`);

      for (let i = 0; i < totalUsers; i += BATCH_SIZE) {
        const batch = users.slice(i, i + BATCH_SIZE);

        for (const telegramReal of batch) {
          const text = String(job.body_html || '').replaceAll('${EMOJI}', pickEmoji());

          try {
            await bot.telegram.sendMessage(telegramReal, text, {
              parse_mode: 'HTML',
              disable_web_page_preview: true,
              reply_markup: replyMarkup,
            });
            ok++;
          } catch (err) {
            if (err?.parameters?.retry_after) {
              const wait = (err.parameters.retry_after + 1) * 1000;
              await sleep(wait);

              try {
                await bot.telegram.sendMessage(telegramReal, text, {
                  parse_mode: 'HTML',
                  disable_web_page_preview: true,
                  reply_markup: replyMarkup,
                });
                ok++;
              } catch (_) {
                fail++;
              }
            } else {
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
