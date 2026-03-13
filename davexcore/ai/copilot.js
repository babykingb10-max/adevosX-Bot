const axios = require('axios');
const { createFakeContact, getBotName } = require('../../davelib/fakeContact');

async function copilotCommand(sock, chatId, message, args) {
    const fake = createFakeContact(message);
    const query = args.join(' ').trim();

    if (!query) {
        return sock.sendMessage(chatId, {
            text: `📡 *Microsoft Copilot*\n\nUsage: *copilot* <question>\nExample: *copilot* summarize the news today`
        }, { quoted: fake });
    }

    await sock.sendMessage(chatId, { react: { text: '📡', key: message.key } });

    try {
        const { data } = await axios.get(
            `https://iamtkm.vercel.app/ai/copilot?apikey=tkm&text=${encodeURIComponent(query)}`,
            { timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        const reply = data?.result || data?.data || data?.response || data?.message;
        if (!reply) throw new Error('Empty response');
        await sock.sendMessage(chatId, { text: `📡 *Copilot*\n\n${reply}` }, { quoted: fake });
    } catch {
        try {
            const { data } = await axios.get(
                `https://meta-api.zone.id/ai/copilot?message=${encodeURIComponent(query)}`,
                { timeout: 25000, headers: { 'User-Agent': 'Mozilla/5.0' } }
            );
            const reply = data?.result || data?.data || data?.response;
            if (!reply) throw new Error('Empty response');
            await sock.sendMessage(chatId, { text: `📡 *Copilot*\n\n${reply}` }, { quoted: fake });
        } catch (err) {
            await sock.sendMessage(chatId, { text: `❌ Copilot unavailable. Try *ai* or *gemini* instead.` }, { quoted: fake });
        }
    }
}

module.exports = copilotCommand;
