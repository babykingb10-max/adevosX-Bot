// ─────────────────────────────────────────────────────────────────────
//  LID → Real WhatsApp Number  (Dave-X Bot)
//  Based on Silent Wolf Bot snippet — synchronous resolution via
//  sock.signalRepository.lidMapping.getPNForLID (no await needed)
// ─────────────────────────────────────────────────────────────────────

const lidPhoneCache = new Map();   // lid-number  → phone-number
const phoneLidCache = new Map();   // phone-number → lid-number
const MAX_LID_CACHE = 500;

// drop oldest 40 % when map is full
function _capMap(map, max) {
    if (map.size <= max) return;
    const excess = map.size - Math.floor(max * 0.6);
    let i = 0;
    for (const k of map.keys()) {
        if (i++ >= excess) break;
        map.delete(k);
    }
}

// populate both caches (called from group scans / message handler)
function cacheLidPhone(lidNum, phoneNum) {
    if (!lidNum || !phoneNum || lidNum === phoneNum) return;
    if (!/^\d{7,15}$/.test(phoneNum)) return;
    lidPhoneCache.set(lidNum, phoneNum);
    phoneLidCache.set(phoneNum, lidNum);
    _capMap(lidPhoneCache, MAX_LID_CACHE);
    _capMap(phoneLidCache, MAX_LID_CACHE);
}

// ── Sync Layer 1: signalRepository (fastest, no network) ─────────────
// Works for any LID the socket has seen in this session.
// NOTE: getPNForLID is synchronous — do NOT await it.
function resolvePhoneFromLid(jid, sock) {
    if (!jid) return null;
    const lidNum = jid.split('@')[0].split(':')[0];

    // check in-memory LID cache
    const cached = lidPhoneCache.get(lidNum);
    if (cached) return cached;

    // check global.lidCache (built from startup group scan)
    if (global.lidCache && global.lidCache.has(lidNum)) {
        const phone = global.lidCache.get(lidNum);
        cacheLidPhone(lidNum, phone);
        return phone;
    }

    // try signalRepository — synchronous call
    if (sock?.signalRepository?.lidMapping?.getPNForLID) {
        const formats = [jid, `${lidNum}@lid`, `${lidNum}:0@lid`];
        for (const fmt of formats) {
            try {
                const pn = sock.signalRepository.lidMapping.getPNForLID(fmt);
                if (pn) {
                    const num = String(pn).split('@')[0].replace(/[^0-9]/g, '');
                    if (num.length >= 7 && num.length <= 15 && num !== lidNum) {
                        cacheLidPhone(lidNum, num);
                        return num;
                    }
                }
            } catch {}
        }
    }

    return null;
}

// ── Async Layer 2: group metadata fetch (when sync fails) ─────────────
async function resolveSenderFromGroup(senderJid, chatId, sock) {
    if (!senderJid || !chatId || !sock) return null;
    const lidNum = senderJid.split('@')[0].split(':')[0];

    const fast = lidPhoneCache.get(lidNum);
    if (fast) return fast;

    try {
        const metadata = await sock.groupMetadata(chatId);
        for (const p of (metadata?.participants || [])) {
            const pid  = p.id  || '';
            const plid = p.lid || '';

            let phoneNum = (p.phoneNumber && String(p.phoneNumber).replace(/[^0-9]/g, '')) || null;
            if (!phoneNum && !pid.includes('@lid')) {
                phoneNum = pid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            }
            if (!phoneNum && plid && !plid.includes('@lid')) {
                phoneNum = plid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            }
            if (phoneNum && (phoneNum.length < 7 || phoneNum.length > 15)) phoneNum = null;

            let participantLid = null;
            if (pid.includes('@lid'))  participantLid = pid.split('@')[0].split(':')[0];
            if (!participantLid && plid.includes('@lid')) {
                participantLid = plid.split('@')[0].split(':')[0];
            }

            if (phoneNum && participantLid) cacheLidPhone(participantLid, phoneNum);
        }
    } catch {}

    return lidPhoneCache.get(lidNum) || null;
}

// ── Main display helper ───────────────────────────────────────────────
// Returns "+254703397679" for resolvable JIDs, "LID:12345678..." if unknown
async function getPhoneDisplay(jid, chatId, sock) {
    if (!jid) return 'unknown';
    const raw = jid.split('@')[0].split(':')[0];

    if (!jid.includes('@lid')) return `+${raw}`;

    const fast = resolvePhoneFromLid(jid, sock);
    if (fast) return `+${fast}`;

    if (chatId?.includes('@g.us')) {
        const fromGroup = await resolveSenderFromGroup(jid, chatId, sock);
        if (fromGroup) return `+${fromGroup}`;
    }

    return `LID:${raw.substring(0, 8)}...`;
}

// ── isLidJid helper ───────────────────────────────────────────────────
// Per Baileys WABinary/jid-utils.ts: LID JIDs exclusively end with '@lid'.
// Do NOT use length or digit heuristics — newsletter JIDs (18+ digits),
// group JIDs, and hosted JIDs all have long numbers but are NOT LIDs.
function isLidJid(jid) {
    if (!jid) return false;
    return jid.endsWith('@lid') || jid.includes('@lid:');
}

module.exports = {
    lidPhoneCache,
    phoneLidCache,
    cacheLidPhone,
    resolvePhoneFromLid,
    resolveSenderFromGroup,
    getPhoneDisplay,
    isLidJid
};
