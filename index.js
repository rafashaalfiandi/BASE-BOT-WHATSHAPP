require('./config');
const chalk = require('chalk');
const caseHandler = require('./case');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const readline = require('readline');
const NodeCache = require('node-cache');
const useMobile = process.argv.includes("--mobile")
let store;

let makeWarafcodeet;
let connConnect;
let useMultiFileAuthState;
let DisconnectReason;
let fetchLatestBaileysVersion;
let generateForwardMessageContent;
let generateWAMessage;
let prepareWAMessageMedia;
let generateWAMessageFromContent;
let generateMessageID;
let downloadContentFromMessage;
let PHONENUMBER_MCC;
let jidDecode;
let proto;
let makeCacheableSignalKeyStore;

function printConnectionBanner() {
	const detail = chalk.hex('#82ffe9');
	const time = new Date().toLocaleTimeString('id-ID', { hour12: false });
	console.log(`\n${detail.bold('✔')}  ${chalk.white.bold('Bot is connected')} ${chalk.gray(`· ${time}`)}`);
}

	async function ensureBaileys() {
		if (makeWarafcodeet) return;
		const imported = await import('@whiskeysockets/baileys');
		const baileys = imported.default || imported;
	makeWarafcodeet = baileys.default;
	connConnect = baileys.connConnect;
	useMultiFileAuthState = baileys.useMultiFileAuthState;
	DisconnectReason = baileys.DisconnectReason;
	fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
	generateForwardMessageContent = baileys.generateForwardMessageContent;
	generateWAMessage = baileys.generateWAMessage;
	prepareWAMessageMedia = baileys.prepareWAMessageMedia;
	generateWAMessageFromContent = baileys.generateWAMessageFromContent;
	generateMessageID = baileys.generateMessageID;
	downloadContentFromMessage = baileys.downloadContentFromMessage;
	PHONENUMBER_MCC = baileys.PHONENUMBER_MCC;
	jidDecode = baileys.jidDecode;
	proto = baileys.proto;
	makeCacheableSignalKeyStore = baileys.makeCacheableSignalKeyStore;
}
function createSimpleStore() {
	const cachedMessages = new Map();
	const keyFor = (remoteJid, id) => `${remoteJid}:${id}`;
	const saveMessage = (msg) => {
		const remoteJid = msg?.key?.remoteJid;
		const id = msg?.key?.id;
		if (!remoteJid || !id) return;
		cachedMessages.set(keyFor(remoteJid, id), msg);
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

let activeSocket = null;
let startPromise = null;
let reconnectTimeout = null;
let lastConnectionState = null;

async function startBot() {
    if (startPromise) return startPromise;

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

        lastConnectionState = null;

        await ensureBaileys();

        store = createSimpleStore()

	    const { state, saveCreds } = await useMultiFileAuthState(`./session`)
	    const msgRetryCounterCache = new NodeCache()
	    const auth = {
	        creds: state.creds,
	        keys: makeCacheableSignalKeyStore(state.keys, pino().child({ level: 'fatal', stream: 'store' })),
	    }

    const { version, isLatest } = await fetchLatestBaileysVersion()
	const rafcode = makeWarafcodeet({
	version,
	printQRInTerminal: !global.usePairingCode,
	logger: pino({ level: 'silent' }),
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
auth: {
         creds: state.creds,
         keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }).child({ level: "fatal" })),
      },
connectTimeoutMs: 60000,
defaultQueryTimeoutMs: 0,
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
            return {
                conversation: "Irafcode Bot ZxcoderID Online!!"
            }
        },
      msgRetryCounterCache, // Resolve waiting messages
      defaultQueryTimeoutMs: undefined, // for this issues https://github.com/Whiskeyrafcodeets/Baileys/issues/276
})

	if (global.usePairingCode && !rafcode.authState.creds.registered) {
		let phoneNumber = await question('Nomor Whatsapp Ter-Input (awali dengan 62): ');
		phoneNumber = phoneNumber.replace(/\D/g, '');

		const code = await rafcode.requestPairingCode(phoneNumber, 'RAFASHAA');
		console.log(`Kode Pairing Kamu: ${code}`);
	}

        store.bind(rafcode.ev)
        activeSocket = rafcode;

	    rafcode.ev.on('creds.update', saveCreds);

	    rafcode.ev.on('connection.update', (update) => {
	        const { connection, lastDisconnect } = update;
	        if(connection === 'close') {
	            const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
	            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
	            if (shouldReconnect && !reconnectTimeout) {
	                reconnectTimeout = setTimeout(() => {
	                    reconnectTimeout = null;
	                    startBot();
	                }, 2000);
	            }
        } else if(connection === 'open') {
            if (lastConnectionState !== 'open' && rafcode.authState?.creds?.registered) {
                printConnectionBanner();
            }
        }
	        if (connection) lastConnectionState = connection;
	    });

	    rafcode.ev.on('messages.upsert', async ({ messages, type }) => {
        let msg = messages[0];
                if (!msg.message) {
                    return;
                }
                msg.message = Object.keys(msg.message)[0] === 'ephemeralMessage' ? msg.message.ephemeralMessage.message : msg.message;
                // Abaikan pesan bot sendiri
        if (msg.key.fromMe) return; // Pesan ini berasal dari bot
                if (msg.key && msg.key.remoteJid === 'status@broadcast') {
                    return;
                }
                if (msg.key?.id?.startsWith('BAE5') && msg.key.id.length === 16) {
                    return;
                }
                caseHandler(rafcode, msg, messages, store);
                /*
        if(type === 'notify') {
            const msg = messages[0];
            if(!msg.key.fromMe && msg.message) {
                await rafcode.sendMessage(msg.key.remoteJid, { text: 'Halo, ini bot WhatsApp!' });
            }
        }*/
	    });
    })().finally(() => {
        startPromise = null;
    });

    return startPromise;
}

startBot();
