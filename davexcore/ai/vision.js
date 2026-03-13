const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { createFakeContact, getBotName } = require('../../davelib/fakeContact');

// =======================
// Upload Helpers
// =======================

// Upload to Catbox (primary)
async function uploadToCatbox(filePath) {
    const form = new FormData();
    form.append("reqtype", "fileupload");
    form.append("fileToUpload", fs.createReadStream(filePath));

    const res = await axios.post("https://catbox.moe/user/api.php", form, {
        headers: form.getHeaders(),
        timeout: 30000
    });

    return res.data; // permanent URL
}

// Upload to Ugu.se (fallback)
async function uploadToUgu(filePath) {
    const form = new FormData();
    form.append("files[]", fs.createReadStream(filePath), {
        filename: path.basename(filePath)
    });

    const res = await axios.post("https://uguu.se/upload.php", form, {
        headers: {
            ...form.getHeaders(),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 30000
    });

    if (res.data && res.data.success && res.data.files && res.data.files[0]) {
        return res.data.files[0].url;
    }
    throw new Error('Ugu upload failed');
}

// Main upload function with fallback
async function uploadImage(filePath) {
    try {
        console.log('[Upload] Trying Catbox...');
        const catboxUrl = await uploadToCatbox(filePath);
        console.log('[Upload] Catbox success:', catboxUrl);
        return catboxUrl;
    } catch (catboxError) {
        console.log('[Upload] Catbox failed, trying Ugu...:', catboxError.message);
        
        try {
            const uguUrl = await uploadToUgu(filePath);
            console.log('[Upload] Ugu success:', uguUrl);
            return uguUrl;
        } catch (uguError) {
            console.log('[Upload] Both uploaders failed');
            throw new Error(`Upload failed: Catbox - ${catboxError.message}, Ugu - ${uguError.message}`);
        }
    }
}

// =======================
// Media Extraction
// =======================

// Extract buffer + extension from different media types
async function extractMedia(message) {
    const m = message.message || {};

    const handlers = {
        imageMessage: { type: 'image', ext: '.jpg' },
        videoMessage: { type: 'video', ext: '.mp4' },
        audioMessage: { type: 'audio', ext: '.mp3' },
        documentMessage: { type: 'document', ext: null },
        stickerMessage: { type: 'sticker', ext: '.webp' }
    };

    for (const key in handlers) {
        if (m[key]) {
            const { type, ext } = handlers[key];
            const stream = await downloadContentFromMessage(m[key], type);
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);

            if (key === 'documentMessage') {
                const fileName = m.documentMessage.fileName || 'file.bin';
                return { buffer: Buffer.concat(chunks), ext: path.extname(fileName) || '.bin' };
            }

            return { buffer: Buffer.concat(chunks), ext };
        }
    }

    return null;
}

// Extract quoted media (reply case)
async function extractQuotedMedia(message) {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) return null;
    return extractMedia({ message: quoted });
}

// =======================
// Vision Command
// =======================
async function visionCommand(sock, chatId, message) {
    const fake = createFakeContact(message);
    const botName = getBotName();
    
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
        
        // React to message
        await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

        // Validate input
        if (!text) {
            return sock.sendMessage(
                chatId,
                { text: `✦ *${botName}* Vision\n\nReply to an image with instructions` },
                { quoted: fake }
            );
        }

        // Extract quoted media (only image allowed)
        const quotedMedia = await extractQuotedMedia(message);
        
        if (!quotedMedia) {
            return sock.sendMessage(
                chatId,
                { text: `✦ *${botName}*\nReply to an image` },
                { quoted: fake }
            );
        }

        // Check if it's an image (allow .jpg, .png, .jpeg, .webp)
        const validImageExts = ['.jpg', '.jpeg', '.png', '.webp'];
        if (!validImageExts.includes(quotedMedia.ext.toLowerCase())) {
            return sock.sendMessage(
                chatId,
                { text: `✦ *${botName}*\nThat's not an image` },
                { quoted: fake }
            );
        }

        // Temp file handling
        const tempDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const tempPath = path.join(tempDir, `vision_${Date.now()}${quotedMedia.ext}`);
        fs.writeFileSync(tempPath, quotedMedia.buffer);

        let imageUrl;
        try {
            // Upload image (with fallback)
            imageUrl = await uploadImage(tempPath);
            
            // Notify user that analysis is in progress
            await sock.sendMessage(
                chatId,
                { text: `✦ *${botName}* - am know invisible 🔥\n\nAnalyzing image...` },
                { quoted: fake }
            );
            
            // Call the Gemini Vision API
            const apiUrl = `https://apiskeith.top/ai/gemini-vision?image=${encodeURIComponent(imageUrl)}&q=${encodeURIComponent(text)}`;
            const response = await axios.get(apiUrl, { timeout: 60000 });
            const data = response.data;

            const result = data.result || data.BK9 || data.answer || data.text || data.response;
            if (!result) {
                throw new Error('API returned an empty response');
            }

            // Send success reaction
            await sock.sendMessage(chatId, {
                react: { text: '✅', key: message.key }
            });

            // Send the analysis result
            await sock.sendMessage(
                chatId,
                { text: `✦ *${botName}*\n\n${result}` },
                { quoted: fake }
            );
            
        } catch (apiError) {
            console.error('[Vision] API error:', apiError?.message || apiError);
            
            let errorMsg = `✦ Failed to analyze image`;
            
            if (apiError.code === 'ECONNABORTED' || apiError.message.includes('timeout')) {
                errorMsg += ' (timeout)';
            } else if (apiError.message.includes('Upload failed')) {
                errorMsg += ' (upload failed)';
            } else {
                errorMsg += `: ${apiError.message}`;
            }
            
            await sock.sendMessage(
                chatId,
                { text: errorMsg },
                { quoted: fake }
            );
            
            await sock.sendMessage(chatId, {
                react: { text: '❌', key: message.key }
            });
        } finally {
            // Cleanup temp file
            setTimeout(() => {
                if (fs.existsSync(tempPath)) {
                    try {
                        fs.unlinkSync(tempPath);
                        console.log('[Cleanup] Temp file removed:', tempPath);
                    } catch (cleanupError) {
                        console.error('[Cleanup] Failed to remove temp file:', cleanupError.message);
                    }
                }
            }, 2000);
        }

    } catch (error) {
        console.error('[Vision] error:', error?.message || error);
        await sock.sendMessage(
            chatId,
            { text: `✦ *${botName}*\nError: ${error.message}` },
            { quoted: fake }
        );
        
        await sock.sendMessage(chatId, {
            react: { text: '❌', key: message.key }
        });
    }
}

module.exports = visionCommand;