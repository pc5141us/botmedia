require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const FormData = require('form-data');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is missing in .env file');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

console.log('Bot is running...');

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    // Check if message has a file (photo, document, or video)
    const fileId = msg.document?.file_id || 
                   msg.photo?.[msg.photo.length - 1].file_id || 
                   msg.video?.file_id;

    if (!fileId) {
        if (msg.text === '/start') {
            bot.sendMessage(chatId, 'أرسل لي صورة أو ملف وسأقوم برفعه إلى top4top.io');
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
            responseType: 'arraybuffer'
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
            }
        });

        const $ = cheerio.load(uploadRes.data);
        
        // Use a more specific selector to find the input/textarea fields and their labels
        const links = [];
        $('.input-group').each((i, el) => {
            const label = $(el).find('.input-group-addon').text().trim();
            const link = $(el).find('input, textarea').val();
            if (link && link.startsWith('http')) {
                links.push({ label, link });
            }
        });

        // Fallback for older layout or different response
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
                responseText += `🔗 *${item.label}:*\n\`${item.link}\`\n\n`;
            });
            await bot.editMessageText(responseText, {
                chat_id: chatId,
                message_id: statusMsg.message_id,
                parse_mode: 'Markdown'
            });
        } else {
            // Check if there's an error message on the page
            const errorMsg = $('.alert-danger').text().trim() || 'تعذر استخراج الرابط. قد يكون نوع الملف غير مدعوم.';
            await bot.editMessageText(`❌ فشل الرفع: ${errorMsg}`, {
                chat_id: chatId,
                message_id: statusMsg.message_id
            });
        }

    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, '❌ حدث خطأ أثناء الرفع. تأكد من حجم الملف أو نوعه.');
    }
});
