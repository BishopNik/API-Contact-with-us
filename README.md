# Multi-site Contact API

Единый Node.js API принимает формы нескольких сайтов и отправляет заявки в один Telegram-чат. Зависимостей нет; нужен Node.js 20+.

## Запуск

```bash
cp .env.example .env
# заполнить .env
npm start
```

Локальный `.env` загружается автоматически. В production задайте те же переменные в панели хостинга. Проверка: `GET /health`.

Бот должен быть добавлен в целевой чат. Для личного чата пользователь сначала отправляет боту `/start`; `TELEGRAM_CHAT_ID` — числовой ID пользователя/группы, не username.

## Инструкция и Swagger

После запуска доступны:

- `GET /` или `GET /api/instructions` — JSON-инструкция с endpoints и полями форм;
- `GET /openapi.json` — OpenAPI 3.1 схема;
- `GET /docs` — интерактивный Swagger UI;
- `GET /health` — состояние API и признак `telegramConfigured`.

Локально Swagger открывается по адресу `http://localhost:3010/docs`.

## Endpoint

```text
POST /api/contact/a-house
POST /api/contact/clean-space
POST /api/contact/led-flex
POST /api/contact/laser-clean
Content-Type: application/json
```

Источник заявки берётся из URL endpoint. Поле `source` из браузера игнорируется. `Origin` дополнительно сверяется с `PROJECT_ORIGINS`. Серверные запросы без `Origin` разрешены; их следует закрыть отдельным API gateway, если endpoint будет публично использоваться не только браузерными формами.

Текущие поля:

| Проект | Обязательные | Необязательные | Honeypot |
|---|---|---|---|
| A-House | `name`, `contact` | `project`, `message` | — |
| Clean Space | `name`, `contact`, `service` | `message`, `lang` | `company` |
| LED Flex | `name`, `email`, `message` | `phone`, `country`, `language` | `website` |
| Laser Clean | `name`, `phone`, `email`, `message` | `language` | — |

## Подключение формы

Во всех проектах замените относительный URL на адрес развернутого API. Пример для A-House:

```js
const API_URL = 'https://contact-api.example.com/api/contact/a-house';

const response = await fetch(API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(Object.fromEntries(new FormData(form))),
});

if (!response.ok) throw new Error('Request failed');
```

Для остальных сайтов меняется только последний сегмент URL. Существующие payload уже соответствуют контрактам. В `PROJECT_ORIGINS` нужно указать точные production origins без завершающего пути, например `https://example.com`.

Четыре локальных проекта уже подключены через meta-настройку в их `index.html`:

```html
<meta name="contact-api-origin" content="http://localhost:3010" />
```

После публикации API замените `http://localhost:3010` на его HTTPS origin во всех четырёх проектах. Это единственное место, где фронтендам нужен адрес API.

## Добавление проекта

Добавьте его описание и поля в `src/projects.js`, origin в `PROJECT_ORIGINS`, затем отправляйте форму на `/api/contact/new-project`. Форматирование Telegram-сообщения и общая защита применятся автоматически.

## Проверка

```bash
npm test
```

Rate limit хранится в памяти процесса. Для нескольких инстансов или serverless-развёртывания его стоит перенести в Redis/API gateway.
