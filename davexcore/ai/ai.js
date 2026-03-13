const axios = require('axios');
const { createFakeContact, getBotName } = require('../../davelib/fakeContact');

const GPT_API = {
    baseURL: "https://iamtkm.vercel.app",
    endpoint: "/ai/gpt5",
    apiKey: "tkm"
};

async function aiCommand(sock, chatId, message, args) {
    try {
        const fake = createFakeContact(message);
        const botName = getBotName();
        const query = Array.isArray(args) ? args.join(' ').trim() : '';

        if (!query) {
            return await sock.sendMessage(chatId, { 
                text: `┌─ *${botName} Gemini* ─┐\n│\n│ Use: .gemini [your question]\n│ Example: .gemini explain machine learning\n│\n└─────────────────┘`
            }, { quoted: fake });
        }

        await sock.sendMessage(chatId, {
            react: { text: '✨', key: message.key }
        });

        await processAIRequest(sock, chatId, message, query);

    } catch (error) {
        console.error('AI Command Error:', error);
        const fake = createFakeContact(message);
        await sock.sendMessage(chatId, {
            text: `✦ AI service down. Try again later.`
        }, { quoted: fake });
    }
}

async function processAIRequest(sock, chatId, message, query) {
    try {
        const fake = createFakeContact(message);
        const apiUrl = `${GPT_API.baseURL}${GPT_API.endpoint}?apikey=${GPT_API.apiKey}&text=${encodeURIComponent(query)}`;
        
        const response = await axios.get(apiUrl, { 
            timeout: 30000,
            headers: {
                'User-Agent': 'WhatsApp-Bot/1.0',
                'Accept': 'application/json'
            }
        });
        
        const data = response.data;
        
        if (data.status && data.statusCode === 200 && data.result) {
            const reply = data.result.substring(0, 3000);
            await sock.sendMessage(chatId, {
                text: `┌─ *${botName} Gemini* ─┐\n│\n${reply.split('\n').map(l => `│ ${l}`).join('\n')}\n│\n└─────────────────┘`
            }, { quoted: fake });
            
            await sock.sendMessage(chatId, {
                react: { text: '✅', key: message.key }
            });
        } else {
            await sock.sendMessage(chatId, {
                text: `✦ AI couldn't generate a response. Try a different question.`
            }, { quoted: fake });
        }

    } catch (error) {
        console.error('AI API Error:', error.message);
        const fake = createFakeContact(message);
        
        if (error.response?.status === 429) {
            await sock.sendMessage(chatId, {
                text: `✦ Rate limit. Wait 5 minutes.`
            }, { quoted: fake });
        } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            await sock.sendMessage(chatId, {
                text: `✦ Request timeout. Try shorter question.`
            }, { quoted: fake });
        } else {
            await sock.sendMessage(chatId, {
                text: `✦ AI service error. Try later.`
            }, { quoted: fake });
        }

        await sock.sendMessage(chatId, {
            react: { text: '❌', key: message.key }
        });
    }
}

module.exports = aiCommand;