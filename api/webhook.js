const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const FormData = require('form-data');
const cheerio = require('cheerio');
const path = require('path');

const token = '8668181525:AAEOYjCwqw-khnwcCiOPGAX3PZbauu1DBv4';
const bot = new TelegramBot(token);

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(200).send('Bot is running');
    }

    // Immediately respond to Telegram to prevent timeout retries
    res.status(200).send('OK');

    const { message } = req.body;
    if (!message) return;

    const chatId = message.chat.id;

    // Check if message has a file
    const fileId = message.document?.file_id || 
                   message.photo?.[message.photo.length - 1].file_id || 
                   message.video?.file_id;

    if (!fileId) {
        if (message.text === '/start') {
            await bot.sendMessage(chatId, 'أرسل لي صورة أو ملف وسأقوم برفعه إلى top4top.io');
        }
        return;
    }

    try {
        const statusMsg = await bot.sendMessage(chatId, 'جاري معالجة الملف...');

        // Get file info and download
        const file = await bot.getFile(fileId);
        const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
        
        const response = await axios({
            url: fileUrl,
            method: 'GET',
            responseType: 'arraybuffer',
            timeout: 10000
        });

        const fileName = path.basename(file.file_path);
        const buffer = Buffer.from(response.data);

        await bot.editMessageText('جاري الرفع إلى top4top.io...', {
            chat_id: chatId,
            message_id: statusMsg.message_id
        });

        // Upload to top4top
        const form = new FormData();
        form.append('file_1_', buffer, { filename: fileName });
        form.append('checkr', 'on');
        form.append('submitr', '[ رفع الملفات ]');

        const uploadRes = await axios.post('https://top4top.io/index.php', form, {
            headers: {
                ...form.getHeaders(),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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

        if (links.length === 0) {
            $('textarea, input').each((i, el) => {
                const val = $(el).val();
                if (val && val.startsWith('http')) {
                    links.push({ label: `رابط ${i + 1}`, link: val });
                }
            });
        }

        if (links.length > 0) {
            let responseText = '✅ *تم الرفع بنجاح!*\n\n';
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
            const errorMsg = $('.alert-danger').text().trim() || 'تعذر استخراج الرابط. قد يكون نوع الملف غير مدعوم.';
            await bot.editMessageText(`❌ فشل الرفع: ${errorMsg}`, {
                chat_id: chatId,
                message_id: statusMsg.message_id
            });
        }

    } catch (error) {
        console.error(error);
        await bot.sendMessage(chatId, '❌ حدث خطأ أو انتهى الوقت. Vercel يسمح بـ 10 ثوانٍ فقط للرفع، يرجى تجربة ملفات أصغر حجمًا.');
    }
};
