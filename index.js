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
const readline = require('readline');

dotenv.config();
const parser = new Parser();
const app = express();

// Konfigurasi dari Environment Variables
const TARGET_USERNAME = process.env.TARGET_TIKTOK_USERNAME || 'viunze';
const GROUP_ID = process.env.WA_GROUP_ID || '120363404281995418@g.us';
const NEWSLETTER_ID = process.env.WA_NEWSLETTER_ID || '120363423887149826@newsletter';
const PHONE_NUMBER = "6285940682068"; // Nomor Anda
const CHECK_INTERVAL = 60000; 

// Setup readline untuk input di terminal
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

// Express Server untuk Railway (Keep-alive)
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
        printQRInTerminal: false, // Dimatikan sesuai warning
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    // Logika Pairing Code
    if (!sock.authState.creds.registered) {
        console.log(`Menghubungkan ke nomor: ${PHONE_NUMBER}`);
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(PHONE_NUMBER);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log(`\n\x1b[32mKODE PAIRING ANDA:\x1b[0m \x1b[1m${code}\x1b[0m\n`);
                console.log("Buka WhatsApp > Perangkat Tertaut > Tautkan Perangkat > Tautkan dengan nomor telepon saja.");
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
            console.log('WhatsApp Terhubung (Pairing Sukses)!');
            startMonitoring(sock);
        }
    });
}

async function startMonitoring(sock) {
    console.log(`Monitoring TikTok: ${TARGET_USERNAME}`);
    
    setInterval(async () => {
        try {
            const feed = await parser.parseURL(`https://urlebird.com/user/${TARGET_USERNAME}/rss/`);
            if (feed.items.length > 0) {
                const latestVideo = feed.items[0];
                const videoLink = latestVideo.link;
                const videoTitle = latestVideo.title || "Video Baru";

                if (videoLink !== lastVideoLink) {
                    const message = `vidio baru nih rek\nJudul video: ${videoTitle}\ngas mampir:v\n${videoLink}`;
                    
                    await sock.sendMessage(GROUP_ID, { text: message });
                    await sock.sendMessage(NEWSLETTER_ID, { text: message });

                    lastVideoLink = videoLink;
                    fs.writeFileSync('last_video.txt', videoLink);
                    console.log('Notifikasi terkirim!');
                }
            }
        } catch (error) {
            console.log('RSS Check failed, retrying next minute...');
        }
    }, CHECK_INTERVAL);
}

connectToWhatsApp();
