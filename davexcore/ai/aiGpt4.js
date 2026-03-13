const axios = require('axios');
const { createFakeContact, getBotName } = require('../../davelib/fakeContact');

async function gpt4Command(sock, chatId, message, args) {
  const botName = getBotName();
  try {
    const query = Array.isArray(args) ? args.join(' ').trim() : '';

    if (!query) {
      const fake = createFakeContact(message);
      return sock.sendMessage(chatId, {
        text: `┌─ *${botName} AI* ─┐\n│\n│ Type your question after .ai\n│ Example: .ai explain quantum physics\n│\n└─────────────────┘`
      }, { quoted: fake });
    }

    await sock.sendMessage(chatId, { react: { text: '🤖', key: message.key } });
    await handleAI(sock, chatId, message, query);

  } catch (err) {
    console.error('AI Command Error:', err);
    const fake = createFakeContact(message);
    await sock.sendMessage(chatId, { text: `*${botName}*\nAI service error` }, { quoted: fake });
  }
}

async function handleAI(sock, chatId, message, query) {
  const botName = getBotName();
  const fake = createFakeContact(message);
  
  const apis = [
    { url: `https://bk9.fun/ai/GPT4o?q=${encodeURIComponent(query)}`, parse: d => d.BK9 || d.result },
    { url: `https://api.dreaded.site/api/chatgpt?text=${encodeURIComponent(query)}`, parse: d => d.result },
    { url: `https://iamtkm.vercel.app/ai/gpt5?apikey=tkm&text=${encodeURIComponent(query)}`, parse: d => d.result },
  ];

  for (const api of apis) {
    try {
      const res = await axios.get(api.url, { timeout: 15000 });
      const result = api.parse(res.data);
      if (result && result.trim()) {
        const reply = result.substring(0, 3000);
        await sock.sendMessage(chatId, {
          text: `┌─ *${botName} AI* ─┐\n│\n${reply.split('\n').map(l => `│ ${l}`).join('\n')}\n│\n└─────────────────┘`
        }, { quoted: fake });
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        return;
      }
    } catch {}
  }

  await sock.sendMessage(chatId, { text: `*${botName}*\nAI services are currently down. Try again later.` }, { quoted: fake });
}

module.exports = gpt4Command;
