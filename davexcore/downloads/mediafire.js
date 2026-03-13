const axios = require('axios');
const cheerio = require('cheerio');
const { createFakeContact, getBotName } = require('../../davelib/fakeContact');

const MIME_MAP = {
    'zip': 'application/zip',
    'rar': 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
    'tar': 'application/x-tar',
    'gz': 'application/gzip',
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'txt': 'text/plain',
    'csv': 'text/csv',
    'json': 'application/json',
    'xml': 'application/xml',
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'py': 'text/x-python',
    'java': 'text/x-java-source',
    'cpp': 'text/x-c++src',
    'c': 'text/x-csrc',
    'h': 'text/x-chdr',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'flac': 'audio/flac',
    'aac': 'audio/aac',
    'mp4': 'video/mp4',
    'mkv': 'video/x-matroska',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'wmv': 'video/x-ms-wmv',
    'flv': 'video/x-flv',
    'webm': 'video/webm',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'svg': 'image/svg+xml',
    'webp': 'image/webp',
    'ico': 'image/x-icon',
    'apk': 'application/vnd.android.package-archive',
    'exe': 'application/x-msdownload',
    'dmg': 'application/x-apple-diskimage',
    'iso': 'application/x-iso9660-image',
    'deb': 'application/x-deb',
    'rpm': 'application/x-rpm',
    'ttf': 'font/ttf',
    'otf': 'font/otf',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'sql': 'application/sql',
    'db': 'application/x-sqlite3',
    'psd': 'image/vnd.adobe.photoshop',
    'ai': 'application/postscript',
    'eps': 'application/postscript',
};

function getMimeType(ext) {
    if (!ext) return 'application/octet-stream';
    return MIME_MAP[ext.toLowerCase()] || 'application/octet-stream';
}

async function MediaFire(url, options) {
    try {
        options = options || {};
        const res = await axios.get(url, { ...options, timeout: 15000 });
        const $ = cheerio.load(res.data);
        const link = $('a#downloadButton').attr('href');
        const size = $('a#downloadButton').text().replace('Download', '').replace('(', '').replace(')', '').replace(/\n/g, '').trim();
        const seplit = link.split('/');
        const nama = seplit[5];
        const ext = nama.split('.').pop();
        return [{ nama, ext, size, link }];
    } catch (err) {
        return err;
    }
}

async function mediafireCommand(sock, chatId, message) {
    const fake = createFakeContact(message);
    const botName = getBotName();

    const text = message.message?.conversation || 
                 message.message?.extendedTextMessage?.text || '';

    const query = text.split(' ').slice(1).join(' ').trim();

    if (!query) {
        return sock.sendMessage(chatId, { 
            text: `*${botName}*\nUsage: .mediafire <link>\nExample: .mediafire https://www.mediafire.com/file/abc123/file.zip`
        }, { quoted: fake });
    }

    if (!query.includes('mediafire.com')) {
        return sock.sendMessage(chatId, { 
            text: `*${botName}*\nThat doesn't look like a MediaFire link.`
        }, { quoted: fake });
    }

    try {
        const fileInfo = await MediaFire(query);

        if (!fileInfo || !fileInfo.length || fileInfo instanceof Error) {
            return sock.sendMessage(chatId, { 
                text: `*${botName}*\nFailed to download. File may have been removed or link is invalid.`
            }, { quoted: fake });
        }

        const info = fileInfo[0];
        const mimetype = getMimeType(info.ext);

        await sock.sendMessage(
            chatId,
            {
                document: { url: info.link },
                fileName: info.nama,
                mimetype: mimetype,
                caption: `*${botName} MediaFire*\n\nFile: ${info.nama}\nSize: ${info.size}\nType: ${info.ext || 'Unknown'}`,
            },
            { quoted: fake }
        );

    } catch (error) {
        console.error("MediaFire Error:", error);
        await sock.sendMessage(chatId, { 
            text: `*${botName}*\nFailed to download: ${error.message}`
        }, { quoted: fake });
    }
}

module.exports = mediafireCommand;
