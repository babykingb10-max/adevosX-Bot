const { createFakeContact } = require('../../davelib/fakeContact');

async function coinflipCommand(sock, chatId, message, args) {
    const fake = createFakeContact(message);
    const choice = (args[0] || '').toLowerCase();
    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const emoji = result === 'heads' ? '🪙' : '🔵';

    if (choice && choice !== 'heads' && choice !== 'tails' && choice !== 'h' && choice !== 't') {
        return sock.sendMessage(chatId, {
            text: `🪙 *Coin Flip*\n\nUsage: *coinflip* [heads/tails]\nExample: *coinflip* heads`
        }, { quoted: fake });
    }

    const normalized = choice === 'h' ? 'heads' : choice === 't' ? 'tails' : choice;
    const resultText = `${emoji} *Coin Flip Result:* *${result.toUpperCase()}*`;

    if (!normalized) {
        return sock.sendMessage(chatId, { text: resultText }, { quoted: fake });
    }

    const won = normalized === result;
    const verdict = won ? '✅ *You win!*' : '❌ *You lose!*';
    await sock.sendMessage(chatId, {
        text: `🪙 *Coin Flip*\n\nYou chose: *${normalized}*\n${resultText}\n\n${verdict}`
    }, { quoted: fake });
}

module.exports = { coinflipCommand };
