const { Client, RemoteAuth } = require('whatsapp-web.js'); // Usar RemoteAuth para persistência no MongoDB
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const mongoose = require('mongoose');
const { MongoStore } = require('wwebjs-mongo'); // Pacote correto para store MongoDB

// Conexão com MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Conexão com MongoDB estabelecida com sucesso!');

    // ----- Definição do Modelo de Aniversário (Birthday Model) -----
    const birthdaySchema = new mongoose.Schema({
        name: { type: String, required: true, trim: true },
        day: { type: Number, required: true, min: 1, max: 31 },
        month: { type: Number, required: true, min: 1, max: 12 },
        groupId: { type: String, required: true } // Para armazenar de qual grupo é o aniversário
    });

    // Adiciona um índice composto para garantir unicidade por nome e grupo
    birthdaySchema.index({ name: 1, groupId: 1 }, { unique: true });

    const Birthday = mongoose.model('Birthday', birthdaySchema);

    // ----- Inicialização do Cliente WhatsApp com MongoStore -----
    const store = new MongoStore({ mongoose: mongoose });

    const client = new Client({
        authStrategy: new RemoteAuth({
            clientId: 'datajambu-bot', // ID único para a sessão, importante para multi-device
            store: store,
            backupSyncIntervalMs: 60000
        }),
        puppeteer: {
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process', // Importante para ambientes com recursos limitados como o Render free tier
                '--disable-gpu'
            ],
            headless: true
        }
    });

    // ----- Eventos do Cliente WhatsApp -----
    client.on('qr', qr => {
        console.log('QR RECEIVED', qr);
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log('Cliente WhatsApp está pronto!');
        console.log('Bot de Aniversários está online!');
    });

    client.on('message', async message => {
        const chat = await message.getChat();
        const groupId = chat.isGroup ? chat.id._serialized : null; // Pega o ID do grupo

        // Ignora mensagens que não sejam de grupo ou que não comecem com '!'
        if (!chat.isGroup && message.body[0] !== '!') {
            // Se não for grupo e não for um comando, pode ignorar ou responder algo genérico
            return;
        }

        const args = message.body.split(' ');
        const command = args[0].toLowerCase();

        // Comando !add
        if (command === '!add') {
            if (!groupId) {
                message.reply('Este comando só pode ser usado em grupos.');
                return;
            }
            if (args.length < 4) {
                message.reply('Formato incorreto. Use: `!add [Nome Completo] [DD/MM]`');
                return;
            }

            const datePart = args[args.length - 1]; // Última parte é a data
            const name = args.slice(1, args.length - 1).join(' '); // O resto é o nome

            const dateParts = datePart.split('/');
            const day = parseInt(dateParts[0]);
            const month = parseInt(dateParts[1]);

            if (isNaN(day) || isNaN(month) || !isRealDate(day, month)) {
                message.reply('Data inválida. Use o formato DD/MM.');
                return;
            }

            try {
                const newBirthday = new Birthday({
                    name: name.toLowerCase(), // Armazena em minúsculas para facilitar a busca
                    day,
                    month,
                    groupId
                });
                await newBirthday.save();
                message.reply(`🎉 Aniversário de *${capitalizeName(name)}* em ${day}/${month} adicionado com sucesso!`);
            } catch (error) {
                if (error.code === 11000) { // Erro de chave duplicada (nome e grupo)
                    message.reply(`*${capitalizeName(name)}* já tem um aniversário registrado neste grupo.`);
                } else {
                    console.error('Erro ao adicionar aniversário:', error);
                    message.reply('Ocorreu um erro ao adicionar o aniversário. Tente novamente mais tarde.');
                }
            }
        }

        // Comando !remove
        if (command === '!remove') {
            if (!groupId) {
                message.reply('Este comando só pode ser usado em grupos.');
                return;
            }
            if (args.length < 2) {
                message.reply('Formato incorreto. Use: `!remove [Nome Completo]`');
                return;
            }

            const nameToRemove = args.slice(1).join(' ').toLowerCase();

            try {
                const result = await Birthday.deleteOne({ name: nameToRemove, groupId });
                if (result.deletedCount > 0) {
                    message.reply(`❌ Aniversário de *${capitalizeName(nameToRemove)}* removido com sucesso.`);
                } else {
                    message.reply(`Não encontrei o aniversário de *${capitalizeName(nameToRemove)}* neste grupo.`);
                }
            } catch (error) {
                console.error('Erro ao remover aniversário:', error);
                message.reply('Ocorreu um erro ao remover o aniversário. Tente novamente mais tarde.');
            }
        }

        // Comando !listar
        if (command === '!listar') {
            if (!groupId) {
                message.reply('Este comando só pode ser usado em grupos.');
                return;
            }
            try {
                const allBirthdays = await Birthday.find({ groupId }).sort({ month: 1, day: 1 });
                let replyMessage = '📋 *Lista de Aniversários:*\n\n';
                if (allBirthdays.length > 0) {
                    allBirthdays.forEach(bday => {
                        const displayName = capitalizeName(bday.name);
                        replyMessage += `${displayName}: ${bday.day.toString().padStart(2, '0')}/${bday.month.toString().padStart(2, '0')}\n`;
                    });
                } else {
                    replyMessage += 'Nenhum aniversário registrado neste grupo ainda.';
                }
                message.reply(replyMessage);
            } catch (error) {
                console.error('Erro ao listar aniversários:', error);
                message.reply('Ocorreu um erro ao listar os aniversários. Tente novamente mais tarde.');
            }
        }

        // Comando !proximos
        if (command === '!proximos') {
            if (!groupId) {
                message.reply('Este comando só pode ser usado em grupos.');
                return;
            }
            try {
                const allBirthdays = await Birthday.find({ groupId });
                const today = new Date();
                const currentMonth = today.getMonth() + 1; // Mês atual (1-12)
                const currentDay = today.getDate(); // Dia atual

                const upcomingBirthdays = [];

                allBirthdays.forEach(bday => {
                    let year = today.getFullYear();
                    // Se o aniversário já passou este ano, considera o próximo ano
                    if (bday.month < currentMonth || (bday.month === currentMonth && bday.day < currentDay)) {
                        year++;
                    }
                    const bdayDate = new Date(year, bday.month - 1, bday.day);
                    upcomingBirthdays.push({
                        name: bday.name,
                        date: bdayDate,
                        displayDate: `${bday.day.toString().padStart(2, '0')}/${bday.month.toString().padStart(2, '0')}`
                    });
                });

                // Ordena os próximos aniversários por data
                upcomingBirthdays.sort((a, b) => a.date.getTime() - b.date.getTime());

                let replyMessage = '🎉 *Próximos aniversários:*\n\n';
                if (upcomingBirthdays.length > 0) {
                    const birthdaysToShow = upcomingBirthdays.slice(0, 3); // Mostra os 3 próximos

                    birthdaysToShow.forEach(bday => {
                        replyMessage += `*${capitalizeName(bday.name)}* - ${bday.displayDate}\n`;
                    });
                } else {
                    replyMessage += `Nenhum aniversário a vista neste grupo...`;
                }
                message.reply(replyMessage);
            } catch (error) {
                console.error('Erro ao buscar próximos aniversários:', error);
                message.reply('Ocorreu um erro ao buscar os próximos aniversários. Tente novamente mais tarde.');
            }
        }

        // Comando !help
        if (command === '!help') {
            const helpMessage = `🤖 Oi, eu sou o DataJambu e guardo o aniversário dos membros do grupo! 🤖\n\n` +
                `*Como me usar:*\n\n` +
                `✏️ *!add [Nome Completo] [DD/MM]*\n` +
                `Adiciona um aniversário (ex. \`!add Henrique Jambu 09/06\`)\n\n` +
                `❌ *!remove [Nome Completo]*\n` +
                `Remove um aniversário.\n\n` +
                `📋 *!listar*\n` +
                `Lista todos os aniversários que eu sei neste grupo.\n\n` +
                `3️⃣ *!proximos*\n` +
                `Mostra os 3 próximos aniversários neste grupo.\n\n` +
                `Se tiver dúvidas, chame meu criador!`;
            message.reply(helpMessage);
        }
    });

    client.on('auth_failure', msg => {
        console.error('FALHA DE AUTENTICAÇÃO', msg);
    });

    client.on('disconnected', reason => {
        console.log('Cliente desconectado!', reason);
    });

    // ----- Funções Auxiliares -----
    function isRealDate(day, month) {
        if (day < 1 || month < 1 || month > 12) {
            return false;
        }
        const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        // Considera ano bissexto para fevereiro (apenas para validação do dia 29)
        if (month === 2) {
            return day <= daysInMonth[month - 1];
        }
        return day <= daysInMonth[month - 1];
    }

    function capitalizeName(name) {
        return name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    // ----- Agendamento para verificar e anunciar aniversários (Cron Job) -----
    // Roda todos os dias às 9:00 (no fuso horário do servidor, que o Render configura para UTC)
    cron.schedule('0 9 * * *', async () => {
        console.log('Verificando aniversários...');
        const today = new Date();
        const currentMonth = today.getMonth() + 1; // Mês atual (1-12)
        const currentDay = today.getDate(); // Dia atual

        try {
            // Encontra todos os aniversariantes de hoje em todos os grupos
            const birthdaysToday = await Birthday.find({
                day: currentDay,
                month: currentMonth
            });

            if (birthdaysToday.length > 0) {
                // Agrupa os aniversariantes por grupo para enviar uma única mensagem por grupo
                const birthdaysByGroup = {};
                birthdaysToday.forEach(bday => {
                    if (!birthdaysByGroup[bday.groupId]) {
                        birthdaysByGroup[bday.groupId] = [];
                    }
                    birthdaysByGroup[bday.groupId].push(bday.name);
                });

                for (const groupId in birthdaysByGroup) {
                    const names = birthdaysByGroup[groupId].map(name => `*${capitalizeName(name)}*`).join(' e ');
                    const chat = await client.getChatById(groupId);
                    if (chat) {
                        await chat.sendMessage(`🎉 Parabéns ${names}! Feliz aniversário! 🎂🥳`);
                        console.log(`Mensagem de aniversário enviada para o grupo ${chat.name || groupId}.`);
                    } else {
                        console.log(`Não foi possível encontrar o chat com ID ${groupId} para enviar o aniversário.`);
                    }
                }
            } else {
                console.log('Nenhum aniversário hoje.');
            }
        } catch (error) {
            console.error('Erro ao verificar aniversários agendados:', error);
        }
    }, {
        timezone: "America/Belem" // Define o fuso horário para Belém
    });

    // Inicia o cliente WhatsApp
    client.initialize();

}).catch(err => {
    console.error('Erro ao conectar ao MongoDB:', err);
    process.exit(1); // Sai do processo se a conexão com o DB falhar
});
