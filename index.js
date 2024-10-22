require('dotenv').config();

const { Telegraf } = require('telegraf');
const { message } = require('telegraf/filters');
const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient();
const bot = new Telegraf(process.env.BOT_TOKEN);

// Adicione no início do arquivo, logo após a criação da instância do PrismaClient
async function testDatabaseConnection() {
  try {
    const testMessage = await prisma.message.create({
      data: {
        text: 'Teste de conexão',
      },
    });
    console.log('Teste de conexão bem-sucedido:', testMessage);
  } catch (error) {
    console.error('Erro no teste de conexão:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error('Código do erro Prisma:', error.code);
      console.error('Mensagem do erro Prisma:', error.message);
    }
  }
}

testDatabaseConnection();

async function checkDatabaseStructure() {
  try {
    const tableInfo = await prisma.$queryRaw`PRAGMA table_info(Message)`;
    console.log('Estrutura da tabela Message:', tableInfo);
  } catch (error) {
    console.error('Erro ao verificar a estrutura do banco de dados:', error);
  }
}

checkDatabaseStructure();

prisma.$connect()
  .then(() => console.log('Conectado ao banco de dados via Prisma'))
  .catch((error) => console.error('Erro ao conectar via Prisma:', error));

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

bot.catch((err) => {
  console.error('Erro no bot:', err);
  console.error('Stack trace:', err.stack);
});

bot.launch()
  .then(() => console.log('Bot iniciado'))
  .catch((error) => console.error('Erro ao iniciar o bot:', error));

// Encerrar o bot e fechar a conexão do Prisma quando o processo for encerrado
process.on('SIGINT', async () => {
    bot.stop('SIGINT');
    await prisma.$disconnect();
    process.exit();
});
