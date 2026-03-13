const _warnCooldowns = new Map();
const COOLDOWN_MS = 30000;

function shouldWarn(groupId, senderId, antiType) {
    const key = `${groupId}|${senderId}|${antiType}`;
    const last = _warnCooldowns.get(key) || 0;
    const now = Date.now();
    if (now - last < COOLDOWN_MS) return false;
    _warnCooldowns.set(key, now);
    if (_warnCooldowns.size > 500) {
        const cutoff = now - COOLDOWN_MS * 2;
        for (const [k, v] of _warnCooldowns) if (v < cutoff) _warnCooldowns.delete(k);
    }
    return true;
}

module.exports = { shouldWarn };
