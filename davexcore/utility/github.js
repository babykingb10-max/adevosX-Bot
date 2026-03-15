const moment = require('moment-timezone');
const axios = require('axios');
const { createFakeContact, getBotName } = require('../../davelib/fakeContact');
const { sendInteractiveMessage } = require('gifted-btns');
const { storeTiktokPending } = require('../../davelib/tiktokPending');

const githubPending = new Map();
function storeGithubPending(chatId, data) {
    githubPending.set(chatId, { ...data, ts: Date.now() });
    setTimeout(() => githubPending.delete(chatId), 5 * 60 * 1000);
}
function getGithubPending(chatId) {
    const e = githubPending.get(chatId);
    if (!e || Date.now() - e.ts > 5 * 60 * 1000) { githubPending.delete(chatId); return null; }
    return e;
}
function clearGithubPending(chatId) { githubPending.delete(chatId); }

async function githubCommand(sock, chatId, message) {
    try {
        const fake = createFakeContact(message);
        const botName = getBotName();

        await sock.sendMessage(chatId, { react: { text: '🌟', key: message.key } });

        const res = await axios.get('https://api.github.com/repos/adevosxtech/adevosX-Bot', {
            headers: { 'User-Agent': 'DAVE-X' },
            timeout: 10000
        });

        const repo = res.data;
        const zipUrl = `https://github.com/adevosxtech/adevosX-Bot/archive/refs/heads/main.zip`;

        storeGithubPending(chatId, { zipUrl, name: repo.name });

        const infoCard = `┌─ *${botName} REPOSITORY* ─┐\n│\n│ Name: ${repo.name}\n│ Owner: ${repo.owner.login}\n│ Private: ${repo.private ? 'Yes' : 'No'}\n│ Size: ${(repo.size / 1024).toFixed(2)} MB\n│ Stars: ⭐ ${repo.stargazers_count}\n│ Forks: 🍴 ${repo.forks_count}\n│ Watchers: 👁 ${repo.watchers_count}\n│ Updated: ${moment(repo.updated_at).format('DD/MM/YY - HH:mm')}\n│ URL: ${repo.html_url}\n│\n└─────────────────────┘`;

        try {
            await sendInteractiveMessage(sock, chatId, {
                text: infoCard,
                footer: botName,
                interactiveButtons: [{
                    name: 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title: 'Actions',
                        sections: [{
                            title: 'Download',
                            rows: [
                                { id: 'github_zip', title: 'Download ZIP', description: 'Get the source code as ZIP' }
                            ]
                        }]
                    })
                }]
            });
        } catch {
            await sock.sendMessage(chatId, {
                text: `${infoCard}\n\nReply *zip* to download source code`
            }, { quoted: fake });
        }

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

    } catch (error) {
        console.error('GitHub error:', error.message);
        const fake = createFakeContact(message);
        await sock.sendMessage(chatId, {
            text: `✦ Failed to fetch repository info\n${error.message}`
        }, { quoted: fake });
    }
}

async function processGithubZip(sock, chatId, message) {
    const fake = createFakeContact(message);
    const botName = getBotName();

    const pending = getGithubPending(chatId);
    if (!pending) {
        return sock.sendMessage(chatId, {
            text: `*${botName}*\nNo pending repo. Use .github first.`
        }, { quoted: fake });
    }
    clearGithubPending(chatId);

    await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });

    try {
        const path = require('path');
        const fs = require('fs');
        const zipPath = path.join(require('os').tmpdir(), `davex-repo-${Date.now()}.zip`);

        const zipResponse = await axios.get(pending.zipUrl, {
            responseType: 'arraybuffer',
            headers: { 'User-Agent': 'DAVE-X' },
            timeout: 60000
        });

        fs.writeFileSync(zipPath, zipResponse.data);

        await sock.sendMessage(chatId, {
            document: fs.readFileSync(zipPath),
            mimetype: 'application/zip',
            fileName: `DAVE-X-${moment().format('DDMMYY')}.zip`,
            caption: `✦ *${botName}* Source Code`
        }, { quoted: fake });

        try { fs.unlinkSync(zipPath); } catch {}

        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

    } catch (error) {
        console.error('GitHub ZIP error:', error.message);
        await sock.sendMessage(chatId, {
            text: `*${botName}*\nFailed to download ZIP: ${error.message}`
        }, { quoted: fake });
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
    }
}

module.exports = { githubCommand, processGithubZip, getGithubPending, clearGithubPending };
