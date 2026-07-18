# Docker

## Требования

- На сервере должны быть установлены `docker` и `docker compose`
- В корне проекта должен лежать рабочий `.env`

## Быстрый запуск

```bash
docker compose up -d --build
```

## Остановка

```bash
docker compose down
```

## Обновление после изменений

```bash
docker compose up -d --build
```

## Что делает контейнер

- сам ставит Node-зависимости
- сам собирает нативный модуль `swisseph`
- запускает приложение командой `node index.js`

## Важно

- Порт берётся из `.env` через `PORT`
- `.env` внутрь образа не копируется, он подключается только на запуске через `env_file`

## Prometheus metrics

Добавьте в `.env`:

```env
METRICS_ENABLED=true
METRICS_PROJECT=miniapp-serg
METRICS_SERVICE=backend
METRICS_TOKEN=<случайный секретный токен>
```

Prometheus забирает метрики с `GET /metrics` и передаёт токен в заголовке
`Authorization: Bearer <METRICS_TOKEN>`. Если токен не задан, endpoint отвечает `503`.

Пример scrape job:

```yaml
- job_name: miniapp-serg-backend
  metrics_path: /metrics
  authorization:
    type: Bearer
    credentials: "<METRICS_TOKEN>"
  static_configs:
    - targets: ["miniapp-serg:8090"]
      labels:
        project: miniapp-serg
        service: backend
```

Контейнер Prometheus должен быть подключён к Docker-сети, в которой доступен
контейнер `miniapp-serg`.
