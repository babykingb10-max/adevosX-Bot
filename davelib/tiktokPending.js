const pendingTiktok = new Map();
const TTL = 5 * 60 * 1000;

function storeTiktokPending(chatId, data) {
    pendingTiktok.set(chatId, { ...data, ts: Date.now() });
}

function getTiktokPending(chatId) {
    const entry = pendingTiktok.get(chatId);
    if (!entry) return null;
    if (Date.now() - entry.ts > TTL) {
        pendingTiktok.delete(chatId);
        return null;
    }
    return entry;
}

function clearTiktokPending(chatId) {
    pendingTiktok.delete(chatId);
}

module.exports = { storeTiktokPending, getTiktokPending, clearTiktokPending };
