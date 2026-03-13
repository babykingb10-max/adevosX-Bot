const { createFakeContact } = require('../../davelib/fakeContact');

const wyrQuestions = [
    ["have unlimited money but no friends", "have lots of friends but always be broke"],
    ["be able to fly", "be able to become invisible"],
    ["live without music", "live without internet"],
    ["always be 10 minutes late", "always be 20 minutes early"],
    ["have the ability to read minds", "have the ability to see the future"],
    ["fight 100 duck-sized horses", "fight 1 horse-sized duck"],
    ["be forced to dance every time you hear music", "be forced to sing along to every song you hear"],
    ["never use social media again", "never watch TV/movies again"],
    ["only be able to speak in questions", "only be able to communicate through song"],
    ["have a pause button for your life", "have a rewind button for your life"],
    ["know the day you die", "know how you die"],
    ["lose all your memories from the past 5 years", "never be able to make new memories"],
    ["always be slightly cold", "always be slightly too hot"],
    ["have no one show up to your wedding", "no one show up to your funeral"],
    ["give up bathing for a month", "give up internet for a month"],
    ["speak every language fluently", "play every instrument perfectly"],
    ["never be able to lie", "never be able to tell the truth"],
    ["live in the wilderness for a year", "live in a city with no money for a year"],
    ["be teleported to any place", "be transported to any time"],
    ["eat the same meal every day forever", "never eat the same meal twice"],
];

async function wyrCommand(sock, chatId, message) {
    const fake = createFakeContact(message);
    const q = wyrQuestions[Math.floor(Math.random() * wyrQuestions.length)];

    await sock.sendMessage(chatId, {
        text: `🤔 *Would You Rather?*\n\n🅰️ *${q[0]}*\n\n⎯⎯⎯ OR ⎯⎯⎯\n\n🅱️ *${q[1]}*\n\nReact with 🅰️ or 🅱️!`
    }, { quoted: fake });
}

module.exports = { wyrCommand };
