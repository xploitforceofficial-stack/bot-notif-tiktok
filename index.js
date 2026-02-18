const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const Parser = require('rss-parser');
const express = require('express');
const dotenv = require('dotenv');
const fs = require('fs');
const axios = require('axios');

dotenv.config();
const parser = new Parser({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8'
    }
});
const app = express();

const TARGET_USERNAME = process.env.TARGET_TIKTOK_USERNAME || 'viunze';
const GROUP_ID = process.env.WA_GROUP_ID || '120363404281995418@g.us';
const NEWSLETTER_ID = process.env.WA_NEWSLETTER_ID || '120363423887149826@newsletter';
const PHONE_NUMBER = "6285940682068";
const CHECK_INTERVAL = 60000; 

app.get('/', (req, res) => res.send('Bot is Running 24/7'));
app.listen(process.env.PORT || 8080, () => console.log('Web Server Ready'));

let lastVideoLink = "";
if (fs.existsSync('last_video.txt')) {
    lastVideoLink = fs.readFileSync('last_video.txt', 'utf8');
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    if (!sock.authState.creds.registered) {
        console.log(`Menghubungkan ke nomor: ${PHONE_NUMBER}`);
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(PHONE_NUMBER);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log(`\n\x1b[32mKODE PAIRING ANDA:\x1b[0m \x1b[1m${code}\x1b[0m\n`);
            } catch (err) {
                console.error("Gagal mendapatkan pairing code", err);
            }
        }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('WhatsApp Terhubung!');
            startMonitoring(sock);
        }
    });
}

async function startMonitoring(sock) {
    console.log(`Monitoring TikTok: ${TARGET_USERNAME}`);
    
    // Gunakan beberapa provider RSS cadangan jika satu gagal
    const rssProviders = [
        `https://urlebird.com/user/${TARGET_USERNAME}/rss/`,
        `https://clout.wiki/user/${TARGET_USERNAME}/rss/`
    ];

    setInterval(async () => {
        let success = false;
        
        for (const url of rssProviders) {
            if (success) break;
            
            try {
                const feed = await parser.parseURL(url);
                if (feed.items && feed.items.length > 0) {
                    const latestVideo = feed.items[0];
                    const videoLink = latestVideo.link;
                    const videoTitle = latestVideo.title || "Video Baru";

                    if (videoLink !== lastVideoLink) {
                        const message = `vidio baru nih rek\nJudul video: ${videoTitle}\ngas mampir:v\n${videoLink}`;
                        
                        await sock.sendMessage(GROUP_ID, { text: message });
                        await sock.sendMessage(NEWSLETTER_ID, { text: message });

                        lastVideoLink = videoLink;
                        fs.writeFileSync('last_video.txt', videoLink);
                        console.log('Notifikasi video baru terkirim!');
                    }
                    success = true;
                }
            } catch (error) {
                // Lanjut ke provider berikutnya jika gagal
            }
        }

        if (!success) {
            console.log('Semua provider RSS gagal. Mencoba lagi menit depan...');
        }
    }, CHECK_INTERVAL);
}

connectToWhatsApp();
