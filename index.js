import express from 'express';
import axios from 'axios';

const app = express();
app.use(express.json());

const TELEGRAM_TOKEN    = process.env.TELEGRAM_TOKEN;      // токен бота @BotFather
const YANDEX_API_KEY    = process.env.YANDEX_API_KEY;      // Yandex Cloud: API Key для SpeechKit
const YANDEX_FOLDER_ID  = process.env.YANDEX_FOLDER_ID;    // Folder ID в Yandex Cloud
const JAICP_CHATAPI_TOKEN = process.env.JAICP_CHATAPI_TOKEN; // Токен Chat API канала JAICP

async function downloadTelegramFile(fileId) {
  const info = await axios.get(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile`, {
    params: { file_id: fileId }
  });
  const filePath = info.data?.result?.file_path;
  if (!filePath) throw new Error('No file_path from Telegram');
  const url = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`;
  const audio = await axios.get(url, { responseType: 'arraybuffer' });
  return audio.data; 
}

async function recognizeSpeech(audioBuffer) {
  const url = `https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?lang=ru-RU&folderId=${YANDEX_FOLDER_ID}`;
  const res = await axios.post(url, audioBuffer, {
    headers: {
      'Authorization': `Api-Key ${YANDEX_API_KEY}`,
      'Content-Type': 'application/octet-stream'
    }
  });
  return res.data?.result || '';
}

async function queryJaicp(clientId, text) {
  
  const url = `https://bot.jaicp.com/chatapi/${JAICP_CHATAPI_TOKEN}`;
  const res = await axios.post(url, {
    clientId: String(clientId),
    query: text
  });
  const replies = res.data?.replies || [];
  const firstText = replies.find(r => r.type === 'text')?.text;
  return firstText || 'Нет ответа';
}

async function sendTelegramMessage(chatId, text) {
  await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    chat_id: chatId,
    text
  });
}

app.post('/webhook', async (req, res) => {
  try {
    const update = req.body;
    const message = update?.message;
    if (!message) return res.sendStatus(200);

    const chatId = message.chat.id;
    let text = message.text || '';

    if (message.voice?.file_id) {
      const buf = await downloadTelegramFile(message.voice.file_id);
      text = await recognizeSpeech(buf);
    }

    const reply = await queryJaicp(chatId, text || '');
    await sendTelegramMessage(chatId, reply);

    res.sendStatus(200);
  } catch (err) {
    console.error('Webhook error:', err?.response?.data || err?.message || err);
    res.sendStatus(500);
  }
});

app.get('/', (req, res) => res.send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server on :' + PORT));
