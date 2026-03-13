const config = require('./config');
require('dotenv').config({ override: true });

const fs = require('fs');
const chalk = require('chalk').default || require('chalk');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require('@whiskeysockets/baileys');

const NodeCache = require('node-cache');
const pino = require('pino');
const readline = require('readline');
const { cacheLidPhone: sharedCacheLidPhone } = require('./davelib/lidResolver');

// ─────────────────────────────────────────────────────
// NOISE FILTERING
// ─────────────────────────────────────────────────────
const noisyPatterns = new Set([
    'Failed to decrypt','Bad MAC','decryptWithSessions','doDecryptWhisperMessage',
    'session_cipher','Closing stale open','Decryption failed','SignalProtocolStore',
    'PreKeyWhisperMessage','closing session','Closing session: SessionEntry','SessionEntry {',
    'recv ','handling frame','query:','prekey','session record','identity key','sender key',
    'ciphertext','got notification','msg:ack','writing data','got ack','processing message',
    'updating prekeys','next pre key','ws open','opened ws','frame buffered',
    'pairing configured','handshake','unreadCount','presence',
    'Invalid mex newsletter','Invalid buffer','lid-mapping','no pre key','No session found',
    'NodeNotFoundError','not found in store','socket error','stream error',
    'waiting for message','retry request','Error decoding','failed to decrypt','bad mac',
    'boom error','retry count','reuploadRequest','patchMessage',
]);

function isNoisyLog(...args) {
    const str = args.map(a => a instanceof Error ? a.message : typeof a === 'string' ? a : '').join('');
    for (const p of noisyPatterns) if (str.includes(p)) return true;
    return false;
}

const _origConsoleLog   = console.log;
const _origConsoleError = console.error;
const _origConsoleWarn  = console.warn;
console.log   = (...a) => { if (!isNoisyLog(...a)) _origConsoleLog.apply(console, a); };
console.error = (...a) => { if (!isNoisyLog(...a)) _origConsoleError.apply(console, a); };
console.warn  = (...a) => { if (!isNoisyLog(...a)) _origConsoleWarn.apply(console, a); };

const _origStdoutWrite = process.stdout.write.bind(process.stdout);
const _origStderrWrite = process.stderr.write.bind(process.stderr);
const stdoutNoise = [
    'Closing session: SessionEntry','SessionEntry {','_chains:','chainKey:','registrationId:',
    'currentRatchet:','ephemeralKeyPair:','lastRemoteEphemeralKey:','previousCounter:','rootKey:',
    'indexInfo:','baseKey:','baseKeyType:','remoteIdentityKey:','pendingPreKey:','signedKeyId:',
    'preKeyId:','<Buffer','closed: -1','chainType:','messageKeys:'
];
process.stdout.write = function(chunk, enc, cb) {
    if (typeof chunk === 'string' || Buffer.isBuffer(chunk)) {
        const s = chunk.toString();
        for (const p of stdoutNoise) {
            if (s.includes(p)) { if (typeof enc === 'function') enc(); else if (typeof cb === 'function') cb(); return true; }
        }
    }
    return _origStdoutWrite(chunk, enc, cb);
};
process.stderr.write = function(chunk, enc, cb) {
    if (typeof chunk === 'string' || Buffer.isBuffer(chunk)) {
        const s = chunk.toString();
        if (s.includes('Closing session: SessionEntry') || s.includes('SessionEntry {')) {
            if (typeof enc === 'function') enc(); else if (typeof cb === 'function') cb(); return true;
        }
    }
    return _origStderrWrite(chunk, enc, cb);
};

// ─────────────────────────────────────────────────────
// GLOBALS
// ─────────────────────────────────────────────────────
global.botname            = 'DAVE-X';
global.themeemoji         = '•';
global.isBotConnected     = false;
global.startupWelcomeSent = false;
global.lastActivityTime   = Date.now();
global.errorRetryCount    = 0;

let _backgroundIntervalsStarted = false;
let _440count = 0;
let smsg, handleMessages, handleGroupParticipantUpdate, handleStatus, store, settings;

const SESSION_ERROR_FILE = path.join(__dirname, 'sessionErrorCount.json');
global.messageBackup = {};

// ─────────────────────────────────────────────────────
// PATHS
// ─────────────────────────────────────────────────────
const sessionDir = process.env.SESSION_PATH || path.join(__dirname, 'session');
const credsPath  = path.join(sessionDir, 'creds.json');
const envPath    = path.join(process.cwd(), '.env');

// ─────────────────────────────────────────────────────
// PLATFORM DETECTION  (DAVE-MD style)
// ─────────────────────────────────────────────────────
function detectHost() {
    const e = process.env;
    if (e.RENDER || e.RENDER_EXTERNAL_URL)             return 'Render';
    if (e.DYNO   || e.HEROKU_APP_DIR)                  return 'Heroku';
    if (e.PORTS  && e.CYPHERX_HOST_ID)                 return 'CypherXHost';
    if (e.VERCEL || e.VERCEL_ENV)                      return 'Vercel';
    if (e.RAILWAY_ENVIRONMENT || e.RAILWAY_PROJECT_ID) return 'Railway';
    if (e.REPL_ID || e.REPL_SLUG)                      return 'Replit';
    if (e.P_SERVER_UUID)                               return 'Panel';
    const h = os.hostname().toLowerCase();
    if (h.includes('vps') || h.includes('server'))     return 'VPS';
    switch (os.platform()) {
        case 'win32':  return 'Windows';
        case 'darwin': return 'macOS';
        case 'linux':  return 'Linux';
        default:       return 'Unknown';
    }
}
global.server = detectHost();

// ─────────────────────────────────────────────────────
// STARTUP BANNER
// ─────────────────────────────────────────────────────
_origConsoleLog(chalk.cyan('┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓'));
_origConsoleLog(chalk.cyan('┃') + chalk.white.bold('        🤖 DAVE-X BOT STARTING...     ') + chalk.cyan('  ┃'));
_origConsoleLog(chalk.cyan('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛'));
_origConsoleLog(chalk.cyan(`[DAVE-X] 🖥️  Platform : ${global.server}`));
_origConsoleLog(chalk.cyan(`[DAVE-X] 📦 Node     : ${process.version}`));
_origConsoleLog('');

// ─────────────────────────────────────────────────────
// READLINE  (TTY + non-TTY safe)
// ─────────────────────────────────────────────────────
const rl = process.stdin.isTTY
    ? readline.createInterface({ input: process.stdin, output: process.stdout })
    : null;

const question = (text) => {
    if (rl) return new Promise(resolve => rl.question(text, resolve));
    return Promise.resolve(process.env.PHONE_NUMBER || '');
};

// pairingCode always true — DAVE-MD style, never QR
const pairingCode = true;
const useMobile   = process.argv.includes('--mobile');

// ─────────────────────────────────────────────────────
// RESTART
// ─────────────────────────────────────────────────────
function restartBot() {
    console.log(chalk.blue('[DAVE-X] 🔁 Restarting...'));
    spawn(process.argv[0], [process.argv[1]], { stdio: 'inherit', shell: true });
    process.exit(0);
}

// ─────────────────────────────────────────────────────
// SESSION HELPERS
// ─────────────────────────────────────────────────────
function sessionExists() { return fs.existsSync(credsPath); }

function deleteSessionFolder() {
    if (fs.existsSync(sessionDir)) {
        try { fs.rmSync(sessionDir, { recursive: true, force: true }); console.log(chalk.green('[DAVE-X] ✅ Session folder deleted.')); }
        catch (err) { console.error(chalk.red('[DAVE-X] ❌ Error:'), err.message); }
    }
    deleteErrorCountFile();
    global.errorRetryCount = 0;
}

function loadErrorCount() {
    try { if (fs.existsSync(SESSION_ERROR_FILE)) return JSON.parse(fs.readFileSync(SESSION_ERROR_FILE, 'utf-8')); } catch {}
    return { count: 0, last_error_timestamp: 0 };
}
function saveErrorCount(d) { try { fs.writeFileSync(SESSION_ERROR_FILE, JSON.stringify(d, null, 2)); } catch {} }
function deleteErrorCountFile() { try { if (fs.existsSync(SESSION_ERROR_FILE)) fs.unlinkSync(SESSION_ERROR_FILE); } catch {} }

// ─────────────────────────────────────────────────────
// LOAD SESSION FROM .ENV  (DAVE-MD multi-format parser)
// ─────────────────────────────────────────────────────
function loadEnvSession() {
    const envSession = process.env.SESSION_ID;
    if (!envSession || envSession.trim() === '') return false;

    if (sessionExists()) {
        console.log(chalk.cyan('[DAVE-X] ✅ Existing session found.'));
        return true;
    }

    console.log(chalk.yellow('[DAVE-X] 📥 Session found in env!'));
    console.log(chalk.cyan('[DAVE-X] 🔄 Loading session from env...'));

    try {
        fs.mkdirSync(sessionDir, { recursive: true });
        // Strip quotes, newlines, tabs and all whitespace panels may inject
        let s = envSession
            .trim()
            .replace(/^["'`]+|["'`]+$/g, '')
            .replace(/[\r\n\t]/g, '')
            .replace(/\s+/g, '')
            .trim();

        const prefixes = ['DAVE-X:~','DAVE-MD~','DAVE-AI:~','DAVE-X:','DAVE-MD:','SESSION:','BAILEYS:'];
        for (const p of prefixes) {
            if (s.toUpperCase().startsWith(p.toUpperCase())) {
                s = s.slice(p.length).trim();
                console.log(chalk.gray(`[DAVE-X] 🔍 Removed prefix: ${p}`));
                break;
            }
        }

        let parsed = null;

        // Attempt 1: Raw JSON
        if (s.startsWith('{') && s.endsWith('}')) {
            console.log(chalk.cyan('[DAVE-X] 📋 Format: Raw JSON'));
            try { parsed = JSON.parse(s); } catch {}
        }
        // Attempt 2: Base64
        if (!parsed) {
            console.log(chalk.cyan('[DAVE-X] 🔐 Format: Base64'));
            try { const d = Buffer.from(s, 'base64').toString('utf8'); if (d.includes('{') && d.includes('}')) parsed = JSON.parse(d); } catch {}
        }
        // Attempt 3: URL-safe Base64
        if (!parsed) {
            console.log(chalk.cyan('[DAVE-X] 🔐 Format: URL-safe Base64'));
            try { const d = Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/'), 'base64').toString('utf8'); if (d.includes('{')) parsed = JSON.parse(d); } catch {}
        }
        // Attempt 4: Hex
        if (!parsed) {
            console.log(chalk.cyan('[DAVE-X] 🔐 Format: Hex'));
            try { const d = Buffer.from(s, 'hex').toString('utf8'); if (d.includes('{')) parsed = JSON.parse(d); } catch {}
        }
        // Attempt 5: Extract JSON
        if (!parsed) {
            console.log(chalk.cyan('[DAVE-X] 🔍 Format: Extracting JSON...'));
            try { const m = s.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]); } catch {}
        }

        if (!parsed) {
            console.log(chalk.red('[DAVE-X] ❌ Could not parse SESSION_ID in any format.'));
            return false;
        }

        const required = ['noiseKey','signedIdentityKey','signedPreKey','registrationId'];
        const missing  = required.filter(k => !parsed[k]);
        if (missing.length > 0) {
            console.log(chalk.red(`[DAVE-X] ❌ Session missing keys: ${missing.join(', ')}`));
            return false;
        }

        fs.writeFileSync(credsPath, JSON.stringify(parsed, null, 2));
        console.log(chalk.green('[DAVE-X] ✅ Session loaded and validated successfully!'));
        console.log(chalk.gray(`[DAVE-X] 📝 Saved to: ${credsPath}`));
        return true;

    } catch (err) {
        console.log(chalk.red('[DAVE-X] ❌ Unexpected error loading session:'), err.message);
        return false;
    }
}

// ─────────────────────────────────────────────────────
// PARSE AND SAVE PASTED SESSION  (DAVE-MD exact)
// ─────────────────────────────────────────────────────
function parseAndSaveSession(sessionInput) {
    try {
        fs.mkdirSync(sessionDir, { recursive: true });
        let data = sessionInput.trim();

        const prefixes = ['DAVE-X:~','DAVE-MD~','DAVE-AI:~','DAVE-X:','DAVE-MD:','SESSION:','BAILEYS:'];
        for (const p of prefixes) {
            if (data.startsWith(p)) {
                data = data.replace(p, '').trim();
                console.log(chalk.cyan(`[DAVE-X] 🔍 Detected prefix: ${p}`));
                break;
            }
        }

        let credsJson = null;

        if (data.startsWith('{') && data.endsWith('}')) {
            console.log(chalk.cyan('[DAVE-X] 📋 Format detected: Raw JSON'));
            try { credsJson = JSON.parse(data); } catch (e) { throw new Error('Invalid JSON: ' + e.message); }
        } else {
            console.log(chalk.cyan('[DAVE-X] 🔐 Format detected: Base64'));
            try { credsJson = JSON.parse(Buffer.from(data, 'base64').toString('utf8')); }
            catch (e) { throw new Error('Invalid base64 or JSON: ' + e.message); }
        }

        if (!credsJson || typeof credsJson !== 'object') throw new Error('Not a valid object');

        const required = ['noiseKey','signedIdentityKey','signedPreKey','registrationId'];
        if (!required.some(k => credsJson.hasOwnProperty(k))) throw new Error('Missing required Baileys keys');

        fs.writeFileSync(credsPath, JSON.stringify(credsJson, null, 2));
        console.log(chalk.green('[DAVE-X] ✅ Session validated and saved successfully!'));
        return true;

    } catch (err) {
        console.log(chalk.red(`[DAVE-X] ❌ Failed to parse session: ${err.message}`));
        return false;
    }
}

// ─────────────────────────────────────────────────────
// .ENV WATCHER  (DAVE-MD style)
// ─────────────────────────────────────────────────────
function checkEnvStatus() {
    if (!fs.existsSync(envPath)) return;
    try {
        console.log(chalk.green('╔═══════════════════════════════════════╗'));
        console.log(chalk.green('║       .env file watcher active.       ║'));
        console.log(chalk.green('╚═══════════════════════════════════════╝'));
        fs.watch(envPath, { persistent: false }, (eventType, filename) => {
            if (filename && eventType === 'change') {
                console.log(chalk.bgRed.black('================================================='));
                console.log(chalk.white.bgRed('[DAVE-X] 🚨 .env file change detected!'));
                console.log(chalk.white.bgRed('Restarting bot to apply new configuration.'));
                console.log(chalk.red.bgBlack('================================================='));
                restartBot();
            }
        });
    } catch {}
}

// ─────────────────────────────────────────────────────
// WELCOME MESSAGE
// ─────────────────────────────────────────────────────
async function sendWelcomeMessage(XeonBotInc) {
    global.isBotConnected = true;
    global.sock = XeonBotInc;

    if (global.startupWelcomeSent) {
        console.log(chalk.cyan('[DAVE-X] Reconnected — skipping duplicate startup message.'));
        return;
    }
    global.startupWelcomeSent = true;
    console.log(chalk.green('[DAVE-X] ✅ Bot is now LIVE'));

    try { const { startUpdateChecker } = require('./davexcore/owner/updatenotify'); startUpdateChecker(XeonBotInc); } catch {}
    try { const { startAutoBio } = require('./davexcore/automation/autobio'); startAutoBio(XeonBotInc); } catch {}

    if (!XeonBotInc.user) return;

    try {
        const { getPrefix }          = require('./davexcore/owner/setprefix');
        const { isStartupWelcomeOn } = require('./davexcore/owner/startupwelcome');
        const { createFakeContact, getBotName } = require('./davelib/fakeContact');
        const { getBotMode }         = require('./Database/database');

        const prefix  = getPrefix();
        const botName = getBotName();
        const fake    = createFakeContact(XeonBotInc.user.id);
        const botNum  = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
        const mode    = getBotMode() || 'public';
        const waType  = XeonBotInc.user?.lid ? 'WhatsApp Business' : 'WhatsApp';
        const time    = new Date().toLocaleString();

        if (isStartupWelcomeOn()) {
            try {
                await XeonBotInc.sendMessage(botNum, {
                    text:
`╔═══════════════════════════════╗
║    ✦ ADEVOSX BOT CONNECTED ✦     ║
╠═══════════════════════════════╣
║  ➤ Prefix : [${prefix}]
║  ➤ Mode   : ${mode}
║  ➤ Server : ${global.server}
║  ➤ Time   : ${time}
╚═══════════════════════════════╝`
                }, { quoted: fake });
                console.log(chalk.green('[DAVE-X] Welcome message sent.'));
            } catch (e) {
                console.log(chalk.yellow(`[DAVE-X] Welcome message failed: ${e.message}`));
            }
        }

        for (const nid of ['120363400480173280@newsletter','120363408344756821@newsletter']) {
            try { await XeonBotInc.newsletterFollow(nid); } catch {}
        }
        try { await XeonBotInc.groupAcceptInvite('HupWzyyNIN4HrAZXrRNUJ7'); } catch {}

        deleteErrorCountFile();
        global.errorRetryCount = 0;

        setImmediate(async () => {
            try {
                if (!global.lidCache) global.lidCache = new Map();
                const groups = await Promise.race([
                    XeonBotInc.groupFetchAllParticipating(),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
                ]);
                let mapped = 0;
                for (const gid of Object.keys(groups)) {
                    for (const p of (groups[gid].participants || [])) {
                        const pid  = (p.id  || '').split('@')[0].split(':')[0];
                        const pLid = (p.lid || '').split('@')[0].split(':')[0];
                        if (pLid && pid && /^\d{7,15}$/.test(pid) && /^\d+$/.test(pLid) && pid !== pLid) {
                            global.lidCache.set(pLid, pid); sharedCacheLidPhone(pLid, pid); mapped++;
                        }
                    }
                }
                console.log(chalk.cyan(`[DAVE-X] LID scan: ${Object.keys(groups).length} groups, ${mapped} mappings.`));
                try { require('./dave').populateGroupNameCache(groups); } catch {}
            } catch {}
        });

        console.log(chalk.green('[DAVE-X] Startup complete.'));
    } catch (e) {
        console.log(chalk.red(`[DAVE-X] Startup error: ${e.message}`));
    }
}

// ─────────────────────────────────────────────────────
// 408 HANDLER
// ─────────────────────────────────────────────────────
async function handle408Error(statusCode) {
    if (statusCode !== DisconnectReason.connectionTimeout) return false;
    global.errorRetryCount++;
    const MAX = 3;
    const st = loadErrorCount();
    st.count = global.errorRetryCount;
    st.last_error_timestamp = Date.now();
    saveErrorCount(st);
    console.log(chalk.yellow(`[DAVE-X] ⏱️ Timeout (408). Retry ${global.errorRetryCount}/${MAX}`));
    if (global.errorRetryCount >= MAX) {
        console.log(chalk.red('[DAVE-X] ❌ Max timeouts reached — exiting.'));
        deleteErrorCountFile(); global.errorRetryCount = 0;
        await delay(5000); process.exit(1);
    }
    return true;
}

// ─────────────────────────────────────────────────────
// JUNK + SESSION CLEANUP
// ─────────────────────────────────────────────────────
function cleanupJunkFiles(sock) {
    const dir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(dir)) return;
    fs.readdir(dir, (err, files) => {
        if (err) return;
        const junk = files.filter(f => ['.gif','.png','.mp3','.mp4','.opus','.jpg','.webp','.webm','.zip'].some(e => f.endsWith(e)));
        if (!junk.length) return;
        if (sock?.user?.id) sock.sendMessage(sock.user.id.split(':')[0] + '@s.whatsapp.net', { text: `Deleted ${junk.length} junk files 🚮` });
        junk.forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch {} });
    });
}

function startSessionCleanup() {
    const H = 60 * 60 * 1000, DAY = 24 * H;
    const RULES = [{ prefix: 'sender-key', maxAge: 1*DAY }, { prefix: 'pre-key', maxAge: 3*DAY }, { prefix: 'session-', maxAge: 7*DAY }];
    setInterval(() => {
        try {
            if (!fs.existsSync(sessionDir)) return;
            fs.readdir(sessionDir, (err, files) => {
                if (err) return;
                let deleted = 0;
                const now = Date.now();
                for (const item of files) {
                    if (item === 'creds.json') continue;
                    const rule = RULES.find(r => item.startsWith(r.prefix));
                    if (!rule) continue;
                    const fp = path.join(sessionDir, item);
                    try { if (now - fs.statSync(fp).mtimeMs > rule.maxAge) { fs.unlinkSync(fp); deleted++; } } catch {}
                }
                if (deleted > 0) console.log(chalk.yellow(`[DAVE-X] [CLEANUP] Removed ${deleted} stale session file(s)`));
                if (typeof global.gc === 'function') global.gc();
            });
        } catch {}
    }, 2 * H);
}

// ─────────────────────────────────────────────────────
// MAIN BOT  — login menu INSIDE here (DAVE-MD exact)
// ─────────────────────────────────────────────────────
async function startXeonBotInc() {
    loadEnvSession();

    let version;
    try {
        const r = await Promise.race([fetchLatestBaileysVersion(), new Promise((_, rej) => setTimeout(() => rej(), 5000))]);
        version = r.version;
    } catch { version = [2, 3000, 1033846690]; }

    await fs.promises.mkdir(sessionDir, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const msgRetryCounterCache = new NodeCache();

    const XeonBotInc = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' }).child({ level: 'fatal' })),
        },
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        emitOwnEvents: false,
        keepAliveIntervalMs: 30000,
        connectTimeoutMs: 20000,
        defaultQueryTimeoutMs: 60000,
        enableAutoSessionRecreation: true,
        enableRecentMessageCache: true,
        retryRequestDelayMs: 250,
        maxMsgRetryCount: 5,
        getMessage: async (key) => {
            try { const msg = await store.loadMessage(jidNormalizedUser(key.remoteJid), key.id); return msg?.message || { conversation: '' }; }
            catch { return { conversation: '' }; }
        },
        msgRetryCounterCache
    });

    if (store) store.bind(XeonBotInc.ev);

    // MESSAGE HANDLER
    XeonBotInc.ev.on('messages.upsert', async chatUpdate => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek?.message) return;
            mek.message = Object.keys(mek.message)[0] === 'ephemeralMessage'
                ? mek.message.ephemeralMessage.message : mek.message;
            // Protocol messages (delete/edit) — handle regardless of type
            if (mek.message?.protocolMessage) {
                const protocolType = mek.message.protocolMessage.type;
                if (handleMessages) {
                    try { handleMessages(XeonBotInc, chatUpdate, protocolType === 0).catch(e => log(e.message, 'red', true)); } catch (e) { log(e.message, 'red', true); }
                }
                return;
            }

            // Status messages
            if (mek.key?.remoteJid === 'status@broadcast') {
                try { if (handleStatus) handleStatus(XeonBotInc, chatUpdate).catch(() => {}); } catch {}
                return;
            }

            // Only process live messages
            if (chatUpdate.type !== 'notify') return;
            if (mek.key && !mek.key.fromMe) global.lastActivityTime = Date.now();

            // Drop system/key-exchange messages
            const keys = Object.keys(mek.message);
            if (!keys.length) return;
            if (keys.includes('senderKeyDistributionMessage')) return;
            if (keys.every(k => k === 'messageContextInfo')) return;
            if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return;

            // Private mode: owner commands still work in groups AND private
            // XeonBotInc.public is set by dave.js dynamically — let dave.js handle mode filtering
            if (handleMessages) {
                try { handleMessages(XeonBotInc, chatUpdate, false).catch(e => log(`❌ handleMessages: ${e.message}`, 'red', true)); } catch (e) { log(`❌ handleMessages: ${e.message}`, 'red', true); }
            } else {
                log('⚠️ handleMessages not loaded — message dropped.', 'red', true);
            }
        } catch {}
    });

    // NEWSLETTER AUTO-REACT
    const NEWSLETTER_JIDS = ['120363400480173280@newsletter','120363408344756821@newsletter'];
    XeonBotInc.ev.on('messages.upsert', async (mek) => {
        try {
            const msg = mek.messages[0];
            if (!msg?.message) return;
            if (NEWSLETTER_JIDS.includes(msg?.key?.remoteJid) && msg?.key?.server_id) {
                const emojis = ['❤️','💛','👍','💜','😮','🤍','💙'];
                await XeonBotInc.newsletterReactMessage(msg.key.remoteJid, msg.key.server_id.toString(), emojis[Math.floor(Math.random() * emojis.length)]);
            }
        } catch {}
    });

    // ═══════════════════════════════════════════════
    // LOGIN MENU  — DAVE-MD exact style
    // only runs when creds are not yet registered
    // ═══════════════════════════════════════════════
    if (pairingCode && !XeonBotInc.authState.creds.registered) {
        if (useMobile) throw new Error('Cannot use pairing code with mobile API');

        let phoneNumber;

        if (process.stdin.isTTY) {
            // ── INTERACTIVE (terminal) ──────────────────
            console.log(chalk.grey('┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓'));
            console.log(chalk.cyan('┃') + chalk.white.bold('           CONNECTION OPTIONS              ') + chalk.cyan('┃'));
            console.log(chalk.grey('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛'));
            console.log('');
            console.log(chalk.bold.blue('1. Enter phone number for new pairing'));
            console.log(chalk.bold.blue('2. Use SESSION_ID from .env'));
            console.log(chalk.bold.blue('3. Paste any kind of session'));
            console.log('');

            const option = await question(chalk.bgBlack(chalk.green('Choose between option: 1--2--3\n')));

            if (option.trim() === '2') {
                console.log(chalk.cyan('[DAVE-X] 🔍 Checking .env for SESSION_ID...'));
                const loaded = loadEnvSession();
                if (loaded) {
                    console.log(chalk.green('[DAVE-X] ✅ Session loaded from .env successfully!'));
                    console.log(chalk.cyan('[DAVE-X] 🔄 Restarting to connect with session...'));
                    await delay(1000);
                    restartBot();
                    return;
                } else {
                    console.log(chalk.red('❌ No valid SESSION_ID found in .env'));
                    console.log(chalk.yellow('💡 Tip: Add SESSION_ID=DAVE-X:~your_session to your .env file'));
                    console.log('');
                    console.log(chalk.yellow('⚠️  Falling back to phone number pairing...'));
                    console.log('');
                }

            } else if (option.trim() === '3') {
                console.log(chalk.cyan('┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓'));
                console.log(chalk.cyan('┃') + chalk.green('          📋 PASTE YOUR SESSION        ') + chalk.cyan('  ┃'));
                console.log(chalk.cyan('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛'));
                console.log('');
                console.log(chalk.yellow('✅ Supported formats:'));
                console.log(chalk.white('   • Base64 with prefix: ADEVOS-X:~eyJub2..'));
                console.log(chalk.white('   • Base64 without prefix: eyJub2lzy....'));
                console.log(chalk.white('   • Raw JSON: {"noiseKey":{"private":...'));
                console.log('');
                console.log(chalk.cyan('Paste your session below (press Enter when done):'));
                console.log('');

                const pastedSession = await question(chalk.bgBlack(chalk.green('> ')));

                if (!pastedSession || pastedSession.trim().length < 50) {
                    console.log(chalk.red('❌ Session too short or empty!'));
                    console.log(chalk.yellow('⚠️  Falling back to phone number pairing...'));
                    console.log('');
                } else {
                    console.log(chalk.cyan('[DAVE-X] 🔍 Analyzing session format...'));
                    const saved = parseAndSaveSession(pastedSession);
                    if (saved) {
                        console.log(chalk.green('[DAVE-X] ✅ Session saved successfully!'));
                        console.log(chalk.cyan('[DAVE-X] 🔄 Restarting to connect with pasted session...'));
                        await delay(1000);
                        restartBot();
                        return;
                    } else {
                        console.log(chalk.red('❌ Failed to parse session!'));
                        console.log(chalk.yellow('⚠️  Falling back to phone number pairing...'));
                        console.log('');
                    }
                }
            }

            // Option 1 or fallback — ask phone number directly in console
            phoneNumber = await question(chalk.bgBlack(chalk.green('Please type your WhatsApp number\nFormat: 254104260236 (without + or spaces) : ')));

        } else {
            // ── NON-INTERACTIVE (panels) ────────────────
            console.log(chalk.bold.cyan(`[DAVE-X] [${global.server}] Non-interactive — reading environment variables...`));

            const envSession = (process.env.SESSION_ID || '').trim();
            const envPhone   = (process.env.PHONE_NUMBER || '').replace(/\D/g, '');

            if (envSession) {
                console.log(chalk.magenta('[DAVE-X] SESSION_ID found — loading...'));
                const loaded = loadEnvSession();
                if (!loaded) {
                    console.log(chalk.red('[DAVE-X] ❌ SESSION_ID could not be parsed. Fix it in your panel and restart.'));
                    process.exit(1);
                }
                restartBot();
                return;
            }

            if (envPhone && envPhone.length >= 7) {
                phoneNumber = envPhone;
                console.log(chalk.cyan(`[DAVE-X] 📱 PHONE_NUMBER found: ${phoneNumber}`));
            } else {
                console.log(chalk.red('[DAVE-X] ❌ No SESSION_ID or PHONE_NUMBER set.'));
                console.log(chalk.yellow(`[DAVE-X] Set SESSION_ID or PHONE_NUMBER in your ${global.server} panel and restart.`));
                process.exit(1);
            }
        }

        // Validate phone number
        if (!phoneNumber || phoneNumber.trim() === '') {
            console.log(chalk.red('❌ No phone number provided.'));
            process.exit(1);
        }
        phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
        if (phoneNumber.length < 7 || phoneNumber.length > 15) {
            console.log(chalk.bold.red(`Invalid phone number (${phoneNumber.length} digits). Use format: 254104260236`));
            process.exit(1);
        }

        // Request pairing code — DAVE-MD exact setTimeout style
        setTimeout(async () => {
            try {
                let code = await XeonBotInc.requestPairingCode(phoneNumber);
                code = code?.match(/.{1,4}/g)?.join('-') || code;

                console.log('');
                console.log(chalk.green('┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓'));
                console.log(chalk.green('┃') + chalk.white.bold('              PAIRING CODE               ') + chalk.green('┃'));
                console.log(chalk.green('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛'));
                console.log('');
                console.log(chalk.cyan.bold(`    ${code}    `));
                console.log('');
                console.log(chalk.yellow('📱 How to link your WhatsApp:'));
                console.log(chalk.white('1. Open WhatsApp on your phone'));
                console.log(chalk.white('2. Go to Settings > Linked Devices'));
                console.log(chalk.white('3. Tap "Link a Device"'));
                console.log(chalk.white('4. Enter the code: ') + chalk.green.bold(code));
                console.log('');
                console.log(chalk.cyan.bold('⏱️  Code expires in 1 minute'));
                console.log('');

            } catch (error) {
                const msg = String(error?.message || '').toLowerCase();
                if (msg.includes('connection closed') || msg.includes('closed')) {
                    console.log(chalk.red('⚠ Connection closed — clearing session...'));
                    deleteSessionFolder();
                    process.exit(1);
                }
                console.log(chalk.red('❌ Failed to generate pairing code'));
                console.log(chalk.yellow('Error details:'), error.message);
                process.exit(1);
            }
        }, 3000);
    }

    // CONNECTION UPDATE
    let reconnectAttempts = 0;
    const MAX_RECONNECT = 5;
    let _openHandled = false;

    XeonBotInc.ev.on('connection.update', async (update) => {
        global.lastActivityTime = Date.now();
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            if (_openHandled) return;
            _openHandled = true;
            _440count = 0;
            reconnectAttempts = 0;
            global.sock = XeonBotInc;

            console.log(chalk.green('┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓'));
            console.log(chalk.green('┃') + chalk.white.bold('        ✅ CONNECTION SUCCESSFUL!      ') + chalk.green(' ┃'));
            console.log(chalk.green('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛'));

            if (XeonBotInc.user?.lid) {
                global.ownerLid = XeonBotInc.user.lid.split(':')[0];
            }

            if (!XeonBotInc._fontWrapped) {
                XeonBotInc._fontWrapped = true;
                const _orig = XeonBotInc.sendMessage.bind(XeonBotInc);
                XeonBotInc.sendMessage = async (jid, content, opts) => {
                    try {
                        const { getBotFont }   = require('./davelib/botConfig');
                        const { applyBotFont } = require('./davelib/fontStyles');
                        const font = getBotFont();
                        if (font && font !== 'none' && content) {
                            if (typeof content.text    === 'string') content = { ...content, text:    applyBotFont(content.text,    font) };
                            if (typeof content.caption === 'string') content = { ...content, caption: applyBotFont(content.caption, font) };
                        }
                    } catch {}
                    return _orig(jid, content, opts);
                };
            }

            await sendWelcomeMessage(XeonBotInc);
        }

        if (connection === 'close') {
            global.isBotConnected = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(chalk.yellow(`[DAVE-X] ⚠️ Connection closed. Status: ${statusCode}`));

            const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403 || statusCode === 419;
            if (isLoggedOut) {
                console.log(chalk.red('[DAVE-X] 🚨 Logged out — deleting session.'));
                deleteSessionFolder();
                console.log(chalk.yellow('[DAVE-X] Update SESSION_ID and restart.'));
                await delay(3000); process.exit(1);
            }
            if (statusCode === DisconnectReason.badSession) {
                console.log(chalk.red('[DAVE-X] 🚨 Bad session — deleting and reconnecting.'));
                deleteSessionFolder(); reconnectAttempts = 0;
                setTimeout(() => startXeonBotInc(), 3000); return;
            }
            const is408 = await handle408Error(statusCode);
            if (is408) { setTimeout(() => startXeonBotInc(), 5000); return; }

            if (statusCode === 440) {
                _440count++;
                const backoff = Math.min(15000 * Math.pow(2, _440count - 1), 120000);
                console.log(chalk.yellow(`[DAVE-X] Connection replaced (440 ×${_440count}). Retrying in ${backoff/1000}s...`));
                setTimeout(() => startXeonBotInc(), backoff); return;
            }
            if (statusCode === 515 || statusCode === 516) { setTimeout(() => startXeonBotInc(), 3000); return; }
            if (statusCode === 503) { setTimeout(() => startXeonBotInc(), 10000); return; }
            if (statusCode === 428 || statusCode === DisconnectReason.timedOut || statusCode === DisconnectReason.connectionLost) {
                reconnectAttempts = 0; setTimeout(() => startXeonBotInc(), 5000); return;
            }
            if (reconnectAttempts >= MAX_RECONNECT) {
                console.log(chalk.red(`[DAVE-X] ❌ Max reconnects reached — deleting session...`));
                deleteSessionFolder(); reconnectAttempts = 0;
                setTimeout(() => startXeonBotInc(), 5000);
            } else {
                reconnectAttempts++;
                console.log(chalk.cyan(`[DAVE-X] 🔄 Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT})`));
                setTimeout(() => startXeonBotInc(), 10000);
            }
        }
    });

    // GROUP PARTICIPANTS
    XeonBotInc.ev.on('group-participants.update', async (update) => {
        if (!global.isBotConnected) return;
        try { await handleGroupParticipantUpdate(XeonBotInc, update); } catch {}
    });

    // CALL HANDLER
    XeonBotInc.ev.on('call', async (calls) => {
        if (!global.isBotConnected) return;
        try {
            const { handleIncomingCall, readState } = require('./davexcore/anti/anticall');
            const { handleGroupCall } = require('./davexcore/anti/groupanticall');
            for (const call of calls) {
                if (call.status !== 'offer') continue;
                const callerJid = call.from || call.chatId;
                if (!callerJid) continue;
                const callData = { id: call.id, from: callerJid, callerPn: call.callerPn || null, chatId: call.chatId || callerJid, isVideo: call.isVideo || false, isGroup: call.isGroup || false, groupJid: call.groupJid || null };
                try { const done = await handleGroupCall(XeonBotInc, callData); if (done) continue; } catch {}
                try { const st = readState(); if (st.enabled) await handleIncomingCall(XeonBotInc, callData); } catch {}
            }
        } catch {}
    });

    // MESSAGE EDITS
    XeonBotInc.ev.on('messages.update', async (updates) => {
        if (!global.isBotConnected) return;
        try {
            const { handleMessageUpdate } = require('./davexcore/anti/antiedit');
            for (const u of updates) {
                if (u.update?.message || u.update?.editedMessage || u.message) {
                    try { await handleMessageUpdate(XeonBotInc, u); } catch {}
                }
            }
        } catch {}
    });

    XeonBotInc.ev.on('creds.update', saveCreds);
    XeonBotInc.public = true;
    XeonBotInc.serializeM = (m) => smsg(XeonBotInc, m, store);
    XeonBotInc.getName = (jid) => { const c = store?.contacts[jid] || {}; return c.notify || c.name || jid.split('@')[0]; };

    // BACKGROUND INTERVALS (once per process)
    if (!_backgroundIntervalsStarted) {
        _backgroundIntervalsStarted = true;
        setTimeout(startSessionCleanup, 5 * 60 * 1000);
        setInterval(() => cleanupJunkFiles(global.sock), 30 * 60 * 1000);

        // Watchdog
        const ZOMBIE_MS  = 20 * 60 * 1000;
        const REFRESH_MS = 12 * 60 * 60 * 1000;
        let _lastRefresh = Date.now();
        setInterval(async () => {
            const sock = global.sock;
            if (!sock || !global.isBotConnected) return;
            const now = Date.now();
            if (now - _lastRefresh >= REFRESH_MS) {
                console.log(chalk.cyan('[WATCHDOG] 12h session refresh...'));
                _lastRefresh = now; global.startupWelcomeSent = false;
                try { sock.ws?.terminate?.() || sock.ws?.close?.(); } catch {}
                return;
            }
            const silent = now - global.lastActivityTime;
            if (silent < ZOMBIE_MS) return;
            let ok = false;
            try { await Promise.race([sock.sendPresenceUpdate('available'), new Promise((_, r) => setTimeout(() => r(new Error('t')), 8000))]); ok = true; } catch {}
            if (!ok) {
                console.log(chalk.yellow(`[WATCHDOG] Zombie (${Math.round(silent/60000)}m) — reconnecting...`));
                global.startupWelcomeSent = false;
                try { sock.ws?.terminate?.() || sock.ws?.close?.(); } catch { try { sock.end(new Error('watchdog')); } catch {} }
            }
        }, 2 * 60 * 1000);
    }

    return XeonBotInc;
}

// ─────────────────────────────────────────────────────
// INITIALIZE  (DAVE-MD style with retries)
// ─────────────────────────────────────────────────────
let retryCount = 0;
const maxRetries = 3;

async function initializeBot() {
    try {
        require('./daveset');
        const main = require('./dave');
        handleMessages               = main.handleMessages;
        handleGroupParticipantUpdate = main.handleGroupParticipantUpdate;
        handleStatus                 = main.handleStatus;

        const myfunc = require('./davelib/myfunc');
        smsg = myfunc.smsg;

        store    = require('./davelib/lightweight_store');
        settings = require('./daveset');

        if (!process.env.DYNO) {
            store.readFromFile();
            setInterval(() => store.writeToFile(), settings.storeWriteInterval || 60000);
        }
        console.log(chalk.green('[DAVE-X] ✨ Core files loaded successfully.'));
    } catch (e) {
        console.log(chalk.red(`[DAVE-X] FATAL: Failed to load core files — ${e.message}`));
        process.exit(1);
    }

    global.errorRetryCount = loadErrorCount().count;

    try {
        await startXeonBotInc();
        retryCount = 0;
        checkEnvStatus();
    } catch (err) {
        console.error(chalk.red('[DAVE-X] ❌ Failed to start:'), err);
        if (retryCount < maxRetries) {
            retryCount++;
            const wait = 10 * retryCount;
            console.log(chalk.yellow(`[DAVE-X] 🔄 Retry ${retryCount}/${maxRetries} in ${wait}s...`));
            setTimeout(() => initializeBot(), wait * 1000);
        } else {
            console.error(chalk.red('[DAVE-X] 💥 Max retries reached. Exiting...'));
            process.exit(1);
        }
    }
}

initializeBot();

process.on('uncaughtException', (err) => {
    console.log(chalk.red('[DAVE-X] ❌ Uncaught exception:'), err.message);
    setTimeout(() => startXeonBotInc(), 5000);
});
process.on('unhandledRejection', (reason) => {
    console.log(chalk.red('[DAVE-X] ❌ Unhandled rejection:'), reason);
});

const { closePg } = require('./Database/pgSync');
async function gracefulShutdown(signal) {
    console.log(chalk.yellow(`[DAVE-X] ${signal} — flushing to PostgreSQL...`));
    try { await closePg(); } catch {}
    process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
