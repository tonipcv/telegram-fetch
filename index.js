require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const express = require('express');
const cors = require('cors');

const prisma = new PrismaClient();
const app = express();

// Configuração do CORS e JSON parsing
app.use(cors());
app.use(express.json());

// Rota para buscar todas as mensagens
app.get('/messages', async (req, res) => {
  try {
    const messages = await prisma.message.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      take: 100
    });
    res.json(messages);
  } catch (error) {
    console.error('Erro ao buscar mensagens:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para buscar apenas os textos das mensagens
app.get('/messages/text', async (req, res) => {
  try {
    const messages = await prisma.message.findMany({
      select: {
        text: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 100
    });
    const textOnly = messages.map(message => message.text);
    res.json(textOnly);
  } catch (error) {
    console.error('Erro ao buscar textos das mensagens:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para buscar sinais de trade
app.get('/trades', async (req, res) => {
  try {
    const trades = await prisma.tradeSignal.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      take: 100
    });
    res.json(trades);
  } catch (error) {
    console.error('Erro ao buscar sinais de trade:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Inicialização do servidor
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Testa a conexão com o banco
    await prisma.$connect();
    console.log('Conectado ao banco de dados via Prisma');

    // Inicia o servidor
    app.listen(PORT, () => {
      console.log(`API rodando na porta ${PORT}`);
    });
  } catch (error) {
    console.error('Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

// Tratamento de encerramento gracioso
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

startServer();
