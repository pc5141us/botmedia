const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const FormData = require('form-data');
const cheerio = require('cheerio');
const path = require('path');

const token = '8668181525:AAEOYjCwqw-khnwcCiOPGAX3PZbauu1DBv4';
const bot = new TelegramBot(token);

const stream = require('stream');
const { promisify } = require('util');
const pipeline = promisify(stream.pipeline);

const USERNAME = 'pc5141us';
const PASSWORD = 'Hm@600100';

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(200).send('Bot is running');
    }

    res.status(200).send('OK');

    const { message } = req.body;
    if (!message) return;

    const chatId = message.chat.id;
    const fileId = message.document?.file_id || 
                   message.photo?.[message.photo.length - 1].file_id || 
                   message.video?.file_id;

    if (!fileId) {
        if (message.text === '/start') {
            await bot.sendMessage(chatId, 'أرسل لي صورة أو ملف وسأقوم برفعه إلى حسابك في top4top.io');
        }
        return;
    }

    try {
        const statusMsg = await bot.sendMessage(chatId, 'جاري تسجيل الدخول والتحضير...');

        // 1. Visit login page to get CSRF tokens
        const loginPageRes = await axios.get('https://top4top.io/login.html', {
            timeout: 5000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $login = cheerio.load(loginPageRes.data);
        const k_form_key = $login('input[name="k_form_key"]').val();
        const k_form_time = $login('input[name="k_form_time"]').val();
        const loginCookies = loginPageRes.headers['set-cookie'] || [];

        // 2. Perform login
        const loginForm = new URLSearchParams();
        loginForm.append('lname', USERNAME);
        loginForm.append('lpass', PASSWORD);
        loginForm.append('k_form_key', k_form_key);
        loginForm.append('k_form_time', k_form_time);
        loginForm.append('remme', '864000');
        loginForm.append('submit', 'دخول');

        const loginRes = await axios.post('https://top4top.io/ucp.php?go=login', loginForm, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0',
                'Cookie': loginCookies.join('; ')
            },
            timeout: 5000,
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 400
        });

        const sessionCookies = [
            ...loginCookies,
            ...(loginRes.headers['set-cookie'] || [])
        ];

        await bot.editMessageText('تم تسجيل الدخول. جاري جلب الملف من تلجرام...', {
            chat_id: chatId,
            message_id: statusMsg.message_id
        });

        // 3. Get file from Telegram
        const file = await bot.getFile(fileId);
        const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
        
        const fileRes = await axios({
            url: fileUrl,
            method: 'GET',
            responseType: 'stream',
            timeout: 8000
        });

        const fileName = path.basename(file.file_path);

        await bot.editMessageText('جاري الرفع إلى حسابك في top4top.io...', {
            chat_id: chatId,
            message_id: statusMsg.message_id
        });

        // 4. Upload to top4top with session cookies
        const form = new FormData();
        form.append('file_1_', fileRes.data, { filename: fileName });
        form.append('checkr', 'on');
        form.append('submitr', '[ رفع الملفات ]');

        const uploadRes = await axios.post('https://top4top.io/index.php', form, {
            headers: {
                ...form.getHeaders(),
                'User-Agent': 'Mozilla/5.0',
                'Cookie': sessionCookies.join('; ')
            },
            timeout: 15000 
        });

        const $ = cheerio.load(uploadRes.data);
        const links = [];
        $('.input-group').each((i, el) => {
            const label = $(el).find('.input-group-addon').text().trim();
            const link = $(el).find('input, textarea').val();
            if (link && link.startsWith('http')) {
                links.push({ label, link });
            }
        });

        if (links.length > 0) {
            let responseText = `✅ *تم الرفع بنجاح إلى حسابك (${USERNAME})*\n\n`;
            links.forEach((item) => {
                const secureLink = item.link.replace(/^http:\/\//i, 'https://');
                responseText += `🔗 *${item.label}:*\n${secureLink}\n\n`;
            });
            await bot.editMessageText(responseText, {
                chat_id: chatId,
                message_id: statusMsg.message_id,
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });
        } else {
            const errorMsg = $('.alert-danger').text().trim() || 'تعذر استخراج الرابط.';
            await bot.editMessageText(`❌ فشل الرفع: ${errorMsg}`, {
                chat_id: chatId,
                message_id: statusMsg.message_id
            });
        }

    } catch (error) {
        console.error(error);
        await bot.sendMessage(chatId, '❌ فشل الاتصال بالموقع أو انتهى الوقت. يرجى تجربة ملفات صغيرة جداً بسبب حدود Vercel (10 ثوانٍ).');
    }
};
