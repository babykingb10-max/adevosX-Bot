const axios = require('axios');
const { createFakeContact, getBotName } = require('../../davelib/fakeContact');

// Store processed message IDs to prevent duplicates
const processedMessages = new Set();

async function facebookCommand(sock, chatId, message) {
    const fake = createFakeContact(message);
    const botName = getBotName();
    
    try {
        // Prevent duplicate processing
        if (processedMessages.has(message.key.id)) return;
        processedMessages.add(message.key.id);
        setTimeout(() => processedMessages.delete(message.key.id), 5 * 60 * 1000);

        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
        if (!text) {
            return await sock.sendMessage(chatId, { 
                text: `✦ *${botName}* Facebook\n\nUse: .fb <url>\nExample: .fb https://fb.watch/xxxxx`
            }, { quoted: fake });
        }

        const url = text.split(' ').slice(1).join(' ').trim();
        if (!url) {
            return await sock.sendMessage(chatId, { 
                text: `✦ *${botName}*\nProvide a Facebook link`
            }, { quoted: fake });
        }

        const fbPatterns = [
            /https?:\/\/(?:www\.)?facebook\.com\//,
            /https?:\/\/fb\.watch\//,
            /https?:\/\/m\.facebook\.com\//,
            /https?:\/\/web\.facebook\.com\//,
            /https?:\/\/(?:www\.)?facebook\.com\/share\//
        ];

        const isValidUrl = fbPatterns.some(pattern => pattern.test(url));
        if (!isValidUrl) {
            return await sock.sendMessage(chatId, { 
                text: `✦ *${botName}*\nInvalid Facebook link`
            }, { quoted: fake });
        }

        await sock.sendMessage(chatId, {
            react: { text: '⏳', key: message.key }
        });

        try {
            // ✅ Facebook download API
            const apiResponse = await axios.get(
                `https://apiskeith.top/download/fbdown?url=${encodeURIComponent(url)}`
            );
            const data = apiResponse.data;

            if (data && data.status && data.result && data.result.media.sd && data.result.media.hd) {
                const videoUrl = data.result.media.hd || data.result.media.sd;

                await sock.sendMessage(chatId, {
                    video: { url: videoUrl },
                    mimetype: "video/mp4",
                    caption: `✦ *${botName}* - am know invisible 🔥`
                }, { quoted: fake });

                await sock.sendMessage(chatId, {
                    react: { text: '✅', key: message.key }
                });

            } else {
                return await sock.sendMessage(chatId, {
                    text: `✦ *${botName}*\nFailed to fetch video`
                }, { quoted: fake });
            }

        } catch (error) {
            console.error('Error in Facebook API:', error.message || error);
            await sock.sendMessage(chatId, {
                text: `✦ *${botName}*\nFailed to download video`
            }, { quoted: fake });
            
            await sock.sendMessage(chatId, {
                react: { text: '❌', key: message.key }
            });
        }
    } catch (error) {
        console.error('Error in facebookCommand:', error.message || error);
        await sock.sendMessage(chatId, {
            text: `✦ *${botName}*\nAn error occurred`
        }, { quoted: fake });
    }
}

module.exports = facebookCommand;