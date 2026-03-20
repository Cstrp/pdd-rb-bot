<div align="center">

# 🚗 PDD RB Bot

**Telegram bot for studying the Road Traffic Rules of the Republic of Belarus**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-24-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com)
[![LangChain](https://img.shields.io/badge/LangChain-1.x-1C3C3C?logo=langchain&logoColor=white)](https://langchain.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?logo=postgresql&logoColor=white)](https://github.com/pgvector/pgvector)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o--mini-412991?logo=openai&logoColor=white)](https://openai.com)
[![Tavily](https://img.shields.io/badge/Tavily-Search-FF6B35)](https://tavily.com)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white)](https://prisma.io)

_Ask a question about traffic rules — get a precise answer citing specific clauses, illustrated with official diagrams and verified against live web sources. Photograph an exam ticket — the bot identifies the correct answer._

**[🇷 Rus](README.ru.md)**

</div>

---

## ✨ Features

| Feature              | Description                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------- |
| 💬 **RAG Q&A**       | Hybrid search (vector + keyword) across 942 clauses of the official Belarus traffic rules |
| 🌐 **Web grounding** | Parallel Tavily search confirms answers with live internet sources                        |
| 📸 **Vision OCR**    | GPT-4o-mini Vision recognises photos of exam tickets and extracts questions               |
| 🖼️ **Illustrations** | Relevant official diagrams from the rulebook are automatically attached to replies        |
| 🔄 **Auto-sync**     | gibdd.by is parsed and re-indexed on every startup — rules are always up to date          |

---

## Architecture

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

### Monorepo libraries

```
libs/
├── gibdd/   — gibdd.by parser, Prisma DatabaseService
├── rag/     — RagService: hybrid search, LangChain LCEL chain
├── ocr/     — OcrService: Vision OCR via GPT-4o-mini
└── web/     — WebService: Tavily web search retriever
```

---

## 🛠 Tech stack

| Layer        | Technology                                    |
| ------------ | --------------------------------------------- |
| Runtime      | Node.js 24, TypeScript 5                      |
| Framework    | NestJS 11 (SWC + Webpack)                     |
| ORM          | Prisma 7 + `pg` adapter                       |
| Database     | PostgreSQL + pgvector                         |
| LLM          | OpenAI `gpt-4o-mini` (answers + Vision OCR)   |
| Embeddings   | OpenAI `text-embedding-3-small`               |
| Vector store | LangChain `PGVectorStore` — 942 rules indexed |
| Web search   | Tavily via `@langchain/community`             |
| Telegram     | Telegraf + nestjs-telegraf                    |
| Scraping     | cheerio (gibdd.by)                            |

---

## 🚀 Getting started

### Prerequisites

- Node.js ≥ 20
- PostgreSQL with the `pgvector` extension
- pnpm

### Installation

```bash
git clone https://github.com/Cstrp/pdd-rb-bot.git
cd pdd-rb-bot
pnpm install
```

### Configuration

```bash
cp .env.example .env
```

Edit `.env` — see the [Environment variables](#environment-variables) section below for reference.

### Database

```bash
pnpm prisma:migrate
pnpm prisma:generate
```

### Running

```bash
pnpm start:dev

pnpm build && pnpm start:prod
```

On the first startup the bot automatically:

1. Scrapes all 38 chapters of the Belarus traffic rules from gibdd.by
2. Persists 942 rules and 1 088 illustrations to PostgreSQL
3. Generates and stores vector embeddings for every rule in pgvector

---

## Environment variables

| Variable             | Required    | Description                                                                                                                |
| -------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | ✅          | PostgreSQL connection string                                                                                               |
| `TELEGRAM_BOT_TOKEN` | ✅          | Token from [BotFather](https://t.me/BotFather)                                                                             |
| `OPENAI_API_KEY`     | ✅          | OpenAI API key (embeddings + GPT-4o-mini)                                                                                  |
| `TAVILY_API_KEY`     | ⚡ optional | [Tavily](https://app.tavily.com) key — free tier available. Without it, web search is disabled while RAG continues to work |

See [`.env.example`](.env.example) for a ready-to-fill template.

---

## How it works

### Text question

```
User: "Is driving on the shoulder allowed?"
                ↓
1. hybridSearch():
   ├── pgvector similaritySearch (k=8) — semantically similar rules
   └── Prisma keyword search (OR: shoulder*, ...) — exact-match rules
                ↓
2. Parallel:
   ├── DB context  — relevant clauses from the Belarus traffic rules
   └── Tavily      — live internet sources on traffic rules
                ↓
3. GPT-4o-mini:
   "Both sources agree: driving on the shoulder is prohibited
    (clause 89.1). Exceptions: clauses 89.2–89.4..."
                ↓
4. Reply: text + illustrations from keyword-matched rules
```

### Exam ticket photo

```
User: [photo of exam ticket]
            ↓
OcrService.recognize(buffer):
  gpt-4o-mini vision → "Is overtaking at an intersection allowed?\nA) Yes\nB) No\nC) Only..."
            ↓
OcrService.buildQuery() — detects A/B/C/D answer pattern
            ↓
ragService.query("This is an exam question... A) Yes B) No C)...")
            ↓
Reply: "B) No. Per clause 91.4, overtaking at controlled
        intersections is prohibited..."
```

### Data schema

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

## 📁 Project structure

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

## License

[MIT](LICENSE) © [Cstrp](https://github.com/Cstrp)
