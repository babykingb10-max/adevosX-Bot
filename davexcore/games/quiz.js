const axios = require('axios');
const { createFakeContact } = require('../../davelib/fakeContact');

const activeQuizzes = new Map();

function decodeHtml(html) {
    return html
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&ldquo;/g, '"')
        .replace(/&rdquo;/g, '"');
}

const fallbackQuestions = [
    { q: "What is the capital of France?", a: "Paris", options: ["London", "Berlin", "Paris", "Madrid"] },
    { q: "What is 7 × 8?", a: "56", options: ["48", "56", "64", "54"] },
    { q: "Which planet is closest to the Sun?", a: "Mercury", options: ["Venus", "Earth", "Mars", "Mercury"] },
    { q: "Who wrote Romeo and Juliet?", a: "Shakespeare", options: ["Dickens", "Shakespeare", "Hemingway", "Austen"] },
    { q: "What is the largest ocean on Earth?", a: "Pacific Ocean", options: ["Atlantic Ocean", "Indian Ocean", "Pacific Ocean", "Arctic Ocean"] },
    { q: "How many sides does a hexagon have?", a: "6", options: ["5", "6", "7", "8"] },
    { q: "What year did World War II end?", a: "1945", options: ["1943", "1944", "1945", "1946"] },
    { q: "What is H2O commonly known as?", a: "Water", options: ["Oxygen", "Hydrogen", "Water", "Salt"] },
];

async function quizCommand(sock, chatId, message) {
    const fake = createFakeContact(message);

    let question, correctAnswer, options;

    try {
        const { data } = await axios.get('https://opentdb.com/api.php?amount=1&type=multiple', { timeout: 8000 });
        const q = data?.results?.[0];
        if (q) {
            question = decodeHtml(q.question);
            correctAnswer = decodeHtml(q.correct_answer);
            options = [...q.incorrect_answers.map(decodeHtml), correctAnswer].sort(() => Math.random() - 0.5);
        } else throw new Error('No question');
    } catch {
        const fb = fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)];
        question = fb.q;
        correctAnswer = fb.a;
        options = [...fb.options].sort(() => Math.random() - 0.5);
    }

    const letters = ['A', 'B', 'C', 'D'];
    const optionText = options.map((o, i) => `${letters[i]}. ${o}`).join('\n');
    const correctLetter = letters[options.indexOf(correctAnswer)];

    activeQuizzes.set(chatId, { answer: correctAnswer, correctLetter, expires: Date.now() + 30000 });
    setTimeout(() => {
        const q = activeQuizzes.get(chatId);
        if (q) {
            activeQuizzes.delete(chatId);
            sock.sendMessage(chatId, { text: `⏰ Time's up! The answer was *${correctLetter}. ${correctAnswer}*` });
        }
    }, 30000);

    await sock.sendMessage(chatId, {
        text: `🧠 *Quiz Time!*\n\n❓ ${question}\n\n${optionText}\n\n⏰ 30 seconds to answer! Reply with the letter (A/B/C/D)`
    }, { quoted: fake });
}

async function handleQuizAnswer(sock, chatId, message, text) {
    const quiz = activeQuizzes.get(chatId);
    if (!quiz || Date.now() > quiz.expires) return false;

    const answer = text.trim().toUpperCase();
    if (!['A', 'B', 'C', 'D'].includes(answer)) return false;

    activeQuizzes.delete(chatId);
    const fake = createFakeContact(message);

    if (answer === quiz.correctLetter) {
        await sock.sendMessage(chatId, {
            text: `✅ *Correct!* Well done! The answer was *${quiz.correctLetter}. ${quiz.answer}*`
        }, { quoted: fake });
    } else {
        await sock.sendMessage(chatId, {
            text: `❌ *Wrong!* The correct answer was *${quiz.correctLetter}. ${quiz.answer}*`
        }, { quoted: fake });
    }
    return true;
}

function hasActiveQuiz(chatId) {
    const q = activeQuizzes.get(chatId);
    return q && Date.now() < q.expires;
}

module.exports = { quizCommand, handleQuizAnswer, hasActiveQuiz };
