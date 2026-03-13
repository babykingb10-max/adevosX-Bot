const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const db = require('../../Database/database');
const { createFakeContact, getBotName } = require('../../davelib/fakeContact');

async function isAuthorized(message) {
    try {
        const senderId = message.key.participant || message.key.remoteJid;
        if (message.key.fromMe) return true;
        return db.isSudo(senderId);
    } catch {
        return message.key.fromMe;
    }
}

function getContextInfo(message) {
    return (
        message.message?.extendedTextMessage?.contextInfo ||
        message.message?.imageMessage?.contextInfo ||
        message.message?.videoMessage?.contextInfo ||
        message.message?.stickerMessage?.contextInfo ||
        message.message?.documentMessage?.contextInfo ||
        message.message?.audioMessage?.contextInfo
    );
}

async function downloadToBuffer(msgObj, type) {
    const stream = await downloadContentFromMessage(msgObj, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

function getBotJid(sock) {
    const raw = sock.user?.id || sock.authState?.creds?.me?.id || '';
    return raw.replace(/:\d+@/, '@');
}

function buildStatusOpts(sock, getAllContacts) {
    const myJid = getBotJid(sock);
    const extra = typeof getAllContacts === 'function' ? getAllContacts() : [];
    const list = [...new Set([myJid, ...extra].filter(j => j && j.endsWith('@s.whatsapp.net')))];
    return list.length > 0 ? { statusJidList: list } : {};
}

async function tostatusCommand(sock, chatId, message, fullArgs, getAllContacts) {
    const senderId = message.key.participant || message.key.remoteJid;
    const fake = createFakeContact(senderId);
    const botName = getBotName();

    if (!await isAuthorized(message)) {
        return sock.sendMessage(chatId, {
            text: `*${botName}*\nOwner only command!`
        }, { quoted: fake });
    }

    const contextInfo = getContextInfo(message);
    const quotedMessage = contextInfo?.quotedMessage;
    const textArgs = (fullArgs || '').trim();

    if (!quotedMessage && !textArgs) {
        return sock.sendMessage(chatId, {
            text: `*${botName} TOSTATUS*\n\n` +
                  `Post content to your personal WhatsApp status\n\n` +
                  `*Usage:*\n` +
                  `• .tostatus <text> — Post text status\n` +
                  `• Reply to image with .tostatus <caption>\n` +
                  `• Reply to video with .tostatus <caption>\n` +
                  `• Reply to audio with .tostatus\n` +
                  `• Reply to sticker with .tostatus\n\n` +
                  `Supported: Text, Image, Video, Audio, Sticker`
        }, { quoted: fake });
    }

    const STATUS_JID = 'status@broadcast';
    const statusOpts = buildStatusOpts(sock, getAllContacts);

    try {
        if (quotedMessage) {
            const msgType = Object.keys(quotedMessage)[0];

            if (msgType === 'imageMessage') {
                const buffer = await downloadToBuffer(quotedMessage.imageMessage, 'image');
                await sock.sendMessage(STATUS_JID, {
                    image: buffer,
                    caption: textArgs || quotedMessage.imageMessage?.caption || '',
                }, statusOpts);
                return sock.sendMessage(chatId, {
                    text: `*${botName}*\n✅ Image posted to status!`
                }, { quoted: fake });

            } else if (msgType === 'videoMessage') {
                const buffer = await downloadToBuffer(quotedMessage.videoMessage, 'video');
                await sock.sendMessage(STATUS_JID, {
                    video: buffer,
                    caption: textArgs || quotedMessage.videoMessage?.caption || '',
                    gifPlayback: quotedMessage.videoMessage?.gifPlayback || false,
                }, statusOpts);
                return sock.sendMessage(chatId, {
                    text: `*${botName}*\n✅ Video posted to status!`
                }, { quoted: fake });

            } else if (msgType === 'audioMessage') {
                const buffer = await downloadToBuffer(quotedMessage.audioMessage, 'audio');
                await sock.sendMessage(STATUS_JID, {
                    audio: buffer,
                    mimetype: quotedMessage.audioMessage?.mimetype || 'audio/mp4',
                    ptt: false,
                }, statusOpts);
                return sock.sendMessage(chatId, {
                    text: `*${botName}*\n✅ Audio posted to status!`
                }, { quoted: fake });

            } else if (msgType === 'stickerMessage') {
                const buffer = await downloadToBuffer(quotedMessage.stickerMessage, 'sticker');
                await sock.sendMessage(STATUS_JID, {
                    image: buffer,
                    caption: textArgs || '',
                }, statusOpts);
                return sock.sendMessage(chatId, {
                    text: `*${botName}*\n✅ Sticker posted to status as image!`
                }, { quoted: fake });

            } else if (msgType === 'conversation' || msgType === 'extendedTextMessage') {
                const statusText = quotedMessage.conversation || quotedMessage.extendedTextMessage?.text || '';
                await sock.sendMessage(STATUS_JID, {
                    text: statusText,
                    backgroundColor: '#315575',
                    font: 2,
                }, statusOpts);
                return sock.sendMessage(chatId, {
                    text: `*${botName}*\n✅ Text posted to status!`
                }, { quoted: fake });

            } else {
                return sock.sendMessage(chatId, {
                    text: `*${botName}*\nUnsupported type: ${msgType}\nSupported: image, video, audio, sticker, text`
                }, { quoted: fake });
            }

        } else if (textArgs) {
            await sock.sendMessage(STATUS_JID, {
                text: textArgs,
                backgroundColor: '#315575',
                font: 2,
            }, statusOpts);
            return sock.sendMessage(chatId, {
                text: `*${botName}*\n✅ Text posted to status!`
            }, { quoted: fake });
        }

    } catch (error) {
        console.error('[ToStatus] Error:', error.message, 'Stack:', error.stack?.split('\n')[1]);
        await sock.sendMessage(chatId, {
            text: `*${botName}*\n❌ Failed: ${error.message}`
        }, { quoted: fake });
    }
}

module.exports = { tostatusCommand };
