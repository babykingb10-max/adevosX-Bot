const { GoogleGenerativeAI } = require('@google/generative-ai');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const { createFakeContact, getBotName } = require('../../davelib/fakeContact');

async function downloadMedia(message) {
    try {
        const stream = await downloadContentFromMessage(message, 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        return buffer;
    } catch (error) {
        console.error('Download error:', error);
        throw error;
    }
}

async function nightCommand(sock, chatId, message, text) {
    const fake = createFakeContact(message);
    const botName = getBotName();
    
    try {
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted) {
            await sock.sendMessage(chatId, {
                text: `✦ *${botName}* Night\n\nReply to an image with .night`
            }, { quoted: fake });
            return;
        }

        const imageMessage = quoted.imageMessage;
        if (!imageMessage) {
            await sock.sendMessage(chatId, {
                text: `✦ *${botName}*\nReply to an image`
            }, { quoted: fake });
            return;
        }

        const mimeType = imageMessage.mimetype;
        if (!mimeType || !/image\/(jpe?g|png)/.test(mimeType)) {
            await sock.sendMessage(chatId, {
                text: `✦ *${botName}*\nOnly JPEG/PNG images supported`
            }, { quoted: fake });
            return;
        }

        await sock.sendMessage(chatId, { 
            text: `✦ *${botName}* - am know invisible 🔥\n\nProcessing image...`
        }, { quoted: fake });

        // Download the image
        const buffer = await downloadMedia(imageMessage);
        const base64Image = buffer.toString('base64');
        const promptText = text || "ubah jadi malam hari";

        const genAI = new GoogleGenerativeAI("AIzaSyDE7R-5gnjgeqYGSMGiZVjA5VkSrQvile8");
        
        const contents = [
            { text: promptText },
            {
                inlineData: {
                    mimeType: mimeType,
                    data: base64Image
                }
            }
        ];
        
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash-exp-image-generation",
            generationConfig: {
                responseModalities: ["Text", "Image"]
            },
        });
        
        const response = await model.generateContent(contents);
        
        let resultImage = null;
        
        for (const part of response.response.candidates[0].content.parts) {
            if (part.inlineData) {
                const imageData = part.inlineData.data;
                resultImage = Buffer.from(imageData, "base64");
                break;
            }
        }
        
        if (resultImage) {
            const tempPath = path.join(process.cwd(), "temp", `night_${Date.now()}.png`);
            
            if (!fs.existsSync(path.join(process.cwd(), "temp"))) {
                fs.mkdirSync(path.join(process.cwd(), "temp"), { recursive: true });
            }
            
            fs.writeFileSync(tempPath, resultImage);
            
            await sock.sendMessage(chatId, { 
                image: { url: tempPath },
                caption: `✦ *${botName}* - am know invisible 🔥`
            }, { quoted: fake });
            
            setTimeout(() => {
                try {
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                } catch (e) {}
            }, 30000);
        } else {
            await sock.sendMessage(chatId, {
                text: `✦ *${botName}*\nFailed to edit image`
            }, { quoted: fake });
        }

    } catch (error) {
        console.error('Error in night command:', error);
        await sock.sendMessage(chatId, {
            text: `✦ *${botName}*\nError processing image`
        }, { quoted: fake });
    }
}

async function prettyCommand(sock, chatId, message, text) {
    const fake = createFakeContact(message);
    const botName = getBotName();
    
    try {
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted) {
            await sock.sendMessage(chatId, {
                text: `✦ *${botName}* Pretty\n\nReply to an image with .pretty`
            }, { quoted: fake });
            return;
        }

        const imageMessage = quoted.imageMessage;
        if (!imageMessage) {
            await sock.sendMessage(chatId, {
                text: `✦ *${botName}*\nReply to an image`
            }, { quoted: fake });
            return;
        }

        const mimeType = imageMessage.mimetype;
        if (!mimeType || !/image\/(jpe?g|png)/.test(mimeType)) {
            await sock.sendMessage(chatId, {
                text: `✦ *${botName}*\nOnly JPEG/PNG images supported`
            }, { quoted: fake });
            return;
        }

        await sock.sendMessage(chatId, { 
            text: `✦ *${botName}* - am know invisible 🔥\n\nProcessing image...`
        }, { quoted: fake });

        const buffer = await downloadMedia(imageMessage);
        const base64Image = buffer.toString('base64');
        const promptText = text || "edit wajah karakter menjadi wajah orang Korea";

        const genAI = new GoogleGenerativeAI("AIzaSyDE7R-5gnjgeqYGSMGiZVjA5VkSrQvile8");
        
        const contents = [
            { text: promptText },
            {
                inlineData: {
                    mimeType: mimeType,
                    data: base64Image
                }
            }
        ];
        
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash-exp-image-generation",
            generationConfig: {
                responseModalities: ["Text", "Image"]
            },
        });
        
        const response = await model.generateContent(contents);
        
        let resultImage = null;
        
        for (const part of response.response.candidates[0].content.parts) {
            if (part.inlineData) {
                const imageData = part.inlineData.data;
                resultImage = Buffer.from(imageData, "base64");
                break;
            }
        }
        
        if (resultImage) {
            const tempPath = path.join(process.cwd(), "temp", `pretty_${Date.now()}.png`);
            
            if (!fs.existsSync(path.join(process.cwd(), "temp"))) {
                fs.mkdirSync(path.join(process.cwd(), "temp"), { recursive: true });
            }
            
            fs.writeFileSync(tempPath, resultImage);
            
            await sock.sendMessage(chatId, { 
                image: { url: tempPath },
                caption: `✦ *${botName}* - am know invisible 🔥`
            }, { quoted: fake });
            
            setTimeout(() => {
                try {
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                } catch (e) {}
            }, 30000);
        } else {
            await sock.sendMessage(chatId, {
                text: `✦ *${botName}*\nFailed to edit image`
            }, { quoted: fake });
        }

    } catch (error) {
        console.error('Error in pretty command:', error);
        await sock.sendMessage(chatId, {
            text: `✦ *${botName}*\nError processing image`
        }, { quoted: fake });
    }
}

async function uglyCommand(sock, chatId, message, text) {
    const fake = createFakeContact(message);
    const botName = getBotName();
    
    try {
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted) {
            await sock.sendMessage(chatId, {
                text: `✦ *${botName}* Ugly\n\nReply to an image with .ugly`
            }, { quoted: fake });
            return;
        }

        const imageMessage = quoted.imageMessage;
        if (!imageMessage) {
            await sock.sendMessage(chatId, {
                text: `✦ *${botName}*\nReply to an image`
            }, { quoted: fake });
            return;
        }

        const mimeType = imageMessage.mimetype;
        if (!mimeType || !/image\/(jpe?g|png)/.test(mimeType)) {
            await sock.sendMessage(chatId, {
                text: `✦ *${botName}*\nOnly JPEG/PNG images supported`
            }, { quoted: fake });
            return;
        }

        await sock.sendMessage(chatId, { 
            text: `✦ *${botName}* - am know invisible 🔥\n\nProcessing image...`
        }, { quoted: fake });

        const buffer = await downloadMedia(imageMessage);
        const base64Image = buffer.toString('base64');
        const promptText = text || "edit wajah karakter menjadi jelek";

        const genAI = new GoogleGenerativeAI("AIzaSyDE7R-5gnjgeqYGSMGiZVjA5VkSrQvile8");
        
        const contents = [
            { text: promptText },
            {
                inlineData: {
                    mimeType: mimeType,
                    data: base64Image
                }
            }
        ];
        
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash-exp-image-generation",
            generationConfig: {
                responseModalities: ["Text", "Image"]
            },
        });
        
        const response = await model.generateContent(contents);
        
        let resultImage = null;
        
        for (const part of response.response.candidates[0].content.parts) {
            if (part.inlineData) {
                const imageData = part.inlineData.data;
                resultImage = Buffer.from(imageData, "base64");
                break;
            }
        }
        
        if (resultImage) {
            const tempPath = path.join(process.cwd(), "temp", `ugly_${Date.now()}.png`);
            
            if (!fs.existsSync(path.join(process.cwd(), "temp"))) {
                fs.mkdirSync(path.join(process.cwd(), "temp"), { recursive: true });
            }
            
            fs.writeFileSync(tempPath, resultImage);
            
            await sock.sendMessage(chatId, { 
                image: { url: tempPath },
                caption: `✦ *${botName}* - am know invisible 🔥`
            }, { quoted: fake });
            
            setTimeout(() => {
                try {
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                } catch (e) {}
            }, 30000);
        } else {
            await sock.sendMessage(chatId, {
                text: `✦ *${botName}*\nFailed to edit image`
            }, { quoted: fake });
        }

    } catch (error) {
        console.error('Error in ugly command:', error);
        await sock.sendMessage(chatId, {
            text: `✦ *${botName}*\nError processing image`
        }, { quoted: fake });
    }
}

module.exports = {
    nightCommand,
    prettyCommand,
    uglyCommand
};