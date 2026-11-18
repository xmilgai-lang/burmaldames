import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const USERNAME_RE = /^[a-z][a-z0-9_]{4,31}$/;
const RESERVED = ['admin', 'support', 'root', 'system'];
const AVATARS = ['🦊', '🐼', '🐯', '🦄', '🐸', '🐙', '🦉', '🐨', '🚀', '⚡', '🌟', '🔥'];
const MAX_HISTORY = 100;

const online = new Map(); // socket.id -> пользователь
const history = [];       // последние сообщения

// Цвет пользователя выбирается из юзернейма, поэтому он всегда одинаковый
function hueOf(str) {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

// Наружу отдаём только публичные поля (без socket.id)
function publicUser(u) {
  return { username: u.username, nickname: u.nickname, avatar: u.avatar, hue: u.hue };
}

function sendUsers() {
  io.emit('users', [...online.values()].map(publicUser));
}

io.on('connection', (socket) => {
  socket.on('join', (data, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};

    if (online.has(socket.id)) {
      return reply({ ok: false, error: 'Вы уже в чате' });
    }

    const username = String(data?.username ?? '').trim().toLowerCase();
    const nickname = String(data?.nickname ?? '').trim();
    const avatar = String(data?.avatar ?? '');

    if (!USERNAME_RE.test(username)) {
      return reply({ ok: false, error: 'Юзернейм: 5–32 символа, латиница, цифры и _, начинается с буквы' });
    }
    if (RESERVED.includes(username)) {
      return reply({ ok: false, error: 'Этот юзернейм зарезервирован' });
    }
    if (!nickname || nickname.length > 32) {
      return reply({ ok: false, error: 'Ник: от 1 до 32 символов' });
    }
    if (!AVATARS.includes(avatar)) {
      return reply({ ok: false, error: 'Выберите аватар' });
    }
    if ([...online.values()].some((u) => u.username === username)) {
      return reply({ ok: false, error: 'Этот юзернейм уже в сети' });
    }

    const user = { username, nickname, avatar, hue: hueOf(username) };
    online.set(socket.id, user);

    reply({ ok: true, user: publicUser(user), history });
    sendUsers();
  });

  socket.on('message', (text) => {
    const user = online.get(socket.id);
    if (!user || typeof text !== 'string') return;

    const clean = text.trim().slice(0, 2000);
    if (!clean) return;

    const msg = {
      user: publicUser(user),
      text: clean,
      time: new Date().toISOString(),
    };

    history.push(msg);
    if (history.length > MAX_HISTORY) history.shift();

    io.emit('message', msg);
  });

  socket.on('disconnect', () => {
    if (online.delete(socket.id)) sendUsers();
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Открой http://localhost:${PORT}`);
});