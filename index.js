require('./config');
process.env.RAFASHACODEID_BANNER = '0';
const chalk = require('chalk');
const caseHandler = require('./case');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const readline = require('readline');
const NodeCache = require('node-cache');
const useMobile = process.argv.includes("--mobile")
let store;

if (!global.ownerNumber) {
	console.warn('Owner belum dikonfigurasi. Isi ownerNumber di config.js agar fitur khusus owner dapat digunakan.');
}

let makeWarafcodeet;
let useMultiFileAuthState;
let DisconnectReason;
let fetchLatestBaileysVersion;
let makeCacheableSignalKeyStore;

function printConnectionBanner() {
	const divider = [...'━━━━━━━━━━━━━━━━━━━━━'].map((char, index, line) => {
		const ratio = index / (line.length - 1);
		const red = Math.round(64 + (160 - 64) * ratio);
		const green = Math.round(224 + (32 - 224) * ratio);
		const blue = Math.round(208 + (240 - 208) * ratio);
		const color = `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
		return chalk.hex(color).bold(char);
	}).join('');
	console.log([
		'   >_ RafashaCode.id',
		`   ${divider}`,
		`     ${chalk.hex('#40E0D0').bold('BASE-BOT-WHATSAPP')}`
	].join('\n'));
}

	async function ensureBaileys() {
		if (makeWarafcodeet) return;
		const imported = await import('@whiskeysockets/baileys');
		const baileys = imported.useMultiFileAuthState
			? imported
			: imported.default?.useMultiFileAuthState
				? imported.default
				: imported;
	makeWarafcodeet = baileys.default || baileys.makeWASocket;
	useMultiFileAuthState = baileys.useMultiFileAuthState;
	DisconnectReason = baileys.DisconnectReason;
	fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
	makeCacheableSignalKeyStore = baileys.makeCacheableSignalKeyStore;
	if (!makeWarafcodeet || !useMultiFileAuthState || !DisconnectReason || !fetchLatestBaileysVersion || !makeCacheableSignalKeyStore) {
		throw new Error('Baileys tidak menyediakan API yang dibutuhkan. Periksa versi/dependensi.');
	}
}
function createSimpleStore() {
	const cachedMessages = new Map();
	const maxMessages = 1000;
	const keyFor = (remoteJid, id) => `${remoteJid}:${id}`;
	const saveMessage = (msg) => {
		const remoteJid = msg?.key?.remoteJid;
		const id = msg?.key?.id;
		if (!remoteJid || !id) return;
		const key = keyFor(remoteJid, id);
		cachedMessages.delete(key);
		cachedMessages.set(key, msg);
		if (cachedMessages.size > maxMessages) {
			cachedMessages.delete(cachedMessages.keys().next().value);
		}
	};

	return {
		bind(ev) {
			if (!ev?.on) return;
			ev.on('messages.upsert', ({ messages: newMessages }) => {
				for (const msg of newMessages || []) {
					if (!msg?.message) continue;
					saveMessage(msg);
				}
			});
		},
		async loadMessage(remoteJid, id) {
			if (!remoteJid || !id) return undefined;
			return cachedMessages.get(keyFor(remoteJid, id));
		},
		saveMessage
	};
}
let rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const question = (text) => new Promise((resolve) => {
	if (rl.closed) {
		rl = readline.createInterface({ input: process.stdin, output: process.stdout })
	}
	rl.question(text, resolve)
})

async function askPhoneNumber() {
	while (true) {
		const input = await question('Nomor WhatsApp (awali dengan 62): ');
		const phoneNumber = input.replace(/\D/g, '');
		if (/^62\d{8,13}$/.test(phoneNumber)) return phoneNumber;
		console.log('Nomor tidak valid. Masukkan 10–15 digit, diawali 62.');
	}
}

let activeSocket = null;
let startPromise = null;
let reconnectTimeout = null;
let hasPrintedBanner = false;
let reconnectAttempt = 0;

function scheduleReconnect() {
	if (reconnectTimeout) return;
	const delay = Math.min(2000 * (2 ** reconnectAttempt), 30000);
	reconnectAttempt += 1;
	console.warn(`Mencoba menyambungkan ulang dalam ${Math.ceil(delay / 1000)} detik...`);
	reconnectTimeout = setTimeout(() => {
		reconnectTimeout = null;
		void startBot();
	}, delay);
}

async function startBot() {
    if (startPromise) return startPromise;
	if (!hasPrintedBanner) {
		printConnectionBanner();
		hasPrintedBanner = true;
	}

    startPromise = (async () => {
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }

        if (activeSocket) {
            try { activeSocket.ev.removeAllListeners(); } catch {}
            try { activeSocket.ws?.close(); } catch {}
            try { activeSocket.end?.(); } catch {}
            activeSocket = null;
        }

        await ensureBaileys();

        store = createSimpleStore()

	    const { state, saveCreds } = await useMultiFileAuthState(`./session`)
	    const msgRetryCounterCache = new NodeCache({ stdTTL: 300, checkperiod: 60, useClones: false })
	    const auth = {
	        creds: state.creds,
	        keys: makeCacheableSignalKeyStore(state.keys, pino().child({ level: 'fatal', stream: 'store' })),
	    }

    const { version, isLatest } = await fetchLatestBaileysVersion()
	const rafcode = makeWarafcodeet({
	version,
	printQRInTerminal: !global.usePairingCode,
	logger: pino({ level: process.env.LOG_LEVEL || 'silent' }),
	mobile: useMobile, // mobile api (prone to bans)
	auth,
browser: [ 'Mac OS', 'Safari', '10.15.7' ],
patchMessageBeforeSending: (message) => {
            const requiresPatch = !!(
                message.buttonsMessage ||
                message.templateMessage ||
                message.listMessage ||
                message.templateButtons
            );
            if (requiresPatch) {
                message = {
                    viewOnceMessage: {
                        message: {
                            messageContextInfo: {
                                deviceListMetadataVersion: 2,
                                deviceListMetadata: {},
                            },
                            ...message,
                        },
                    },
                };
            }
            return message;
		},
connectTimeoutMs: 60000,
	defaultQueryTimeoutMs: 60000,
keepAliveIntervalMs: 10000,
emitOwnEvents: true,
fireInitQueries: true,
 generateHighQualityLinkPreview: false, // lower memory usage
 syncFullHistory: false, // avoid loading entire chat history into RAM
markOnlineOnConnect: true,
      getMessage: async (key) => {
            if (store) {
                const msg = await store.loadMessage(key.remoteJid, key.id)
                return msg?.message || undefined
            }
			return undefined;
        },
	msgRetryCounterCache,
})

        store.bind(rafcode.ev)
        activeSocket = rafcode;

	    rafcode.ev.on('creds.update', saveCreds);

	    rafcode.ev.on('connection.update', (update) => {
	        const { connection, lastDisconnect } = update;
	        if(connection === 'close') {
	            const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
	            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
	            if (shouldReconnect) scheduleReconnect();
	            else console.error('Sesi WhatsApp logout. Hapus folder session lalu jalankan bot dan tautkan ulang.');
	        }
	        if (connection === 'open') reconnectAttempt = 0;
	    });

	if (global.usePairingCode && !rafcode.authState.creds.registered) {
		const inputDivider = chalk.hex('#40E0D0').bold('━'.repeat(48));
		console.log(`\n${inputDivider}`);
		const phoneNumber = await askPhoneNumber();
		if (!global.ownerNumber) global.ownerNumber = phoneNumber;
		console.log(inputDivider);
		const code = await rafcode.requestPairingCode(phoneNumber, 'RAFASHAA');
		console.log(`Kode Pairing Kamu: ${code}`);
	}

	    rafcode.ev.on('messages.upsert', async ({ messages = [] } = {}) => {
		for (const msg of messages) {
			if (!msg?.message || !msg?.key?.remoteJid || msg.key.fromMe) continue;
			if (msg.key.remoteJid === 'status@broadcast') continue;
			if (msg.key.id?.startsWith('BAE5') && msg.key.id.length === 16) continue;
			try {
				await caseHandler(rafcode, msg, messages, store);
			} catch (error) {
				console.error('Gagal memproses pesan WhatsApp:', error);
			}
		}
	    });
	    })().catch((error) => {
		console.error('Bot gagal dijalankan:', error);
		scheduleReconnect();
	}).finally(() => {
        startPromise = null;
    });

    return startPromise;
}

startBot();
