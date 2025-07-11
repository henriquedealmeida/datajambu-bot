const { Client, RemoteAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const qrcodeLib= require('qrcode');
const cron = require('node-cron');
const mongoose = require('mongoose');
const { MongoStore } = require('wwebjs-mongo');
const express = require('express');

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Conexão com MongoDB estabelecida com sucesso!');

    const birthdaySchema = new mongoose.Schema({
        name: { type: String, required: true, trim: true },
        day: { type: Number, required: true, min: 1, max: 31 },
        month: { type: Number, required: true, min: 1, max: 12 },
        groupId: { type: String, required: true }
    });

    birthdaySchema.index({ name: 1, groupId: 1 }, { unique: true });

    const Birthday = mongoose.model('Birthday', birthdaySchema);

    const store = new MongoStore({ mongoose: mongoose });

    const client = new Client({
        authStrategy: new RemoteAuth({
            clientId: 'datajambu-bot',
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
                '--single-process',
                '--disable-gpu'
            ],
            headless: true
        }
    });

    client.on('qr', qr => {
        console.log('QR RECEBIDO (ASCII)', qr);
        qrcode.generate(qr, { small: true });

        qrcodeLib.toDataURL(qr, (err, url) => {
            if (err) {
                console.error('Erro ao gerar QR code como Data URL:', err);
                return;
            }
            console.log(url);
        })
    });

    client.on('ready', () => {
        console.log('Cliente WhatsApp está pronto!');
        console.log('DataJambu está online!');
    });

    client.on('message', async message => {
        const chat = await message.getChat();
        const groupId = chat.isGroup ? chat.id._serialized : null;

        // Ignora mensagens que não sejam de grupo ou que não comecem com '!'
        if (!chat.isGroup && message.body[0] !== '!') {
            return;
        }

        const args = message.body.split(' ');
        const command = args[0].toLowerCase();

        // Comando !add [Nome] [DD/MM]
        if (command === '!add') {
            if (!groupId) {
                message.reply('Este comando só pode ser usado em grupos.');
                return;
            }
            if (args.length < 3) {
                message.reply('Formato incorreto. Use: `!add [Nome Completo] [DD/MM]`');
                return;
            }

            const datePart = args[args.length - 1];
            const name = args.slice(1, args.length - 1).join(' ');

            const dateParts = datePart.split('/');
            const day = parseInt(dateParts[0]);
            const month = parseInt(dateParts[1]);

            if (isNaN(day) || isNaN(month) || !isRealDate(day, month)) {
                message.reply('Formato inválido. Use o formato DD/MM.');
                return;
            }

            try {
                const newBirthday = new Birthday({
                    name: name.toLowerCase(),
                    day,
                    month,
                    groupId
                });
                await newBirthday.save();
                message.reply(`✨ Agora sei o aniversário de *${capitalizeName(name)}*!`);
            } catch (error) {
                if (error.code === 11000) { 
                    message.reply(`*${capitalizeName(name)}* já tem um aniversário registrado neste grupo.`);
                } else {
                    console.error('Erro ao adicionar aniversário:', error);
                    message.reply('Ocorreu um erro ao adicionar o aniversário. Tente novamente mais tarde.');
                }
            }
        }

        // Comando !remove [Nome]
        if (command === '!remove') {
            if (!groupId) {
                message.reply('Este comando só pode ser usado em grupos.');
                return;
            }
            if (args.length < 2) {
                message.reply('Formato incorreto. Use: `!remove [Nome]`');
                return;
            }

            const nameToRemove = args.slice(1).join(' ').toLowerCase();

            try {
                const result = await Birthday.deleteOne({ name: nameToRemove, groupId });
                if (result.deletedCount > 0) {
                    message.reply(`🪦 Esqueci quando *${capitalizeName(nameToRemove)}* nasceu..`);
                } else {
                    message.reply(`🤖 Eu nem sabia que *${capitalizeName(nameToRemove)}* tinha nascido!`);
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
                let replyMessage = '🦜 *Aniversários dos Xiolers:*\n\n';
                if (allBirthdays.length > 0) {
                    allBirthdays.forEach(bday => {
                        const displayName = capitalizeName(bday.name);
                        replyMessage += `${displayName} - ${bday.day.toString().padStart(2, '0')}/${bday.month.toString().padStart(2, '0')}\n`;
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
                const currentHour = today.getHours();
                const cronHour = 8;

                const upcomingBirthdays = [];

                allBirthdays.forEach(bday => {
                    let year = today.getFullYear();
                    let bdayDate = new Date(year, bday.month - 1, bday.day);
                    bdayDate.setHours(0, 0, 0, 0);

                    const isToday = (bdayDate.getDate() === today.getDate() &&
                                     bdayDate.getMonth() === today.getMonth());

                    let include = false;

                    if (isToday) {
                        if (currentHour < cronHour) {
                            include = true;
                        }
                    } else if (bdayDate > today) {
                        include = true;
                    } else {
                        year++;
                        bdayDate.setFullYear(year);
                        include = true;
                    }

                    if (include) {
                        upcomingBirthdays.push({
                            name: bday.name,
                            date: bdayDate,
                            displayDate: `${bday.day.toString().padStart(2, '0')}/${bday.month.toString().padStart(2, '0')}`
                        });
                    }
                });

                upcomingBirthdays.sort((a, b) => a.date.getTime() - b.date.getTime());

                let replyMessage = '🎉 *Próximos aniversários:*\n\n';
                if (upcomingBirthdays.length > 0) {
                    const birthdaysToShow = upcomingBirthdays.slice(0, 3);

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
                `✏️ *!add [Nome] [DD/MM]*\n` +
                `Adiciona um aniversário (ex. \`!add Henrique Jambu 09/06\`)\n\n` +
                `❌ *!remove [Nome]*\n` +
                `Remove um aniversário da minha cabeça.\n\n` +
                `📋 *!listar*\n` +
                `Lista todos os aniversários que eu sei neste grupo.\n\n` +
                `3️⃣ *!proximos*\n` +
                `Mostra os 3 próximos aniversários neste grupo.\n\n` +
                `🆘 *!help*\n` +
                `Mostra essa mensagem de ajuda. Gostou? :)`;
            message.reply(helpMessage);
        }
    });

    client.on('auth_failure', msg => {
        console.error('FALHA DE AUTENTICAÇÃO', msg);
    });

    client.on('disconnected', reason => {
        console.log('Cliente desconectado!', reason);
    });

    // Funções
    function isRealDate(day, month) {
        if (day < 1 || month < 1 || month > 12) {
            return false;
        }
        const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (month === 2) {
            return day <= daysInMonth[month - 1];
        }
        return day <= daysInMonth[month - 1];
    }

    function capitalizeName(name) {
        return name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    // Agendamento para verificar e anunciar aniversários
    cron.schedule('0 8 * * *', async () => {
        console.log('Verificando aniversários...');
        const today = new Date();
        const currentMonth = today.getMonth() + 1;
        const currentDay = today.getDate();

        try {
            const birthdaysToday = await Birthday.find({
                day: currentDay,
                month: currentMonth
            });

            if (birthdaysToday.length > 0) {
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
                        await chat.sendMessage(`🚨 Atenção xiolas! Hoje é aniversário de ${names}! Feliz aniversário! Que o dia de hoje seja cheio de felicidade e de muito jambu! 🎂🥳`);
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
        timezone: "America/Belem" 
    });

    const app = express();
    const port = process.env.PORT || 3000;

    app.get('/', (req, res) => {
        res.status(200).send('DataJambu está online!');
    });

    app.listen(port, '0.0.0.0', () => {
        console.log(`Servidor de health check iniciado na porta ${port}`);
    })
    
    client.initialize();

}).catch(err => {
    console.error('Erro ao conectar ao MongoDB:', err);
    process.exit(1);
});
