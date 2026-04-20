const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const FormData = require('form-data');
const cheerio = require('cheerio');
const path = require('path');

const token = '8668181525:AAEOYjCwqw-khnwcCiOPGAX3PZbauu1DBv4';
const bot = new TelegramBot(token);

const USERNAME = 'pc5141us';
const PASSWORD = 'Hm@600100';

module.exports = async (req, res) => {
    if (req.method !== 'POST' || !req.body.message) {
        return res.status(200).send('OK');
    }

    const message = req.body.message;
    const chatId = message.chat.id;
    const fileId = message.document?.file_id || message.photo?.[message.photo.length - 1].file_id || message.video?.file_id;

    if (!fileId) {
        if (message.text === '/start') await bot.sendMessage(chatId, 'أرسل لي ملفاً لرفعه لحسابك.');
        return;
    }

    try {
        const statusMsg = await bot.sendMessage(chatId, '⚙️ جاري التحضير...');

        // 1. Login Logic
        const loginPage = await axios.get('https://top4top.io/login.html', { timeout: 4000 });
        const $login = cheerio.load(loginPage.data);
        const formKey = $login('input[name="k_form_key"]').val();
        const formTime = $login('input[name="k_form_time"]').val();
        
        const loginData = new URLSearchParams();
        loginData.append('lname', USERNAME);
        loginData.append('lpass', PASSWORD);
        loginData.append('k_form_key', formKey);
        loginData.append('k_form_time', formTime);
        loginData.append('submit', 'دخول');

        const loginRes = await axios.post('https://top4top.io/ucp.php?go=login', loginData, {
            headers: { 'Cookie': loginPage.headers['set-cookie']?.join('; '), 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 4000,
            maxRedirects: 0,
            validateStatus: s => s < 400
        });
        const cookies = [...(loginPage.headers['set-cookie'] || []), ...(loginRes.headers['set-cookie'] || [])].join('; ');

        // 2. Clear to Download & Upload
        await bot.editMessageText('✅ تم الدخول. جاري الرفع...', { chat_id: chatId, message_id: statusMsg.message_id });

        const file = await bot.getFile(fileId);
        const fileStream = await axios({ url: `https://api.telegram.org/file/bot${token}/${file.file_path}`, method: 'GET', responseType: 'stream' });

        const form = new FormData();
        form.append('file_1_', fileStream.data, { filename: path.basename(file.file_path) });
        form.append('checkr', 'on');
        form.append('submitr', '[ رفع الملفات ]');

        const uploadRes = await axios.post('https://top4top.io/index.php', form, {
            headers: { ...form.getHeaders(), 'Cookie': cookies },
            timeout: 7000
        });

        const $ = cheerio.load(uploadRes.data);
        const link = $('.input-group input, .input-group textarea').first().val();

        if (link) {
            await bot.editMessageText(`✅ تم الرفع بنجاح:\n${link.replace('http://', 'https://')}`, { chat_id: chatId, message_id: statusMsg.message_id });
        } else {
            throw new Error('لم يتم العثور على رابط في الصفحة.');
        }

    } catch (error) {
        console.error(error);
        const errorDetail = error.response?.data?.includes('كلمة المرور') ? 'بيانات الدخول غير صحيحة' : error.message;
        await bot.sendMessage(chatId, `❌ خطأ: ${errorDetail}\n(قد يكون الملف كبيراً أو الموقع بطيئاً)`);
    }

    return res.status(200).send('OK');
};
