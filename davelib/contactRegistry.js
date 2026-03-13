const registry = new Map();

function registerContact(jid) {
    if (!jid || typeof jid !== 'string') return;
    if (!jid.endsWith('@s.whatsapp.net')) return;
    if (!registry.has(jid)) {
        registry.set(jid, Date.now());
    }
}

function getAllContacts() {
    return [...registry.keys()];
}

function getContactCount() {
    return registry.size;
}

module.exports = { registerContact, getAllContacts, getContactCount };
