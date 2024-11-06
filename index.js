require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const express = require('express');
const cors = require('cors');

const prisma = new PrismaClient();
const app = express();

// Configuração do CORS e JSON parsing
app.use(cors());
app.use(express.json());

// Rota de healthcheck
app.get('/', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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

    // Inicia o servidor com melhor tratamento de erros
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`API rodando em http://0.0.0.0:${PORT}`);
    });

    server.on('error', (error) => {
      if (error.code === 'EACCES') {
        console.error(`Porta ${PORT} requer privilégios elevados`);
      } else if (error.code === 'EADDRINUSE') {
        console.error(`Porta ${PORT} já está em uso`);
      } else {
        console.error('Erro ao iniciar servidor:', error);
      }
      process.exit(1);
    });

    // Tratamento de encerramento gracioso
    const shutdown = async () => {
      console.log('Iniciando encerramento gracioso...');
      server.close(async () => {
        console.log('Servidor HTTP fechado');
        await prisma.$disconnect();
        console.log('Conexão com banco de dados fechada');
        process.exit(0);
      });

      // Força o encerramento após 10 segundos
      setTimeout(() => {
        console.error('Encerramento forçado após timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    console.error('Erro fatal ao iniciar servidor:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

startServer().catch(error => {
  console.error('Erro não tratado:', error);
  process.exit(1);
});
