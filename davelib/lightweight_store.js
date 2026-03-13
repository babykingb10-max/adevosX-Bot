const fs = require('fs')
const STORE_FILE = './baileys_store.json'

// Hard limits for low-memory panels
let MAX_MESSAGES   = 50   // messages kept per chat
const MAX_CONTACTS = 250  // max contacts in memory
const MAX_CHATS    = 60   // max chats in memory

try {
    const settings = require('../daveset.js')
    if (settings.maxStoreMessages && typeof settings.maxStoreMessages === 'number') {
        MAX_MESSAGES = Math.min(settings.maxStoreMessages, 50)
    }
} catch (e) {}

let _isDirty = false  // only flush to disk when data actually changed

const store = {
    messages: {},
    contacts: {},
    chats: {},

    readFromFile(filePath = STORE_FILE) {
        try {
            if (fs.existsSync(filePath)) {
                const raw = fs.readFileSync(filePath, 'utf-8')
                if (!raw || raw.length < 2) return
                const data = JSON.parse(raw)
                this.contacts = data.contacts || {}
                this.chats    = data.chats    || {}
                this.messages = data.messages || {}
                this._enforceAllLimits()
            }
        } catch (e) {
            console.warn('[STORE] Failed to read:', e.message)
        }
    },

    writeToFile(filePath = STORE_FILE) {
        if (!_isDirty) return
        try {
            fs.writeFileSync(filePath, JSON.stringify({
                contacts: this.contacts,
                chats:    this.chats,
                messages: this.messages
            }))
            _isDirty = false
        } catch (e) {
            console.warn('[STORE] Failed to write:', e.message)
        }
    },

    _enforceAllLimits() {
        // Contacts
        const cKeys = Object.keys(this.contacts)
        if (cKeys.length > MAX_CONTACTS) {
            for (const k of cKeys.slice(0, cKeys.length - MAX_CONTACTS)) {
                delete this.contacts[k]
            }
        }
        // Chats
        const chatKeys = Object.keys(this.chats)
        if (chatKeys.length > MAX_CHATS) {
            for (const k of chatKeys.slice(0, chatKeys.length - MAX_CHATS)) {
                delete this.chats[k]
            }
        }
        // Messages — trim each chat and drop old-format objects
        for (const jid of Object.keys(this.messages)) {
            if (!Array.isArray(this.messages[jid])) {
                const vals = Object.values(this.messages[jid])
                this.messages[jid] = vals.slice(-MAX_MESSAGES)
            } else if (this.messages[jid].length > MAX_MESSAGES) {
                this.messages[jid] = this.messages[jid].slice(-MAX_MESSAGES)
            }
        }
    },

    bind(ev) {
        ev.on('messages.upsert', ({ messages }) => {
            for (const msg of messages) {
                if (!msg.key?.remoteJid) continue
                const jid = msg.key.remoteJid
                if (!this.messages[jid]) this.messages[jid] = []
                this.messages[jid].push(msg)
                if (this.messages[jid].length > MAX_MESSAGES) {
                    this.messages[jid] = this.messages[jid].slice(-MAX_MESSAGES)
                }
                _isDirty = true
            }
        })

        ev.on('contacts.update', (contacts) => {
            for (const contact of contacts) {
                if (!contact.id) continue
                this.contacts[contact.id] = {
                    id:   contact.id,
                    name: contact.notify || contact.name || ''
                }
                _isDirty = true
            }
            const cKeys = Object.keys(this.contacts)
            if (cKeys.length > MAX_CONTACTS) {
                for (const k of cKeys.slice(0, cKeys.length - MAX_CONTACTS)) {
                    delete this.contacts[k]
                }
            }
        })

        ev.on('chats.set', (data) => {
            const chatList = Array.isArray(data) ? data : (data?.chats || [])
            if (!Array.isArray(chatList)) return
            const recent = chatList.slice(-MAX_CHATS)
            for (const chat of recent) {
                if (chat?.id) {
                    this.chats[chat.id] = { id: chat.id, subject: chat.subject || '' }
                    _isDirty = true
                }
            }
            const chatKeys = Object.keys(this.chats)
            if (chatKeys.length > MAX_CHATS) {
                for (const k of chatKeys.slice(0, chatKeys.length - MAX_CHATS)) {
                    delete this.chats[k]
                }
            }
        })
    },

    async loadMessage(jid, id) {
        return this.messages[jid]?.find(m => m.key.id === id) || null
    },

    // Called by index.js when RAM hits critical level — aggressive purge
    purge() {
        const msgJids = Object.keys(this.messages)
        if (msgJids.length > 15) {
            for (const k of msgJids.slice(0, msgJids.length - 15)) {
                delete this.messages[k]
            }
        }
        for (const jid of Object.keys(this.messages)) {
            this.messages[jid] = this.messages[jid].slice(-2)
        }
        const cKeys = Object.keys(this.contacts)
        for (const k of cKeys.slice(0, Math.floor(cKeys.length * 0.6))) {
            delete this.contacts[k]
        }
        const chatKeys = Object.keys(this.chats)
        for (const k of chatKeys.slice(0, Math.floor(chatKeys.length * 0.6))) {
            delete this.chats[k]
        }
        _isDirty = false
    },

    getStats() {
        let totalMessages = 0
        for (const msgs of Object.values(this.messages)) {
            if (Array.isArray(msgs)) totalMessages += msgs.length
        }
        return {
            messages:           totalMessages,
            contacts:           Object.keys(this.contacts).length,
            chats:              Object.keys(this.chats).length,
            maxMessagesPerChat: MAX_MESSAGES
        }
    }
}

module.exports = store
