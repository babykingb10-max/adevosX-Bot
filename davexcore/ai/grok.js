const axios = require('axios');
const { createFakeContact, getBotName } = require('../../davelib/fakeContact');

async function grokCommand(sock, chatId, message, args) {
    const fake = createFakeContact(message);
    const query = args.join(' ').trim();

    if (!query) {
        return sock.sendMessage(chatId, {
            text: `✦ *Grok AI* (by xAI)\n\nUsage: *grok* <question>\nExample: *grok* what is the meaning of life`
        }, { quoted: fake });
    }

    await sock.sendMessage(chatId, { react: { text: '🔮', key: message.key } });

    try {
        const { data } = await axios.get(
            `https://apiskeith.vercel.app/ai/grok?q=${encodeURIComponent(query)}`,
            { timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        const reply = data?.result || data?.data || data?.response || (data?.status && data?.message);
        if (!reply) throw new Error('Empty response');
        await sock.sendMessage(chatId, { text: `🔮 *Grok*\n\n${reply}` }, { quoted: fake });
    } catch {
        try {
            const { data } = await axios.get(
                `https://api.siputzx.my.id/api/ai/groq?prompt=${encodeURIComponent(query)}`,
                { timeout: 25000, headers: { 'User-Agent': 'Mozilla/5.0' } }
            );
            const reply = data?.data || data?.result || data?.response;
            if (!reply) throw new Error('Empty response');
            await sock.sendMessage(chatId, { text: `🔮 *Grok*\n\n${reply}` }, { quoted: fake });
        } catch (err) {
            await sock.sendMessage(chatId, { text: `❌ Grok unavailable at the moment. Try *ai* instead.` }, { quoted: fake });
        }
    }
}

module.exports = grokCommand;
