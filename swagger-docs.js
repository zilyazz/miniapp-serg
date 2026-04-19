/**
 * Актуальная swagger-документация только по живым маршрутам из index.js.
 */

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Перевыпустить JWT по свежему Telegram initData
 *     description: |
 *       Используется, когда серверный JWT истёк или фронт хочет перевыпустить его без полной инициализации.
 *       В body нужно передавать сырой `Telegram.WebApp.initData`, а не `initDataUnsafe`.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [initData]
 *             properties:
 *               initData:
 *                 type: string
 *                 description: Сырой Telegram initData
 *     responses:
 *       200:
 *         description: Новый токен
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [token]
 *               properties:
 *                 token:
 *                   type: string
 *                   description: Новый JWT
 *             example:
 *               token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 */

/**
 * @openapi
 * /initUserDailyRuneHandler:
 *   post:
 *     summary: Инициализация пользователя и состояние карты Таро дня
 *     description: |
 *       Главная стартовая ручка приложения.
 *       На успешной инициализации сервер:
 *       1. Проверяет Telegram initData
 *       2. Создаёт или обновляет пользователя
 *       3. Возвращает JWT
 *       4. Возвращает текущее состояние карты Таро дня
 *
 *       Если карта дня ещё не открыта, сервер вернёт:
 *       - `name = "Скрытая карта"`
 *       - `card_key = null`
 *       - `interpretation = null`
 *
 *       Если включён maintenance gate и пользователь не разрешён, сервер вернёт только:
 *       - `allow = false`
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [initData]
 *             properties:
 *               initData:
 *                 type: string
 *               referralParam:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Инициализация успешна
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   required: [allow]
 *                   properties:
 *                     allow:
 *                       type: boolean
 *                       example: false
 *                 - type: object
 *                   required: [token, score_crystal, newUserCreated, subscriptionExpired, sound, allow, name, card_key, interpretation]
 *                   properties:
 *                     token:
 *                       type: string
 *                     score_crystal:
 *                       type: integer
 *                     newUserCreated:
 *                       type: boolean
 *                     subscriptionExpired:
 *                       type: boolean
 *                     sound:
 *                       type: integer
 *                     allow:
 *                       type: boolean
 *                     name:
 *                       type: string
 *                     card_key:
 *                       type: string
 *                       nullable: true
 *                       description: Ключ карты дня, например `4` или `4*`
 *                     interpretation:
 *                       type: string
 *                       nullable: true
 *             examples:
 *               hidden_card:
 *                 value:
 *                   token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                   score_crystal: 120
 *                   newUserCreated: false
 *                   subscriptionExpired: false
 *                   sound: 1
 *                   allow: true
 *                   name: "Скрытая карта"
 *                   card_key: null
 *                   interpretation: null
 *               opened_card:
 *                 value:
 *                   token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                   score_crystal: 120
 *                   newUserCreated: false
 *                   subscriptionExpired: false
 *                   sound: 1
 *                   allow: true
 *                   name: "Император (перевернутая)"
 *                   card_key: "4*"
 *                   interpretation: "Сегодня важно не давить на события и не пытаться контролировать всех вокруг."
 */

/**
 * @openapi
 * /flipRune:
 *   post:
 *     summary: Открыть карту Таро дня
 *     description: |
 *       Карта выбирается один раз и сохраняется на 24 часа от момента открытия.
 *       Повторный вызов в рамках активного окна вернёт уже сохранённую карту и интерпретацию.
 *     tags: [Runes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Карта дня открыта
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [name, card_key, interpretation]
 *               properties:
 *                 name:
 *                   type: string
 *                 card_key:
 *                   type: string
 *                   description: `ID карты или ID со звёздочкой для перевёрнутой карты
 *                 interpretation:
 *                   type: string
 *             example:
 *               name: "Сила (перевернутая)"
 *               card_key: "8*"
 *               interpretation: "Сегодня лучше снизить внутреннее давление и не пытаться продавить результат силой."
 */

/**
 * @openapi
 * /generate:
 *   post:
 *     summary: Сгенерировать рунический расклад
 *     description: |
 *       `useCrystals=true` используется только когда бесплатный лимит исчерпан и фронт осознанно запускает платный расклад.
 *       Для `theme=danet` сервер возвращает простой ответ `Да` или `Нет`.
 *     tags: [Layouts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [theme, type]
 *             properties:
 *               theme:
 *                 type: string
 *                 enum: [classic, love, energy, career, danet]
 *               type:
 *                 type: string
 *                 enum: [classic, cross, pyramid]
 *               useCrystals:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Расклад сгенерирован
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [key, runes, description, theme, type]
 *               properties:
 *                 key:
 *                   type: string
 *                   description: Ключ расклада. Для `danet` это строка `Да` или `Нет`
 *                 runes:
 *                   type: array
 *                   items:
 *                     type: string
 *                 description:
 *                   type: string
 *                 theme:
 *                   type: string
 *                 type:
 *                   type: string
 *             examples:
 *               layout:
 *                 value:
 *                   key: "12,49,11"
 *                   runes: ["Йера", "Одал*", "Иса"]
 *                   description: "Связи рун в раскладе: Йера, Одал*, Иса.\n\n..."
 *                   theme: "love"
 *                   type: "classic"
 *               danet:
 *                 value:
 *                   key: "Да"
 *                   runes: []
 *                   description: "Да"
 *                   theme: "danet"
 *                   type: "classic"
 */

/**
 * @openapi
 * /layoutAllowed:
 *   post:
 *     summary: Проверить rolling-лимит рунических раскладов
 *     description: |
 *       Лимит считается не по календарным суткам, а как `24 часа с первого расклада в теме`.
 *       Лимит считается по `theme`, а не по паре `theme + type`.
 *       Для премиума используется отдельный лимит-антиспам.
 *     tags: [Layouts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [theme, type]
 *             properties:
 *               theme:
 *                 type: string
 *               type:
 *                 type: string
 *     responses:
 *       200:
 *         description: Состояние лимита
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [allowed, used, max, quota_left, window_started_at, window_expires_at, is_premium]
 *               properties:
 *                 allowed:
 *                   type: boolean
 *                 used:
 *                   type: integer
 *                 max:
 *                   type: integer
 *                 quota_left:
 *                   type: integer
 *                 window_started_at:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                 window_expires_at:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                 is_premium:
 *                   type: boolean
 *             example:
 *               allowed: true
 *               used: 0
 *               max: 1
 *               quota_left: 1
 *               window_started_at: null
 *               window_expires_at: null
 *               is_premium: false
 */

/**
 * @openapi
 * /spread/history:
 *   get:
 *     summary: История рунических раскладов
 *     tags: [Layouts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: История, сгруппированная по датам
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: array
 *                 items:
 *                   type: object
 *             example:
 *               "30 марта 2026 г.":
 *                 - id: 11
 *                   Theme: "love"
 *                   Type: "classic"
 */

/**
 * @openapi
 * /spread/details/{spreadId}:
 *   get:
 *     summary: Детали рунического расклада
 *     tags: [Layouts]
 *     parameters:
 *       - in: path
 *         name: spreadId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Полное описание расклада
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               Description: "Связи рун в раскладе: ...\n\n..."
 */

/**
 * @openapi
 * /profile:
 *   get:
 *     summary: Получить профиль пользователя
 *     description: |
 *       Возвращает базовый профиль и данные из `birth_profiles`, если они уже заполнены.
 *       Поле `date` — это дата окончания подписки. Может быть `null`.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Профиль пользователя
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [id, date, birth_date, birth_time, has_exact_time, place_name, name, sex]
 *               properties:
 *                 id:
 *                   type: integer
 *                 date:
 *                   type: string
 *                   format: date
 *                   nullable: true
 *                 birth_date:
 *                   type: string
 *                   format: date
 *                   nullable: true
 *                 birth_time:
 *                   type: string
 *                   nullable: true
 *                 has_exact_time:
 *                   type: boolean
 *                   nullable: true
 *                 place_name:
 *                   type: string
 *                   nullable: true
 *                 name:
 *                   type: string
 *                   nullable: true
 *                 sex:
 *                   type: string
 *                   nullable: true
 *             example:
 *               id: 4
 *               date: "2026-04-30"
 *               birth_date: "1997-03-14"
 *               birth_time: "09:30:00"
 *               has_exact_time: true
 *               place_name: "Самара, Самарская область, Россия"
 *               name: "Анна"
 *               sex: "female"
 */

/**
 * @openapi
 * /profile/addParam:
 *   post:
 *     summary: Первичное заполнение birth_profile
 *     description: |
 *       Ручка для первого сохранения данных профиля.
 *       Нужно передавать все поля.
 *
 *       Если точное время рождения неизвестно:
 *       - `has_exact_time = false`
 *       - `birth_time_str = null`
 *       Тогда сервер сам подставит техническое время `12:00`.
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, sex, birth_date, birth_time_str, has_exact_time, place_name, lat, lon, tz_name]
 *             properties:
 *               name:
 *                 type: string
 *               sex:
 *                 type: string
 *                 enum: [male, female]
 *               birth_date:
 *                 type: string
 *                 format: date
 *               birth_time_str:
 *                 type: string
 *                 nullable: true
 *               has_exact_time:
 *                 type: boolean
 *               place_name:
 *                 type: string
 *               lat:
 *                 type: number
 *               lon:
 *                 type: number
 *               tz_name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Данные профиля сохранены
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user_id:
 *                   type: integer
 *                 birth_date:
 *                   type: string
 *                   format: date
 *                 birth_time:
 *                   type: string
 *                 has_exact_time:
 *                   type: boolean
 *                 place_name:
 *                   type: string
 *                 name:
 *                   type: string
 *                 sex:
 *                   type: string
 *             example:
 *               user_id: 4
 *               birth_date: "1997-03-14"
 *               birth_time: "09:30:00"
 *               has_exact_time: true
 *               place_name: "Самара, Самарская область, Россия"
 *               name: "Анна"
 *               sex: "female"
 */

/**
 * @openapi
 * /profile/changeParam:
 *   post:
 *     summary: Частично обновить birth_profile
 *     description: |
 *       Можно отправлять не все поля, а только те, которые реально изменились.
 *       Допустим частичный patch: хоть одно поле, хоть несколько.
 *
 *       Примеры:
 *       - поменять только `name`
 *       - поменять только `sex`
 *       - поменять только `birth_time_str`
 *       - поменять сразу `place_name`, `lat`, `lon`, `tz_name`
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             properties:
 *               name:
 *                 type: string
 *               sex:
 *                 type: string
 *                 enum: [male, female]
 *               birth_date:
 *                 type: string
 *                 format: date
 *               birth_time_str:
 *                 type: string
 *                 nullable: true
 *               has_exact_time:
 *                 type: boolean
 *               place_name:
 *                 type: string
 *               lat:
 *                 type: number
 *               lon:
 *                 type: number
 *               tz_name:
 *                 type: string
 *           examples:
 *             only_name:
 *               value:
 *                 name: "Илья"
 *             only_time:
 *               value:
 *                 birth_time_str: "18:45"
 *                 has_exact_time: true
 *             only_place:
 *               value:
 *                 place_name: "Москва, Россия"
 *                 lat: 55.7558
 *                 lon: 37.6173
 *                 tz_name: "Europe/Moscow"
 *     responses:
 *       200:
 *         description: Актуальные данные профиля после обновления
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user_id:
 *                   type: integer
 *                 birth_date:
 *                   type: string
 *                   format: date
 *                 birth_time:
 *                   type: string
 *                   nullable: true
 *                 has_exact_time:
 *                   type: boolean
 *                 place_name:
 *                   type: string
 *                 name:
 *                   type: string
 *                 sex:
 *                   type: string
 *             example:
 *               user_id: 4
 *               birth_date: "1997-03-14"
 *               birth_time: "18:45:00"
 *               has_exact_time: true
 *               place_name: "Самара, Самарская область, Россия"
 *               name: "Илья"
 *               sex: "female"
 */

/**
 * @openapi
 * /subscribe:
 *   get:
 *     summary: Получить варианты подписки
 *     tags: [Subscribe]
 *     responses:
 *       200:
 *         description: Список тарифов подписки
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [result]
 *               properties:
 *                 result:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       description:
 *                         type: string
 *                       month:
 *                         type: integer
 *             example:
 *               result:
 *                 - id: 1
 *                   description: "1 месяц Premium"
 *                   month: 1
 *                 - id: 2
 *                   description: "3 месяца Premium"
 *                   month: 3
 */

/**
 * @openapi
 * /subscribe/buy:
 *   post:
 *     summary: Купить подписку
 *     description: |
 *       В body передаётся `id` тарифа из `/subscribe`.
 *       Успешный ответ зависит от того, что именно возвращает RPC `subscrive_buy`, поэтому сервер прокидывает его в поле `result`.
 *     tags: [Subscribe]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id]
 *             properties:
 *               id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Подписка куплена
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [result]
 *               properties:
 *                 result:
 *                   description: Сырой ответ RPC `subscrive_buy`
 *                   nullable: true
 *             example:
 *               result: true
 */

/**
 * @openapi
 * /politicalAcc/{telegramId}:
 *   get:
 *     summary: Проверить согласие с пользовательским соглашением
 *     tags: [System]
 *     parameters:
 *       - in: path
 *         name: telegramId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Статус согласия
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [status]
 *               properties:
 *                 status:
 *                   type: boolean
 *             example:
 *               status: true
 */

/**
 * @openapi
 * /crystalMoney:
 *   get:
 *     summary: Пакеты кристаллов за рубли
 *     tags: [Crystal]
 *     responses:
 *       200:
 *         description: Список пакетов
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   crystals:
 *                     type: integer
 *                   price_money:
 *                     type: number
 *             example:
 *               - id: 1
 *                 crystals: 100
 *                 price_money: 99
 *               - id: 2
 *                 crystals: 250
 *                 price_money: 199
 */

/**
 * @openapi
 * /crystalStars:
 *   get:
 *     summary: Пакеты кристаллов за Telegram Stars
 *     tags: [Crystal]
 *     responses:
 *       200:
 *         description: Список пакетов
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   crystals:
 *                     type: integer
 *                   price_stars:
 *                     type: integer
 *             example:
 *               - id: 1
 *                 crystals: 100
 *                 price_stars: 50
 */

/**
 * @openapi
 * /sound:
 *   post:
 *     summary: Изменить настройку звука
 *     tags: [System]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sound]
 *             properties:
 *               sound:
 *                 type: integer
 *                 description: Обычно `0` или `1`
 *     responses:
 *       200:
 *         description: Настройка сохранена
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [status]
 *               properties:
 *                 status:
 *                   type: string
 *             example:
 *               status: "ok"
 */

/**
 * @openapi
 * /createInvoice:
 *   post:
 *     summary: Создать invoice для оплаты кристаллов рублями
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id, email]
 *             properties:
 *               id:
 *                 type: integer
 *               email:
 *                 type: string
 *               discountPercent:
 *                 type: number
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Ссылка на оплату создана
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [invoice_url, payment_id]
 *               properties:
 *                 invoice_url:
 *                   type: string
 *                 payment_id:
 *                   type: string
 *             example:
 *               invoice_url: "https://t.me/$123456"
 *               payment_id: "2_1234567891711791200000"
 */

/**
 * @openapi
 * /createInvoiceStars:
 *   post:
 *     summary: Создать invoice для оплаты кристаллов звёздами
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id]
 *             properties:
 *               id:
 *                 type: integer
 *               discountPercent:
 *                 type: number
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Ссылка на оплату создана
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [invoice_url, payment_id]
 *               properties:
 *                 invoice_url:
 *                   type: string
 *                 payment_id:
 *                   type: string
 *             example:
 *               invoice_url: "https://t.me/$123456"
 *               payment_id: "2_1234567891711791200000"
 */

/**
 * @openapi
 * /createInvoiceCrypto:
 *   post:
 *     summary: Создать invoice для оплаты кристаллов криптой
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id]
 *             properties:
 *               id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Ссылка на оплату создана
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [invoice_url, payment_id]
 *               properties:
 *                 invoice_url:
 *                   type: string
 *                 payment_id:
 *                   type: string
 *             example:
 *               invoice_url: "https://app.cryptobot.me/invoice/..."
 *               payment_id: "2_1234567891711791200000"
 */

/**
 * @openapi
 * /checkPayment:
 *   post:
 *     summary: Проверить статус платежа
 *     description: |
 *       Возвращает текущее значение поля `payments.status` для указанного `payment_id`.
 *       На практике это обычно строка вроде `pending` / `succeeded`.
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [payment_id]
 *             properties:
 *               payment_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Текущий статус
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: string
 *                 - type: boolean
 *             examples:
 *               pending:
 *                 value: "pending"
 *               succeeded:
 *                 value: "succeeded"
 */

/**
 * @openapi
 * /webhook:
 *   post:
 *     summary: Telegram payment webhook
 *     description: Служебный webhook для Telegram-оплаты. Внешний фронт его не вызывает.
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: Webhook обработан
 */

/**
 * @openapi
 * /tarot/check:
 *   get:
 *     summary: Проверить лимит основных раскладов Таро
 *     description: |
 *       Возвращает остаток бесплатных основных раскладов Таро в текущем 24-часовом окне.
 *       Это только проверка лимита, без генерации карт.
 *     tags: [Tarot]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Состояние лимита
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [limit_total, quota_left, pr_lim]
 *               properties:
 *                 limit_total:
 *                   type: integer
 *                 quota_left:
 *                   type: integer
 *                 pr_lim:
 *                   type: integer
 *             example:
 *               limit_total: 1
 *               quota_left: 1
 *               pr_lim: 2
 */

/**
 * @openapi
 * /tarot/open:
 *   post:
 *     summary: Сгенерировать карты основного расклада и определить, нужна ли оплата
 *     description: |
 *       Сервер сразу генерирует `key` карт.
 *       Если `need_payment=false`, фронт может сразу вызывать `/tarot/generate`.
 *       Если `need_payment=true`, фронт должен показать цену и вызвать `/tarot/generate/pay`.
 *     tags: [Tarot]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type]
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [cross, road, railstat]
 *     responses:
 *       200:
 *         description: Карты выбраны
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [need_payment, key, crystal]
 *               properties:
 *                 need_payment:
 *                   type: boolean
 *                 key:
 *                   type: string
 *                   description: Набор id карт, где перевёрнутая карта помечается `*`
 *                 crystal:
 *                   type: integer
 *             example:
 *               need_payment: false
 *               key: "4,11*,28,36"
 *               crystal: 100
 */

/**
 * @openapi
 * /tarot/generate:
 *   post:
 *     summary: Бесплатный основной расклад Таро
 *     tags: [Tarot]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, key, question]
 *             properties:
 *               type:
 *                 type: string
 *               key:
 *                 type: string
 *               question:
 *                 type: string
 *     responses:
 *       200:
 *         description: Основной расклад создан
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [interpretation, session_id]
 *               properties:
 *                 interpretation:
 *                   type: string
 *                 session_id:
 *                   type: integer
 *             example:
 *               interpretation: "Карты в раскладе: Маг, Сила (перевернутая), Звезда.\n\n..."
 *               session_id: 57
 */

/**
 * @openapi
 * /tarot/generate/pay:
 *   post:
 *     summary: Платный основной расклад Таро
 *     tags: [Tarot]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, key, question]
 *             properties:
 *               type:
 *                 type: string
 *               key:
 *                 type: string
 *               question:
 *                 type: string
 *     responses:
 *       200:
 *         description: Платный расклад создан
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [interpretation, crystal, session_id]
 *               properties:
 *                 interpretation:
 *                   type: string
 *                 crystal:
 *                   type: integer
 *                   description: Остаток кристаллов после оплаты
 *                 session_id:
 *                   type: integer
 *             example:
 *               interpretation: "Карты в раскладе: Маг, Сила (перевернутая), Звезда.\n\n..."
 *               crystal: 340
 *               session_id: 57
 */

/**
 * @openapi
 * /tarot/generate/follow:
 *   post:
 *     summary: Бесплатное продолжение расклада Таро
 *     description: |
 *       У этой ручки два валидных успешных ответа:
 *       1. `pay=false` — бесплатное продолжение создано
 *       2. `pay=true` — бесплатный лимит исчерпан, фронту нужно предложить платное продолжение
 *     tags: [Tarot]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionId, question]
 *             properties:
 *               sessionId:
 *                 type: integer
 *               question:
 *                 type: string
 *     responses:
 *       200:
 *         description: Продолжение создано или требуется оплата
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   required: [pay, session_id, followup_seq, card_id, card_name, interpretation]
 *                   properties:
 *                     pay:
 *                       type: boolean
 *                       example: false
 *                     session_id:
 *                       type: integer
 *                     followup_seq:
 *                       type: integer
 *                     card_id:
 *                       type: string
 *                     card_name:
 *                       type: string
 *                     interpretation:
 *                       type: string
 *                 - type: object
 *                   required: [ok, pay, crystal, free_left]
 *                   properties:
 *                     ok:
 *                       type: boolean
 *                     pay:
 *                       type: boolean
 *                       example: true
 *                     crystal:
 *                       type: integer
 *                     free_left:
 *                       type: integer
 *             examples:
 *               created:
 *                 value:
 *                   pay: false
 *                   session_id: 57
 *                   followup_seq: 1
 *                   card_id: "42*"
 *                   card_name: "Солнце (перевернутая)"
 *                   interpretation: "..."
 *               need_pay:
 *                 value:
 *                   ok: true
 *                   pay: true
 *                   crystal: 30
 *                   free_left: 0
 */

/**
 * @openapi
 * /tarot/generate/follow/pay:
 *   post:
 *     summary: Платное продолжение расклада Таро
 *     tags: [Tarot]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionId, question]
 *             properties:
 *               sessionId:
 *                 type: integer
 *               question:
 *                 type: string
 *     responses:
 *       200:
 *         description: Платное продолжение создано
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [ok, session_id, followup_seq, card_id, card_name, interpretation, crystal]
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 session_id:
 *                   type: integer
 *                 followup_seq:
 *                   type: integer
 *                 card_id:
 *                   type: string
 *                 card_name:
 *                   type: string
 *                 interpretation:
 *                   type: string
 *                 crystal:
 *                   type: integer
 *             example:
 *               ok: true
 *               session_id: 57
 *               followup_seq: 2
 *               card_id: "15"
 *               card_name: "Дьявол"
 *               interpretation: "..."
 *               crystal: 310
 */

/**
 * @openapi
 * /tarot/history:
 *   get:
 *     summary: История раскладов Таро
 *     description: |
 *       История возвращается по датам.
 *       Внутри каждой даты данные сгруппированы по `sessionId`, потому что один основной расклад и его продолжения относятся к одной сессии.
 *     tags: [Tarot]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: История Таро
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: array
 *             example:
 *               "30 марта 2026 г.":
 *                 - sessionId: 57
 *                   items:
 *                     - id: 101
 *                       Theme: "tarot"
 *                       Type: "cross"
 *                     - id: 102
 *                       Theme: "tarot"
 *                       Type: "follow"
 */

/**
 * @openapi
 * /tarot/history/details:
 *   post:
 *     summary: Детали расклада Таро
 *     tags: [Tarot]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [spreadId]
 *             properties:
 *               spreadId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Полное описание расклада
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 description:
 *                   type: string
 *             example:
 *               description: "Карты в раскладе: Маг, Солнце, Звезда.\n\n..."
 */

/**
 * @openapi
 * /horoscope/open:
 *   post:
 *     summary: Открыть гороскоп дня
 *     description: |
 *       Если у пользователя нет birth_profile, сервер вернёт `has_profile=false`.
 *       Если день уже доступен, сервер вернёт public и premium части в соответствии с текущими unlock-флагами.
 *     tags: [Horoscope]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [day]
 *             properties:
 *               day:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Данные гороскопа
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   required: [ok, has_profile]
 *                   properties:
 *                     ok:
 *                       type: boolean
 *                     has_profile:
 *                       type: boolean
 *                       example: false
 *                 - type: object
 *                   required: [ok, has_profile, sign_code, is_premium, day_unlocked, premium_unlocked, can_view_public, can_view_premium, need_buy_day, need_buy_premium, general_public, general_premium, prices]
 *                   properties:
 *                     ok:
 *                       type: boolean
 *                     has_profile:
 *                       type: boolean
 *                     sign_code:
 *                       type: string
 *                     is_premium:
 *                       type: boolean
 *                     day_unlocked:
 *                       type: boolean
 *                     premium_unlocked:
 *                       type: boolean
 *                     can_view_public:
 *                       type: boolean
 *                     can_view_premium:
 *                       type: boolean
 *                     need_buy_day:
 *                       type: boolean
 *                     need_buy_premium:
 *                       type: boolean
 *                     general_public:
 *                       type: string
 *                       nullable: true
 *                     general_premium:
 *                       type: string
 *                       nullable: true
 *                     prices:
 *                       type: object
 *             example:
 *               ok: true
 *               has_profile: true
 *               sign_code: "aries"
 *               is_premium: false
 *               day_unlocked: true
 *               premium_unlocked: false
 *               can_view_public: true
 *               can_view_premium: false
 *               need_buy_day: false
 *               need_buy_premium: true
 *               general_public: "Сегодня..."
 *               general_premium: null
 *               prices:
 *                 prem_horoscope_crystal: 20
 *                 day_open_crystal: 20
 *                 lucky_day_crystal: 30
 */

/**
 * @openapi
 * /horoscope/buyHoroscopeFull:
 *   post:
 *     summary: Купить premium-часть гороскопа дня
 *     tags: [Horoscope]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [day]
 *             properties:
 *               day:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Premium-часть открыта
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [ok, crystal, general_premium]
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 crystal:
 *                   type: integer
 *                 general_premium:
 *                   type: string
 *                   nullable: true
 *             example:
 *               ok: true
 *               crystal: 340
 *               general_premium: "Твоя природная склонность к риску сегодня усиливается..."
 */

/**
 * @openapi
 * /horoscope/buyFutureHoroscope:
 *   post:
 *     summary: Купить гороскоп будущего дня
 *     tags: [Horoscope]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [day]
 *             properties:
 *               day:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Будущий день открыт
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [ok, crystal, has_profile, sign_code, day_unlocked, premium_unlocked, general_public, general_premium, prices]
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 crystal:
 *                   type: integer
 *                 has_profile:
 *                   type: boolean
 *                 sign_code:
 *                   type: string
 *                 day_unlocked:
 *                   type: boolean
 *                 premium_unlocked:
 *                   type: boolean
 *                 general_public:
 *                   type: string
 *                   nullable: true
 *                 general_premium:
 *                   type: string
 *                   nullable: true
 *                 prices:
 *                   type: object
 *             example:
 *               ok: true
 *               crystal: 320
 *               has_profile: true
 *               sign_code: "aries"
 *               day_unlocked: true
 *               premium_unlocked: false
 *               general_public: "Сегодня..."
 *               general_premium: null
 *               prices:
 *                 lucky_day_crystal: 30
 */

/**
 * @openapi
 * /horoscope/luckyDay:
 *   post:
 *     summary: Подобрать удачный день
 *     description: |
 *       Если у пользователя нет birth_profile, сервер вернёт `ok=true` и `hasProfile=false`.
 *       Иначе вернёт лучший день, top-3 и текстовую интерпретацию.
 *     tags: [Horoscope]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [query, range_days, pay]
 *             properties:
 *               query:
 *                 type: string
 *               range_days:
 *                 type: integer
 *                 enum: [7, 15, 30]
 *               pay:
 *                 type: string
 *                 enum: [crystal, coin]
 *     responses:
 *       200:
 *         description: Результат подбора удачного дня
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   required: [ok, hasProfile]
 *                   properties:
 *                     ok:
 *                       type: boolean
 *                     hasProfile:
 *                       type: boolean
 *                       example: false
 *                 - type: object
 *                   required: [ok, hasProfile, range_days, best_day, top3, best_text_ru, balance]
 *                   properties:
 *                     ok:
 *                       type: boolean
 *                     hasProfile:
 *                       type: boolean
 *                     range_days:
 *                       type: integer
 *                     best_day:
 *                       type: string
 *                       format: date
 *                     top3:
 *                       type: array
 *                       items:
 *                         type: string
 *                         format: date
 *                     best_text_ru:
 *                       type: string
 *                     balance:
 *                       type: object
 *                       properties:
 *                         crystal:
 *                           type: integer
 *             example:
 *               ok: true
 *               hasProfile: true
 *               range_days: 7
 *               best_day: "2026-04-02"
 *               top3: ["2026-04-02", "2026-04-04", "2026-04-05"]
 *               best_text_ru: "Лучший день для твоего запроса — 2 апреля..."
 *               balance:
 *                 crystal: 290
 */

/**
 * @openapi
 * /horoscope/lucky/history:
 *   post:
 *     summary: История запросов удачного дня
 *     tags: [Horoscope]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: История, сгруппированная по дате создания записи
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [ok, groups]
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 groups:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                       items:
 *                         type: array
 *                         items:
 *                           type: object
 *             example:
 *               ok: true
 *               groups:
 *                 - date: "2026-03-30"
 *                   items:
 *                     - id: 17
 *                       created_at: "2026-03-30T09:15:00.000Z"
 *                       query_ru: "Когда лучше провести важный разговор?"
 *                       range_days: 7
 *                       best_day: "2026-04-02"
 *                       top3: ["2026-04-02", "2026-04-04", "2026-04-05"]
 *                       best_text_ru: "Лучший день для разговора..."
 */
