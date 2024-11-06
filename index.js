require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const express = require('express');
const cors = require('cors');

const prisma = new PrismaClient();
const app = express();

// Configuração do CORS mais permissiva
app.use(cors({
  origin: '*', // Permite todas as origens
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Rota de healthcheck mais detalhada
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    port: process.env.PORT || 3000
  });
});

// Rota para buscar todas as mensagens com paginação
app.get('/messages', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take: limit
      }),
      prisma.message.count()
    ]);

    res.json({
      data: messages,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erro ao buscar mensagens:', error);
    res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
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

// Nova rota POST para criar sinais de trade
app.post('/trades', async (req, res) => {
  try {
    const { symbol, type, entry, sl, tp, text } = req.body;

    // Validação básica dos campos
    if (!symbol || !type || !entry || !sl || !tp) {
      return res.status(400).json({
        error: 'Campos obrigatórios faltando',
        required: ['symbol', 'type', 'entry', 'sl', 'tp'],
        received: req.body
      });
    }

    // Validação do tipo de trade
    if (!['COMPRA', 'VENDA'].includes(type.toUpperCase())) {
      return res.status(400).json({
        error: 'Tipo de trade inválido',
        allowedTypes: ['COMPRA', 'VENDA'],
        received: type
      });
    }

    // Validação dos valores numéricos
    const numericFields = { entry, sl, tp };
    for (const [field, value] of Object.entries(numericFields)) {
      if (isNaN(parseFloat(value))) {
        return res.status(400).json({
          error: `Campo ${field} deve ser um número válido`,
          received: value
        });
      }
    }

    // Criar o sinal de trade
    const trade = await prisma.tradeSignal.create({
      data: {
        symbol: symbol.toUpperCase(),
        type: type.toUpperCase(),
        entry: parseFloat(entry),
        sl: parseFloat(sl),
        tp: parseFloat(tp),
        text: text || `${symbol.toUpperCase()} - ${type.toUpperCase()} em ${entry}`
      }
    });

    // Criar mensagem associada
    await prisma.message.create({
      data: {
        text: `SINAL\nPAR: ${trade.symbol}\n${trade.type}\nENTRADA: ${trade.entry}\nSL: ${trade.sl}\nTP: ${trade.tp}`
      }
    });

    res.status(201).json({
      message: 'Sinal de trade criado com sucesso',
      data: trade
    });

  } catch (error) {
    console.error('Erro ao criar sinal de trade:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
});

// Nova rota POST para criar mensagens
app.post('/messages', async (req, res) => {
  try {
    const { text } = req.body;

    // Validação básica
    if (!text) {
      return res.status(400).json({
        error: 'Campo text é obrigatório',
        received: req.body
      });
    }

    // Criar a mensagem
    const message = await prisma.message.create({
      data: {
        text: text
      }
    });

    res.status(201).json({
      message: 'Mensagem criada com sucesso',
      data: message
    });

  } catch (error) {
    console.error('Erro ao criar mensagem:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
});

// Inicialização do servidor
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await prisma.$connect();
    console.log('Conectado ao banco de dados via Prisma');

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`API rodando em http://0.0.0.0:${PORT}`);
      console.log('Ambiente:', process.env.NODE_ENV);
    });

    // Melhor tratamento de erros do servidor
    server.on('error', (error) => {
      console.error('Erro no servidor:', error);
      if (error.code === 'EADDRINUSE') {
        console.log(`Porta ${PORT} em uso, tentando próxima porta...`);
        server.close();
        startServer(PORT + 1);
      }
    });

    // Tratamento de sinais mais robusto
    const shutdown = async (signal) => {
      console.log(`Recebido sinal ${signal}, iniciando shutdown gracioso...`);
      
      // Parar de aceitar novas conexões
      server.close(async () => {
        console.log('Servidor HTTP fechado');
        try {
          await prisma.$disconnect();
          console.log('Prisma desconectado');
          process.exit(0);
        } catch (err) {
          console.error('Erro ao desconectar Prisma:', err);
          process.exit(1);
        }
      });

      // Timeout de segurança
      setTimeout(() => {
        console.error('Shutdown forçado após timeout');
        process.exit(1);
      }, 15000);
    };

    // Registrar handlers para diferentes sinais
    ['SIGTERM', 'SIGINT', 'SIGUSR2'].forEach(signal => {
      process.on(signal, () => shutdown(signal));
    });

    // Tratamento de erros não capturados
    process.on('uncaughtException', (error) => {
      console.error('Erro não capturado:', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Promessa rejeitada não tratada:', reason);
      shutdown('unhandledRejection');
    });

  } catch (error) {
    console.error('Erro fatal ao iniciar servidor:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

startServer().catch(async (error) => {
  console.error('Erro não tratado na inicialização:', error);
  await prisma.$disconnect();
  process.exit(1);
});
