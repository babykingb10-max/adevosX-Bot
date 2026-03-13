const { sendInteractiveMessage } = require('gifted-btns');
const { getBotName, createFakeContact } = require('./fakeContact');

async function sendAntiStatus(sock, chatId, message, {
    label,
    configKey,
    currentMode,
    prefix,
    modes,
    extraInfo
}) {
    const fake = createFakeContact(message);
    const botName = getBotName();

    const statusLine = `Status: ${currentMode.toUpperCase()}`;
    const extraLine = extraInfo ? `\n│ ${extraInfo}` : '';

    const infoCard = `┌─ *${botName} ${label}* ─┐\n│\n│ ${statusLine}${extraLine}\n│\n└─────────────────────┘`;

    const interactiveButtons = modes.map(m => ({
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
            display_text: m.label,
            id: `${prefix}${configKey} ${m.value}`
        })
    }));

    try {
        await sendInteractiveMessage(sock, chatId, {
            text: infoCard,
            footer: botName,
            interactiveButtons
        });
    } catch (e) {
        await sock.sendMessage(chatId, { text: infoCard }, { quoted: fake });
    }
}

module.exports = { sendAntiStatus };
