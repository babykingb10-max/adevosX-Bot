const { createFakeContact, getBotName } = require('../../davelib/fakeContact');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

async function tomp4Command(sock, chatId, message) {
    const fakeContact = createFakeContact(message);
    const botName = getBotName();

    const contextInfo = message.message?.extendedTextMessage?.contextInfo;
    const quotedMsg = contextInfo?.quotedMessage;

    if (!quotedMsg) {
        return sock.sendMessage(chatId, {
            text: `*${botName}*\nReply to a sticker, animated GIF or WebP with .tovideo`
        }, { quoted: fakeContact });
    }

    const isStickerOrGif = quotedMsg.stickerMessage
        || (quotedMsg.videoMessage?.gifPlayback)
        || (quotedMsg.imageMessage?.mimetype?.includes('webp'));

    if (!isStickerOrGif) {
        return sock.sendMessage(chatId, {
            text: `*${botName}*\nReply to an animated sticker or GIF only.`
        }, { quoted: fakeContact });
    }

    await sock.sendMessage(chatId, { react: { text: '🔄', key: message.key } });

    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const uid = Date.now();
    const tempInput = path.join(tmpDir, `v2mp4_in_${uid}.webp`);
    const tempOutput = path.join(tmpDir, `v2mp4_out_${uid}.mp4`);

    try {
        const targetMessage = {
            key: {
                remoteJid: chatId,
                id: contextInfo.stanzaId,
                participant: contextInfo.participant,
                fromMe: false
            },
            message: quotedMsg
        };

        const buffer = await downloadMediaMessage(
            targetMessage,
            'buffer',
            {},
            { logger: undefined, reuploadRequest: sock.updateMediaMessage }
        );

        if (!buffer || buffer.length === 0) throw new Error('Media download failed');

        fs.writeFileSync(tempInput, buffer);

        // Convert webp/gif sticker → mp4
        const ffmpegCmd = `ffmpeg -y -i "${tempInput}" -movflags +faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=15" -c:v libx264 -preset fast -crf 28 "${tempOutput}"`;

        await new Promise((resolve, reject) => {
            exec(ffmpegCmd, { timeout: 60000 }, (error, stdout, stderr) => {
                if (error) reject(new Error(stderr?.slice(-300) || error.message));
                else resolve();
            });
        });

        if (!fs.existsSync(tempOutput)) throw new Error('Conversion produced no output');

        const videoBuffer = fs.readFileSync(tempOutput);

        await sock.sendMessage(chatId, {
            video: videoBuffer,
            gifPlayback: false,
            caption: `*${botName}*`
        }, { quoted: fakeContact });

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

    } catch (err) {
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, {
            text: `*${botName}*\nConversion failed: ${err.message?.slice(0, 150) || 'Unknown error'}`
        }, { quoted: fakeContact });
    } finally {
        try { fs.unlinkSync(tempInput); } catch (_) {}
        try { fs.unlinkSync(tempOutput); } catch (_) {}
    }
}

module.exports = { tomp4Command };
