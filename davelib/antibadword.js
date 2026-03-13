const { getGroupConfig, setGroupConfig } = require('../Database/settingsStore');
const db = require('../Database/database');
const { getBotName } = require('./botConfig');

function createFakeContact(participantId = '0') {
    const botName = getBotName();
    const cleanId = String(participantId).split('@')[0] || '0';
    
    return {
        key: {
            participants: "0@s.whatsapp.net",
            remoteJid: "0@s.whatsapp.net",
            fromMe: false
        },
        message: {
            contactMessage: {
                displayName: botName,
                vcard: `BEGIN:VCARD\nVERSION:3.0\nN:;${botName};;;\nFN:${botName}\nitem1.TEL;waid=${cleanId}:${cleanId}\nitem1.X-ABLabel:Phone\nEND:VCARD`
            }
        },
        participant: "0@s.whatsapp.net"
    };
}

const DEFAULT_BAD_WORDS = [
    'gandu', 'madarchod', 'bhosdike', 'bsdk', 'fucker', 'bhosda', 
    'lauda', 'laude', 'betichod', 'chutiya', 'behenchod', 
    'randi', 'chuchi', 'boobs', 'idiot', 'nigga', 'fuck', 
    'dick', 'bitch', 'bastard', 'asshole', 'lund', 'mc', 'lodu',
    'shit', 'damn', 'piss', 'crap', 'slut', 'whore', 'prick',
    'motherfucker', 'cock', 'cunt', 'pussy', 'twat', 'wanker',
    'chut', 'harami', 'kameena', 'haramzada'
];

async function handleAntiBadwordCommand(sock, chatId, message, match) {
    const senderId = message.key.participant || message.key.remoteJid;
    const botName = getBotName();
    const fake = createFakeContact(senderId);
    const config = getGroupConfig(chatId, 'antibadword') || {};
    
    if (!match) {
        const customWords = config.words || [];
        return sock.sendMessage(chatId, {
            text: `*${botName} ANTIBADWORD*\n\n` +
                  `Status: ${config.enabled ? 'ON' : 'OFF'}\n` +
                  `Action: ${config.action || 'delete'}\n` +
                  `Max Warnings: ${config.maxWarnings || 3}\n` +
                  `Custom Words: ${customWords.length}\n\n` +
                  `*Commands:*\n` +
                  `.antibadword on - Enable\n` +
                  `.antibadword off - Disable\n` +
                  `.antibadword set <action> - delete/kick/warn\n` +
                  `.antibadword add <word1, word2> - Add bad words\n` +
                  `.antibadword remove <word> - Remove a word\n` +
                  `.antibadword list - List custom words\n` +
                  `.antibadword reset - Reset to default words`
        }, { quoted: fake });
    }

    if (match === 'on') {
        if (config?.enabled) {
            return sock.sendMessage(chatId, { text: `*${botName}*\nAntiBadword already enabled!` }, { quoted: fake });
        }
        setGroupConfig(chatId, 'antibadword', { ...config, enabled: true, action: config.action || 'delete' });
        return sock.sendMessage(chatId, { text: `*${botName}*\nAntiBadword ENABLED!` }, { quoted: fake });
    }

    if (match === 'off') {
        if (!config?.enabled) {
            return sock.sendMessage(chatId, { text: `*${botName}*\nAntiBadword already disabled!` }, { quoted: fake });
        }
        setGroupConfig(chatId, 'antibadword', { ...config, enabled: false });
        return sock.sendMessage(chatId, { text: `*${botName}*\nAntiBadword DISABLED!` }, { quoted: fake });
    }

    if (match.startsWith('set ')) {
        const action = match.split(' ')[1];
        if (!action || !['delete', 'kick', 'warn'].includes(action)) {
            return sock.sendMessage(chatId, { text: `*${botName}*\nInvalid action!\nChoose: delete, kick, or warn` }, { quoted: fake });
        }
        setGroupConfig(chatId, 'antibadword', { ...config, enabled: true, action });
        return sock.sendMessage(chatId, { text: `*${botName}*\nAction set to: ${action}` }, { quoted: fake });
    }

    if (match.startsWith('add ')) {
        const wordsInput = match.slice(4).trim();
        if (!wordsInput) {
            return sock.sendMessage(chatId, { text: `*${botName}*\nProvide words to add!\nExample: .antibadword add word1, word2, word3` }, { quoted: fake });
        }
        const newWords = wordsInput.split(/[,\s]+/).map(w => w.trim().toLowerCase()).filter(w => w.length > 0);
        if (newWords.length === 0) {
            return sock.sendMessage(chatId, { text: `*${botName}*\nNo valid words provided!` }, { quoted: fake });
        }
        const currentWords = config.words || [...DEFAULT_BAD_WORDS];
        const addedWords = [];
        for (const word of newWords) {
            if (!currentWords.includes(word)) {
                currentWords.push(word);
                addedWords.push(word);
            }
        }
        setGroupConfig(chatId, 'antibadword', { ...config, words: currentWords, enabled: true });
        return sock.sendMessage(chatId, { 
            text: `*${botName}*\nAdded ${addedWords.length} word(s): ${addedWords.join(', ')}\nTotal words: ${currentWords.length}` 
        }, { quoted: fake });
    }

    if (match.startsWith('remove ')) {
        const wordToRemove = match.slice(7).trim().toLowerCase();
        if (!wordToRemove) {
            return sock.sendMessage(chatId, { text: `*${botName}*\nProvide a word to remove!` }, { quoted: fake });
        }
        const currentWords = config.words || [...DEFAULT_BAD_WORDS];
        const idx = currentWords.indexOf(wordToRemove);
        if (idx === -1) {
            return sock.sendMessage(chatId, { text: `*${botName}*\nWord "${wordToRemove}" not found in list!` }, { quoted: fake });
        }
        currentWords.splice(idx, 1);
        setGroupConfig(chatId, 'antibadword', { ...config, words: currentWords });
        return sock.sendMessage(chatId, { text: `*${botName}*\nRemoved "${wordToRemove}"\nTotal words: ${currentWords.length}` }, { quoted: fake });
    }

    if (match === 'list') {
        const currentWords = config.words || DEFAULT_BAD_WORDS;
        const wordList = currentWords.join(', ');
        return sock.sendMessage(chatId, { 
            text: `*${botName} BAD WORDS LIST*\n\n${currentWords.length} words:\n${wordList}` 
        }, { quoted: fake });
    }

    if (match === 'reset') {
        setGroupConfig(chatId, 'antibadword', { ...config, words: [...DEFAULT_BAD_WORDS] });
        return sock.sendMessage(chatId, { 
            text: `*${botName}*\nBad words reset to defaults (${DEFAULT_BAD_WORDS.length} words)` 
        }, { quoted: fake });
    }

    return sock.sendMessage(chatId, { text: `*${botName}*\nInvalid command!\nUse .antibadword for help` }, { quoted: fake });
}

async function handleBadwordDetection(sock, chatId, message, userMessage, senderId) {
    try {
        if (!chatId.endsWith('@g.us')) return;
        if (message.key.fromMe) return;

        const config = getGroupConfig(chatId, 'antibadword');
        if (!config?.enabled) return;

        const groupMetadata = await sock.groupMetadata(chatId);
        const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const bot = groupMetadata.participants.find(p => p.id === botId);
        if (!bot?.admin) return;

        const participant = groupMetadata.participants.find(p => p.id === senderId);
        if (participant?.admin) return;
        if (db.isSudo(senderId)) return;

        const cleanMessage = userMessage.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const badWords = config.words?.length > 0 ? config.words : DEFAULT_BAD_WORDS;
        const messageWords = cleanMessage.split(' ');
        let containsBadWord = false;

        for (const word of messageWords) {
            if (word.length < 2) continue;
            if (badWords.includes(word)) {
                containsBadWord = true;
                break;
            }
        }

        for (const badWord of badWords) {
            if (badWord.includes(' ') && cleanMessage.includes(badWord)) {
                containsBadWord = true;
                break;
            }
        }

        if (!containsBadWord) return;

        const botName = getBotName();
        const fake = createFakeContact(senderId);

        try {
            await sock.sendMessage(chatId, { delete: message.key });
        } catch (err) {
            console.error('Error deleting message:', err.message);
            return;
        }

        const action = config.action || 'delete';
        const senderNumber = senderId.split('@')[0];
        const maxWarnings = config.maxWarnings || 3;

        switch (action) {
            case 'delete':
                await sock.sendMessage(chatId, {
                    text: `*${botName}*\n@${senderNumber}, bad words not allowed!\nMessage deleted.`,
                    mentions: [senderId]
                }, { quoted: fake });
                break;

            case 'kick':
                try {
                    await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
                    await sock.sendMessage(chatId, {
                        text: `*${botName}*\n@${senderNumber} kicked for bad words!`,
                        mentions: [senderId]
                    }, { quoted: fake });
                } catch (error) {
                    console.error('Error kicking user:', error.message);
                }
                break;

            case 'warn':
                const warningCount = db.incrementWarning(chatId, senderId);
                if (warningCount >= maxWarnings) {
                    try {
                        await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
                        db.resetWarning(chatId, senderId);
                        await sock.sendMessage(chatId, {
                            text: `*${botName}*\n@${senderNumber} kicked after ${maxWarnings} warnings!`,
                            mentions: [senderId]
                        }, { quoted: fake });
                    } catch (error) {
                        console.error('Error kicking user after warnings:', error.message);
                    }
                } else {
                    await sock.sendMessage(chatId, {
                        text: `*${botName}*\n@${senderNumber} warning ${warningCount}/${maxWarnings}!\nBad words not allowed.`,
                        mentions: [senderId]
                    }, { quoted: fake });
                }
                break;
        }
    } catch (err) {
        console.error('Error in handleBadwordDetection:', err.message, 'Line:', err.stack?.split('\n')[1]);
    }
}

async function setAntiBadword(groupId, type, action) {
    setGroupConfig(groupId, 'antibadword', {
        enabled: type === 'on',
        action: action || 'delete'
    });
    return true;
}

async function getAntiBadword(groupId) {
    return getGroupConfig(groupId, 'antibadword');
}

async function removeAntiBadword(groupId) {
    setGroupConfig(groupId, 'antibadword', { enabled: false, action: 'delete' });
    return true;
}

function incrementWarningCount(groupId, userId) {
    return db.incrementWarning(groupId, userId);
}

function resetWarningCount(groupId, userId) {
    db.resetWarning(groupId, userId);
    return true;
}

module.exports = {
    handleAntiBadwordCommand,
    handleBadwordDetection,
    setAntiBadword,
    getAntiBadword,
    removeAntiBadword,
    incrementWarningCount,
    resetWarningCount
};
