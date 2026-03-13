const axios = require('axios');
const { createFakeContact, getBotName } = require('../../davelib/fakeContact');

async function deepseekCommand(sock, chatId, message, args) {
    const fake = createFakeContact(message);
    const botName = getBotName();
    const query = args.join(' ').trim();

    if (!query) {
        return sock.sendMessage(chatId, {
            text: `✦ *DeepSeek AI*\n\nUsage: *deepseek* <question>\nExample: *deepseek* explain quantum computing`
        }, { quoted: fake });
    }

    await sock.sendMessage(chatId, { react: { text: '🤖', key: message.key } });

    try {
        const { data } = await axios.get(
            `https://api.siputzx.my.id/api/ai/deepseek-r1?prompt=${encodeURIComponent(query)}`,
            { timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        const reply = data?.data || data?.result || data?.response || data?.message;
        if (!reply) throw new Error('Empty response');
        await sock.sendMessage(chatId, { text: `✦ *DeepSeek*\n\n${reply}` }, { quoted: fake });
    } catch {
        try {
            const { data } = await axios.get(
                `https://apiskeith.vercel.app/ai/deepseek?q=${encodeURIComponent(query)}`,
                { timeout: 25000, headers: { 'User-Agent': 'Mozilla/5.0' } }
            );
            const reply = data?.result || data?.data || data?.response;
            if (!reply) throw new Error('Empty response');
            await sock.sendMessage(chatId, { text: `✦ *DeepSeek*\n\n${reply}` }, { quoted: fake });
        } catch (err) {
            await sock.sendMessage(chatId, { text: `❌ DeepSeek unavailable. Try *ai* or *gemini* instead.` }, { quoted: fake });
        }
    }
}

module.exports = deepseekCommand;
