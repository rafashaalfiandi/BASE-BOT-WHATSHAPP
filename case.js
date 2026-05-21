const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const config = require('./config');
const PROMO_KEYWORDS = require('./storage/promoKeywords');
let getContentType;
let jidDecode;
let areJidsSameUser;
let generateWAMessageFromContent;
let baileysDepsInitialized = false;

async function ensureBaileysDeps() {
  if (baileysDepsInitialized) return;
  const baileysModule = await import('@whiskeysockets/baileys');
  const baileys = baileysModule?.default ?? baileysModule;
  getContentType = baileys.getContentType;
  jidDecode = baileys.jidDecode;
  areJidsSameUser = baileys.areJidsSameUser;
  generateWAMessageFromContent = baileys.generateWAMessageFromContent;
  baileysDepsInitialized = true;
}
const moment = require('moment-timezone');

const databaseFolder = path.join(__dirname, 'database');
const assetPaths = global.assetPaths || {};
const INVISIBLE_CHARS_REGEX = /[\u200e\u200f\u202a-\u202e]/g;
const EMOJI_REGEX = /[\p{Extended_Pictographic}\uFE0F]/gu;
const SAFE_CALC_REGEX = /^[0-9+\-*/().\s]+$/;
const LINK_DETECT_REGEX = /(https?:\/\/|wa\.me|chat\.whatsapp\.com|[a-z0-9-]+\.(com|net|org|id))/i;
const LINK_MATCH_REGEX_SOURCE =
  '(https?:\\/\\/[^\\s]+|wa\\.me\\/[^\\s]+|chat\\.whatsapp\\.com\\/[^\\s]+|[a-z0-9-]+\\.(?:com|net|org|id))';
const GITHUB_HOSTNAMES = ['github.com', 'gist.github.com', 'github.io', 'raw.githubusercontent.com'];
const DEBUG_ADMIN = String(process.env.DEBUG_ADMIN || '').toLowerCase() === '1';
const LOG_EVERY_MESSAGE = String(process.env.LOG_EVERY_MESSAGE || '').toLowerCase() === '1';
const ADMIN_WHITELIST = [
  '628561617643' // admin manusia (ganti sesuai kebutuhan)
];
const antilinkFile = path.join(databaseFolder, 'antilink.json');
const antipromosiFile = path.join(databaseFolder, 'antipromosi.json');
const ownerModeFile = path.join(databaseFolder, 'ownerMode.json');

const execAsync = promisify(exec);

function ensureDatabaseFile(filePath) {
  if (!fs.existsSync(databaseFolder)) {
    fs.mkdirSync(databaseFolder, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '{}');
  }
}

function loadToggleStatuses(filePath) {
  try {
    ensureDatabaseFile(filePath);
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw || '{}');
  } catch (error) {
    console.error(`Failed to load toggle file ${filePath}:`, error);
    return {};
  }
}

function saveToggleStatuses(filePath, statuses) {
  try {
    ensureDatabaseFile(filePath);
    fs.writeFileSync(filePath, JSON.stringify(statuses, null, 2));
  } catch (error) {
    console.error(`Failed to save toggle file ${filePath}:`, error);
  }
}

function setToggleStatus(filePath, jid, value) {
  const statuses = loadToggleStatuses(filePath);
  if (value) {
    statuses[jid] = true;
  } else {
    delete statuses[jid];
  }
  saveToggleStatuses(filePath, statuses);
  return statuses;
}

function loadOwnerModeStatuses() {
  try {
    ensureDatabaseFile(ownerModeFile);
    const raw = fs.readFileSync(ownerModeFile, 'utf-8');
    const parsed = JSON.parse(raw || '{}');
    return {
      onlygc: Boolean(parsed.onlygc),
      onlyprib: Boolean(parsed.onlyprib)
    };
  } catch (error) {
    console.error('Failed to load owner mode statuses:', error);
    return { onlygc: false, onlyprib: false };
  }
}

function saveOwnerModeStatuses(statuses) {
  try {
    ensureDatabaseFile(ownerModeFile);
    fs.writeFileSync(
      ownerModeFile,
      JSON.stringify({ onlygc: Boolean(statuses.onlygc), onlyprib: Boolean(statuses.onlyprib) }, null, 2)
    );
  } catch (error) {
    console.error('Failed to save owner mode statuses:', error);
  }
}

function setOwnerModeStatus(option, value) {
  const normalizedOption = option === 'onlygc' ? 'onlygc' : option === 'onlyprib' ? 'onlyprib' : null;
  if (!normalizedOption) return ownerModeStatuses;

  const nextState = {
    onlygc: ownerModeStatuses.onlygc,
    onlyprib: ownerModeStatuses.onlyprib
  };
  nextState[normalizedOption] = Boolean(value);
  if (value) {
    nextState[normalizedOption === 'onlygc' ? 'onlyprib' : 'onlygc'] = false;
  }

  ownerModeStatuses = nextState;
  saveOwnerModeStatuses(ownerModeStatuses);
  return ownerModeStatuses;
}


function getStatusOrderQuoted(text) {
  const safeText = (text || 'Status Order').toString().trim() || 'Status Order';
  return {
    key: {
      remoteJid: 'status@broadcast',
      fromMe: false,
      id: `STATUS_ORDER_${Date.now()}`
    },
    message: {
      orderMessage: {
        itemCount: 1,
        status: 1,
        surface: 1,
        message: safeText,
        orderTitle: safeText,
        sellerJid: '0@s.whatsapp.net'
      }
    },
    participant: '0@s.whatsapp.net'
  };
}

function stripInvisible(text) {
  return (text || '').toString().replace(INVISIBLE_CHARS_REGEX, '');
}

function cleanMessageText(text) {
  return stripInvisible(text).trim();
}

function extractCommandTail(body, prefix) {
  const safeBody = body || '';
  const prefixLength = (prefix || '').length;
  const afterPrefix = safeBody.slice(prefixLength);
  if (!afterPrefix) return '';

  const firstNonWhitespaceIndex = afterPrefix.search(/\S/);
  if (firstNonWhitespaceIndex === -1) return '';

  const afterWhitespace = afterPrefix.slice(firstNonWhitespaceIndex);
  const commandMatch = afterWhitespace.match(/^(\S+)/);
  if (!commandMatch) return '';

  const tailStart = firstNonWhitespaceIndex + commandMatch[1].length;
  const tail = afterPrefix.slice(tailStart);
  return tail.replace(/^\s+/, '');
}

function removeEmoji(text) {
  return (text || '').toString().replace(EMOJI_REGEX, '').replace(/\s{2,}/g, ' ').trim();
}

function normalizeSimiInput(text) {
  const raw = (text ?? '').toString();
  const cleaned = cleanMessageText(raw);
  const withoutMentions = cleaned.replace(/@\d{5,20}/g, '').trim();
  const noEmoji = removeEmoji(withoutMentions || cleaned);
  const trimmed = noEmoji.trim();
  const candidate = trimmed || '';
  return candidate.slice(0, 250);
}

function unwrapMessage(msg) {
  let message = msg?.message || {};
  let depth = 0;
  // unwrap common wrappers so inner text is readable
  while (message?.ephemeralMessage?.message || message?.viewOnceMessage?.message || message?.viewOnceMessageV2?.message) {
    if (message.ephemeralMessage?.message) {
      message = message.ephemeralMessage.message;
    } else if (message.viewOnceMessage?.message) {
      message = message.viewOnceMessage.message;
    } else if (message.viewOnceMessageV2?.message) {
      message = message.viewOnceMessageV2.message;
    }
    depth += 1;
    if (depth > 5) break;
  }
  return message;
}

function extractText(message, type) {
  const contentType = type || getContentType(message || {});
  let text =
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    message?.documentMessage?.caption ||
    '';

  if (!text) {
    switch (contentType) {
      case 'buttonsResponseMessage':
        text =
          message.buttonsResponseMessage?.selectedButtonId ||
          message.buttonsResponseMessage?.selectedDisplayText;
        break;
      case 'listResponseMessage':
        text =
          message.listResponseMessage?.singleSelectReply?.selectedRowId ||
          message.listResponseMessage?.title ||
          message.listResponseMessage?.description;
        break;
      case 'templateButtonReplyMessage':
        text =
          message.templateButtonReplyMessage?.selectedDisplayText ||
          message.templateButtonReplyMessage?.selectedId;
        break;
      default:
        text = message?.[contentType]?.text || message?.[contentType]?.caption || '';
        break;
    }
  }

  return cleanMessageText(text);
}

function sanitizeSimiText(text) {
  return normalizeSimiInput(text);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const displayValue = value >= 10 || value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${displayValue} ${units[unitIndex]}`;
}

function formatDuration(seconds) {
  const totalSeconds = Math.max(0, Math.floor(seconds || 0));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

function evaluateCalc(expr) {
  const expression = (expr || '').trim();
  if (!expression || expression.length > 120 || !SAFE_CALC_REGEX.test(expression)) {
    throw new Error('Invalid calculator expression');
  }

  const result = Function(`"use strict"; return (${expression});`)();
  if (typeof result !== 'number' || !Number.isFinite(result)) {
    throw new Error('Invalid calculator result');
  }

  return Number(result.toFixed(12));
}

async function getRootDiskUsage() {
  try {
    const { stdout } = await execAsync('df -Pk /', {
      timeout: 2000,
      maxBuffer: 1024 * 1024,
      windowsHide: true
    });
    const output = String(stdout || '').trim().split('\n');
    const line = output[output.length - 1] || '';
    const parts = line.trim().split(/\s+/);
    const sizeKb = parseInt(parts[1], 10);
    const usedKb = parseInt(parts[2], 10);
    const availKb = parseInt(parts[3], 10);
    const percentRaw = parts[4] || '';
    const percent = parseInt(percentRaw.replace('%', ''), 10);
    return {
      size: Number.isFinite(sizeKb) ? sizeKb * 1024 : 0,
      used: Number.isFinite(usedKb) ? usedKb * 1024 : 0,
      free: Number.isFinite(availKb) ? availKb * 1024 : 0,
      percent: Number.isFinite(percent) ? percent : 0
    };
  } catch (error) {
    console.error('Failed to read disk usage:', error);
    return null;
  }
}

let systemInfoCache = {
  value: null,
  expireAt: 0,
  inFlight: null
};

async function getSystemInfoCached() {
  const now = Date.now();
  if (systemInfoCache.value && now < systemInfoCache.expireAt) {
    return systemInfoCache.value;
  }
  if (systemInfoCache.inFlight) {
    return await systemInfoCache.inFlight;
  }

  systemInfoCache.inFlight = (async () => {
    const cpus = os.cpus() || [];
    const cpuModel = cpus[0]?.model || 'Unknown CPU';
    const cpuCores = cpus.length || 0;
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const disk = await getRootDiskUsage();

    const info = {
      osRelease: `${os.type()} ${os.release()}`,
      hostname: os.hostname(),
      arch: os.arch(),
      cpuModel,
      cpuCores,
      mem: {
        total: totalMem,
        used: usedMem,
        free: freeMem
      },
      disk,
      botUptime: process.uptime(),
      serverUptime: os.uptime(),
      node: process.version
    };

    systemInfoCache.value = info;
    systemInfoCache.expireAt = Date.now() + 3000; // cache singkat biar ping spam gak ngeblok event loop
    return info;
  })();

  try {
    return await systemInfoCache.inFlight;
  } finally {
    systemInfoCache.inFlight = null;
  }
}

const thumbnailCache = new Map();

function loadFileBufferCached(filePath) {
  if (!filePath) return null;
  const resolved = path.resolve(String(filePath));
  if (!resolved) return null;
  if (thumbnailCache.has(resolved)) return thumbnailCache.get(resolved);
  try {
    const buf = fs.readFileSync(resolved);
    thumbnailCache.set(resolved, buf);
    return buf;
  } catch (error) {
    return null;
  }
}

function getSystemInfo() {
  const cpus = os.cpus() || [];
  const cpuModel = cpus[0]?.model || 'Unknown CPU';
  const cpuCores = cpus.length || 0;
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const disk = null;

  return {
    osRelease: `${os.type()} ${os.release()}`,
    hostname: os.hostname(),
    arch: os.arch(),
    cpuModel,
    cpuCores,
    mem: {
      total: totalMem,
      used: usedMem,
      free: freeMem
    },
    disk,
    botUptime: process.uptime(),
    serverUptime: os.uptime(),
    node: process.version
  };
}

function buildPingText(latency, info) {
  const diskLine = info.disk
    ? `Disk /: ${formatBytes(info.disk.size)} • ${formatBytes(info.disk.used)} used • ${formatBytes(info.disk.free)} free (${info.disk.percent}%)`
    : 'Disk /: N/A';

  return [
    '🏓 *Pong!*',
    `Speed: ${latency} ms`,
    `OS: ${info.osRelease}`,
    `Hostname: ${info.hostname}`,
    `Arch: ${info.arch}`,
    `CPU: ${info.cpuModel} (${info.cpuCores} cores)`,
    `RAM: ${formatBytes(info.mem.total)} • ${formatBytes(info.mem.used)} used • ${formatBytes(info.mem.free)} free`,
    diskLine,
    `Uptime Bot: ${formatDuration(info.botUptime)}`,
    `Uptime Server: ${formatDuration(info.serverUptime)}`,
    `NodeJS: ${info.node}`
  ].join('\n');
}

function loadPingThumbnail(customPath) {
  const defaultThumbnail = path.join(__dirname, 'assets', 'img', 'logo.png');
  const thumbnailPath = customPath || assetPaths.thumbnail || defaultThumbnail;
  return loadFileBufferCached(thumbnailPath);
}

function buildFakePreviewQuoted(options = {}) {
  const { thumbnailPath, includeThumbnail = true } = options;
  const thumbnail = includeThumbnail ? loadPingThumbnail(thumbnailPath) : null;
  const externalAdReply = {
    title: global.botName,
    body: 'rafashacode.id',
    sourceUrl: 'https://rafashaalfian.my.id',
    thumbnail: thumbnail || undefined,
    mediaUrl: 'https://rafashaalfian.my.id',
    mediaType: 1,
    renderLargerThumbnail: true,
    showAdAttribution: false
  };

  const fakeQuoted = {
    key: {
      remoteJid: 'status@broadcast',
      fromMe: false,
      id: `FAKE_PREVIEW_${Date.now()}`
    },
    message: {
      extendedTextMessage: {
        text: global.botName,
        contextInfo: { externalAdReply }
      }
    },
    participant: '0@s.whatsapp.net'
  };

  return { fakeQuoted, externalAdReply };
}

function isLidGroup(participants = []) {
  return (participants || []).some((p) => String(p?.id || '').toLowerCase().includes('@lid'));
}

function getAdminWhitelistSet() {
  const set = new Set();
  for (const n of ADMIN_WHITELIST || []) {
    const digits = String(n || '').replace(/\D+/g, '');
    if (digits) set.add(digits);
  }
  const env = String(process.env.ADMIN_WHITELIST || '')
    .split(',')
    .map((s) => String(s || '').trim())
    .filter(Boolean);
  for (const n of env) {
    const digits = String(n || '').replace(/\D+/g, '');
    if (digits) set.add(digits);
  }
  const ownerDigits = String(global.ownerNumber || '').replace(/\D+/g, '');
  if (ownerDigits) set.add(ownerDigits);
  return set;
}

function isWhitelistedAdmin(jid) {
  const num = getJidUser(jid);
  if (!num) return false;
  return getAdminWhitelistSet().has(num);
}

function normalizeJidFull(jid) {
  const raw = jid == null ? '' : String(jid);
  const noSpaces = raw.replace(/\s+/g, '').trim();
  if (!noSpaces) {
    return { user: '', jidNormalized: '', raw: raw || '' };
  }

  const converted = noSpaces.replace(/@c\.us\b/g, '@s.whatsapp.net');
  const withoutDevice = converted.replace(/:\d+(?=@)/g, '');
  const jidNormalized = withoutDevice;

  let user = '';
  try {
    const decoded = jidDecode(jidNormalized);
    if (decoded?.user) user = String(decoded.user);
  } catch {
    // ignore
  }

  if (!user) {
    user = (jidNormalized.split('@')[0] || '').replace(/:\d+$/g, '');
  }

  const userDigits = user.replace(/\D+/g, '');
  const server = jidNormalized.includes('@') ? jidNormalized.split('@')[1] : '';
  const isLid = server.toLowerCase() === 'lid';

  return {
    user: userDigits,
    jidNormalized,
    raw,
    server,
    isLid
  };
}

function normalizeJid(jid) {
  return normalizeJidFull(jid).jidNormalized;
}

function getSenderJidInfo(msg, unwrappedMessage) {
  const from = msg?.key?.remoteJid || '';
  const isGroup = from.endsWith('@g.us');

  const senderFromKey = msg?.key?.participant || '';
  const senderFromParticipant = msg?.participant || '';
  const ctx = unwrappedMessage?.extendedTextMessage?.contextInfo || unwrappedMessage?.contextInfo || {};
  const senderFromCtx = ctx?.participant || '';

  let senderRaw = '';
  if (isGroup) {
    senderRaw = senderFromKey || senderFromParticipant || senderFromCtx || '';
  } else {
    senderRaw = from;
  }

  return {
    senderRaw,
    senderFromKey,
    senderFromParticipant,
    senderFromCtx
  };
}

function containsLink(text) {
  const normalized = (text || '').toLowerCase();
  if (!LINK_DETECT_REGEX.test(normalized)) return false;
  const links = extractLinks(normalized);
  if (!links.length) return false;
  return links.some((link) => !isGithubLink(link));
}

function extractLinks(text) {
  if (!text) return [];
  const regex = new RegExp(LINK_MATCH_REGEX_SOURCE, 'gi');
  return Array.from(text.matchAll(regex), (match) => match[0]);
}

function isGithubLink(link) {
  if (!link) return false;
  let cleaned = cleanLinkForParsing(link);
  if (!cleaned) return false;
  if (!/^https?:\/\//i.test(cleaned) && !/^wa\.me\//i.test(cleaned) && !/^chat\.whatsapp\.com\//i.test(cleaned)) {
    cleaned = `https://${cleaned}`;
  }
  try {
    const hostname = new URL(cleaned).hostname.toLowerCase();
    return isGithubHost(hostname);
  } catch {
    return false;
  }
}

function cleanLinkForParsing(link) {
  return (link || '').trim().replace(/[.,!?;:]+$/g, '');
}

function isGithubHost(host) {
  if (!host) return false;
  return GITHUB_HOSTNAMES.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function containsPromotion(text) {
  const lower = (text || '').toLowerCase();
  return PROMO_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function getJidUser(jid) {
  return normalizeJidFull(jid).user || '';
}

function isBotSelf(jid) {
  const botDigits = String(config?.botNumber || global.botNumber || '').replace(/\D+/g, '');
  const jidDigits = getJidUser(jid);
  return Boolean(botDigits && jidDigits && jidDigits === botDigits);
}

function isOwnerUser(jid) {
  const ownerDigits = String(global.ownerNumber || '').replace(/\D+/g, '');
  const jidDigits = getJidUser(jid);
  return Boolean(ownerDigits && jidDigits && jidDigits === ownerDigits);
}

async function getAllGroupsSafe(socket) {
  try {
    const groups = await socket.groupFetchAllParticipating();
    return Object.keys(groups || {});
  } catch (error) {
    console.error('getAllGroupsSafe error:', error);
    return [];
  }
}

async function sendHidetag(socket, groupJid, text, imageBuffer = null) {
  const metadata = await fetchGroupMetadataSafe(socket, groupJid);
  const participants = metadata?.participants || [];
  const mentions = participants.map((p) => p.id).filter(Boolean);

  if (imageBuffer) {
    return socket.sendMessage(groupJid, { image: imageBuffer, caption: text, mentions });
  }
  return socket.sendMessage(groupJid, { text, mentions });
}

function parseBroadcastCommandTail(rawTail, hasQuotedMessage) {
  const trimmed = (rawTail || '').trim();
  if (!trimmed) {
    return { message: '', mentionAll: true };
  }
  const optionMatch = trimmed.match(/^(.*\S)\s+(notag|no[\s-]*tag)$/i);
  if (optionMatch) {
    const messagePart = (optionMatch[1] || '').trim();
    return {
      message: messagePart,
      mentionAll: false
    };
  }
  const normalizedWhole = trimmed.toLowerCase().replace(/[\s-]/g, '');
  if (normalizedWhole === 'notag') {
    return { message: '', mentionAll: false };
  }
  if (hasQuotedMessage && normalizedWhole === 'tag') {
    return { message: '', mentionAll: true };
  }
  return { message: trimmed, mentionAll: true };
}

async function sendBroadcastMessage(socket, groupJid, text, imageBuffer = null, mentionAll = true) {
  const safeText = text || '';
  if (mentionAll) {
    return sendHidetag(socket, groupJid, safeText, imageBuffer);
  }
  if (imageBuffer) {
    return socket.sendMessage(groupJid, { image: imageBuffer, caption: safeText });
  }
  return socket.sendMessage(groupJid, { text: safeText });
}

function sameUserLoose(a, b) {
  const userA = getJidUser(a);
  const userB = getJidUser(b);
  if (!userA || !userB) return false;
  return userA.toLowerCase() === userB.toLowerCase();
}

function isAdminParticipant(p) {
  return (
    p?.admin === 'admin' ||
    p?.admin === 'superadmin' ||
    p?.isAdmin === true ||
    p?.isSuperAdmin === true ||
    p?.admin != null
  );
}

async function fetchGroupMetadataSafe(socket, jid) {
  return await fetchGroupMetadataSafeWithCache(socket, jid);
}

const groupMetadataCache = new Map();
const groupMetadataInFlight = new Map();

async function fetchGroupMetadataSafeWithCache(socket, jid, options = {}) {
  const { forceRefresh = false, ttlMs = 15000 } = options;
  try {
    if (!jid) return null;

    const now = Date.now();
    if (!forceRefresh) {
      const cached = groupMetadataCache.get(jid);
      if (cached && now < cached.expireAt) {
        return cached.value || null;
      }
    }

    if (!forceRefresh && groupMetadataInFlight.has(jid)) {
      return await groupMetadataInFlight.get(jid);
    }

    const task = (async () => {
      try {
        const metadata = await socket.groupMetadata(jid);
        groupMetadataCache.set(jid, { value: metadata || null, expireAt: Date.now() + ttlMs });
        return metadata || null;
      } catch (error) {
        console.error('Failed to fetch group metadata:', error);
        return null;
      }
    })();

    if (!forceRefresh) {
      groupMetadataInFlight.set(jid, task);
    }

    try {
      return await task;
    } finally {
      if (!forceRefresh) groupMetadataInFlight.delete(jid);
    }
  } catch (error) {
    console.error('fetchGroupMetadataSafeWithCache error:', error);
    return null;
  }
}

function isUserGroupAdmin(participants, jid) {
  if (!jid) return false;

  const target = normalizeJidFull(jid);
  if (!target.user && !target.jidNormalized) return false;

  return (participants || []).some((p) => {
    if (!isAdminParticipant(p)) return false;
    const participant = normalizeJidFull(p?.id);

    const senderIsAdminByUser =
      Boolean(participant.user) && Boolean(target.user) && participant.user === target.user;

    let senderIsAdminByJid = false;
    try {
      senderIsAdminByJid = areJidsSameUser(participant.jidNormalized, target.jidNormalized);
    } catch {
      senderIsAdminByJid = false;
    }

    return senderIsAdminByUser || senderIsAdminByJid;
  });
}

function extractTargetJid(message) {
  const ctx = message?.extendedTextMessage?.contextInfo || message?.contextInfo || {};

  if (Array.isArray(ctx.mentionedJid) && ctx.mentionedJid.length > 0) {
    return ctx.mentionedJid[0];
  }

  if (ctx.participant) {
    return ctx.participant;
  }

  return null;
}

let antilinkStatuses = loadToggleStatuses(antilinkFile);
let antipromosiStatuses = loadToggleStatuses(antipromosiFile);
let ownerModeStatuses = loadOwnerModeStatuses();

// ✅ FIXED read function
async function markAsRead(socket, msgKey) {
  try {
    if (!msgKey?.remoteJid || !msgKey?.id) return;

    await socket.readMessages([
      {
        remoteJid: msgKey.remoteJid,
        id: msgKey.id,
        participant: msgKey.participant || undefined
      }
    ]);
  } catch (error) {
    console.error('Failed to mark message as read:', error);
  }
}

// ✅ AutoRead state (RAM only, reset ketika bot restart)
let autoreadEnabled = false;

// Anti spam read per chat
const autoreadCooldown = new Map();

module.exports = rafcode = async (rafcode, msg, messages, store) => {
  await ensureBaileysDeps();
  try {
    if (msg.key?.id?.startsWith('BAE5') && msg.key.id.length === 16) return;

    const unwrappedMessage = unwrapMessage(msg);
    const type = getContentType(unwrappedMessage);
    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');

    const body = extractText(unwrappedMessage, type);
    const trimmedBody = body;

    const prefix = prefa
      ? (/^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#$%^&.©^]/gi.test(body)
        ? body.match(/^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#$%^&.©^]/gi)[0]
        : '')
      : prefa ?? global.prefix;

    const isCmd = prefix ? body.startsWith(prefix) : false;
    let command = '';
    let args = [];
    if (isCmd) {
      const parts = body.slice(prefix.length).trim().split(/\s+/).filter(Boolean);
      command = (parts.shift() || '').toLowerCase();
      args = parts;
    }

    const senderInfo = getSenderJidInfo(msg, unwrappedMessage);
    const senderRaw = senderInfo.senderRaw;
    const senderFull = normalizeJidFull(senderRaw);
    const botFull = normalizeJidFull(rafcode.user?.id || '');
    const senderNormalized = senderFull.jidNormalized;
    const botNormalized = botFull.jidNormalized;
    const senderName = msg.pushName || jidDecode(senderNormalized)?.user || senderNormalized;
    const isBot = msg.key.fromMe || areJidsSameUser(senderNormalized, botNormalized);

    if (isGroup && !senderRaw && !msg.key.fromMe) {
      console.log('[WARN] senderRaw kosong, kemungkinan event bukan pesan user normal');
      if (DEBUG_ADMIN) {
        console.log('senderFromKey:', senderInfo.senderFromKey);
        console.log('senderFromParticipant:', senderInfo.senderFromParticipant);
        console.log('senderFromCtx:', senderInfo.senderFromCtx);
      }
    }

    const groupState = {
      metadata: null,
      participants: [],
      senderIsAdmin: false,
      botIsAdmin: false,
      lidMode: false,
      groupAdminMetaStatus: {
        participantsCount: 0,
        anyAdminRoleFieldPresent: false,
        detectedAdminsCount: 0,
        roleFieldsMissing: false,
        refreshed: false
      }
    };

    async function ensureGroupContext(forceRefresh = false) {
      if (!isGroup) return groupState;
      if (!forceRefresh && groupState.metadata) return groupState;

      const metadata = await fetchGroupMetadataSafeWithCache(rafcode, from, { forceRefresh });
      const participants = metadata?.participants || [];
      const lidModeDetected = isLidGroup(participants);
      const senderAdmin = isUserGroupAdmin(participants, senderRaw);
      const botAdmin = isUserGroupAdmin(participants, rafcode.user?.id);
      const participantsCount = participants.length || 0;
      const anyAdminRoleFieldPresent = participants.some((p) => p?.admin != null || p?.isAdmin != null || p?.isSuperAdmin != null);
      const detectedAdmins = participants.filter(isAdminParticipant);
      const groupAdminMetaStatus = {
        participantsCount,
        anyAdminRoleFieldPresent,
        detectedAdminsCount: detectedAdmins.length || 0,
        roleFieldsMissing: participantsCount > 0 && !anyAdminRoleFieldPresent,
        refreshed: Boolean(forceRefresh)
      };

      Object.assign(groupState, {
        metadata,
        participants,
        lidMode: lidModeDetected,
        senderIsAdmin: senderAdmin,
        botIsAdmin: botAdmin,
        groupAdminMetaStatus
      });

      if (!forceRefresh && groupAdminMetaStatus.roleFieldsMissing) {
        if (DEBUG_ADMIN) {
          console.log('[ADMIN][WARN] Metadata participants ada, tapi semua field admin kosong. Refreshing metadata...');
        }
        return ensureGroupContext(true);
      }

      if (DEBUG_ADMIN) {
        console.log('✅ CHECK ADMIN DEBUG');
        console.log('senderRaw:', senderRaw);
        console.log('senderFromKey:', senderInfo.senderFromKey);
        console.log('senderFromParticipant:', senderInfo.senderFromParticipant);
        console.log('senderFromCtx:', senderInfo.senderFromCtx);
        console.log('senderUser:', senderFull.user);
        console.log('senderJidNormalized:', senderFull.jidNormalized);

        console.log('botRaw:', rafcode.user?.id);
        console.log('botUser:', botFull.user);
        console.log('botJidNormalized:', botFull.jidNormalized);

        console.log('participantsCount:', participantsCount);
        const sample = participants.slice(0, 10).map((p) => ({
          id: p?.id,
          user: getJidUser(p?.id),
          adminField: p?.admin,
          isAdmin: p?.isAdmin,
          isSuperAdmin: p?.isSuperAdmin
        }));
        console.log('participantsSample(10):', sample);

        const admins = detectedAdmins.map((p) => ({
          id: p?.id,
          user: getJidUser(p?.id),
          adminField: p?.admin,
          isAdmin: p?.isAdmin,
          isSuperAdmin: p?.isSuperAdmin
        }));
        console.log('adminsDetected:', admins);

        console.log('senderIsAdmin:', senderAdmin);
        console.log('botIsAdmin:', botAdmin);
        console.log('lidMode:', lidModeDetected);
        console.log('senderWhitelisted:', isWhitelistedAdmin(senderRaw));
        console.log('botSelf:', isBotSelf(rafcode.user?.id));

        if (participantsCount > 0 && detectedAdmins.length === 0) {
          console.log('[ADMIN][WARN] Admin list kosong dari metadata.');
          console.log('anyAdminRoleFieldPresent:', anyAdminRoleFieldPresent);
        }
      }

      if (forceRefresh && groupAdminMetaStatus.roleFieldsMissing) {
        console.error('[ADMIN][ERROR] groupMetadata() tidak mengembalikan field role admin (admin/isAdmin/isSuperAdmin).');
        console.error('Tidak bisa verifikasi admin 100% dari metadata. Coba restart sesi Baileys atau update versi baileys.');
      }

      return groupState;
    }

    const targetJid = extractTargetJid(unwrappedMessage);

    if (msg.message && (LOG_EVERY_MESSAGE || isCmd)) {
      const time = moment().tz('Asia/Jakarta').format('YYYY-MM-DD HH:mm:ss');
      console.log(
        chalk.white.bold('[') +
        chalk.white.bgHex('#ffffff').bold(' NEW MESSAGE ') +
        chalk.white.bold('] ') +
        chalk.hex('#ffffff').bgHex('#bb16f7').bold(` ${botName} `) +
        '\n' +
        chalk.bgHex('#222831')(' ') +
        chalk.hex('#00adb5')(` [${time}] `) +
        (isGroup ? chalk.bgHex('#f8b400').bold(' [GROUP] ') : chalk.bgHex('#00adb5').bold(' [PRIVATE] ')) +
        chalk.hex('#ff2e63')(` FROM: ${senderName} `) +
        chalk.hex('#08d9d6')(` CMD: ${isCmd ? command : '-'} `) +
        chalk.hex('#00adb5')(` MSG: ${body.slice(0, 60)}${body.length > 60 ? '...' : ''} `)
      );
    }

    if (!msg.message) return;

    const ownerMode = ownerModeStatuses || { onlygc: false, onlyprib: false };
    const isOwner = isOwnerUser(senderRaw);
    const groupLinkText = global.groupLink ? `\nSilakan join grup: ${global.groupLink}` : '';
    if (isCmd && !isOwner) {
      if (ownerMode.onlygc && !isGroup) {
        await rafcode.sendMessage(
          from,
          {
            text: `Bot hanya bisa digunakan di grup. Bot tidak bisa digunakan di pribadi${groupLinkText}`
          },
          { quoted: getStatusOrderQuoted(trimmedBody) }
        );
        return;
      }
      if (ownerMode.onlyprib && isGroup) {
        await rafcode.sendMessage(
          from,
          {
            text: `Bot hanya bisa digunakan di chat pribadi. Silakan hubungi ${global.ownerName || 'owner'} untuk akses grup.`
          },
          { quoted: getStatusOrderQuoted(trimmedBody) }
        );
        return;
      }
    }

    // ✅ AUTO READ (PRIVATE + GROUP + STATUS) - RAM only (.autoread)
    const isStatusBroadcast = from === 'status@broadcast';
    const shouldAutoRead =
      autoreadEnabled &&
      !isBot &&
      msg?.key?.remoteJid &&
      msg?.key?.id &&
      (isGroup || !isGroup || isStatusBroadcast);

    if (shouldAutoRead) {
      const chatKey = msg.key.remoteJid;
      const last = autoreadCooldown.get(chatKey) || 0;
      const now = Date.now();

      // ✅ biar gak spam read (1 detik per chat)
      if (now - last > 1000) {
        autoreadCooldown.set(chatKey, now);
        // Non-blocking read to keep response snappy
        markAsRead(rafcode, msg.key).catch(() => {});
      }
    }

    let moderationHandled = false;
    const antilinkOn = isGroup && antilinkStatuses[from] === true;
    const antipromosiOn = isGroup && antipromosiStatuses[from] === true;
    if ((antilinkOn || antipromosiOn) && !isBot) {
      const maybeLink = antilinkOn && containsLink(trimmedBody);
      const maybePromo = antipromosiOn && containsPromotion(trimmedBody);

      let context = groupState;
      if (maybeLink || maybePromo) {
        context = await ensureGroupContext();
      }

      const senderAllowed = context.senderIsAdmin || (context.lidMode && isWhitelistedAdmin(senderRaw));
      const flaggedLink = maybeLink && !senderAllowed;
      const flaggedPromo = maybePromo && !senderAllowed;
      if (flaggedLink || flaggedPromo) {
        moderationHandled = true;
        const botAllowed = context.botIsAdmin || (context.lidMode && isBotSelf(rafcode.user?.id));
        if (botAllowed) {
          await rafcode.sendMessage(from, { delete: msg.key });
          if (flaggedPromo) {
            await rafcode.sendMessage(
              from,
              { text: 'Promosi terdeteksi, pesan dihapus.', mentions: [senderRaw] },
              { quoted: getStatusOrderQuoted(trimmedBody) }
            );
          }
        } else {
          await rafcode.sendMessage(
            from,
            { text: 'Bot harus admin untuk menghapus pesan.' },
            { quoted: getStatusOrderQuoted(trimmedBody) }
          );
        }
      }
    }

    if (moderationHandled) {
      return;
    }

    // ✅ COMMAND HANDLER
    if (isCmd) {
      switch (command) {
        case 'kick': {
          if (!isGroup) {
            await rafcode.sendMessage(from, { text: 'Command ini hanya bisa digunakan di grup.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const context = await ensureGroupContext();
          if (!context.metadata) {
            await rafcode.sendMessage(from, { text: 'Gagal mengambil data grup.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const senderAllowed = context.senderIsAdmin || (context.lidMode && isWhitelistedAdmin(senderRaw));
          if (!senderAllowed) {
            await rafcode.sendMessage(from, { text: 'Command ini hanya untuk admin grup.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const botAllowed = context.botIsAdmin || (context.lidMode && isBotSelf(rafcode.user?.id));
          if (!botAllowed) {
            await rafcode.sendMessage(from, { text: 'Bot harus admin untuk mengeluarkan member.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const target = normalizeJid(targetJid);
          if (!target) {
            await rafcode.sendMessage(from, { text: 'Gunakan .kick @tag atau balas pesan target.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          if (isUserGroupAdmin(context.participants, target)) {
            await rafcode.sendMessage(from, { text: 'Tidak bisa mengeluarkan admin.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          await rafcode.groupParticipantsUpdate(from, [target], 'remove');
          await rafcode.sendMessage(
            from,
            { text: `@${(target || '').split('@')[0]} telah dikick.`, mentions: [target] },
            { quoted: getStatusOrderQuoted(trimmedBody) }
          );
          break;
        }
        
        case 'ht':
        case 'hidetag': {
          if (!isGroup) {
            await rafcode.sendMessage(from, { text: 'Command ini hanya bisa digunakan di grup.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const context = await ensureGroupContext();
          if (!context.metadata) {
            await rafcode.sendMessage(from, { text: 'Gagal mengambil data grup.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const senderAllowed = context.senderIsAdmin || (context.lidMode && isWhitelistedAdmin(senderRaw));
          if (!senderAllowed) {
            await rafcode.sendMessage(from, { text: 'Command ini hanya untuk admin grup.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const text = args.join(' ').trim();
          if (!text) {
            await rafcode.sendMessage(from, { text: 'Gunakan .hidetag <teks>' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const mentions = (context.participants || []).map((p) => p.id);
          await rafcode.sendMessage(from, { text, mentions });
          break;
        }

        case 'tagall': {
          if (!isGroup) {
            await rafcode.sendMessage(from, { text: 'Command ini hanya bisa digunakan di grup.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const context = await ensureGroupContext();
          if (!context.metadata) {
            await rafcode.sendMessage(from, { text: 'Gagal mengambil data grup.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const senderAllowed = context.senderIsAdmin || (context.lidMode && isWhitelistedAdmin(senderRaw));
          if (!senderAllowed) {
            await rafcode.sendMessage(from, { text: 'Command ini hanya untuk admin grup.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const mentions = (context.participants || []).map((p) => p.id);
          const tagLines = mentions.map((jid) => `@${(jid || '').split('@')[0]}`).join('\n');
          const text = ['📢 TAG ALL', '', tagLines].join('\n');
          await rafcode.sendMessage(from, { text, mentions });
          break;
        }

        case 'id': {
          if (!isGroup) {
            await rafcode.sendMessage(from, { text: 'Command ini hanya bisa digunakan di grup.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          await rafcode.sendMessage(from, { text: `ID Grup: ${from}` }, { quoted: getStatusOrderQuoted(trimmedBody) });
          break;
        }

        case 'bc':
        case 'broadcast': {
          if (!isOwnerUser(senderRaw)) {
            await rafcode.sendMessage(from, { text: 'Fitur ini hanya untuk owner.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }

          const commandTail = extractCommandTail(body, prefix).trim();
          const ctxInfo = unwrappedMessage?.extendedTextMessage?.contextInfo || unwrappedMessage?.contextInfo || {};
          const quotedMessage = ctxInfo?.quotedMessage || null;
          const quotedText = quotedMessage ? extractText(quotedMessage) : '';

          let imageBuffer = null;
          if (quotedMessage?.imageMessage) {
            try {
              if (typeof rafcode.downloadMediaMessage === 'function') {
                imageBuffer = await rafcode.downloadMediaMessage({ message: quotedMessage }, 'buffer');
              } else {
                console.error('BC download image error: downloadMediaMessage() not available on socket');
              }
            } catch (error) {
              console.error('BC download image error:', error);
            }
          }

          const parsedTail = parseBroadcastCommandTail(commandTail, Boolean(quotedMessage));
          let broadcastText = parsedTail.message || '';
          const mentionAll = parsedTail.mentionAll;

          if (!broadcastText && quotedText) {
            broadcastText = quotedText;
          }

          if (!broadcastText && !imageBuffer) {
            await rafcode.sendMessage(
              from,
              { text: 'Gunakan: .bc/.broadcast <pesan atau reply> [notag]' },
              { quoted: getStatusOrderQuoted(trimmedBody) }
            );
            break;
          }

          const groups = await getAllGroupsSafe(rafcode);
          if (!groups.length) {
            await rafcode.sendMessage(from, { text: 'Bot belum masuk grup manapun.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }

          await rafcode.sendMessage(from, { text: `📢 Broadcast dimulai...\nTotal grup: ${groups.length}` }, { quoted: getStatusOrderQuoted(trimmedBody) });

          let success = 0;
          let failed = 0;

          for (const gid of groups) {
            try {
              await sendBroadcastMessage(rafcode, gid, broadcastText, imageBuffer, mentionAll);
              success += 1;
            } catch (error) {
              failed += 1;
              console.error(`BC gagal ke ${gid}:`, error);
            }
            await new Promise((r) => setTimeout(r, 1500));
          }

          await rafcode.sendMessage(
            from,
            { text: `✅ Broadcast selesai.\nSukses: ${success}\nGagal: ${failed}` },
            { quoted: getStatusOrderQuoted(trimmedBody) }
          );
          break;
        }

        case 'listgc': {
          if (!isOwnerUser(senderRaw)) {
            await rafcode.sendMessage(from, { text: 'Owner only.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }

          const groups = await getAllGroupsSafe(rafcode);
          let teks = `📌 List Grup Bot (${groups.length})\n\n`;

          let no = 1;
          for (const gid of groups) {
            try {
              const meta = await fetchGroupMetadataSafe(rafcode, gid);
              teks += `${no++}. ${meta?.subject || 'Unknown'}\nID: ${gid}\n\n`;
            } catch {
              teks += `${no++}. Unknown\nID: ${gid}\n\n`;
            }
          }

          await rafcode.sendMessage(from, { text: teks.slice(0, 3500) }, { quoted: getStatusOrderQuoted(trimmedBody) });
          break;
        }

        case 'leave': {
          if (!isOwnerUser(senderRaw)) {
            await rafcode.sendMessage(from, { text: 'Owner only.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          if (!isGroup) {
            await rafcode.sendMessage(from, { text: 'Command ini hanya bisa dipakai di grup.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }

          await rafcode.sendMessage(from, { text: 'Bye bye 👋' }, { quoted: getStatusOrderQuoted(trimmedBody) });
          await rafcode.groupLeave(from);
          break;
        }

        case 'join': {
          if (!isOwnerUser(senderRaw)) {
            await rafcode.sendMessage(from, { text: 'Owner only.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }

          const link = args[0];
          if (!link || !link.includes('chat.whatsapp.com/')) {
            await rafcode.sendMessage(from, { text: 'Gunakan: .join <linkgrup>' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }

          try {
            const code = link.split('chat.whatsapp.com/')[1].trim();
            await rafcode.groupAcceptInvite(code);
            await rafcode.sendMessage(from, { text: '✅ Bot berhasil join grup.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
          } catch (error) {
            console.error('join error:', error);
            await rafcode.sendMessage(from, { text: 'Gagal join grup.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
          }
          break;
        }

        case 'autoread': {
          if (!isOwnerUser(senderRaw)) {
            await rafcode.sendMessage(from, { text: 'Owner only.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }

          const opt = (args[0] || '').toLowerCase();

          if (opt === 'on') {
            autoreadEnabled = true;
            await rafcode.sendMessage(from, { text: '✅ AutoRead ON' }, { quoted: getStatusOrderQuoted(trimmedBody) });
          } else if (opt === 'off') {
            autoreadEnabled = false;
            await rafcode.sendMessage(from, { text: '❌ AutoRead OFF' }, { quoted: getStatusOrderQuoted(trimmedBody) });
          } else {
            await rafcode.sendMessage(from, { text: 'Gunakan: .autoread on / .autoread off' }, { quoted: getStatusOrderQuoted(trimmedBody) });
          }
          break;
        }

        case 'onlygc': {
          if (!isOwnerUser(senderRaw)) {
            await rafcode.sendMessage(from, { text: 'Owner only.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const option = (args[0] || '').toLowerCase();
          if (option !== 'on' && option !== 'off') {
            await rafcode.sendMessage(from, { text: 'Gunakan: .onlygc on / .onlygc off' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const statuses = setOwnerModeStatus('onlygc', option === 'on');
          const statusText = statuses.onlygc ? 'diaktifkan' : 'dimatikan';
          const linkLine = option === 'on' && global.groupLink ? `\nSilakan join grup: ${global.groupLink}` : '';
          await rafcode.sendMessage(
            from,
            { text: `Mode hanya grup ${statusText}.${linkLine}` },
            { quoted: getStatusOrderQuoted(trimmedBody) }
          );
          break;
        }

        case 'onlyprib': {
          if (!isOwnerUser(senderRaw)) {
            await rafcode.sendMessage(from, { text: 'Owner only.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const option = (args[0] || '').toLowerCase();
          if (option !== 'on' && option !== 'off') {
            await rafcode.sendMessage(from, { text: 'Gunakan: .onlyprib on / .onlyprib off' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const statuses = setOwnerModeStatus('onlyprib', option === 'on');
          const statusText = statuses.onlyprib ? 'diaktifkan' : 'dimatikan';
          await rafcode.sendMessage(
            from,
            {
              text: `Mode hanya pribadi ${statusText}. ${
                statuses.onlyprib ? `Hubungi ${global.ownerName || 'owner'} untuk akses grup.` : ''
              }`
            },
            { quoted: getStatusOrderQuoted(trimmedBody) }
          );
          break;
        }

        case 'antilink': {
          if (!isGroup) {
            await rafcode.sendMessage(from, { text: 'Command ini hanya bisa digunakan di grup.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const context = await ensureGroupContext();
          const senderAllowed = context.senderIsAdmin || (context.lidMode && isWhitelistedAdmin(senderRaw));
          if (!senderAllowed) {
            await rafcode.sendMessage(from, { text: 'Command ini hanya untuk admin grup.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          if (!args[0]) {
            await rafcode.sendMessage(from, { text: 'Gunakan .antilink on atau .antilink off' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const option = args[0].toLowerCase();
          if (option === 'on') {
            antilinkStatuses = setToggleStatus(antilinkFile, from, true);
            await rafcode.sendMessage(from, { text: 'Antilink grup aktif.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
          } else if (option === 'off') {
            antilinkStatuses = setToggleStatus(antilinkFile, from, false);
            await rafcode.sendMessage(from, { text: 'Antilink grup dimatikan.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
          } else {
            await rafcode.sendMessage(from, { text: 'Gunakan .antilink on atau .antilink off' }, { quoted: getStatusOrderQuoted(trimmedBody) });
          }
          break;
        }

        case 'antipromosi': {
          if (!isGroup) {
            await rafcode.sendMessage(from, { text: 'Command ini hanya bisa digunakan di grup.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const context = await ensureGroupContext();
          const senderAllowed = context.senderIsAdmin || (context.lidMode && isWhitelistedAdmin(senderRaw));
          if (!senderAllowed) {
            await rafcode.sendMessage(from, { text: 'Command ini hanya untuk admin grup.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          if (!args[0]) {
            await rafcode.sendMessage(from, { text: 'Gunakan .antipromosi on atau .antipromosi off' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const option = args[0].toLowerCase();
          if (option === 'on') {
            antipromosiStatuses = setToggleStatus(antipromosiFile, from, true);
            await rafcode.sendMessage(from, { text: 'Anti promosi grup aktif.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
          } else if (option === 'off') {
            antipromosiStatuses = setToggleStatus(antipromosiFile, from, false);
            await rafcode.sendMessage(from, { text: 'Anti promosi grup dimatikan.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
          } else {
            await rafcode.sendMessage(from, { text: 'Gunakan .antipromosi on atau .antipromosi off' }, { quoted: getStatusOrderQuoted(trimmedBody) });
          }
          break;
        }

        case 'promote': {
          if (!isGroup) {
            await rafcode.sendMessage(from, { text: 'Command ini hanya bisa digunakan di grup.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const context = await ensureGroupContext();
          if (!context.metadata) {
            await rafcode.sendMessage(from, { text: 'Gagal mengambil data grup.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const senderAllowed = context.senderIsAdmin || (context.lidMode && isWhitelistedAdmin(senderRaw));
          if (!senderAllowed) {
            await rafcode.sendMessage(from, { text: 'Command ini hanya untuk admin grup.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const botAllowed = context.botIsAdmin || (context.lidMode && isBotSelf(rafcode.user?.id));
          if (!botAllowed) {
            await rafcode.sendMessage(from, { text: 'Bot harus admin untuk promote member.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const target = normalizeJid(targetJid);
          if (!target) {
            await rafcode.sendMessage(from, { text: 'Gunakan .promote @tag atau balas pesan target.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          if (isUserGroupAdmin(context.participants, target)) {
            await rafcode.sendMessage(from, { text: 'Pengguna sudah menjadi admin.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          await rafcode.groupParticipantsUpdate(from, [target], 'promote');
          await rafcode.sendMessage(
            from,
            { text: `@${(target || '').split('@')[0]} telah dipromote.`, mentions: [target] },
            { quoted: getStatusOrderQuoted(trimmedBody) }
          );
          break;
        }

        case 'demote': {
          if (!isGroup) {
            await rafcode.sendMessage(from, { text: 'Command ini hanya bisa digunakan di grup.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const context = await ensureGroupContext();
          if (!context.metadata) {
            await rafcode.sendMessage(from, { text: 'Gagal mengambil data grup.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const senderAllowed = context.senderIsAdmin || (context.lidMode && isWhitelistedAdmin(senderRaw));
          if (!senderAllowed) {
            await rafcode.sendMessage(from, { text: 'Command ini hanya untuk admin grup.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const botAllowed = context.botIsAdmin || (context.lidMode && isBotSelf(rafcode.user?.id));
          if (!botAllowed) {
            await rafcode.sendMessage(from, { text: 'Bot harus admin untuk demote admin lain.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          const target = normalizeJid(targetJid);
          if (!target) {
            await rafcode.sendMessage(from, { text: 'Gunakan .demote @tag atau balas pesan target.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          if (!isUserGroupAdmin(context.participants, target)) {
            await rafcode.sendMessage(from, { text: 'Target bukan admin.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
            break;
          }
          await rafcode.groupParticipantsUpdate(from, [target], 'demote');
          await rafcode.sendMessage(
            from,
            { text: `@${(target || '').split('@')[0]} telah didemote.`, mentions: [target] },
            { quoted: getStatusOrderQuoted(trimmedBody) }
          );
          break;
        }

        case 'calc': {
          const expr = args.join(' ').trim();
          try {
            const result = evaluateCalc(expr);
            await rafcode.sendMessage(from, { text: `Hasil: ${result}` }, { quoted: getStatusOrderQuoted(trimmedBody) });
          } catch (error) {
            await rafcode.sendMessage(from, { text: 'Format rumus tidak valid. Gunakan angka dan operator + - * / ( ) . saja.' }, { quoted: getStatusOrderQuoted(trimmedBody) });
          }
          break;
        }

        case 'owner': {
          const { fakeQuoted, externalAdReply } = buildFakePreviewQuoted();
          const ownerText = [
            `Nama: ${global.ownerName}`,
            `Nomor: ${global.ownerNumber}`,
            `Link: https://wa.me/${global.ownerNumber}`
          ].join('\n');

          await rafcode.sendMessage(
            from,
            {
              text: ownerText,
              contextInfo: { externalAdReply }
            },
            { quoted: fakeQuoted }
          );
          break;
        }

        case 'ping': {
          const pingStart = Date.now();
          const info = await getSystemInfoCached();
          const latency = Date.now() - pingStart;
          const pingText = buildPingText(latency, info);
          const { fakeQuoted, externalAdReply } = buildFakePreviewQuoted();

          try {
            await rafcode.sendMessage(
              from,
              {
                text: pingText,
                contextInfo: { externalAdReply }
              },
              { quoted: fakeQuoted }
            );
          } catch (error) {
            console.error('Failed to send ping reply:', error);
            await rafcode.sendMessage(from, { text: pingText }, { quoted: msg });
          }
          break;
        }

        default:
          break;
      }
    }

  } catch (error) {
    console.error('Error in rafcode module:', error);
  }

};
