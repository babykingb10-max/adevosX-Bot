const axios = require('axios');
const { createFakeContact, getBotName } = require('../../davelib/fakeContact');

async function speechwriterCommand(sock, chatId, message, args) {
    const fake = createFakeContact(message);
    const query = args.join(' ').trim();

    if (!query) {
        return sock.sendMessage(chatId, {
            text: `🎤 *AI Speechwriter*\n\nUsage: *speechwrite* <topic>\nExample: *speechwrite* graduation speech for university`
        }, { quoted: fake });
    }

    await sock.sendMessage(chatId, { react: { text: '🎤', key: message.key } });

    const prompt = `Write a compelling, eloquent speech about: ${query}. Include an opening hook, main points, and a memorable closing. Make it inspiring and well-structured.`;

    try {
        const { data } = await axios.get(
            `https://iamtkm.vercel.app/ai/gpt5?apikey=tkm&text=${encodeURIComponent(prompt)}`,
            { timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        const reply = data?.result || data?.data || data?.response || data?.message;
        if (!reply) throw new Error('Empty response');
        await sock.sendMessage(chatId, { text: `🎤 *Speech: ${query}*\n\n${reply}` }, { quoted: fake });
    } catch {
        try {
            const { data } = await axios.get(
                `https://api.siputzx.my.id/api/ai/chatgpt?prompt=${encodeURIComponent(prompt)}`,
                { timeout: 25000, headers: { 'User-Agent': 'Mozilla/5.0' } }
            );
            const reply = data?.data || data?.result || data?.response;
            if (!reply) throw new Error('Empty response');
            await sock.sendMessage(chatId, { text: `🎤 *Speech: ${query}*\n\n${reply}` }, { quoted: fake });
        } catch (err) {
            await sock.sendMessage(chatId, { text: `❌ Speechwriter unavailable. Try *ai* instead.` }, { quoted: fake });
        }
    }
}

module.exports = speechwriterCommand;
