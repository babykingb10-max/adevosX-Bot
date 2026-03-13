const axios = require('axios');
const { createFakeContact, getBotName } = require('../../davelib/fakeContact');
const { storeTiktokPending, getTiktokPending, clearTiktokPending } = require('../../davelib/tiktokPending');
const { sendInteractiveMessage } = require('gifted-btns');

const processedMessages = new Set();

const TIKTOK_APIS = [
    {
        name: 'iamtkm',
        url: u => `https://iamtkm.vercel.app/downloaders/tiktokdl?apikey=tkm&url=${encodeURIComponent(u)}`,
        parse: d => ({
            video: d?.result?.no_watermark || d?.result?.watermark,
            audio: d?.result?.audio,
            title: d?.result?.title || 'TikTok'
        }),
        check: d => d?.status && d?.result
    },
    {
        name: 'Keith',
        url: u => `https://apiskeith.top/download/tiktok?url=${encodeURIComponent(u)}`,
        parse: d => ({
            video: d?.result?.no_watermark || d?.result?.video || d?.result?.url,
            audio: d?.result?.audio,
            title: d?.result?.title || 'TikTok'
        }),
        check: d => d?.status && d?.result
    },
    {
        name: 'BK9',
        url: u => `https://bk9.fun/download/tiktok?url=${encodeURIComponent(u)}`,
        parse: d => ({
            video: d?.BK9?.no_watermark || d?.BK9?.video || d?.BK9?.url || d?.BK9,
            audio: d?.BK9?.audio,
            title: d?.BK9?.title || 'TikTok'
        }),
        check: d => d?.BK9
    },
    {
        name: 'Dreaded',
        url: u => `https://api.dreaded.site/api/tiktok?url=${encodeURIComponent(u)}`,
        parse: d => ({
            video: d?.result?.no_watermark || d?.result?.video,
            audio: d?.result?.audio,
            title: d?.result?.title || 'TikTok'
        }),
        check: d => d?.result
    },
    {
        name: 'Siputzx',
        url: u => `https://api.siputzx.my.id/api/d/tiktok?url=${encodeURIComponent(u)}`,
        parse: d => ({
            video: d?.data?.no_watermark || d?.data?.video,
            audio: d?.data?.audio,
            title: d?.data?.title || 'TikTok'
        }),
        check: d => d?.data
    }
];

async function tryApis(tiktokUrl, needVideo, needAudio) {
    let videoUrl = null, audioUrl = null, title = 'TikTok';

    for (const api of TIKTOK_APIS) {
        if ((!needVideo || videoUrl) && (!needAudio || audioUrl)) break;
        try {
            const res = await axios.get(api.url(tiktokUrl), { timeout: 15000 });
            if (!api.check(res.data)) continue;
            const parsed = api.parse(res.data);
            if (needVideo && !videoUrl && parsed.video && typeof parsed.video === 'string' && parsed.video.startsWith('http')) {
                videoUrl = parsed.video;
                title = parsed.title || title;
            }
            if (needAudio && !audioUrl && parsed.audio && typeof parsed.audio === 'string' && parsed.audio.startsWith('http')) {
                audioUrl = parsed.audio;
                title = parsed.title || title;
            }
        } catch {}
    }
    return { videoUrl, audioUrl, title };
}

async function downloadAndValidate(downloadUrl, timeout = 60000) {
    const response = await axios({
        url: downloadUrl,
        method: 'GET',
        responseType: 'arraybuffer',
        timeout,
        maxRedirects: 5,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        validateStatus: s => s >= 200 && s < 400
    });
    const buffer = Buffer.from(response.data);
    if (buffer.length < 5000) throw new Error('File too small');
    const headerStr = buffer.slice(0, 50).toString('utf8').toLowerCase();
    if (headerStr.includes('<!doctype') || headerStr.includes('<html') || headerStr.includes('bad gateway')) {
        throw new Error('Received HTML instead of media');
    }
    return buffer;
}

async function tiktokCommand(sock, chatId, message) {
    const senderId = message.key.participant || message.key.remoteJid;
    const fake = createFakeContact(senderId);
    const botName = getBotName();

    try {
        if (processedMessages.has(message.key.id)) return;
        processedMessages.add(message.key.id);
        setTimeout(() => processedMessages.delete(message.key.id), 5 * 60 * 1000);

        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const url = text.split(' ').slice(1).join(' ').trim();

        if (!url) {
            return sock.sendMessage(chatId, {
                text: `┌─ *${botName} TikTok* ─┐\n│\n│ Usage: .tiktok <url>\n│ Example: .tiktok https://vm.tiktok.com/abc\n│\n└─────────────────────┘`
            }, { quoted: fake });
        }

        const tiktokPatterns = [/tiktok\.com\//, /vm\.tiktok\.com\//, /vt\.tiktok\.com\//];
        if (!tiktokPatterns.some(p => p.test(url))) {
            return sock.sendMessage(chatId, { text: `*${botName}*\nInvalid TikTok link` }, { quoted: fake });
        }

        await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

        const { videoUrl, audioUrl, title } = await tryApis(url, true, true);

        if (!videoUrl) {
            return sock.sendMessage(chatId, {
                text: `*${botName}*\nFailed to fetch TikTok. Try again.`
            }, { quoted: fake });
        }

        storeTiktokPending(chatId, { videoUrl, audioUrl, title, originalUrl: url });

        const infoCard = `┌─ *${botName} TikTok* ─┐\n│\n│ *${title}*\n│\n│ Choose format:\n│\n└─────────────────────┘`;

        const rows = [
            { id: 'tiktok_video', title: '📹 Video', description: 'Download as MP4 video' },
            { id: 'tiktok_audio', title: '🎵 Audio', description: audioUrl ? 'Download as audio' : 'Download audio (fetched separately)' }
        ];

        try {
            await sendInteractiveMessage(sock, chatId, {
                text: infoCard,
                footer: botName,
                interactiveButtons: [{
                    name: 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title: 'Select Format',
                        sections: [{ title: 'Format Options', rows }]
                    })
                }]
            });
        } catch {
            await sock.sendMessage(chatId, {
                text: `${infoCard}\n\nReply: *video* or *audio*`
            }, { quoted: fake });
        }

    } catch (error) {
        console.error('[TIKTOK]', error.message);
        await sock.sendMessage(chatId, { text: `*${botName}*\nFailed to process TikTok.` }, { quoted: fake });
    }
}

async function processTiktokDownload(sock, chatId, message, format) {
    const senderId = message.key.participant || message.key.remoteJid;
    const fake = createFakeContact(senderId);
    const botName = getBotName();

    const pending = getTiktokPending(chatId);
    if (!pending) {
        return sock.sendMessage(chatId, {
            text: `*${botName}*\nNo pending TikTok. Use .tiktok <url> first.`
        }, { quoted: fake });
    }
    await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

    try {
        if (format === 'video') {
            let sent = false;
            try {
                await sock.sendMessage(chatId, {
                    video: { url: pending.videoUrl },
                    mimetype: 'video/mp4',
                    caption: `✦ *${botName}* - ${pending.title}`
                }, { quoted: fake });
                sent = true;
            } catch {
                const buf = await downloadAndValidate(pending.videoUrl);
                await sock.sendMessage(chatId, {
                    video: buf,
                    mimetype: 'video/mp4',
                    caption: `✦ *${botName}* - ${pending.title}`
                }, { quoted: fake });
                sent = true;
            }
            if (sent) await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

        } else {
            let audioUrl = pending.audioUrl;

            if (!audioUrl && pending.originalUrl) {
                const result = await tryApis(pending.originalUrl, false, true);
                audioUrl = result.audioUrl;
            }

            if (!audioUrl) throw new Error('No audio available for this TikTok');

            let audioSent = false;
            try {
                await sock.sendMessage(chatId, {
                    audio: { url: audioUrl },
                    mimetype: 'audio/mpeg',
                    ptt: false
                }, { quoted: fake });
                audioSent = true;
            } catch {
                const buf = await downloadAndValidate(audioUrl, 40000);
                await sock.sendMessage(chatId, {
                    audio: buf,
                    mimetype: 'audio/mpeg',
                    ptt: false
                }, { quoted: fake });
                audioSent = true;
            }
            if (audioSent) await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        }
    } catch (err) {
        console.error('[TIKTOK DOWNLOAD]', err.message);
        await sock.sendMessage(chatId, {
            text: `*${botName}*\nDownload failed: ${err.message}`
        }, { quoted: fake });
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
    }
}

module.exports = { tiktokCommand, processTiktokDownload };
