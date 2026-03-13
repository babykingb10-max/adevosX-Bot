const WordChainGame = require('../../davelib/wordchain');

const games = {};
const gameTimeouts = {};
const BOT_JID = 'bot@s.whatsapp.net';

function getPlayerName(jid) {
    return (jid || '').split(':')[0].split('@')[0];
}

function clearWcgTimeout(chatId) {
    if (gameTimeouts[chatId]) {
        clearTimeout(gameTimeouts[chatId]);
        delete gameTimeouts[chatId];
    }
}

async function wcgCommand(sock, chatId, senderId, fake) {
    try {
        if (games[chatId]) {
            await sock.sendMessage(chatId, {
                text: '❌ There is already a Word Chain game in this chat!\nUse *.wcgend* to end it first.'
            }, { quoted: fake });
            return;
        }

        const game = new WordChainGame(senderId);
        games[chatId] = game;

        await sock.sendMessage(chatId, {
            text: `🔤 *WORD CHAIN GAME*\n\n@${getPlayerName(senderId)} started a Word Chain game!\n\n*Type "join" within 60 seconds to play!*\n\nPlayers: 1 (need at least 2)\n\n_Rules:_\n- Each word must start with the last letter of the previous word\n- No repeating words\n- Longer words = more points\n- Host types *.wcgbegin* to start when ready\n\n_Auto-cancels in 60 seconds if not enough players_`,
            mentions: [senderId]
        }, { quoted: fake });

        gameTimeouts[chatId] = setTimeout(async () => {
            if (games[chatId] && games[chatId].state === 'WAITING') {
                delete games[chatId];
                await sock.sendMessage(chatId, {
                    text: '⏰ *WORD CHAIN - TIMEOUT*\n\nNot enough players joined. Game cancelled!'
                });
            }
        }, 60000);
    } catch (error) {
        console.error('Error in wcg command:', error);
        await sock.sendMessage(chatId, { text: '❌ Error starting game.' });
    }
}

async function wcgAICommand(sock, chatId, senderId, fake) {
    try {
        if (games[chatId]) {
            await sock.sendMessage(chatId, {
                text: '❌ There is already a Word Chain game in this chat!\nUse *.wcgend* to end it first.'
            }, { quoted: fake });
            return;
        }

        const game = new WordChainGame(senderId);
        game.addPlayer(BOT_JID);
        game.isAI = true;
        game.start();
        games[chatId] = game;

        await sock.sendMessage(chatId, {
            text: `🔤 *WORD CHAIN vs AI* 🤖\n\n@${getPlayerName(senderId)} vs ADEVOS-X BOT Bot\n\nYou go first! Type any word to start.\n\n_Rules:_\n- Each word must start with the last letter of the previous word\n- No repeating words\n- Longer words = more points`,
            mentions: [senderId]
        }, { quoted: fake });
    } catch (error) {
        console.error('Error in wcgai command:', error);
        await sock.sendMessage(chatId, { text: '❌ Error starting AI game.' });
    }
}

async function wcgBeginCommand(sock, chatId, senderId, fake) {
    const game = games[chatId];
    if (!game) {
        await sock.sendMessage(chatId, { text: '❌ No Word Chain game to start!' }, { quoted: fake });
        return;
    }
    if (game.host !== senderId) {
        await sock.sendMessage(chatId, { text: '❌ Only the host can start the game!' }, { quoted: fake });
        return;
    }
    if (!game.start()) {
        await sock.sendMessage(chatId, { text: '❌ Need at least 2 players to start!' }, { quoted: fake });
        return;
    }
    clearWcgTimeout(chatId);

    const playerList = game.players.map((p, i) => `${i + 1}. @${getPlayerName(p)}`).join('\n');
    await sock.sendMessage(chatId, {
        text: `🔤 *WORD CHAIN - Game Started!*\n\nPlayers:\n${playerList}\n\n@${getPlayerName(game.currentPlayer)} goes first! Type any word to start.\n\n_60 seconds per turn or you're eliminated!_`,
        mentions: game.players
    });

    setTurnTimeout(sock, chatId);
}

function setTurnTimeout(sock, chatId) {
    clearWcgTimeout(chatId);
    const game = games[chatId];
    if (!game || game.state !== 'PLAYING') return;

    gameTimeouts[chatId] = setTimeout(async () => {
        const g = games[chatId];
        if (!g || g.state !== 'PLAYING') return;

        const eliminated = g.currentPlayer;
        g.eliminateCurrentPlayer();

        if (g.state === 'ENDED') {
            const winner = g.winner;
            await sock.sendMessage(chatId, {
                text: `⏰ @${getPlayerName(eliminated)} took too long and is eliminated!\n\n🏆 @${getPlayerName(winner)} wins the Word Chain!\n\n*Scores:*\n${g.getScoreboard()}`,
                mentions: [eliminated, winner]
            });
            delete games[chatId];
        } else {
            await sock.sendMessage(chatId, {
                text: `⏰ @${getPlayerName(eliminated)} took too long and is eliminated!\n\n@${getPlayerName(g.currentPlayer)}'s turn!${g.lastWord ? ` Word must start with "${g.lastWord.charAt(g.lastWord.length - 1).toUpperCase()}"` : ''}`,
                mentions: [eliminated, g.currentPlayer]
            });
            setTurnTimeout(sock, chatId);
        }
    }, 60000);
}

async function handleWcgJoin(sock, chatId, senderId) {
    const game = games[chatId];
    if (!game || game.state !== 'WAITING') return false;
    if (game.players.includes(senderId)) return false;

    if (game.addPlayer(senderId)) {
        await sock.sendMessage(chatId, {
            text: `🔤 @${getPlayerName(senderId)} joined the Word Chain!\n\nPlayers: ${game.players.length}\nHost can type *.wcgbegin* to start.`,
            mentions: [senderId]
        });
        return true;
    }
    return false;
}

async function handleWcgWord(sock, chatId, senderId, text) {
    const game = games[chatId];
    if (!game || game.state !== 'PLAYING') return false;
    if (!game.players.includes(senderId)) return false;

    const word = text.toLowerCase().trim();
    if (word.length < 2 || word.includes(' ')) return false;

    const result = game.submitWord(senderId, word);
    if (!result.ok) {
        await sock.sendMessage(chatId, {
            text: `❌ @${getPlayerName(senderId)}: ${result.reason}`,
            mentions: [senderId]
        });
        return true;
    }

    clearWcgTimeout(chatId);

    if (game.isAI && game.currentPlayer === BOT_JID) {
        const lastChar = word.charAt(word.length - 1);
        const aiWord = WordChainGame.findAIWord(lastChar, game.usedWords);

        if (aiWord) {
            const aiResult = game.submitWord(BOT_JID, aiWord);
            if (aiResult.ok) {
                const nextChar = aiWord.charAt(aiWord.length - 1).toUpperCase();
                await sock.sendMessage(chatId, {
                    text: `🔤 @${getPlayerName(senderId)}: *${word}* (+${word.length}pts)\n🤖 Bot: *${aiWord}* (+${aiWord.length}pts)\n\nYour turn! Word must start with "${nextChar}"\n\n*Scores:*\n${game.getScoreboard()}`,
                    mentions: [senderId]
                });
                setTurnTimeout(sock, chatId);
                return true;
            }
        }

        game.state = 'ENDED';
        await sock.sendMessage(chatId, {
            text: `🔤 @${getPlayerName(senderId)}: *${word}* (+${word.length}pts)\n🤖 Bot can't find a word! You win!\n\n🏆 *Final Scores:*\n${game.getScoreboard()}`,
            mentions: [senderId]
        });
        delete games[chatId];
        return true;
    }

    const nextChar = word.charAt(word.length - 1).toUpperCase();
    await sock.sendMessage(chatId, {
        text: `🔤 @${getPlayerName(senderId)}: *${word}* (+${word.length}pts)\n\n@${getPlayerName(game.currentPlayer)}'s turn! Word must start with "${nextChar}"\n\n*Scores:*\n${game.getScoreboard()}`,
        mentions: [senderId, game.currentPlayer]
    });

    setTurnTimeout(sock, chatId);
    return true;
}

async function wcgEndCommand(sock, chatId, senderId, fake) {
    const game = games[chatId];
    if (!game) {
        await sock.sendMessage(chatId, { text: '❌ No Word Chain game to end!' }, { quoted: fake });
        return;
    }
    clearWcgTimeout(chatId);
    const scores = game.getScoreboard();
    delete games[chatId];
    await sock.sendMessage(chatId, {
        text: `🛑 Word Chain ended by @${getPlayerName(senderId)}!\n\n*Final Scores:*\n${scores || 'No scores yet'}`,
        mentions: [senderId]
    });
}

async function wcgScoresCommand(sock, chatId, fake) {
    const game = games[chatId];
    if (!game) {
        await sock.sendMessage(chatId, { text: '❌ No active Word Chain game!' }, { quoted: fake });
        return;
    }
    await sock.sendMessage(chatId, {
        text: `🔤 *Word Chain Scores*\n\n${game.getScoreboard()}\n\nWords used: ${game.usedWords.size}\nRounds: ${game.rounds}`,
    });
}

function hasWcgGame(chatId) {
    return !!games[chatId] && games[chatId].state === 'PLAYING';
}

function hasWaitingWcgGame(chatId) {
    return !!games[chatId] && games[chatId].state === 'WAITING';
}

module.exports = {
    wcgCommand,
    wcgAICommand,
    wcgBeginCommand,
    wcgEndCommand,
    wcgScoresCommand,
    handleWcgJoin,
    handleWcgWord,
    hasWcgGame,
    hasWaitingWcgGame,
};
