const axios = require('axios');
const { createFakeContact, getBotName } = require('../../davelib/fakeContact');

async function wormgptCommand(sock, chatId, message, args) {
    const fake = createFakeContact(message);
    const query = args.join(' ').trim();

    if (!query) {
        return sock.sendMessage(chatId, {
            text: `🕷️ *WormGPT*\n\nUsage: *wormgpt* <query>\nExample: *wormgpt* write a scary story`
        }, { quoted: fake });
    }

    await sock.sendMessage(chatId, { react: { text: '🕷️', key: message.key } });

    try {
        const { data } = await axios.get(
            `https://apiskeith.top/ai/wormgpt?q=${encodeURIComponent(query)}`,
            { timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0', accept: 'application/json' } }
        );
        const reply = data?.result || data?.data || data?.response;
        if (!reply) throw new Error('Empty response');
        await sock.sendMessage(chatId, { text: `🕷️ *WormGPT*\n\n${reply}` }, { quoted: fake });
    } catch {
        try {
            const { data } = await axios.get(
                `https://apiskeith.vercel.app/ai/wormgpt?q=${encodeURIComponent(query)}`,
                { timeout: 25000, headers: { 'User-Agent': 'Mozilla/5.0' } }
            );
            const reply = data?.result || data?.data || data?.response;
            if (!reply) throw new Error('Empty response');
            await sock.sendMessage(chatId, { text: `🕷️ *WormGPT*\n\n${reply}` }, { quoted: fake });
        } catch (err) {
            await sock.sendMessage(chatId, { text: `❌ WormGPT unavailable. Try *ai* instead.` }, { quoted: fake });
        }
    }
}

module.exports = wormgptCommand;
