# Telegram Relay For miniapp-serg

Маленький relay-сервер для Telegram Bot API, который нужно поднять на Vultr.

Он нужен, чтобы основной backend на Selectel не ходил напрямую в Telegram при создании invoice для Stars.

## Что делает relay

- `GET /health` — проверка, что relay жив.
- `POST /telegram/create-invoice-link` — проксирует `createInvoiceLink` в Telegram.
- `POST /telegram/answer-precheckout` — проксирует `answerPreCheckoutQuery` в Telegram.
- `POST /telegram/webhook` — принимает webhook от Telegram и пересылает его на основной backend.

Сейчас в основном проекте через relay используется только создание ссылки для Stars.

## Схема

Создание Stars invoice:

```text
Selectel backend -> Vultr relay -> Telegram createInvoiceLink
```

Telegram webhook, если решите перевести его на Vultr:

```text
Telegram -> Vultr relay -> Selectel backend /webhook
```

## Файлы

Эту папку можно целиком положить на Vultr:

```text
deploy/tg-relay
```

Внутри:

- `app.py`
- `Dockerfile`
- `docker-compose.yml`
- `requirements.txt`

## 1. Подготовить сервер Vultr

На Vultr должен быть установлен Docker и Docker Compose plugin.

Проверка:

```bash
docker --version
docker compose version
```

Если Docker ещё не установлен:

```bash
apt update
apt install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

## 2. Залить файлы на Vultr

Например, создать папку:

```bash
mkdir -p /opt/miniapp-serg/tg-relay
```

И положить туда содержимое этой папки `deploy/tg-relay`.

Если копировать с локальной машины:

```bash
scp -r /Users/zilya/Project/Sergey/miniapp-serg/deploy/tg-relay/* root@VULTR_IP:/opt/miniapp-serg/tg-relay/
```

## 3. Создать `.env` на Vultr

На Vultr в папке `/opt/miniapp-serg/tg-relay` создайте `.env`:

```env
TELEGRAM_BOT_TOKEN=<telegram_bot_token>
RELAY_SECRET=<long_random_secret>
FORWARD_WEBHOOK_URL=https://serg.srvmysticode.ru/webhook
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_TIMEOUT_SEC=30
FORWARD_TIMEOUT_SEC=15
```

Пояснения:

- `TELEGRAM_BOT_TOKEN` — токен этого Telegram-бота.
- `RELAY_SECRET` — длинная случайная строка, она же будет в `.env` основного backend на Selectel как `TELEGRAM_RELAY_SECRET`.
- `FORWARD_WEBHOOK_URL` — ваш текущий Telegram webhook на основном backend.
- `TELEGRAM_WEBHOOK_SECRET` можно оставить пустым, если сейчас не используете secret в Telegram webhook.

Сгенерировать секрет можно так:

```bash
openssl rand -hex 32
```

## 4. Запустить relay

На Vultr:

```bash
cd /opt/miniapp-serg/tg-relay
docker compose up -d --build
```

Проверить контейнер:

```bash
docker compose ps
docker logs -f miniapp-serg-tg-relay
```

Проверить локально на Vultr:

```bash
curl http://127.0.0.1:8085/health
```

Ожидаемый ответ:

```json
{"ok":true}
```

## 5. Подключить домен или nginx

Relay слушает порт `8085`.

Если будет домен, например:

```text
https://relay.srvmysticode.ru
```

то nginx должен проксировать на:

```text
http://127.0.0.1:8085
```

Минимальный nginx location:

```nginx
location / {
    proxy_pass http://127.0.0.1:8085;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Проверка через домен:

```bash
curl https://relay.srvmysticode.ru/health
```

## 6. Настроить основной backend на Selectel

В `.env` основного проекта на Selectel добавить:

```env
TELEGRAM_RELAY_BASE_URL=https://relay.srvmysticode.ru
TELEGRAM_RELAY_SECRET=<same_long_random_secret_as_on_vultr>
```

После этого пересобрать и перезапустить основной backend.

Важно: в текущем Node-коде relay используется только для `POST /createInvoiceStars`.

## 7. Проверить создание Stars invoice

На основном backend дернуть:

```http
POST https://serg.srvmysticode.ru/createInvoiceStars
Authorization: Bearer <token>
Content-Type: application/json
```

Body:

```json
{
  "id": 1
}
```

Если `TELEGRAM_RELAY_BASE_URL` задан, основной backend пойдет:

```text
Selectel -> https://relay.srvmysticode.ru/telegram/create-invoice-link -> Telegram
```

## 8. Нужно ли переводить Telegram webhook на Vultr

Для создания Stars invoice это не обязательно.

Но если входящие Telegram webhook-и тоже нестабильны на Selectel, можно перевести их на Vultr.

Тогда webhook URL в Telegram должен быть:

```text
https://relay.srvmysticode.ru/telegram/webhook
```

Команда:

```bash
TOKEN='<telegram_bot_token>'
curl -X POST "https://api.telegram.org/bot${TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://relay.srvmysticode.ru/telegram/webhook"}'
```

После этого Telegram будет ходить:

```text
Telegram -> Vultr relay -> https://serg.srvmysticode.ru/webhook
```

Проверить текущий webhook:

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

## 9. Быстрый тест relay напрямую

Этот тест проверяет только авторизацию relay, не полноценную оплату.

```bash
curl -X POST "https://relay.srvmysticode.ru/telegram/create-invoice-link" \
  -H "Content-Type: application/json" \
  -H "X-Relay-Secret: <same_long_random_secret_as_on_vultr>" \
  -d '{
    "title": "Test",
    "description": "Test stars invoice",
    "payload": "test_payload_123",
    "currency": "XTR",
    "provider_token": "",
    "prices": [
      {
        "label": "Test",
        "amount": 1
      }
    ]
  }'
```

Если Telegram вернет ошибку про payload/chat/user — это уже ответ от Telegram, значит relay доступен и секрет принят.
