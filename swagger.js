const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const config = require('./config/config');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Telegram Web App API Runes',
      version: '1.0.0',
      description:
        'API для Telegram Web App - приложения для работы с рунами, таро, раскладами и другими мистическими сервисами',
      contact: { name: 'API Support' },
    },

    // ✅ Чтобы Try it out работал на текущем домене (dev/prod), а не на localhost
    servers: [
      { url: '/', description: 'Current host' },
      {
        url: `http://localhost:${config.port}`,
        description: 'Local development server',
      },
      {
        url: 'https://dev.shepsmystics.ru',
        description: 'Cloud development server',
      },
      {
        url: 'https://shepsmystics.ru',
        description: 'Production server',
      },
    ],

    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Серверный JWT-токен. Формат: "Bearer {token}". Если API вернул error=auth_token_expired, фронт должен вызвать refresh-ручку своей платформы: для Telegram это POST /auth/refresh, для VK это POST /auth/vk/refresh. После этого нужно заменить Bearer-токен и повторить исходный запрос. При проблеме конфигурации auth middleware может вернуть error=auth_config_invalid.',
        },
      },

      schemas: {
        // ✅ Базовая ошибка без enum — чтобы не "врать" что везде бывают not_enough_crystals и т.п.
        ErrorResponse: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'string',
              description: 'Код ошибки',
              example: 'internal_error',
            },
            message: {
              type: 'string',
              description: 'Описание ошибки (опционально)',
              example: 'Что-то пошло не так',
            },
            price: {
              type: 'number',
              description: 'Требуемая сумма/стоимость (если актуально)',
              example: 40,
              nullable: true,
            },
            max_size: {
              type: 'number',
              description: 'Максимальный размер файла в MB (если актуально)',
              example: 10,
              nullable: true,
            },
            details: {
              type: 'object',
              description: 'Дополнительные детали ошибки (опционально)',
              additionalProperties: true,
            },
          },
        },

        SuccessResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean', example: true },
          },
        },

        TelegramId: {
          type: 'string',
          description: 'Telegram ID пользователя',
          example: '123456789',
        },
      },

      //500
      responses: {
        InternalServerError: {
          description: 'Внутренняя ошибка сервера',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { error: 'internal_error', message: 'Internal server error' },
            },
          },
        },
      },
    },

    tags: [
      { name: 'Auth', description: 'Авторизация и инициализация пользователя' },
      { name: 'System', description: 'Системные функции' },
      { name: 'Payments', description: 'Оплата + вебхуки' },
      { name: 'Profile', description: 'Профиль пользователя' },
      { name: 'Subscribe', description: 'Действия с подпиской' },
      { name: 'Runes', description: 'Ежедневные руны' },
      { name: 'Crystal', description: 'Покупка кристаллов' },
      { name: 'Layouts', description: 'Расклады рун и таро' },
      { name: 'Tarot', description: 'Гадание на таро' },
      { name: 'Horoscope', description: 'Гороскоп' },
    ],
  },

  apis: ['./swagger-docs.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = {
  swaggerSpec,
  swaggerUi,
};
