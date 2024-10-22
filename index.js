require('dotenv').config();

const { Telegraf } = require('telegraf');
const { message } = require('telegraf/filters');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const bot = new Telegraf(process.env.BOT_TOKEN);

prisma.$connect()
  .then(() => console.log('Conectado ao banco de dados via Prisma'))
  .catch((error) => console.error('Erro ao conectar via Prisma:', error));

bot.on(message('text'), async (ctx) => {
    console.log(ctx.message);

    try {
        // Salvar a mensagem no banco de dados
        const savedMessage = await prisma.message.create({
            data: {
                text: ctx.message.text,
                userId: ctx.message.from.id,
                chatId: ctx.message.chat.id,
                // createdAt é preenchido automaticamente pelo Prisma
            },
        });
        console.log('Mensagem salva:', savedMessage);
    } catch (error) {
        console.error('Erro ao processar a mensagem:', error);
    }
});

bot.launch();

// Encerrar o bot e fechar a conexão do Prisma quando o processo for encerrado
process.on('SIGINT', async () => {
    bot.stop('SIGINT');
    await prisma.$disconnect();
    process.exit();
});
