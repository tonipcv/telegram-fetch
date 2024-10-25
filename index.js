require('dotenv').config();

const { Telegraf } = require('telegraf');
const { message } = require('telegraf/filters');
const { PrismaClient, Prisma } = require('@prisma/client');
const express = require('express');
const cors = require('cors');

const prisma = new PrismaClient();
const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

async function checkDatabaseStructure() {
  try {
    const tableInfo = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Message'
    `;
    console.log('Estrutura da tabela Message:', tableInfo);
  } catch (error) {
    console.error('Erro ao verificar a estrutura do banco de dados:', error);
  }
}

checkDatabaseStructure();

async function initializeDatabase() {
  try {
    await prisma.$connect();
    console.log('Conectado ao banco de dados via Prisma');
    
    // Tenta fazer uma consulta simples para verificar se a tabela existe
    await prisma.tradeSignal.findFirst();
    console.log('Tabela TradeSignal existe e está acessível.');
  } catch (error) {
    console.error('Erro ao conectar ou verificar o banco de dados:', error);
    process.exit(1);
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
  console.error('Stack trace:', err.stack);
});

// Adicione este bloco de código após a inicialização do bot
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

const server = app.listen(PORT, () => {
  console.log(`API rodando na porta ${server.address().port}`);
});

// Modifique a parte de inicialização para:
initializeDatabase()
  .then(() => {
    return Promise.all([
      bot.launch(),
      new Promise((resolve) => {
        server.on('listening', () => {
          console.log(`Servidor Express iniciado na porta ${server.address().port}`);
          resolve();
        });
      })
    ]);
  })
  .then(() => {
    console.log('Bot iniciado, conectado ao banco de dados e servidor Express rodando');
  })
  .catch((error) => {
    console.error('Erro ao iniciar o bot, conectar ao banco de dados ou iniciar o servidor:', error);
    process.exit(1);
  });

// Encerrar o bot e fechar a conexão do Prisma quando o processo for encerrado
process.on('SIGINT', async () => {
    bot.stop('SIGINT');
    await prisma.$disconnect();
    process.exit();
});

bot.launch().catch((error) => {
  console.error('Erro ao iniciar o bot:', error);
});
