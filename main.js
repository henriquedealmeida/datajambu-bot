const { Client } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');

// Variáveis de ambiente
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error("Erro! Variável de ambiente MONGO_URI não definida.");
    process.exit(1);
}

const birthdaySchema = new mongoose.Schema({
    name: String,
    day: Number,
    month: Number,
    groupChatID: String
});
const Birthday = mongoose.model('Birthday', birthdaySchema);

// Conexão com o MongoDB
let client;
let db;

mongoose.connect(MONGO_URI)
    .then(connection => {
        db = connection.connection.db;
        console.log("Conexão com MongoDB estabelecida com sucesso!");

        const store = new MongoStore({ mongoose: mongoose });

        client = new Client({
            authStrategy: new MongoStore({ mongoose: mongoose }),
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
                ] 
            }
        });

        client.on('qr', qr => {
            console.log('QR recebido', qr);
            qrcode.generate(qr, {small:true});
        });
        
        client.on('ready', () => {
            console.log('Cliente pronto!');
            shceduleBirthdayChecks();
        });

        client.on('message', async message => {
            console.log(`Mensagem recebida de ${message.from}: ${message.body}`);
            const chat = await message.getChat();
            
            if (message.body === '!misterio') {
                const groupId = chat.id._serialized;
                message.reply(`🤫`);
                console.log(`ID do grupo "${chat.name}" (${chat.id._serialized}) solicitado.`);
        }
            
            // Comando !add [Nome] [DD/MM]
            if (message.body.startsWith('!add')) {
                const parts = message.body.split(' ');
                if (parts.length < 4) {
                    message.reply('❌ Erro de formatação! Use DD/MM');
                    return;
                }
                const name = parts.slice(1, parts.length - 1).join(' ');
                const datePart = parts[parts.length - 1];
                const [day, month] = datePart.split('/').map(Number);

                if (!name || !day || !month || !isRealDate(day, month)) {
                    message.reply('Sacana... 🤔 Só aceito dias e meses que existem!');
                    return;
                }

                try {
                    const existingBirthday = await Birthday.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') }, groupChatID: chat.id });
                    if (existingBirthday) {
                        message.reply('Aaaah, eu já sabia o aniversário de ${name}');
                        reutrn;
                    }

                    const newBirthday = new Birthday({ name, day, month, groupChatID: chat.id });
                    await newBirthday.save();
                    message.reply(`Agora sei o aniversário de ${name}! ✨`)
                } catch (error) {
                    console.error('Erro ao adicionar aniversário:', error);
                    message.reply('❌ Erro de formatação! Use: !add Nome DD/MM');
                }

            // Comando !remove [Nome]
            if (message.body.startsWith('!remove')) {
                const nameToRemove = message.body.substring(8).trim();
                if (!nameToRemove) {
                    message.reply('❌ Erro de formatação! Use: !remove Nome');
                    return;
                }
                // Checa se a pessoa está tentando remover uma data ao invés de um nome
                if (/^\d{2}\/\d{2}$/.test(nameToRemove)) {
                    message.reply(`Use: !remove Nome (Tem que ser o nome completo da pessoa, ok? 👍🏽)`);
                    return;
                }

                try {
                    const result = await Birthday.deleteOne({ name: { $regex: new RegExp(`^${nameToRemove}$`, 'i') }, groupChatID: chat.id });
                    if (result.deletedCount > 0) {
                        message.reply(`Esqueci quando ${nameToRemove} nasceu... 🪦`);
                        console.log(`Aniversário de ${nameToRemove} removido.`)
                    } else {
                        message.reply(`Eu nem sabia que ${nameToRemove} tinha nascido! 👁️👄👁️`);
                    }
                } catch (error) {
                    console.error('Erro ao remover aniversário:', error);
                    message.reply(`Use: !remove Nome (Tem que ser o nome completo da pessoa, ok? 👍🏽)`);
                }
            }
                
            // Comando !listar
            if (message.body === '!listar') {
                try {
                    const allBirthdays = await Birthday.find({ groupChatID: chat.id });
                    if (allBirthdays.length === 0) {
                        message.reply('Ainda não sei nenhum aniversário :(');
                        return;
                    }

                    let birthdayList = '🦜 Aniversários dos Xiolers: 🦜\n';
                    allBirthdays.forEach(bday => {
                        const displayName = bday.name.split(' ').map(word => word.charAt(0).toUpperCase + word.slice(1)).join(' ');
                        birthdayList += `${displayName} - ${bday.day.toString().padStart(2, '0')}/${bday.month.toString().padStart(2, '0')}\n`;
                    });
                    message.reply(birthdayList);
                } catch (error) {
                    console.error('Erro ao listar aniversários:', error);
                    message.reply('Ocorreu um erro ao listar os aniversários. Tenta de novo.');
                }
            }
                
            // Comando !proximos
            if (message.body === '!proximos') {
                try {
                    const allBirthdays = await Birthday.find({ groupChatId: chat.id });
                    const today = new Date();
                    const currentYear = today.getFullYear();
                    let upcomingBirthdays = [];

                    allBirthdays.forEach(bday => {
                        let bdayDate = new Date(CurrentYear, bday.month - 1, bday.day);
                        if (bdayDate < today) {
                            bdayDate.setFullYear(currentYear + 1);
                        }
                        const diffTime = bdayDate.getTime() - today.getTime();
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                        const displayDate = `${bday.day.toString().padStart(2, '0')}/${bday.month.toString().padStart(2, '0')}`;

                        upcomingBirthdays.push({
                            name: bday.name,
                            date: bday.date,
                            daysUntil: diffDays,
                            displayDate: displayDate
                        });
                    });

                    // Organiza os próximos aniversários
                    upcomingBirthdays.sort((a, b) => a.date.getTime() - b.date.getTime());

                    let replyMessage = '🎉 Próximos aniversários: 🎈\n';
                    if (upcomingBirthdays.length > 0) {
                        const birthdaysToShow = upcomingBirthdays.slice(0, 3); // Mostra os 3 próximos

                        birthdaysToShow.forEach(bday => {
                            const displayName = bday.name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                            replyMessage += `${displayName} - ${bday.displayDate}\n`;
                        });
                    } else {
                        replyMessage += `Ih, gente! Nenhum aniversário à vista neste grupo...`;
                    }
                    message.reply(replyMessage);
                } catch (error) {
                    console.error('Erro ao buscar próximos aniversários:', error);
                    message.reply('Ocorreu um erro ao buscar os próximos aniversários. Tenta de novo.');
                }
            }
                
            // Comando !help
            if (message.body === '!help') {
                const helpMessage = `🤖 Oi, eu sou o DataJambu e guardo o aniversário dos membros do grupo! 🤖\n
                Como me usar:\n
                ✏️ *!add [Nome] [DD/MM]*\nAdiciona um aniversário na minha cabeça (ex. !add Henrique Jambu 09/06)\n
                ❌ *!remove [Nome]*\nRemove um aniversário da minha cabeça.\n
                📋 *!listar*\nLista todos os aniversários que eu sei.\n
                3️⃣ *!proximos*\nMostra os 3 próximos aniversários.\n
                ‼️ *!help*\nMostra essa mensagem de ajuda :) gostou??`.trim();
                    message.reply(helpMessage);
            }
        }
    });

      client.on('auth_failure', msg => {
            console.error('FALHA DE AUTENTICAÇÃO', msg);
        });

        client.on('disconnected', reason => {
            console.log('Cliente desconectado', reason);
            // Re-inicializa o cliente se for desconectado
            client.initialize();
        });

        // --- Inicializa o Cliente WhatsApp ---
        client.initialize();

    })
    .catch(err => {
        console.error('Erro ao conectar ao MongoDB:', err);
        process.exit(1); // Encerra o processo se não conseguir conectar ao DB
    });


// Funções auxiliares (não precisam de conexão DB para si mesmas)

// Função para verificar se a data é real
function isRealDate(day, month) {
    if (day < 1 || month < 1 || month > 12) {
        return false;
    }

    const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    // Para fevereiro, considera o ano bissexto para 29 dias.
    // Como os aniversários são fixos, 29 dias em fev é o máximo possível para uma data real.
    if (month === 2) {
        return day <= daysInMonth[month - 1]; // daysInMonth[1] é 29
    }
    return day <= daysInMonth[month - 1];
}


// Agendamento de aniversários (CRON)
function scheduleBirthdayChecks() {
    cron.schedule('10 8 * * *', async () => {
        console.log('Verificando aniversários do dia...');
        const today = new Date();
        const currentDay = today.getDate();
        const currentMonth = today.getMonth() + 1; // Mês é 0-indexado

        try {
            // Busca todos os aniversários no DB que correspondem ao dia e mês de hoje
            const birthdaysToday = await Birthday.find({ day: currentDay, month: currentMonth });

            if (birthdaysToday.length > 0) {
                // Para cada aniversário, tenta encontrar o grupo e enviar a mensagem
                for (const bday of birthdaysToday) {
                    try {
                        const chat = await client.getChatById(bday.groupChatId);
                        if (chat) { // Verifica se o chat ainda existe
                            const displayName = bday.name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                            await chat.sendMessage(`🚨 ATENÇÃO XIOLERS 🚨\nHoje é aniversário de ${displayName}! Que seu dia seja incrível, cheio de alegria e de muito jambu!! 🥳🎂`);
                            console.log(`Mensagem de aniversário enviada para ${displayName} no grupo ${chat.name || bday.groupChatId}`);
                        } else {
                            console.log(`Grupo ${bday.groupChatId} não encontrado para ${bday.name}.`);
                        }
                    } catch (chatError) {
                        console.error(`Erro ao enviar mensagem para ${bday.name} no grupo ${bday.groupChatId}:`, chatError);
                    }
                }
            } else {
                console.log('Nenhum aniversário hoje.');
            }
        } catch (error) {
            console.error('Erro ao buscar aniversários para o CRON:', error);
        }
    }, {
        scheduled: true,
        timezone: "America/Belem"
    });

    console.log('Verificação diária de aniversários agendada.');
}

// Servidor web simples para manter o bot ativo
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('DataJambu está online!');
});

app.listen(PORT, () => {
    console.log(`Servidor web rodando na porta ${PORT}`);
});
