const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const FormData = require('form-data');
const cheerio = require('cheerio');
const path = require('path');

const token = '8668181525:AAEOYjCwqw-khnwcCiOPGAX3PZbauu1DBv4';
const bot = new TelegramBot(token);

const USERNAME = 'pc5141us';
const PASSWORD = 'Hm@600100';

let cachedCookies = null;
let lastLoginTime = 0;

module.exports = async (req, res) => {
    if (req.method !== 'POST' || !req.body.message) {
        return res.status(200).send('OK');
    }

    const message = req.body.message;
    const chatId = message.chat.id;
    const file = message.document || (message.photo ? message.photo[message.photo.length - 1] : null) || message.video;
    const fileId = file?.file_id;
    const fileSize = file?.file_size || 0;

    if (!fileId) {
        if (message.text === '/start') await bot.sendMessage(chatId, 'أرسل لي ملفاً لرفعه لحسابك.');
        return res.status(200).send('OK');
    }

    // Telegram Bot API limit for getFile is 20MB
    if (fileSize > 20 * 1024 * 1024) {
        await bot.sendMessage(chatId, '❌ حجم الملف كبير جداً (أكبر من 20 ميجابايت).\nللأسف، لا يمكن للبوتات العادية التعامل مع ملفات أكبر من 20 ميجابايت بسبب قيود تيليجرام.');
        return res.status(200).send('OK');
    }

    try {
        const currentTime = Date.now();
        let cookies = cachedCookies;

        // Check if we need to login (if no cookies or older than 24 hours)
        if (!cookies || (currentTime - lastLoginTime) > 86400000) {
            const statusMsg = await bot.sendMessage(chatId, '⚙️ جاري تسجيل الدخول (لأول مرة)...');
            
            const loginPage = await axios.get('https://top4top.io/login.html', { timeout: 5000 });
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
                headers: { 
                    'Cookie': loginPage.headers['set-cookie']?.join('; '), 
                    'Content-Type': 'application/x-www-form-urlencoded' 
                },
                timeout: 5000,
                maxRedirects: 0,
                validateStatus: s => s < 400
            });
            
            cookies = [...(loginPage.headers['set-cookie'] || []), ...(loginRes.headers['set-cookie'] || [])].join('; ');
            cachedCookies = cookies;
            lastLoginTime = currentTime;
            
            await bot.editMessageText('✅ تم تسجيل الدخول وحفظ الجلسة. جاري الرفع...', { chat_id: chatId, message_id: statusMsg.message_id });
            // Processing will continue below with these cookies
        }

        const statusMsg = await bot.sendMessage(chatId, '⏳ جاري الرفع المباشر...');

        const file = await bot.getFile(fileId);
        const fileStream = await axios({ 
            url: `https://api.telegram.org/file/bot${token}/${file.file_path}`, 
            method: 'GET', 
            responseType: 'stream' 
        });

        const form = new FormData();
        form.append('file_1_', fileStream.data, { filename: path.basename(file.file_path) });
        form.append('checkr', 'on');
        form.append('submitr', '[ رفع الملفات ]');

        const uploadRes = await axios.post('https://top4top.io/index.php', form, {
            headers: { ...form.getHeaders(), 'Cookie': cookies },
            timeout: 10000 
        });

        const $ = cheerio.load(uploadRes.data);
        const boxes = $('.all_boxes');
        let link = '';

        if (boxes.length > 0) {
            if (boxes.length >= 3 && boxes.eq(2).val().match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                link = boxes.eq(2).val();
            } else {
                link = boxes.first().val();
            }
        }

        if (link) {
            await bot.editMessageText(`✅ تم الرفع بنجاح:\n${link.replace('http://', 'https://')}`, { 
                chat_id: chatId, 
                message_id: statusMsg.message_id 
            });
        } else {
            const fallbackLink = $('.input-group input, .input-group textarea').first().val();
            if (fallbackLink) {
                 await bot.editMessageText(`✅ تم الرفع بنجاح:\n${fallbackLink.replace('http://', 'https://')}`, { 
                    chat_id: chatId, 
                    message_id: statusMsg.message_id 
                });
            } else {
                throw new Error('لم يتم العثور على رابط.');
            }
        }

    } catch (error) {
        console.error(error);
        await bot.sendMessage(chatId, `❌ خطأ أو انتهى الوقت: ${error.message}`);
    }

    return res.status(200).send('OK');
};
