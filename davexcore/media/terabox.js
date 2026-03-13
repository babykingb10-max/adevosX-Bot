const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createFakeContact, getBotName } = require('../../davelib/fakeContact');

async function teraboxCommand(sock, chatId, message, args) {
    const fake = createFakeContact(message);
    const botName = getBotName();
    const url = args.join(' ').trim();

    if (!url) {
        return sock.sendMessage(chatId, {
            text: `📦 *TeraBox Downloader*\n\nUsage: *terabox* <link>\nExample: *terabox* https://1024terabox.com/s/xxxxx`
        }, { quoted: fake });
    }

    const isValid = url.includes('terabox.com') || url.includes('1024terabox.com') ||
                    url.includes('teraboxapp.com') || url.includes('terabox.app');

    if (!isValid) {
        return sock.sendMessage(chatId, {
            text: `❌ Please provide a valid TeraBox URL!`
        }, { quoted: fake });
    }

    await sock.sendMessage(chatId, { react: { text: '📦', key: message.key } });

    try {
        const apiUrl = `https://api.qasimdev.dpdns.org/api/terabox/download?apiKey=qasim-dev&url=${encodeURIComponent(url)}`;
        const { data } = await axios.get(apiUrl, { timeout: 60000, headers: { 'User-Agent': 'Mozilla/5.0' } });

        if (!data?.success || !data?.data?.files?.length) {
            return sock.sendMessage(chatId, { text: `❌ No files found or invalid link.` }, { quoted: fake });
        }

        const fileData = data.data;
        const file = fileData.files[0];
        const { title, size, downloadUrl, type } = file;

        const tempDir = path.join(os.tmpdir(), 'davex-temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const sanitized = title.replace(/[^a-z0-9.]/gi, '_').substring(0, 80);
        const filePath = path.join(tempDir, `${Date.now()}_${sanitized}`);

        const resp = await axios({
            method: 'GET', url: downloadUrl, responseType: 'arraybuffer',
            timeout: 600000, headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://1024terabox.com/' }
        });

        fs.writeFileSync(filePath, resp.data);
        const stats = fs.statSync(filePath);
        if (stats.size / (1024 * 1024) > 100) {
            fs.unlinkSync(filePath);
            return sock.sendMessage(chatId, { text: `❌ File too large (>100MB). WhatsApp limit exceeded.` }, { quoted: fake });
        }

        const buffer = fs.readFileSync(filePath);
        const ext = title.split('.').pop().toLowerCase();
        const caption = `✅ *${title}*\n📊 ${size}`;

        if (['mp4', 'mkv', 'avi', 'mov', 'webm', '3gp'].includes(ext)) {
            await sock.sendMessage(chatId, { video: buffer, caption, fileName: title }, { quoted: fake });
        } else if (['mp3', 'wav', 'aac', 'flac', 'm4a', 'ogg', 'opus'].includes(ext)) {
            await sock.sendMessage(chatId, { audio: buffer, mimetype: 'audio/mpeg', fileName: title }, { quoted: fake });
        } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
            await sock.sendMessage(chatId, { image: buffer, caption }, { quoted: fake });
        } else {
            await sock.sendMessage(chatId, { document: buffer, mimetype: 'application/octet-stream', fileName: title, caption }, { quoted: fake });
        }

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    } catch (err) {
        console.error('TeraBox error:', err.message);
        await sock.sendMessage(chatId, { text: `❌ Failed: ${err.message}` }, { quoted: fake });
    }
}

module.exports = teraboxCommand;
