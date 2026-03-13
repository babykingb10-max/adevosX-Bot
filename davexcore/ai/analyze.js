const fetch = require('node-fetch');
const { createFakeContact, getBotName } = require('../../davelib/fakeContact');
async function analyzeCommand(sock, chatId, message, text, prefix) {
    try {
        const fake = createFakeContact(message);
        
        // Get quoted message
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        
        // Check if it's a reply to media or text
        const hasQuotedImage = quoted?.imageMessage;
        const hasQuotedVideo = quoted?.videoMessage;
        const hasQuotedDocument = quoted?.documentMessage;
        const hasQuotedText = quoted?.conversation || quoted?.extendedTextMessage?.text;
        
        const apiKey = "AIzaSyDE7R-5gnjgeqYGSMGiZVjA5VkSrQvile8"; // Using your Gemini API key
        
        // Send processing message
        const processingMsg = await sock.sendMessage(chatId, {
            text: "*AI Analysis in Progress...*\n\nAnalyzing content, please wait..."
        }, { quoted: fake });
        
        let analysisResult = "";
        
        if (hasQuotedImage) {
            analysisResult = await analyzeImage(quoted, text, apiKey);
        } else if (hasQuotedVideo) {
            analysisResult = await analyzeVideo(quoted, text, apiKey);
        } else if (hasQuotedDocument) {
            analysisResult = await analyzeDocument(quoted, text, apiKey);
        } else if (hasQuotedText) {
            analysisResult = await analyzeText(quoted, text, apiKey);
        } else if (text && text.trim() !== '') {
            analysisResult = await analyzeQuery(text, apiKey);
        } else {
            // Delete processing message
            try { await sock.sendMessage(chatId, { delete: processingMsg.key }); } catch(e) {}
            
            await sock.sendMessage(chatId, {
                text: `🔬 *AI Content Analyzer*\n\nI can analyze various types of content:\n\n` +
                      `• *Images* - Reply .analyze to an image\n` +
                      `• *Videos* - Reply .analyze to a video\n` +
                      `• *Documents* - Reply .analyze to a document\n` +
                      `• *Text* - Reply .analyze to text or use .analyze <text>\n\n` +
                      `*Examples:*\n` +
                      `• Reply .analyze to a photo\n` +
                      `• .analyze What is in this picture?\n` +
                      `• .analyze sentiment This is amazing!\n\n` +
                      `*Analysis Types:*\n` +
                      `- sentiment (analyze emotions)\n` +
                      `- summary (summarize content)\n` +
                      `- keywords (extract key topics)\n` +
                      `- grammar (check grammar/spelling)\n` +
                      `- complexity (analyze readability)`
            }, { quoted: fake });
            return;
        }
        
        // Delete processing message
        try { await sock.sendMessage(chatId, { delete: processingMsg.key }); } catch(e) {}
        
        // Format and send result
        const formattedResult = `🔬 *AI ANALYSIS REPORT*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n${analysisResult}\n\n━━━━━━━━━━━━━━━━━━━━━━━\n🧠 *Analyzed by ADEVOS-X BOT AI*\n⚡ Powered by Gemini AI`;
        
        await sock.sendMessage(chatId, { text: formattedResult }, { quoted: fake });
        
    } catch (error) {
        console.error('Analyze command error:', error);
        const fake = createFakeContact(message);
        await sock.sendMessage(chatId, {
            text: `❌ *Analysis Failed*\n\nError: ${error.message}\n\nPlease try again with different content.`
        }, { quoted: fake });
    }
}

// Helper functions
async function analyzeImage(quotedMsg, query, apiKey) {
    try {
        const imageCaption = quotedMsg.imageMessage?.caption || "an image";
        const prompt = query || "Describe this image in detail. What do you see? Be specific about objects, colors, scene, mood, and any text present.";
        
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `${prompt}\n\nNote: I cannot see the actual image, but here's the description: "${imageCaption}"`
                    }]
                }]
            })
        });
        
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "Could not analyze image.";
        
    } catch (error) {
        throw new Error(`Image analysis failed: ${error.message}`);
    }
}

async function analyzeVideo(quotedMsg, query, apiKey) {
    const videoCaption = quotedMsg.videoMessage?.caption || "a video";
    const videoSeconds = quotedMsg.videoMessage?.seconds || 'unknown';
    const prompt = query || "Analyze this video. What might it contain? Consider duration, possible content, and context.";
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: `${prompt}\n\nVideo description: "${videoCaption}"\nDuration: ${videoSeconds} seconds`
                }]
            }]
        })
    });
    
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Could not analyze video.";
}

async function analyzeDocument(quotedMsg, query, apiKey) {
    const docName = quotedMsg.documentMessage?.fileName || "a document";
    const fileSize = quotedMsg.documentMessage?.fileLength ? 
        Math.round(quotedMsg.documentMessage.fileLength / 1024) + "KB" : "unknown size";
    const mimeType = quotedMsg.documentMessage?.mimetype || "unknown type";
    
    const prompt = query || `Analyze this document.\n\nDocument info:\n- Name: ${docName}\n- Type: ${mimeType}\n- Size: ${fileSize}\n\nWhat kind of document might this be? What could it contain?`;
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: prompt
                }]
            }]
        })
    });
    
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Could not analyze document.";
}

async function analyzeText(quotedMsg, query, apiKey) {
    let textContent = "";
    
    if (quotedMsg.conversation) {
        textContent = quotedMsg.conversation;
    } else if (quotedMsg.extendedTextMessage?.text) {
        textContent = quotedMsg.extendedTextMessage.text;
    }
    
    if (!textContent) {
        return "No text content found to analyze.";
    }
    
    const analysisType = query?.toLowerCase().split(' ')[0] || "general";
    let prompt = "";
    
    switch (analysisType) {
        case "sentiment":
            prompt = `Analyze the sentiment of this text:\n\n"${textContent}"\n\nIs it positive, negative, or neutral? What emotions are expressed?`;
            break;
        case "summary":
            prompt = `Summarize this text concisely:\n\n"${textContent}"`;
            break;
        case "keywords":
            prompt = `Extract key topics and keywords from this text:\n\n"${textContent}"`;
            break;
        case "grammar":
            prompt = `Check grammar and spelling in this text:\n\n"${textContent}"\n\nProvide corrections and suggestions.`;
            break;
        case "complexity":
            prompt = `Analyze the reading complexity of this text:\n\n"${textContent}"\n\nWhat reading level is it? Is it easy or difficult to understand?`;
            break;
        case "tone":
            prompt = `Analyze the tone and style of this text:\n\n"${textContent}"\n\nIs it formal, informal, academic, casual, etc.?`;
            break;
        default:
            prompt = `Analyze this text comprehensively:\n\n"${textContent}"\n\nProvide insights about:\n1. Main topic/theme\n2. Key points\n3. Writing style\n4. Potential purpose/audience\n5. Any notable patterns or insights`;
    }
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: prompt
                }]
            }]
        })
    });
    
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Could not analyze text.";
}

async function analyzeQuery(query, apiKey) {
    const prompt = `Analyze this query or content: "${query}"\n\nProvide a comprehensive analysis including:\n1. Main topic/request\n2. Key elements to consider\n3. Potential approaches or solutions\n4. Related concepts\n5. Recommendations or next steps`;
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: prompt
                }]
            }]
        })
    });
    
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Could not analyze query.";
}

module.exports = {
    analyzeCommand
};