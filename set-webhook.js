require('dotenv').config();
const axios = require('axios');

const token = '8668181525:AAEOYjCwqw-khnwcCiOPGAX3PZbauu1DBv4';
const url = process.argv[2]; // Passed as argument: node set-webhook.js https://your-app.vercel.app

if (!token || !url) {
    console.error('Usage: node set-webhook.js <YOUR_VERCEL_URL>');
    console.error('Make sure TELEGRAM_BOT_TOKEN is set in .env');
    process.exit(1);
}

const webhookUrl = `${url}/api/webhook`;

axios.get(`https://api.telegram.org/bot${token}/setWebhook?url=${webhookUrl}`)
    .then(res => {
        console.log('Webhook set successfully:', res.data);
    })
    .catch(err => {
        console.error('Error setting webhook:', err.response?.data || err.message);
    });
