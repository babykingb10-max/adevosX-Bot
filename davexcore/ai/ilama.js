const axios = require('axios');
const { createFakeContact, getBotName } = require('../../davelib/fakeContact');

async function ilamaCommand(sock, chatId, message, args) {
    const fake = createFakeContact(message);
    const query = args.join(' ').trim();

    if (!query) {
        return sock.sendMessage(chatId, {
            text: `🔥 *Llama AI*\n\nUsage: *llama* <question>\nExample: *llama* write a poem about rain`
        }, { quoted: fake });
    }

    await sock.sendMessage(chatId, { react: { text: '🔥', key: message.key } });

    try {
        const { data } = await axios.get(
            `https://apiskeith.vercel.app/ai/llama?q=${encodeURIComponent(query)}`,
            { timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        const reply = data?.result || data?.data || data?.response;
        if (!reply) throw new Error('Empty response');
        await sock.sendMessage(chatId, { text: `🔥 *Llama*\n\n${reply}` }, { quoted: fake });
    } catch {
        try {
            const { data } = await axios.get(
                `https://api.siputzx.my.id/api/ai/llama?prompt=${encodeURIComponent(query)}`,
                { timeout: 25000, headers: { 'User-Agent': 'Mozilla/5.0' } }
            );
            const reply = data?.data || data?.result || data?.response;
            if (!reply) throw new Error('Empty response');
            await sock.sendMessage(chatId, { text: `🔥 *Llama*\n\n${reply}` }, { quoted: fake });
        } catch (err) {
            await sock.sendMessage(chatId, { text: `❌ Llama unavailable. Try *ai* instead.` }, { quoted: fake });
        }
    }
}

module.exports = ilamaCommand;
