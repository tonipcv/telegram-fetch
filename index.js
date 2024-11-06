require('dotenv').config();

const { Telegraf } = require('telegraf');
const { message } = require('telegraf/filters');
const { PrismaClient } = require('@prisma/client');
const express = require('express');
const cors = require('cors');

const prisma = new PrismaClient();
const bot = new Telegraf(process.env.BOT_TOKEN, {
  handlerTimeout: 90000, // 90 segundos timeout
  telegram: {
    // Adiciona um identificador único para esta instância
    apiRoot: 'https://api.telegram.org',
    webhookReply: false,
    polling: {
      timeout: 30,
      limit: 100,
    }
  }
});
const app = express();

async function initializeDatabase() {
  try {
    await prisma.$connect();
    console.log('Conectado ao banco de dados via Prisma');
    
    // Tenta fazer uma consulta simples para verificar se as tabelas existem
    await prisma.tradeSignal.findFirst();
    console.log('Tabela TradeSignal existe e está acessível.');
    await prisma.message.findFirst();
    console.log('Tabela Message existe e está acessível.');
  } catch (error) {
    console.error('Erro ao conectar ou verificar o banco de dados:', error);
    throw error; // Propaga o erro para ser tratado na inicialização principal
  }
}

// Configuração do CORS
app.use(cors());

// Middleware para logar todas as atualizações
bot.use((ctx, next) => {
  console.log('Recebida atualização:', JSON.stringify(ctx.update, null, 2));
  return next();
});

bot.command('start', (ctx) => {
    console.log('Comando /start recebido');
    ctx.reply('Olá! Estou funcionando e pronto para salvar mensagens do grupo alvo.');
});

bot.on(['message', 'channel_post'], async (ctx) => {
    console.log('Mensagem ou post de canal recebido:', JSON.stringify(ctx.update, null, 2));
    
    const message = ctx.message || ctx.channelPost;
    const chat = ctx.chat;

    console.log('ID do chat atual:', chat.id);
    console.log('Tipo do chat:', chat.type);

    const targetId = process.env.TARGET_ID;
    console.log('ID alvo (do .env):', targetId);
    console.log('Tipo do ID alvo:', typeof targetId);

    if (!targetId) {
        console.error('TARGET_ID não está definido no arquivo .env');
        return;
    }

    if (chat.id.toString() !== targetId) {
        console.log(`Mensagem não é do alvo. Chat ID: ${chat.id}, Target ID: ${targetId}`);
        return;
    }

    console.log('Mensagem é do alvo. Processando...');

    try {
        console.log('Tentando salvar a mensagem no banco de dados...');
        console.log('Texto da mensagem:', message.text);
        
        // Salvar a mensagem no banco de dados
        const savedMessage = await prisma.message.create({
            data: {
                text: message.text,
            },
        });
        console.log('Mensagem salva com sucesso:', JSON.stringify(savedMessage, null, 2));
    } catch (error) {
        console.error('Erro ao processar a mensagem:', error);
        console.error('Stack trace:', error.stack);
    }
});

bot.on('polling_error', (error) => {
  console.error('Erro de polling:', error);
});

bot.catch((err) => {
  console.error('Erro no bot:', err);
});

const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/messages', async (req, res) => {
  try {
    const messages = await prisma.message.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      take: 100 // Limita a 100 mensagens mais recentes
    });
    res.json(messages);
  } catch (error) {
    console.error('Erro ao buscar mensagens:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Adicione a nova rota aqui
app.get('/messages/text', async (req, res) => {
  try {
    const messages = await prisma.message.findMany({
      select: {
        text: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 100 // Limita a 100 mensagens mais recentes
    });
    const textOnly = messages.map(message => message.text);
    res.json(textOnly);
  } catch (error) {
    console.error('Erro ao buscar textos das mensagens:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

function startServer() {
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, () => {
      console.log(`API rodando na porta ${server.address().port}`);
      resolve(server);
    }).on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.log(`Porta ${PORT} já está em uso. Tentando a próxima...`);
        server.close();
        startServer(PORT + 1).then(resolve).catch(reject);
      } else {
        reject(error);
      }
    });
  });
}

async function main() {
  try {
    await initializeDatabase();
    
    // Primeiro, tenta limpar qualquer webhook existente
    console.log('Removendo webhook...');
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    
    // Espera um pouco antes de iniciar
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const server = await startServer();
    
    // Tenta iniciar o bot com retry
    let retries = 3;
    while (retries > 0) {
      try {
        console.log(`Tentando iniciar o bot (tentativas restantes: ${retries})`);
        await bot.launch({
          dropPendingUpdates: true,
          polling: {
            timeout: 30,
            limit: 100
          }
        });
        console.log('Bot iniciado com sucesso!');
        break;
      } catch (error) {
        retries--;
        if (retries === 0) throw error;
        console.log(`Erro ao iniciar bot, tentando novamente em 5 segundos...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    console.log('Bot iniciado, conectado ao banco de dados e servidor Express rodando');

    // Melhor tratamento de encerramento
    const shutdown = async (signal) => {
      console.log(`Recebido sinal ${signal}`);
      try {
        console.log('Parando o bot...');
        await bot.stop();
        console.log('Desconectando do Prisma...');
        await prisma.$disconnect();
        console.log('Fechando servidor HTTP...');
        server.close(() => {
          console.log('Servidor HTTP fechado');
          process.exit(0);
        });
      } catch (error) {
        console.error('Erro durante o shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
  } catch (error) {
    console.error('Erro na inicialização:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main().catch(console.error);
