<div align="center">

# 🚗 PDD RB Bot

**Telegram-бот для изучения Правил дорожного движения Республики Беларусь**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-24-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com)
[![LangChain](https://img.shields.io/badge/LangChain-1.x-1C3C3C?logo=langchain&logoColor=white)](https://langchain.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?logo=postgresql&logoColor=white)](https://github.com/pgvector/pgvector)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o--mini-412991?logo=openai&logoColor=white)](https://openai.com)
[![Tavily](https://img.shields.io/badge/Tavily-Search-FF6B35)](https://tavily.com)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)](https://prisma.io)

_Задан вопрос по ПДД — получен точный ответ с указанием конкретных пунктов, официальными иллюстрациями и подтверждением из актуальных интернет-источников. Сфотографирован экзаменационный билет — бот определяет правильный вариант ответа._

**[🇬 Eng](README.md)**

</div>

---

## ✨ Возможности

| Функция                  | Описание                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------ |
| 💬 **RAG Q&A**           | Гибридный поиск (векторный + ключевые слова) по 942 пунктам официальных ПДД РБ       |
| 🌐 **Веб-граундинг**     | Параллельный поиск через Tavily — подтверждение ответа из живых интернет-источников  |
| 📸 **Vision OCR**        | GPT-4o-mini Vision распознаёт фотографии экзаменационных билетов и извлекает вопросы |
| 🖼️ **Иллюстрации**       | Релевантные официальные схемы из ПДД автоматически прикрепляются к ответам           |
| 🔄 **Автосинхронизация** | gibdd.by парсится и переиндексируется при каждом запуске — правила всегда актуальны  |

---

## Архитектура

```
┌──────────────────────────────────────────────────────────┐
│                     Telegram User                        │
│              text question │ exam ticket photo           │
└───────────────────┬────────┴────────────────┬───────────┘
                    │                         │
                    ▼                         ▼
          ┌─────────────────┐     ┌─────────────────────┐
          │  TelegramService│     │    OcrService        │
          │  @On('text')    │     │  GPT-4o-mini Vision  │
          └────────┬────────┘     └──────────┬──────────┘
                   │                         │ extracted text
                   └────────────┬────────────┘
                                │ question
                                ▼
                    ┌───────────────────────┐
                    │      RagService       │
                    │   query(question)     │
                    └─────────┬─────────────┘
                              │
              ┌───────────────┼───────────────┐
              │ parallel      │               │
              ▼               ▼               ▼
   ┌──────────────────┐  ┌─────────┐  ┌─────────────────┐
   │  Hybrid Search   │  │ Tavily  │  │  Image Fetch    │
   │  pgvector k=8    │  │  Web    │  │  (base64 URLs)  │
   │  + keyword DB    │  │ Search  │  │  keyword rules  │
   └──────────┬───────┘  └────┬────┘  └────────┬────────┘
              │               │                │
              └───────────────┼────────────────┘
                              │ db_context + web_context
                              ▼
                   ┌─────────────────────┐
                   │    GPT-4o-mini       │
                   │  dual-context RAG   │
                   └─────────┬───────────┘
                             │    answer + sources
                             ▼
                   ┌─────────────────────┐
                   │   Telegram Reply    │
                   │  text + photos      │
                   └─────────────────────┘
```

### Библиотеки (monorepo)

```
libs/
├── gibdd/   — парсер gibdd.by, Prisma DatabaseService
├── rag/     — RagService: гибридный поиск, LangChain LCEL цепочка
├── ocr/     — OcrService: Vision OCR через GPT-4o-mini
└── web/     — WebService: Tavily web search retriever
```

---

## 🛠 Технологический стек

| Слой                | Технология                                        |
| ------------------- | ------------------------------------------------- |
| Runtime             | Node.js 24, TypeScript 5                          |
| Фреймворк           | NestJS 11 (SWC + Webpack)                         |
| ORM                 | Prisma 7 + адаптер `pg`                           |
| База данных         | PostgreSQL + pgvector                             |
| LLM                 | OpenAI `gpt-4o-mini` (ответы + Vision OCR)        |
| Эмбеддинги          | OpenAI `text-embedding-3-small`                   |
| Векторное хранилище | LangChain `PGVectorStore` — 942 правила в индексе |
| Веб-поиск           | Tavily через `@langchain/community`               |
| Telegram            | Telegraf + nestjs-telegraf                        |
| Парсинг             | cheerio (gibdd.by)                                |

---

## 🚀 Быстрый старт

### Требования

- Node.js ≥ 20
- PostgreSQL с расширением `pgvector`
- pnpm

### Установка

```bash
git clone https://github.com/Cstrp/pdd-rb-bot.git
cd pdd-rb-bot
pnpm install
```

### Конфигурация

```bash
cp .env.example .env
```

Файл `.env` заполняется согласно разделу [Переменные окружения](#переменные-окружения) ниже.

### База данных

```bash
pnpm prisma:migrate
pnpm prisma:generate
```

### Запуск

```bash
pnpm start:dev

pnpm build && pnpm start:prod
```

При первом запуске бот автоматически:

1. Парсит все 38 глав ПДД РБ с gibdd.by
2. Сохраняет 942 правила и 1 088 иллюстраций в PostgreSQL
3. Формирует и записывает векторные эмбеддинги всех правил в pgvector

---

## Переменные окружения

| Переменная           | Обязательная   | Описание                                                                                                                  |
| -------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | ✅             | Строка подключения к PostgreSQL                                                                                           |
| `TELEGRAM_BOT_TOKEN` | ✅             | Токен от [BotFather](https://t.me/BotFather)                                                                              |
| `OPENAI_API_KEY`     | ✅             | Ключ OpenAI API (эмбеддинги + GPT-4o-mini)                                                                                |
| `TAVILY_API_KEY`     | ⚡ опционально | Ключ [Tavily](https://app.tavily.com) — доступен бесплатный tier. Без него веб-поиск отключается, RAG продолжает работать |

Шаблон: [`.env.example`](.env.example)

---

## Как это работает

### Текстовый вопрос

```
User: "Разрешено ли движение по обочине?"
                ↓
1. hybridSearch():
   ├── pgvector similaritySearch (k=8) — семантически похожие правила
   └── Prisma keyword search (OR: обочин*, обочина, ...) — точные совпадения
                ↓
2. Параллельно:
   ├── DB context  — релевантные пункты ПДД РБ
   └── Tavily      — актуальные интернет-источники
                ↓
3. GPT-4o-mini:
   «Оба источника согласны: движение по обочине запрещено
    (пункт 89.1 ПДД). Исключения: пункты 89.2–89.4...»
                ↓
4. Ответ: текст + иллюстрации из совпавших по ключевым словам правил
```

### Фото экзаменационного билета

```
User: [фото экзаменационного билета]
            ↓
OcrService.recognize(buffer):
  gpt-4o-mini vision → "Можно ли обгонять на перекрёстке?\nА) Да\nБ) Нет\nВ) Только..."
            ↓
OcrService.buildQuery() — детектирует паттерн А/Б/В/Г
            ↓
ragService.query("Это вопрос из экзамена... А) Да Б) Нет В)...")
            ↓
Ответ: "Б) Нет. Согласно пункту 91.4 ПДД, обгон на регулируемых
        перекрёстках запрещён..."
```

### Схема данных

```
Chapter (38)
 └── Rule (942)
      ├── text, number
      └── Image (1088)
           └── url

rule_embeddings (pgvector)
 └── embedding(1536), content, metadata{ruleId, number, chapterId}
```

---

## 📁 Структура проекта

```
pdd-rb-bot/
├── src/
│   ├── app.module.ts
│   ├── main.ts
│   └── telegram/
│       ├── telegram.module.ts
│       └── telegram.service.ts
├── libs/
│   ├── gibdd/src/
│   │   ├── gibdd.service.ts
│   │   └── services/
│   │       ├── scrapper.service.ts
│   │       └── parser.service.ts
│   ├── rag/src/
│   │   ├── rag.service.ts
│   │   └── types.ts
│   ├── ocr/src/
│   │   └── ocr.service.ts
│   └── web/src/
│       └── web.service.ts
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── .env.example
```

---

## Лицензия

[MIT](LICENSE) © [Cstrp](https://github.com/Cstrp)
