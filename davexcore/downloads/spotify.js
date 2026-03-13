const axios = require('axios');
const { createFakeContact, getBotName } = require('../../davelib/fakeContact');

const AXIOS_DEFAULTS = {
    timeout: 60000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/1.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    }
};

async function tryRequest(getter, attempts = 3) {
    let lastError;
    for (let i = 1; i <= attempts; i++) {
        try {
            return await getter();
        } catch (err) {
            lastError = err;
            if (i < attempts) {
                await new Promise(r => setTimeout(r, i * 1000));
            }
        }
    }
    throw lastError;
}

async function spotifyCommand(sock, chatId, message) {
    const fake = createFakeContact(message);
    const botName = getBotName();
    
    try {
        const rawText = message.message?.conversation?.trim() ||
            message.message?.extendedTextMessage?.text?.trim() ||
            message.message?.imageMessage?.caption?.trim() ||
            message.message?.videoMessage?.caption?.trim() ||
            '';

        const used = (rawText || '').split(/\s+/)[0] || '.spotify';
        const query = rawText.slice(used.length).trim();

        if (!query) {
            await sock.sendMessage(chatId, { 
                text: `✦ *${botName}* Spotify\n\nUse: .spotify <song name>\nExample: .spotify Blinding Lights` 
            }, { quoted: fake });
            return;
        }

        await sock.sendMessage(chatId, {
            react: { text: '🔍', key: message.key }
        });

        const apiUrl = `https://apiskeith.top/download/spotify?q=${encodeURIComponent(query)}`;
        let result = null;
        let downloadUrl = null;

        try {
            const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
            if (res?.data?.status && res?.data?.result?.track) {
                const track = res.data.result.track;
                downloadUrl = track.downloadLink;
                result = {
                    title: track.title || track.name,
                    artist: track.artist,
                    cover: track.thumbnail,
                    duration: track.duration,
                    popularity: track.popularity
                };
            }
        } catch (err) {
            console.log('Spotify API failed:', err.message);
        }

        if (!downloadUrl || !result) {
            throw new Error('No results found');
        }

        await sock.sendMessage(chatId, {
            react: { text: '⬇️', key: message.key }
        });

        let caption = `✦ *${botName}* Spotify\n\n`;
        caption += `Title: ${result.title || 'Unknown'}\n`;
        caption += `Artist: ${result.artist || 'Unknown'}\n`;
        if (result.duration) caption += `Duration: ${result.duration}\n`;
        if (result.popularity) caption += `Popularity: ${result.popularity}\n`;

        if (result.cover) {
            await sock.sendMessage(chatId, { 
                image: { url: result.cover }, 
                caption 
            }, { quoted: fake });
        } else {
            await sock.sendMessage(chatId, { 
                text: caption 
            }, { quoted: fake });
        }

        const safeTitle = (result.title || 'spotify').replace(/[\\/:*?"<>|]/g, '');
        await sock.sendMessage(chatId, {
            audio: { url: downloadUrl },
            mimetype: 'audio/mpeg',
            fileName: `${safeTitle}.mp3`
        }, { quoted: fake });

        await sock.sendMessage(chatId, {
            react: { text: '✅', key: message.key }
        });

    } catch (error) {
        console.error('Spotify error:', error.message);

        let errorMsg = '✦ Failed to download.';
        if (error.message.includes('No results')) {
            errorMsg = '✦ No results found.';
        } else if (error.message.includes('timeout')) {
            errorMsg = '✦ Request timeout.';
        }

        await sock.sendMessage(chatId, { 
            text: errorMsg
        }, { quoted: fake });
        
        await sock.sendMessage(chatId, {
            react: { text: '❌', key: message.key }
        });
    }
}

module.exports = spotifyCommand;
