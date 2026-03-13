const { getOwnerConfig, setOwnerConfig } = require('../Database/settingsStore');

const defaultEmojis = ['💞', '💘', '🥰', '💙', '💓', '💕'];

/**
 * Config shape:
 * {
 *   enabled: boolean,
 *   customReactions: string[],
 *   pm: boolean,       — react in private chats
 *   group: boolean,    — react in group chats
 *   chats: string[],   — extra specific chat JIDs to always react in (regardless of pm/group flags)
 * }
 */

function loadAutoReactionState() {
    try {
        const config = getOwnerConfig('autoReaction');
        if (config && typeof config === 'object') {
            return {
                enabled:         config.enabled         ?? false,
                customReactions: Array.isArray(config.customReactions) ? config.customReactions : [...defaultEmojis],
                pm:              config.pm              ?? true,
                group:           config.group           ?? true,
                chats:           Array.isArray(config.chats) ? config.chats : [],
            };
        }
    } catch (error) {
        console.error('Error loading auto-reaction state:', error);
    }
    return { enabled: false, customReactions: [...defaultEmojis], pm: true, group: true, chats: [] };
}

function saveAutoReactionState(patch) {
    try {
        const current = loadAutoReactionState();
        const merged = { ...current, ...patch };
        setOwnerConfig('autoReaction', merged);
        autoReactionConfig = merged;
    } catch (error) {
        console.error('Error saving auto-reaction state:', error);
    }
}

let autoReactionConfig = loadAutoReactionState();

function getRandomEmoji() {
    const reactions = autoReactionConfig.customReactions;
    if (!Array.isArray(reactions) || reactions.length === 0) {
        return defaultEmojis[Math.floor(Math.random() * defaultEmojis.length)];
    }
    return reactions[Math.floor(Math.random() * reactions.length)];
}

/**
 * Called for EVERY incoming message (not just commands).
 * Respects pm / group / per-chat scope settings.
 */
async function handleAutoreactForMessage(sock, message) {
    try {
        if (!autoReactionConfig.enabled) return;
        if (!message?.key?.id) return;

        const chatId = message.key.remoteJid;
        if (!chatId) return;

        const isGroup = chatId.endsWith('@g.us');

        // Per-chat whitelist always wins
        if (autoReactionConfig.chats.includes(chatId)) {
            // fall through to react
        } else if (isGroup && !autoReactionConfig.group) {
            return;
        } else if (!isGroup && !autoReactionConfig.pm) {
            return;
        }

        const emoji = getRandomEmoji();
        await sock.sendMessage(chatId, {
            react: { text: emoji, key: message.key }
        });
    } catch (error) {
        // Silent — never let autoreact crash the message flow
    }
}

/**
 * Legacy: kept so existing call-sites that check hasPrefix still compile.
 * Now just delegates to handleAutoreactForMessage.
 */
async function addCommandReaction(sock, message) {
    return handleAutoreactForMessage(sock, message);
}

function statusLine(cfg) {
    const scope = [];
    if (cfg.pm)    scope.push('PM');
    if (cfg.group) scope.push('Groups');
    if (cfg.chats.length) scope.push(`${cfg.chats.length} specific chat(s)`);
    return [
        `*Auto-React*: ${cfg.enabled ? '✅ ON' : '❌ OFF'}`,
        `*Scope*: ${scope.length ? scope.join(' + ') : 'none'}`,
        `*Emojis*: ${cfg.customReactions.join(' ')}`,
    ].join('\n');
}

async function handleAreactCommand(sock, chatId, message, isOwner) {
    try {
        if (!isOwner) {
            await sock.sendMessage(chatId, {
                text: '❌ This command is only for the owner!',
                quoted: message
            });
            return;
        }

        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const args = text.trim().split(/\s+/).slice(1);
        const action  = args[0]?.toLowerCase();
        const action2 = args[1]?.toLowerCase();

        const cfg = loadAutoReactionState();

        // ── on/off ───────────────────────────────────────────────────
        if (action === 'on') {
            saveAutoReactionState({ enabled: true, pm: true, group: true });
            return sock.sendMessage(chatId, {
                text: `✅ Auto-react *ON* — all chats (PM + Groups)\n\n${statusLine(autoReactionConfig)}`,
                quoted: message
            });
        }
        if (action === 'off') {
            saveAutoReactionState({ enabled: false });
            return sock.sendMessage(chatId, {
                text: `❌ Auto-react *OFF*`,
                quoted: message
            });
        }

        // ── scope: pm ─────────────────────────────────────────────────
        if (action === 'pm') {
            if (!action2 || action2 === 'on') {
                saveAutoReactionState({ enabled: true, pm: true, group: false });
                return sock.sendMessage(chatId, {
                    text: `✅ Auto-react *PM only*\n\n${statusLine(autoReactionConfig)}`,
                    quoted: message
                });
            }
            if (action2 === 'off') {
                const newGroup = cfg.group;
                saveAutoReactionState({ pm: false, enabled: newGroup || cfg.chats.length > 0 });
                return sock.sendMessage(chatId, {
                    text: `✅ Auto-react PM *disabled*\n\n${statusLine(autoReactionConfig)}`,
                    quoted: message
                });
            }
        }

        // ── scope: group ───────────────────────────────────────────────
        if (action === 'group' || action === 'groups') {
            if (!action2 || action2 === 'on') {
                saveAutoReactionState({ enabled: true, pm: false, group: true });
                return sock.sendMessage(chatId, {
                    text: `✅ Auto-react *Groups only*\n\n${statusLine(autoReactionConfig)}`,
                    quoted: message
                });
            }
            if (action2 === 'off') {
                const newPm = cfg.pm;
                saveAutoReactionState({ group: false, enabled: newPm || cfg.chats.length > 0 });
                return sock.sendMessage(chatId, {
                    text: `✅ Auto-react Groups *disabled*\n\n${statusLine(autoReactionConfig)}`,
                    quoted: message
                });
            }
        }

        // ── scope: both ────────────────────────────────────────────────
        if (action === 'both') {
            if (!action2 || action2 === 'on') {
                saveAutoReactionState({ enabled: true, pm: true, group: true });
                return sock.sendMessage(chatId, {
                    text: `✅ Auto-react *PM + Groups*\n\n${statusLine(autoReactionConfig)}`,
                    quoted: message
                });
            }
            if (action2 === 'off') {
                saveAutoReactionState({ enabled: false, pm: false, group: false });
                return sock.sendMessage(chatId, {
                    text: `❌ Auto-react disabled for all\n\n${statusLine(autoReactionConfig)}`,
                    quoted: message
                });
            }
        }

        // ── per-chat whitelist ─────────────────────────────────────────
        if (action === 'chat') {
            // .areact chat — adds current chat
            // .areact chat <JID> — adds specified JID
            const targetId = args[1]?.includes('@') ? args[1] : chatId;
            const chats = [...cfg.chats];
            if (!chats.includes(targetId)) {
                chats.push(targetId);
                saveAutoReactionState({ chats, enabled: true });
                return sock.sendMessage(chatId, {
                    text: `✅ Auto-react enabled for this chat\nJID: ${targetId}\n\n${statusLine(autoReactionConfig)}`,
                    quoted: message
                });
            }
            return sock.sendMessage(chatId, { text: `Already in per-chat list.`, quoted: message });
        }

        if (action === 'removechat' || action === 'unchat') {
            const targetId = args[1]?.includes('@') ? args[1] : chatId;
            const chats = cfg.chats.filter(c => c !== targetId);
            saveAutoReactionState({ chats, enabled: chats.length > 0 || cfg.pm || cfg.group });
            return sock.sendMessage(chatId, {
                text: `✅ Removed from per-chat list\n\n${statusLine(autoReactionConfig)}`,
                quoted: message
            });
        }

        // ── emojis ─────────────────────────────────────────────────────
        if (action === 'set' || action === 'emoji') {
            const rawEmojis = args.slice(1);
            if (!rawEmojis.length) {
                return sock.sendMessage(chatId, {
                    text: `❌ Provide emojis: .areact set 🎉 🚀 ⭐`,
                    quoted: message
                });
            }
            const validEmojis = rawEmojis.filter(e => /[\p{Emoji}]/u.test(e));
            if (!validEmojis.length) {
                return sock.sendMessage(chatId, { text: `❌ No valid emojis found`, quoted: message });
            }
            saveAutoReactionState({ customReactions: validEmojis });
            return sock.sendMessage(chatId, {
                text: `✅ Emojis updated: ${validEmojis.join(' ')}\n\n${statusLine(autoReactionConfig)}`,
                quoted: message
            });
        }

        if (action === 'reset') {
            saveAutoReactionState({ customReactions: [...defaultEmojis] });
            return sock.sendMessage(chatId, {
                text: `✅ Emojis reset to default\n\n${statusLine(autoReactionConfig)}`,
                quoted: message
            });
        }

        if (action === 'list' || action === 'status') {
            return sock.sendMessage(chatId, {
                text: `📋 ${statusLine(autoReactionConfig)}${cfg.chats.length ? '\n*Per-chat JIDs:*\n' + cfg.chats.join('\n') : ''}`,
                quoted: message
            });
        }

        // ── help ───────────────────────────────────────────────────────
        await sock.sendMessage(chatId, {
            text: `⚙️ *Auto-React*\n\n${statusLine(autoReactionConfig)}\n\n` +
                `*Scope commands:*\n` +
                `• \`.areact on\` — all chats (PM + groups)\n` +
                `• \`.areact pm\` — PMs only\n` +
                `• \`.areact group\` — groups only\n` +
                `• \`.areact both\` — both PM + groups\n` +
                `• \`.areact chat\` — this chat only (per-chat)\n` +
                `• \`.areact removechat\` — remove this chat\n` +
                `• \`.areact pm off\` — disable for PMs\n` +
                `• \`.areact group off\` — disable for groups\n` +
                `• \`.areact off\` — disable everywhere\n\n` +
                `*Emoji commands:*\n` +
                `• \`.areact set 🎉 🚀 ⭐\` — set emojis\n` +
                `• \`.areact reset\` — reset to defaults\n` +
                `• \`.areact list\` — show status`,
            quoted: message
        });
    } catch (error) {
        console.error('Error handling areact command:', error);
        await sock.sendMessage(chatId, { text: '❌ Error controlling auto-reactions', quoted: message });
    }
}

module.exports = {
    addCommandReaction,
    handleAutoreactForMessage,
    handleAreactCommand,
    getAutoReactionConfig: () => autoReactionConfig,
    defaultEmojis,
};
