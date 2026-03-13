const { addWelcome, delWelcome, isWelcomeOn, addGoodbye, delGoodBye, isGoodByeOn } = require('./index');
const { createFakeContact, getBotName } = require('./fakeContact');

async function handleWelcome(sock, chatId, message, match) {
    const senderId = message.key.participant || message.key.remoteJid;
    const fake = createFakeContact(senderId);
    const botName = getBotName();
    
    if (!match) {
        return sock.sendMessage(chatId, {
            text: `╭─❖ *WELCOME SETTINGS* ❖─╮\n` +
                  `│ .welcome on - Enable\n` +
                  `│ .welcome set <msg> - Customize\n` +
                  `│ .welcome off - Disable\n` +
                  `╰─────────────────╯\n\n` +
                  `Variables: {user}, {group}, {description}, {bot}`,
        }, { quoted: fake });
    }

    const [command, ...args] = match.split(' ');
    const lowerCommand = command.toLowerCase();
    const customMessage = args.join(' ');

    if (lowerCommand === 'on') {
        if (await isWelcomeOn(chatId)) {
            return sock.sendMessage(chatId, { text: `*${botName}*\nWelcome messages are already active.` }, { quoted: fake });
        }
        await addWelcome(chatId, true, `@{user} Holla👋,\n\nWelcome to {group}.\n\nYou might want to read group description,\nFollow group rules to avoid being removed.\n\n {bot} 2026.`);
        return sock.sendMessage(chatId, { text: `*${botName}*\n✓ Welcome enabled. Use .welcome set to customize.` }, { quoted: fake });
    }

    if (lowerCommand === 'off') {
        if (!(await isWelcomeOn(chatId))) {
            return sock.sendMessage(chatId, { text: `*${botName}*\nWelcome messages are already off.` }, { quoted: fake });
        }
        await delWelcome(chatId);
        return sock.sendMessage(chatId, { text: `*${botName}*\n✓ Welcome disabled.` }, { quoted: fake });
    }

    if (lowerCommand === 'set') {
        if (!customMessage) {
            return sock.sendMessage(chatId, { text: `*${botName}*\nPlease provide a message.\nExample: .welcome set @{user} Holla👋, welcome!` }, { quoted: fake });
        }
        await addWelcome(chatId, true, customMessage);
        return sock.sendMessage(chatId, { text: `*${botName}*\n✓ Welcome message updated.\nPreview: ${customMessage}` }, { quoted: fake });
    }

    return sock.sendMessage(chatId, {
        text: `*${botName}*\nInvalid. Use: on, off, or set <message>`,
    }, { quoted: fake });
}

async function handleGoodbye(sock, chatId, message, match) {
    const senderId = message.key.participant || message.key.remoteJid;
    const fake = createFakeContact(senderId);
    const botName = getBotName();
    const lower = match?.toLowerCase();

    if (!match) {
        return sock.sendMessage(chatId, {
            text: `╭─❖ *GOODBYE SETTINGS* ❖─╮\n` +
                  `│ .goodbye on - Enable\n` +
                  `│ .goodbye set <msg> - Customize\n` +
                  `│ .goodbye off - Disable\n` +
                  `╰───────────────────╯\n\n` +
                  `Variables: {user}, {group}, {bot}`,
        }, { quoted: fake });
    }

    if (lower === 'on') {
        if (await isGoodByeOn(chatId)) {
            return sock.sendMessage(chatId, { text: `*${botName}*\nGoodbye messages are already active.` }, { quoted: fake });
        }
        await addGoodbye(chatId, true, `@{user} Has run out of data, let's pray for the poor😢.\n\nAnyway Goodbye Hustler👋.`);
        return sock.sendMessage(chatId, { text: `*${botName}*\n✓ Goodbye enabled. Use .goodbye set to customize.` }, { quoted: fake });
    }

    if (lower === 'off') {
        if (!(await isGoodByeOn(chatId))) {
            return sock.sendMessage(chatId, { text: `*${botName}*\nGoodbye messages are already off.` }, { quoted: fake });
        }
        await delGoodBye(chatId);
        return sock.sendMessage(chatId, { text: `*${botName}*\n✓ Goodbye disabled.` }, { quoted: fake });
    }

    if (lower.startsWith('set ')) {
        const customMessage = match.substring(4);
        if (!customMessage) {
            return sock.sendMessage(chatId, { text: `*${botName}*\nPlease provide a message.\nExample: .goodbye set @{user} Goodbye!` }, { quoted: fake });
        }
        await addGoodbye(chatId, true, customMessage);
        return sock.sendMessage(chatId, { text: `*${botName}*\n✓ Goodbye message updated.\nPreview: ${customMessage}` }, { quoted: fake });
    }

    return sock.sendMessage(chatId, {
        text: `*${botName}*\nInvalid. Use: on, off, or set <message>`,
    }, { quoted: fake });
}

module.exports = { handleWelcome, handleGoodbye };