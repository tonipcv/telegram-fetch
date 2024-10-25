-- CreateTable
CREATE TABLE "TradeSignal" (
    "id" SERIAL NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeSignal_pkey" PRIMARY KEY ("id")
);
