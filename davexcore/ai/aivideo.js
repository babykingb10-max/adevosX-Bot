const { createFakeContact, getBotName } = require('../../davelib/fakeContact');
const axios = require('axios');

async function aivideoCommand(sock, chatId, message, args) {
    const fakeContact = createFakeContact(message);
    const botName = getBotName();
    const prompt = args.join(' ').trim();
    
    if (!prompt) {
        return sock.sendMessage(chatId, { text: `*${botName} AI VIDEO*\n\nUsage: .aivideo <prompt>\nExample: .aivideo a sunset over the ocean` }, { quoted: fakeContact });
    }
    
    await sock.sendMessage(chatId, { react: { text: '🎬', key: message.key } });
    await sock.sendMessage(chatId, { text: `*${botName}*\nGenerating video from: "${prompt}"\nThis may take a moment...` }, { quoted: fakeContact });
    
    try {
        const res = await axios.get(`https://bk9.fun/ai/Kling?prompt=${encodeURIComponent(prompt)}`, { timeout: 60000 });
        const videoUrl = res.data?.BK9 || res.data?.result || res.data?.url;
        
        if (videoUrl) {
            await sock.sendMessage(chatId, { video: { url: videoUrl }, caption: `*${botName} AI VIDEO*\nPrompt: ${prompt}` }, { quoted: fakeContact });
            await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        } else {
            await sock.sendMessage(chatId, { text: `*${botName}*\nFailed to generate video. Try a different prompt.` }, { quoted: fakeContact });
        }
    } catch (err) {
        await sock.sendMessage(chatId, { text: `*${botName}*\nVideo generation failed: ${err.message}` }, { quoted: fakeContact });
    }
}

module.exports = aivideoCommand;
