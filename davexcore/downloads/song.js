const fs = require('fs');
const axios = require('axios');
const yts = require('yt-search');
const path = require('path');
const os = require('os');
const { createFakeContact, getBotName } = require('../../davelib/fakeContact');
const { storePending, getPending, clearPending } = require('../../davelib/songPending');
const { sendInteractiveMessage } = require('gifted-btns');

async function fetchAudioUrl(videoUrl) {
    const apis = [
        {
            url: `https://api.giftedtech.co.ke/api/download/ytmp3?apikey=gifted&url=${encodeURIComponent(videoUrl)}`,
            parse: (d) => d?.status ? { url: d.result?.download_url, title: d.result?.title } : null
        },
        {
            url: `https://apiskeith.top/download/audio?url=${encodeURIComponent(videoUrl)}`,
            parse: (d) => (d?.status && d?.result) ? { url: d.result, title: d.title } : null
        },
        {
            url: `https://api.giftedtech.co.ke/api/download/yta?apikey=gifted&url=${encodeURIComponent(videoUrl)}`,
            parse: (d) => {
                const r = d?.result || d;
                const u = r?.download_url || r?.download || r?.url || r?.downloadUrl || null;
                return u ? { url: u, title: r?.title || d?.title } : null;
            }
        }
    ];

    for (const api of apis) {
        try {
            const res = await axios.get(api.url, { timeout: 35000 });
            const result = api.parse(res.data);
            if (result?.url) return result;
        } catch {
            continue;
        }
    }
    return null;
}

async function downloadFile(downloadUrl, filePath) {
    const res = await axios({
        method: 'get',
        url: downloadUrl,
        responseType: 'stream',
        timeout: 900000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const writer = fs.createWriteStream(filePath);
    res.data.pipe(writer);

    await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', (err) => {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            reject(err);
        });
    });

    if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
        throw new Error('Download failed or file is empty');
    }
}

async function processSongDownload(sock, chatId, message, format) {
    const senderId = message.key.participant || message.key.remoteJid;
    const fake = createFakeContact(senderId);
    const botName = getBotName();

    const pending = getPending(chatId);
    if (!pending) {
        await sock.sendMessage(chatId, {
            text: `┌─ *${botName}* ─┐\n│\n│ No pending search found.\n│ Use .song or .play first.\n│\n└─────────────────────┘`
        }, { quoted: fake });
        return;
    }

    await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

    const tempDir = path.join(os.tmpdir(), 'davex-audio');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    let filePath = null;
    try {
        console.log(`[SONG DOWNLOAD] Fetching audio URL for: ${pending.videoUrl}`);
        const audioData = await fetchAudioUrl(pending.videoUrl);
        if (!audioData?.url) throw new Error('Could not fetch download link from APIs');
        console.log(`[SONG DOWNLOAD] Got download URL: ${audioData.url.substring(0, 80)}`);

        const cleanTitle = (audioData.title || pending.title)
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 80);

        filePath = path.join(tempDir, `audio_${Date.now()}.mp3`);
        console.log(`[SONG DOWNLOAD] Downloading to: ${filePath}`);
        await downloadFile(audioData.url, filePath);

        const fileSize = fs.statSync(filePath).size;
        console.log(`[SONG DOWNLOAD] Downloaded ${fileSize} bytes, sending as format=${format}`);

        const audioBuffer = fs.readFileSync(filePath);

        if (format === 'doc') {
            await sock.sendMessage(chatId, {
                document: audioBuffer,
                mimetype: 'audio/mpeg',
                fileName: `${cleanTitle}.mp3`
            }, { quoted: fake });
        } else if (format === 'voice') {
            await sock.sendMessage(chatId, {
                audio: audioBuffer,
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true
            }, { quoted: fake });
        } else {
            await sock.sendMessage(chatId, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                fileName: `${cleanTitle}.mp3`,
                ptt: false
            }, { quoted: fake });
        }

        console.log(`[SONG DOWNLOAD] Sent successfully`);
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
    } catch (error) {
        console.error('[SONG DOWNLOAD] ERROR:', error.message, error.stack?.split('\n')[1]);
        await sock.sendMessage(chatId, {
            text: `┌─ *${botName}* ─┐\n│\n│ Download failed:\n│ ${error.message}\n│\n└─────────────────────┘`
        }, { quoted: fake });
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
    } finally {
        if (filePath && fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch {}
        }
    }
}

async function songCommand(sock, chatId, message) {
    const senderId = message.key.participant || message.key.remoteJid;
    const fake = createFakeContact(senderId);
    const botName = getBotName();

    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const query = text.split(' ').slice(1).join(' ').trim();

        if (!query) {
            return sock.sendMessage(chatId, {
                text: `┌─ *${botName} Song* ─┐\n│\n│ Usage: .song <song name>\n│ Example: .song Not Like Us\n│\n└─────────────────────┘`
            }, { quoted: fake });
        }

        if (query.length > 100) {
            return sock.sendMessage(chatId, {
                text: `*${botName}*\nQuery too long! Max 100 characters.`
            }, { quoted: fake });
        }

        await sock.sendMessage(chatId, { react: { text: '🔍', key: message.key } });

        const searchResult = (await yts(query + ' official audio')).videos[0] ||
                             (await yts(query)).videos[0];

        if (!searchResult) {
            return sock.sendMessage(chatId, {
                text: `*${botName}*\nCould not find that song. Try a different name.`
            }, { quoted: fake });
        }

        storePending(chatId, {
            videoUrl: searchResult.url,
            title: searchResult.title
        });

        const duration = searchResult.duration?.timestamp || '?';
        const views = searchResult.views ? `${(searchResult.views / 1000000).toFixed(1)}M views` : '';

        const infoCard = `┌─ *${botName} Song* ─┐\n│\n│ *${searchResult.title}*\n│ Duration: ${duration}${views ? `\n│ ${views}` : ''}\n│\n│ Choose a format:\n│\n└─────────────────────┘`;

        try {
            await sendInteractiveMessage(sock, chatId, {
                text: infoCard,
                footer: botName,
                interactiveButtons: [{
                    name: 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title: 'Select Format',
                        sections: [{
                            title: 'Format Options',
                            rows: [
                                { id: 'song_audio', title: '🎵 Audio', description: 'Send as audio player' },
                                { id: 'song_doc', title: '📄 Document', description: 'Send as downloadable MP3' },
                                { id: 'song_voice', title: '🎙 Voice Note', description: 'Send as voice message' }
                            ]
                        }]
                    })
                }]
            });
        } catch {
            await sock.sendMessage(chatId, { text: `${infoCard}\n\nReply: *audio*, *doc*, or *voice*` }, { quoted: fake });
        }

    } catch (error) {
        console.error('[SONG COMMAND]', error.message);
        await sock.sendMessage(chatId, {
            text: `*${botName}*\nError: ${error.message}`
        }, { quoted: fake });
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
    }
}

module.exports = { songCommand, processSongDownload };
