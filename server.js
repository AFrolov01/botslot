const crypto = require('crypto');
const path = require('path');
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const {
  getOrCreateUser,
  canClaimFree,
  markFreeClaimed,
  setPending,
  doublePending,
  burnPending,
  claimPending,
  spendSilver,
} = require('./db');
const { CONTAINER_L_TABLE, openContainerL } = require('./gameLogic');

const BOT_TOKEN = process.env.BOT_TOKEN || '8755064730:AAGz0uV_HlKHTFlfFvju2eTasbhTJUVlxIk';
const WEBAPP_URL = process.env.WEBAPP_URL || '';
const PORT = process.env.PORT || 3000;
const CONTAINER_L_PRICE_SILVER = 100;

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN не задан. Укажите переменную окружения BOT_TOKEN.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Telegram bot: команда /start с кнопкой Open App
// ---------------------------------------------------------------------------
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.on('polling_error', (err) => console.error('polling_error:', err.message));

bot.setMyCommands([{ command: 'start', description: 'Запустить приложение' }]);

// Синяя кнопка Open App слева от поля ввода (menu button)
if (WEBAPP_URL) {
  bot
    .setChatMenuButton({
      menu_button: { type: 'web_app', text: 'Open App', web_app: { url: WEBAPP_URL } },
    })
    .catch((e) => console.error('setChatMenuButton error:', e.message));
}

bot.onText(/^\/start/, (msg) => {
  const chatId = msg.chat.id;
  if (!WEBAPP_URL) {
    bot.sendMessage(
      chatId,
      'Приложение ещё не задеплоено (нет WEBAPP_URL). Задайте переменную окружения WEBAPP_URL и перезапустите бота.'
    );
    return;
  }
  bot.sendMessage(chatId, 'Добро пожаловать! Открывай приложение и забирай награды 👇', {
    reply_markup: {
      inline_keyboard: [[{ text: '🚀 Open App', web_app: { url: WEBAPP_URL } }]],
    },
  });
});

// ---------------------------------------------------------------------------
// Валидация Telegram.WebApp.initData (защита API от подделки запросов)
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
// ---------------------------------------------------------------------------
function validateInitData(initData) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckArr = [];
  for (const [key, value] of [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    dataCheckArr.push(`${key}=${value}`);
  }
  const dataCheckString = dataCheckArr.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  const userRaw = params.get('user');
  if (!userRaw) return null;
  try {
    return JSON.parse(userRaw);
  } catch {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  const user = validateInitData(initData);
  if (!user) {
    return res.status(401).json({ error: 'invalid_init_data' });
  }
  req.tgUser = user;
  next();
}

// ---------------------------------------------------------------------------
// Express API
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/state', authMiddleware, (req, res) => {
  const user = getOrCreateUser(req.tgUser.id, req.tgUser.username, req.tgUser.first_name);
  res.json({
    balances: { silver: user.silver, gold: user.gold, chrome: user.chrome },
    pending: { silver: user.pending_silver, gold: user.pending_gold, chrome: user.pending_chrome },
    pendingState: user.pending_state,
    freeAvailable: canClaimFree(user.telegram_id),
    containerLPrice: CONTAINER_L_PRICE_SILVER,
  });
});

app.get('/api/container-l/info', authMiddleware, (req, res) => {
  res.json({ table: CONTAINER_L_TABLE, price: CONTAINER_L_PRICE_SILVER });
});

// Открыть контейнер: бесплатно (раз в день) либо за серебро
app.post('/api/container-l/open', authMiddleware, (req, res) => {
  const user = getOrCreateUser(req.tgUser.id, req.tgUser.username, req.tgUser.first_name);

  if (user.pending_state === 'revealed') {
    return res.status(409).json({ error: 'pending_not_resolved' });
  }

  const free = canClaimFree(user.telegram_id);
  if (!free) {
    const ok = spendSilver(user.telegram_id, CONTAINER_L_PRICE_SILVER);
    if (!ok) return res.status(400).json({ error: 'not_enough_silver' });
  } else {
    markFreeClaimed(user.telegram_id);
  }

  const drops = openContainerL();
  setPending(user.telegram_id, drops, 'revealed');
  res.json({ drops, wasFree: free });
});

// Забрать выигрыш (без гэмбла или после гэмбла)
app.post('/api/claim', authMiddleware, (req, res) => {
  const updated = claimPending(req.tgUser.id);
  if (!updated) return res.status(400).json({ error: 'no_user' });
  res.json({
    balances: { silver: updated.silver, gold: updated.gold, chrome: updated.chrome },
  });
});

// Крутить колесо 50/50
app.post('/api/gamble/spin', authMiddleware, (req, res) => {
  const user = getOrCreateUser(req.tgUser.id, req.tgUser.username, req.tgUser.first_name);
  if (user.pending_state !== 'revealed') {
    return res.status(409).json({ error: 'nothing_to_gamble' });
  }
  const win = Math.random() < 0.5;
  if (win) {
    doublePending(req.tgUser.id);
  } else {
    burnPending(req.tgUser.id);
  }
  res.json({ win });
});

app.get('/healthz', (req, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  if (!WEBAPP_URL) {
    console.warn('WEBAPP_URL не задан — кнопка Open App работать не будет, пока вы его не укажете.');
  }
});
