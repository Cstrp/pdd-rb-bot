-- CreateEnum
CREATE TYPE "ChapterType" AS ENUM ('CHAPTER', 'APPENDIX');

-- CreateTable
CREATE TABLE "Chapter" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "ChapterType" NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "commentary" TEXT,
    "chapterId" INTEGER NOT NULL,
    "parentId" INTEGER,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleImage" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "ruleId" INTEGER NOT NULL,

    CONSTRAINT "RuleImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_url_key" ON "Chapter"("url");

-- CreateIndex
CREATE UNIQUE INDEX "Rule_chapterId_number_key" ON "Rule"("chapterId", "number");

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Rule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleImage" ADD CONSTRAINT "RuleImage_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
