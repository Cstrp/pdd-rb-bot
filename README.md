<div align="center">

# 🚗 ПДД РБ Bot

**Telegram-бот для изучения Правил дорожного движения Республики Беларусь**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-24-green.svg)](https://nodejs.org)
[![NestJS](https://img.shields.io/badge/NestJS-11-red.svg)](https://nestjs.com)
[![LangChain](https://img.shields.io/badge/LangChain-1.x-blue.svg)](https://langchain.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-blue.svg)](https://github.com/pgvector/pgvector)
[![OpenAI](https://img.shields.io/badge/OpenAI-gpt--4o--mini-green.svg)](https://openai.com)
[![Tavily](https://img.shields.io/badge/Tavily-Search-orange.svg)](https://tavily.com)

_Задай вопрос по ПДД — получи точный ответ с указанием пунктов, иллюстрациями и подтверждением из интернета. Сфотографируй экзаменационный билет — бот назовёт правильный вариант ответа._

</div>

---

## ✨ Возможности

| Функция                  | Описание                                                                       |
| ------------------------ | ------------------------------------------------------------------------------ |
| 💬 **RAG Q&A**           | Гибридный поиск (векторный + ключевые слова) по 942 пунктам официальных ПДД РБ |
| 🌐 **Веб-граундинг**     | Параллельный поиск через Tavily — подтверждение ответа из интернета            |
| 📸 **Vision OCR**        | Распознавание фото экзаменационных билетов через GPT-4o-mini                   |
| 🖼️ **Изображения**       | Автоматическая отправка иллюстраций из ПДД, релевантных вопросу                |
| 🔄 **Автосинхронизация** | Парсинг и индексация gibdd.by при каждом запуске                               |
| 🇧🇾 **Русский стеммер**   | Нормализация словоформ для точного keyword-поиска                              |

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
├── gibdd/      — парсер gibdd.by, Prisma DatabaseService
├── rag/        — RagService: гибридный поиск, LangChain LCEL цепочка
├── ocr/        — OcrService: Vision OCR через GPT-4o-mini
└── web/        — WebService: Tavily web search retriever
```

---

## 🛠 Стек

- **Runtime**: Node.js 24, TypeScript 5
- **Framework**: NestJS 11 (SWC + Webpack)
- **ORM**: Prisma 7 + `pg` adapter
- **База данных**: PostgreSQL + pgvector
- **LLM**: OpenAI `gpt-4o-mini` (ответы + Vision OCR)
- **Embeddings**: OpenAI `text-embedding-3-small`
- **Vector store**: LangChain `PGVectorStore` (942 правила)
- **Web search**: Tavily via `@langchain/community`
- **Telegram**: Telegraf + nestjs-telegraf
- **Парсинг**: cheerio (gibdd.by)

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

Заполни `.env` (см. [Переменные окружения](#переменные-окружения)).

### База данных

```bash
# Применить миграции (создаст таблицы + pgvector extension)
pnpm prisma:migrate

# Сгенерировать Prisma Client
pnpm prisma:generate
```

### Запуск

```bash
# Разработка (hot reload)
pnpm start:dev

# Production
pnpm build
pnpm start:prod
```

При первом запуске бот автоматически:

1. Распарсит 38 глав ПДД РБ с gibdd.by
2. Сохранит 942 правила и 1088 иллюстраций в PostgreSQL
3. Создаст векторные эмбеддинги всех правил в pgvector

---

## Переменные окружения

| Переменная           | Обязательная | Описание                                                                                                          |
| -------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | ✅           | PostgreSQL connection string                                                                                      |
| `TELEGRAM_BOT_TOKEN` | ✅           | [BotFather](https://t.me/BotFather) токен                                                                         |
| `OPENAI_API_KEY`     | ✅           | OpenAI API ключ (embeddings + GPT-4o-mini)                                                                        |
| `TAVILY_API_KEY`     | ⚡           | [Tavily](https://app.tavily.com) ключ — бесплатный tier. Без ключа веб-поиск отключается, RAG продолжает работать |

Пример файла: [`.env.example`](.env.example)

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
2. Parallel:
   ├── DB context  — релевантные пункты ПДД РБ
   └── Tavily      — интернет-источники о ПДД РБ
                ↓
3. GPT-4o-mini:
   «Оба источника согласны: движение по обочине запрещено
    (пункт 89.1 ПДД). Исключения: пункты 89.2–89.4...»
                ↓
4. Reply: текст + иллюстрации из keyword-matched правил
```

### Фото экзаменационного билета

```
User: [photo of exam ticket]
            ↓
OcrService.recognize(buffer):
  gpt-4o-mini vision → "Можно ли обгонять на перекрёстке?\nА) Да\nБ) Нет\nВ) Только..."
            ↓
OcrService.buildQuery() — детектирует паттерн А/Б/В/Г
            ↓
ragService.query("Это вопрос экзамена... А) Да Б) Нет В)...")
            ↓
Reply: "Б) Нет. Согласно пункту 91.4 ПДД, обгон на регулируемых
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
│       └── telegram.service.ts    # @On('text') + @On('photo')
├── libs/
│   ├── gibdd/src/
│   │   ├── gibdd.service.ts       # seed() — парсинг + сохранение
│   │   ├── database.service.ts    # Prisma client
│   │   └── services/
│   │       ├── scrapper.service.ts
│   │       └── parser.service.ts
│   ├── rag/src/
│   │   ├── rag.service.ts         # query() + hybridSearch() + indexRules()
│   │   └── types.ts               # RagAnswer, RagSource
│   ├── ocr/src/
│   │   └── ocr.service.ts         # recognize() + buildQuery()
│   └── web/src/
│       └── web.service.ts         # search() via Tavily
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── .env.example
```

---

## Лицензия

[MIT](LICENSE) © [Cstrp](https://github.com/Cstrp)
