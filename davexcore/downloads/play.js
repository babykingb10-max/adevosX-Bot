const yts = require('yt-search');
const { createFakeContact, getBotName } = require('../../davelib/fakeContact');
const { storePending } = require('../../davelib/songPending');
const { processSongDownload } = require('./song');
const { sendInteractiveMessage } = require('gifted-btns');

async function playCommand(sock, chatId, message) {
    const senderId = message.key.participant || message.key.remoteJid;
    const fake = createFakeContact(senderId);
    const botName = getBotName();

    try {
        const text = message.message?.conversation ||
            message.message?.extendedTextMessage?.text || '';
        const query = text.split(' ').slice(1).join(' ').trim();

        if (!query) {
            return sock.sendMessage(chatId, {
                text: `┌─ *${botName} Play* ─┐\n│\n│ Usage: .play <song name>\n│ Example: .play Never Gonna Give You Up\n│\n└─────────────────────┘`
            }, { quoted: fake });
        }

        if (query.length > 100) {
            return sock.sendMessage(chatId, {
                text: `*${botName}*\nQuery too long! Max 100 characters.`
            }, { quoted: fake });
        }

        await sock.sendMessage(chatId, { react: { text: '🔍', key: message.key } });

        let video = (await yts(`${query} official audio`)).videos[0];
        if (!video) video = (await yts(query)).videos[0];

        if (!video) {
            return sock.sendMessage(chatId, {
                text: `*${botName}*\nCould not find that song. Try a different name.`
            }, { quoted: fake });
        }

        storePending(chatId, {
            videoUrl: video.url,
            title: video.title
        });

        const duration = video.duration?.timestamp || '?';
        const views = video.views ? `${(video.views / 1000000).toFixed(1)}M views` : '';

        const infoCard = `┌─ *${botName} Play* ─┐\n│\n│ *${video.title}*\n│ Duration: ${duration}${views ? `\n│ ${views}` : ''}\n│\n│ Choose a format:\n│\n└─────────────────────┘`;

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
                                { id: 'song_audio', title: 'Audio', description: 'Send as audio player' },
                                { id: 'song_doc', title: 'Document', description: 'Send as downloadable MP3' },
                                { id: 'song_voice', title: 'Voice Note', description: 'Send as voice message' }
                            ]
                        }]
                    })
                }]
            });
        } catch {
            await sock.sendMessage(chatId, { text: `${infoCard}\n\nReply: *audio*, *doc*, or *voice*` }, { quoted: fake });
        }

    } catch (error) {
        console.error('[PLAY COMMAND]', error.message);
        await sock.sendMessage(chatId, {
            text: `*${botName}*\nError: ${error.message}`
        }, { quoted: fake });
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
    }
}

module.exports = playCommand;
