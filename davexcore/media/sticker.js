const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const settings = require('../../daveset');
const webp = require('node-webpmux');
const crypto = require('crypto');
const { createFakeContact, getBotName } = require('../../davelib/fakeContact');

function getExtension(mediaMessage) {
    const mime = mediaMessage?.mimetype || '';
    if (mime.includes('webp')) return '.webp';
    if (mime.includes('gif')) return '.gif';
    if (mime.includes('png')) return '.png';
    if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
    if (mime.includes('mp4') || mime.includes('video')) return '.mp4';
    if (mime.includes('image')) return '.jpg';
    return '.bin';
}

async function stickerCommand(sock, chatId, message) {
    const fakeContact = createFakeContact(message);
    const pushname = message.pushName || 'Unknown User';

    let targetMessage = message;
    let mediaMessage = null;

    // Check for reply (quoted message)
    const contextInfo = message.message?.extendedTextMessage?.contextInfo
        || message.message?.imageMessage?.contextInfo
        || message.message?.videoMessage?.contextInfo;

    if (contextInfo?.quotedMessage) {
        const quotedInfo = contextInfo;
        const quotedMsg = quotedInfo.quotedMessage;
        targetMessage = {
            key: {
                remoteJid: chatId,
                id: quotedInfo.stanzaId,
                participant: quotedInfo.participant,
                fromMe: false
            },
            message: quotedMsg
        };
        mediaMessage = quotedMsg.imageMessage || quotedMsg.videoMessage || quotedMsg.stickerMessage || quotedMsg.documentMessage;
    } else {
        mediaMessage = message.message?.imageMessage || message.message?.videoMessage || message.message?.stickerMessage || message.message?.documentMessage;
    }

    if (!mediaMessage) {
        await sock.sendMessage(chatId, {
            text: `Please reply to or send an image/video/gif with *.sticker* as caption`
        }, { quoted: fakeContact });
        return;
    }

    await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

    try {
        const mediaBuffer = await downloadMediaMessage(
            targetMessage,
            'buffer',
            {},
            { logger: undefined, reuploadRequest: sock.updateMediaMessage }
        );

        if (!mediaBuffer || mediaBuffer.length === 0) {
            await sock.sendMessage(chatId, { text: 'Failed to download media. Please try again.' }, { quoted: fakeContact });
            return;
        }

        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

        const ext = getExtension(mediaMessage);
        const uid = Date.now();
        const tempInput = path.join(tmpDir, `stk_in_${uid}${ext}`);
        const tempOutput = path.join(tmpDir, `stk_out_${uid}.webp`);

        fs.writeFileSync(tempInput, mediaBuffer);

        const isAnimated = mediaMessage.mimetype?.includes('gif')
            || mediaMessage.mimetype?.includes('video')
            || (mediaMessage.seconds && mediaMessage.seconds > 0)
            || ext === '.gif'
            || ext === '.mp4';

        const ffmpegCmd = isAnimated
            ? `ffmpeg -y -i "${tempInput}" -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 75 -compression_level 6 "${tempOutput}"`
            : `ffmpeg -y -i "${tempInput}" -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libwebp -preset default -loop 1 -vsync 0 -pix_fmt yuva420p -quality 80 -compression_level 6 -frames:v 1 "${tempOutput}"`;

        await new Promise((resolve, reject) => {
            exec(ffmpegCmd, { timeout: 60000 }, (error, stdout, stderr) => {
                if (error) reject(new Error(stderr || error.message));
                else resolve();
            });
        });

        if (!fs.existsSync(tempOutput)) throw new Error('FFmpeg produced no output');

        const webpBuffer = fs.readFileSync(tempOutput);
        let finalBuffer = webpBuffer;

        try {
            const img = new webp.Image();
            await img.load(webpBuffer);
            const json = {
                'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
                'sticker-pack-name': settings.packname || pushname,
                'sticker-pack-publisher': settings.author || 'ADEVOS-X BOT',
                'emojis': ['🫩']
            };
            const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
            const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
            const exif = Buffer.concat([exifAttr, jsonBuffer]);
            exif.writeUIntLE(jsonBuffer.length, 14, 4);
            img.exif = exif;
            finalBuffer = await img.save(null);
        } catch (_) {}

        await sock.sendMessage(chatId, { sticker: finalBuffer }, { quoted: fakeContact });
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

        try { fs.unlinkSync(tempInput); } catch (_) {}
        try { fs.unlinkSync(tempOutput); } catch (_) {}

    } catch (error) {
        try { } catch (_) {}
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        await sock.sendMessage(chatId, { text: `Failed to create sticker: ${error.message?.slice(0, 120) || 'Unknown error'}` }, { quoted: fakeContact });
    }
}

module.exports = stickerCommand;
