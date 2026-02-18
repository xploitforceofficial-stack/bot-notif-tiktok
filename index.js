const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason 
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const Parser = require('rss-parser');
const express = require('express');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config();
const parser = new Parser();
const app = express();

// Konfigurasi dari Environment Variables
const TARGET_USERNAME = process.env.TARGET_TIKTOK_USERNAME || 'viunze';
const GROUP_ID = process.env.WA_GROUP_ID || '120363404281995418@g.us';
const NEWSLETTER_ID = process.env.WA_NEWSLETTER_ID || '120363423887149826@newsletter';
const CHECK_INTERVAL = 60000; // 1 Menit

// Express Server untuk Railway (Keep-alive)
app.get('/', (req, res) => res.send('Bot is Running 24/7'));
app.listen(process.env.PORT || 8080, () => console.log('Web Server Ready'));

let lastVideoLink = "";

// Database sederhana untuk menyimpan video terakhir agar tidak duplikat saat restart
if (fs.existsSync('last_video.txt')) {
    lastVideoLink = fs.readFileSync('last_video.txt', 'utf8');
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
        browser: ["TikTok Notifier", "Chrome", "1.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus, mencoba menyambung kembali...', shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('WhatsApp Terhubung!');
            startMonitoring(sock);
        }
    });
}

async function startMonitoring(sock) {
    console.log(`Memulai pemantauan TikTok untuk user: ${TARGET_USERNAME}`);
    
    setInterval(async () => {
        try {
            // Menggunakan proxi RSS TikTok (RSS.app atau urlebird sebagai fallback stabil)
            // TikTok secara native tidak punya RSS, kita gunakan layanan pihak ketiga yang stabil
            const feed = await parser.parseURL(`https://urlebird.com/user/${TARGET_USERNAME}/rss/`);
            
            if (feed.items.length > 0) {
                const latestVideo = feed.items[0];
                const videoLink = latestVideo.link;
                const videoTitle = latestVideo.title || "Video Baru";

                if (videoLink !== lastVideoLink) {
                    console.log('Video baru ditemukan:', videoTitle);
                    
                    const message = `vidio baru nih rek
Judul video: ${videoTitle}
gas mampir:v
${videoLink}`;

                    // Kirim ke Grup
                    await sock.sendMessage(GROUP_ID, { text: message });
                    
                    // Kirim ke Saluran (Newsletter)
                    await sock.sendMessage(NEWSLETTER_ID, { text: message });

                    // Simpan state
                    lastVideoLink = videoLink;
                    fs.writeFileSync('last_video.txt', videoLink);
                }
            }
        } catch (error) {
            console.error('Gagal mengambil data TikTok:', error.message);
        }
    }, CHECK_INTERVAL);
}

connectToWhatsApp();
