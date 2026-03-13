class DiceGame {
    constructor(hostId, maxRounds = 3) {
        this.host = hostId;
        this.players = [hostId];
        this.scores = {};
        this.scores[hostId] = 0;
        this.currentPlayerIndex = 0;
        this.round = 1;
        this.maxRounds = maxRounds;
        this.state = 'WAITING';
        this.lastRoll = null;
        this.roundRolls = {};
        this.createdAt = Date.now();
    }

    addPlayer(playerId) {
        if (this.players.includes(playerId)) return false;
        if (this.state !== 'WAITING') return false;
        this.players.push(playerId);
        this.scores[playerId] = 0;
        return true;
    }

    start() {
        if (this.players.length < 2) return false;
        this.state = 'PLAYING';
        this.currentPlayerIndex = 0;
        this.roundRolls = {};
        return true;
    }

    get currentPlayer() {
        return this.players[this.currentPlayerIndex];
    }

    roll(playerId) {
        if (this.state !== 'PLAYING') return { ok: false, reason: 'Game not active' };
        if (playerId !== this.currentPlayer) return { ok: false, reason: 'Not your turn' };
        if (this.roundRolls[playerId]) return { ok: false, reason: 'You already rolled this round' };

        const dice1 = Math.floor(Math.random() * 6) + 1;
        const dice2 = Math.floor(Math.random() * 6) + 1;
        const total = dice1 + dice2;

        this.roundRolls[playerId] = { dice1, dice2, total };
        this.scores[playerId] = (this.scores[playerId] || 0) + total;
        this.lastRoll = { playerId, dice1, dice2, total };

        this.currentPlayerIndex++;

        let roundComplete = false;
        let gameOver = false;

        if (this.currentPlayerIndex >= this.players.length) {
            roundComplete = true;
            this.round++;
            if (this.round > this.maxRounds) {
                this.state = 'ENDED';
                gameOver = true;
            } else {
                this.currentPlayerIndex = 0;
                this.roundRolls = {};
            }
        }

        return {
            ok: true,
            dice1,
            dice2,
            total,
            roundComplete,
            gameOver,
            round: this.round - (roundComplete ? 1 : 0),
            nextPlayer: gameOver ? null : this.currentPlayer,
        };
    }

    getScoreboard() {
        return Object.entries(this.scores)
            .sort((a, b) => b[1] - a[1])
            .map(([player, score], i) => {
                const name = player.split(':')[0].split('@')[0];
                const medal = i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i + 1}th`;
                return `${medal} @${name}: ${score} pts`;
            })
            .join('\n');
    }

    get winner() {
        if (this.state !== 'ENDED') return null;
        let maxScore = -1;
        let winner = null;
        for (const [player, score] of Object.entries(this.scores)) {
            if (score > maxScore) {
                maxScore = score;
                winner = player;
            }
        }
        return winner;
    }

    static getDiceEmoji(num) {
        const emojis = ['', '1', '2', '3', '4', '5', '6'];
        return emojis[num] || '?';
    }

    static aiRoll() {
        const dice1 = Math.floor(Math.random() * 6) + 1;
        const dice2 = Math.floor(Math.random() * 6) + 1;
        return { dice1, dice2, total: dice1 + dice2 };
    }
}

module.exports = DiceGame;
