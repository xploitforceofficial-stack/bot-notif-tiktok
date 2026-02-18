const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const express = require('express');
const dotenv = require('dotenv');
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

dotenv.config();
const app = express();

// Konfigurasi
const TARGET_USERNAME = process.env.TARGET_TIKTOK_USERNAME || 'viunze';
const GROUP_ID = process.env.WA_GROUP_ID || '120363404281995418@g.us';
const NEWSLETTER_ID = process.env.WA_NEWSLETTER_ID || '120363423887149826@newsletter';
const PHONE_NUMBER = "6285940682068";
const CHECK_INTERVAL = 60000; 

app.get('/', (req, res) => res.send('Bot Aktif 24 Jam'));
app.listen(process.env.PORT || 8080, () => console.log('Web Server Ready'));

let lastVideoId = "";
if (fs.existsSync('last_video.txt')) {
    lastVideoId = fs.readFileSync('last_video.txt', 'utf8');
}

async function getLatestTikTokVideo(username) {
    try {
        // Menggunakan Urlebird sebagai sumber scraping utama (tanpa RSS)
        const url = `https://urlebird.com/user/${username}/`;
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(data);
        const firstVideoBox = $('.thumb-video').first();
        const videoLink = firstVideoBox.find('a').attr('href');
        const videoTitle = firstVideoBox.find('img').attr('alt') || "Video Baru";

        if (videoLink) {
            return {
                id: videoLink, // Menggunakan link sebagai ID unik
                link: videoLink,
                title: videoTitle
            };
        }
        return null;
    } catch (error) {
        console.error('Scraping Error:', error.message);
        return null;
    }
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
    console.log(`Monitoring TikTok Scraper: ${TARGET_USERNAME}`);
    
    setInterval(async () => {
        const video = await getLatestTikTokVideo(TARGET_USERNAME);
        
        if (video && video.id !== lastVideoId) {
            console.log('Video baru ditemukan:', video.title);
            
            const message = `vidio baru nih rek\nJudul video: ${video.title}\ngas mampir:v\n${video.link}`;
            
            try {
                // Kirim ke Grup
                await sock.sendMessage(GROUP_ID, { text: message });
                // Kirim ke Saluran
                await sock.sendMessage(NEWSLETTER_ID, { text: message });

                lastVideoId = video.id;
                fs.writeFileSync('last_video.txt', video.id);
                console.log('Pesan otomatis terkirim!');
            } catch (e) {
                console.error('Gagal mengirim pesan WA:', e.message);
            }
        }
    }, CHECK_INTERVAL);
}

connectToWhatsApp();
