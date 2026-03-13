const pendingSongs = new Map();
const PENDING_TTL = 5 * 60 * 1000;

function storePending(chatId, data) {
    pendingSongs.set(chatId, { ...data, ts: Date.now() });
}

function getPending(chatId) {
    const entry = pendingSongs.get(chatId);
    if (!entry) return null;
    if (Date.now() - entry.ts > PENDING_TTL) {
        pendingSongs.delete(chatId);
        return null;
    }
    return entry;
}

function clearPending(chatId) {
    pendingSongs.delete(chatId);
}

module.exports = { storePending, getPending, clearPending };
