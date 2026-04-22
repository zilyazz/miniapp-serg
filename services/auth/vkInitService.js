const crypto = require('crypto');
const maskTelegramId = require('../System/maskHash');
const tokenService = require('./tokenService');

const VK_APP_SECRET = process.env.VK_APP_SECRET;
const VK_APP_ID = process.env.VK_APP_ID ? Number(process.env.VK_APP_ID) : null;

function buildQueryString(values) {
  const parts = [];

  for (const [key, value] of values.entries()) {
    if (!key.startsWith('vk_')) {
      continue;
    }

    parts.push({ key, value });
  }

  parts.sort((a, b) => a.key.localeCompare(b.key));

  return parts
    .map(({ key, value }) => `${key}=${encodeURIComponent(value).replace(/%20/g, '%20')}`)
    .join('&');
}

function computeVKSign(query, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(query)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function parseAndValidateLaunchParams(launchParams) {
  if (!VK_APP_SECRET) {
    const err = new Error('vk_app_secret_missing');
    err.code = 'vk_app_secret_missing';
    throw err;
  }

  if (!VK_APP_ID) {
    const err = new Error('vk_app_id_missing');
    err.code = 'vk_app_id_missing';
    throw err;
  }

  if (!launchParams || typeof launchParams !== 'string') {
    const err = new Error('vk_launch_params_missing');
    err.code = 'vk_launch_params_missing';
    throw err;
  }

  let normalizedLaunchParams = launchParams.trim();
  const queryIndex = normalizedLaunchParams.indexOf('?');
  if (queryIndex >= 0) {
    normalizedLaunchParams = normalizedLaunchParams.slice(queryIndex + 1);
  }

  if (/^Bearer\s+/i.test(normalizedLaunchParams)) {
    normalizedLaunchParams = normalizedLaunchParams.replace(/^Bearer\s+/i, '').trim();
  }

  const values = new URLSearchParams(normalizedLaunchParams);
  const sign = (values.get('sign') || '').trim();
  if (!sign) {
    const err = new Error('vk_launch_params_sign_missing');
    err.code = 'vk_launch_params_sign_missing';
    throw err;
  }

  const appIdRaw = (values.get('vk_app_id') || '').trim();
  if (!appIdRaw) {
    const err = new Error('vk_launch_params_app_id_missing');
    err.code = 'vk_launch_params_app_id_missing';
    throw err;
  }

  const appId = Number(appIdRaw);
  if (!Number.isInteger(appId) || appId <= 0) {
    const err = new Error('vk_launch_params_app_id_invalid');
    err.code = 'vk_launch_params_app_id_invalid';
    throw err;
  }

  if (appId !== VK_APP_ID) {
    const err = new Error('vk_launch_params_app_id_unexpected');
    err.code = 'vk_launch_params_app_id_unexpected';
    throw err;
  }

  const userIdRaw = (values.get('vk_user_id') || '').trim();
  if (!userIdRaw) {
    const err = new Error('vk_launch_params_user_id_missing');
    err.code = 'vk_launch_params_user_id_missing';
    throw err;
  }

  const userId = Number(userIdRaw);
  if (!Number.isInteger(userId) || userId <= 0) {
    const err = new Error('vk_launch_params_user_id_missing');
    err.code = 'vk_launch_params_user_id_missing';
    throw err;
  }

  const expectedSign = computeVKSign(buildQueryString(values), VK_APP_SECRET);
  if (sign !== expectedSign) {
    const err = new Error('vk_launch_params_invalid');
    err.code = 'vk_launch_params_invalid';
    throw err;
  }

  return {
    userId,
    appId,
    rawFields: Object.fromEntries(values.entries()),
  };
}

async function initVKUser(launchParams) {
  const identity = parseAndValidateLaunchParams(launchParams);
  const realVkId = identity.userId;
  const userKey = maskTelegramId(realVkId, 'vk');
  const { token } = tokenService.issueToken(userKey);

  return {
    vkId: userKey,
    token,
    realVkId,
  };
}

async function issueTokenFromLaunchParams(launchParams) {
  const { token } = await initVKUser(launchParams);
  return { token };
}

module.exports = {
  initVKUser,
  issueTokenFromLaunchParams,
};
