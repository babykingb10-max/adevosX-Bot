const { createFakeContact } = require('../../davelib/fakeContact');

const activeGames = new Map();

async function numguessCommand(sock, chatId, message, args) {
    const fake = createFakeContact(message);
    const senderId = message.key.participant || message.key.remoteJid;
    const gameKey = `${chatId}_${senderId}`;

    if (activeGames.has(gameKey)) {
        const game = activeGames.get(gameKey);
        const guess = parseInt(args[0]);

        if (isNaN(guess)) {
            return sock.sendMessage(chatId, {
                text: `🎯 You have an active game!\nGuess a number between *1* and *${game.max}*\nAttempts left: *${game.attemptsLeft}*`
            }, { quoted: fake });
        }

        game.attemptsLeft--;

        if (guess === game.number) {
            activeGames.delete(gameKey);
            const used = game.maxAttempts - game.attemptsLeft;
            return sock.sendMessage(chatId, {
                text: `🎉 *Correct!* The number was *${game.number}*!\nYou guessed it in *${used}* attempt${used !== 1 ? 's' : ''}!`
            }, { quoted: fake });
        }

        if (game.attemptsLeft <= 0) {
            activeGames.delete(gameKey);
            return sock.sendMessage(chatId, {
                text: `😢 *Game Over!* The number was *${game.number}*.\nBetter luck next time! Start a new game with *numguess*`
            }, { quoted: fake });
        }

        const hint = guess < game.number ? '📈 Too low!' : '📉 Too high!';
        await sock.sendMessage(chatId, {
            text: `${hint}\nAttempts left: *${game.attemptsLeft}*`
        }, { quoted: fake });
        return;
    }

    const max = parseInt(args[0]) || 100;
    const clampedMax = Math.min(Math.max(max, 10), 1000);
    const number = Math.floor(Math.random() * clampedMax) + 1;
    const attempts = clampedMax <= 20 ? 5 : clampedMax <= 100 ? 7 : 10;

    activeGames.set(gameKey, { number, max: clampedMax, attemptsLeft: attempts, maxAttempts: attempts });

    setTimeout(() => activeGames.delete(gameKey), 5 * 60 * 1000);

    await sock.sendMessage(chatId, {
        text: `🎯 *Number Guessing Game Started!*\n\nI'm thinking of a number between *1* and *${clampedMax}*\nYou have *${attempts}* attempts.\n\nReply with your guess using: *numguess <number>*`
    }, { quoted: fake });
}

module.exports = { numguessCommand };
