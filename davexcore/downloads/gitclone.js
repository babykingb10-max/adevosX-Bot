const axios = require('axios');
const { createFakeContact, getBotName } = require('../../davelib/fakeContact');

// Store processed message IDs to prevent duplicates
const processedGitMessages = new Set();

async function gitcloneCommand(sock, chatId, message) {
    const fake = createFakeContact(message);
    const botName = getBotName();
    
    try {
        // Check if message has already been processed
        if (processedGitMessages.has(message.key.id)) {
            return;
        }

        // Add message ID to processed set
        processedGitMessages.add(message.key.id);

        // Clean up old message IDs
        setTimeout(() => {
            processedGitMessages.delete(message.key.id);
        }, 5 * 60 * 1000);

        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;

        if (!text) {
            return await sock.sendMessage(chatId, { 
                text: `✦ *${botName}* GitClone\n\nUse: .gitclone <url>\nExample: .gitclone https://github.com/user/repo`
            }, { quoted: fake });
        }

        // Extract URL from command
        const url = text.split(' ').slice(1).join(' ').trim();

        if (!url) {
            return await sock.sendMessage(chatId, { 
                text: `✦ *${botName}*\nProvide a GitHub URL`
            }, { quoted: fake });
        }

        // Check for GitHub URL
        if (!url.includes('github.com')) {
            return await sock.sendMessage(chatId, { 
                text: `✦ *${botName}*\nInvalid GitHub URL`
            }, { quoted: fake });
        }

        // GitHub URL pattern
        const gitRegex = /github\.com[\/:]([^\/:]+)\/(.+)/i;
        const match = url.match(gitRegex);

        if (!match) {
            return await sock.sendMessage(chatId, { 
                text: `✦ *${botName}*\nInvalid GitHub URL format`
            }, { quoted: fake });
        }

        const [, username, repoPath] = match;
        const repo = repoPath.replace(/\.git$/, '');

        // React
        await sock.sendMessage(chatId, {
            react: { text: '⏳', key: message.key }
        });

        try {
            const apiUrl = `https://api.github.com/repos/${username}/${repo}/zipball`;

            // Check if repository exists
            const headResponse = await axios.head(apiUrl, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                }
            });

            // Get filename
            const contentDisposition = headResponse.headers['content-disposition'];
            let filename = `${username}-${repo}.zip`;

            if (contentDisposition) {
                const match = contentDisposition.match(/filename=(?:"(.+)"|([^;]+))/i);
                if (match) {
                    filename = match[1] || match[2] || filename;
                }
            }

            if (!filename.endsWith('.zip')) {
                filename += '.zip';
            }

            // Send the ZIP file
            await sock.sendMessage(chatId, {
                document: { url: apiUrl },
                fileName: filename,
                mimetype: 'application/zip',
                caption: `✦ *${botName}*\n${username}/${repo}`
            }, { quoted: fake });

            // Success reaction
            await sock.sendMessage(chatId, {
                react: { text: '✅', key: message.key }
            });

        } catch (error) {
            console.error('GitHub error:', error.message);

            let errorMessage = "✦ Failed to download repository";
            
            if (error.response?.status === 404) {
                errorMessage = "✦ Repository not found";
            } else if (error.response?.status === 403) {
                errorMessage = "✦ Rate limit exceeded. Try later";
            } else if (error.message.includes('timeout')) {
                errorMessage = "✦ Request timeout";
            } else if (error.code === 'ENOTFOUND') {
                errorMessage = "✦ GitHub unreachable";
            }

            await sock.sendMessage(chatId, { 
                text: errorMessage
            }, { quoted: fake });
            
            await sock.sendMessage(chatId, {
                react: { text: '❌', key: message.key }
            });
        }
    } catch (error) {
        console.error('Gitclone command error:', error.message);
        await sock.sendMessage(chatId, { 
            text: `✦ *${botName}*\nAn error occurred`
        }, { quoted: fake });
    }
}

module.exports = gitcloneCommand;