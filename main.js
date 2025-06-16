const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const cron = require('node-cron');
const { group } = require('console');

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Constantes
const BIRTHDAYS_FILE = 'birthdays.json';

// Variável global
let birthdays = {};

// Funções
function loadBirthdays() {
    if (fs.existsSync(BIRTHDAYS_FILE)) {
        const data = fs.readFileSync(BIRTHDAYS_FILE, 'utf-8');
        birthdays = JSON.parse(data);
        console.log('Aniversários carregados do arquivo!');
    } else {
        console.log('Arquivo de aniversários não encontrado. Começando do zero.');
    }
}

function saveBirthdays() {
    fs.writeFileSync(BIRTHDAYS_FILE, JSON.stringify(birthdays, null, 2), 'utf-8');
    console.log('Aniversários salvos no arquivo.');
}

function isRealDate(day, month) {
    if (day < 1 || month < 1 || month > 12) {
        return false;
    }

    const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    if (month === 2 && day > 29) {
        return false;
    }

    if (day > daysInMonth[month - 1]) {
        return false;
    }

    const testDate = new Date(2000, month - 1, day);

    return testDate.getMonth() === (month - 1) && testDate.getDate() === day;
}

function getNextBdayDate(day, month) {
    const today = new Date();
    const currentYear = today.getFullYear();

    let bdayThisYear = new Date(currentYear, month - 1, day);

    if (bdayThisYear < today) {
        bdayThisYear = new Date(currentYear + 1, month - 1, day);
    }
    return bdayThisYear
}

function sendHappyBirthday(client) {
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth() + 1;

    console.log(`Verificando aniversários hoje: ${currentDay}/${currentMonth}`);

    let happyBdaySent = false;
    for (const name in birthdays) {
        const dateParts = birthdays[name].split('/');
        const bdayDay = parseInt(dateParts[0], 10);
        const bdayMonth = parseInt(dateParts[1], 10);

        if (bdayDay === currentDay && bdayMonth === currentMonth) {
            const displayName = name.split(' ')
                                .map(word => {
                                    if (word && word.length > 0) {
                                        return word.charAt(0).toUpperCase() + word.slice(1);
                                    }
                                    return '';
                                })
                                .filter(Boolean)
                                .join(' ');
            const happyBdayMessage = `🚨 ATENÇÃO XIOLERS 🚨\nHoje é aniversário de ${displayName}! Que seu dia seja incrível, cheio de alegria e de muito jambu!! 🥳🎂`;
            
            const GROUP_ID_TO_SEND_MESSAGE = '120363158758153954@g.us';

            client.sendMessage(GROUP_ID_TO_SEND_MESSAGE, happyBdayMessage)
                .then(() => console.log(`Parabéns enviados para ${displayName} no ${GROUP_ID_TO_SEND_MESSAGE}`))
                .catch(err => console.error(`Erro ao enviar parabéns para ${displayName}:`, err));
            happyBdaySent = true;
        }
    }
    if (!happyBdaySent) {
        console.log(`Nenhum aniversário hoje, ${currentDay}/${currentMonth}`);
    }
}

// Create a new client instance
const client = new Client({
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    },
    authStrategy: new LocalAuth()
});

// When the client is ready, run this code (only once)
client.once('ready', () => {
    console.log('Client is ready!');
    loadBirthdays();

    const GROUP_ID_FOR_BIRTHDAYS = '120363158758153954@g.us';

    cron.schedule('5 8 * * *', () => {
        console.log(`Checando aniversários...`);
        sendHappyBirthday(client, GROUP_ID_FOR_BIRTHDAYS);
    }, {
        scheduled: true,
        timezone: "America/Belem"
    });

    console.log(`Agenda de aniversários configurada.`);
});

// When the client received QR-Code
client.on('qr', qr => {
    qrcode.generate(qr, {small:true});
});

client.on('message_create', async message => {
    const chat = await message.getChat();

    if(chat.isGroup) {
        if (message.body === '!misterio') {
            const groupId = chat.id._serialized;
            message.reply(`🤫`);
            console.log(`ID do grupo "${chat.name}" (${chat.id._serialized}) solicitado.`);
        }
        // Comando !add [Nome] [DD/MM]
        if (message.body.startsWith('!add')) {
            const parts = message.body.split(' ');
            if (parts.length >= 3) {
                const date = parts[parts.length - 1];
                const name = parts.slice(1, -1).join(' ');

                if (/^\d{2}\/\d{2}$/.test(date)) {
                    const [dayStr, monthStr] = date.split('/');
                    const day = parseInt(dayStr, 10);
                    const month = parseInt(monthStr, 10);

                    if (isRealDate(day, month)) {
                        const normalizedName = name.toLowerCase();
                        birthdays[normalizedName] = date;
                        saveBirthdays();
                        message.reply(`Agora sei o aniversário de ${name}! ✨`);
                        console.log(`Aniversário de ${name} adicionado.`);
                    } else {
                        message.reply(`Sacana... 🤔 Só aceito dias e meses que existem!`)
                    }
                } else {
                    message.reply(`Erro de formatação! ❌ Use: !add Nome DD/MM`);
                }
            } else {
                message.reply(`Erro de formatação! ❌ Use: !add Nome DD/MM`);
            }
        }
        // Comando !listar
        if (message.body === '!listar') {
            if (Object.keys(birthdays).length > 0) {
                let birthdayList = '🦜 Aniversários dos Xiolers: 🦜\n';
                const sortedNames = Object.keys(birthdays).sort((a, b) => {
                    const [dayA, monthA] = birthdays[a].split('/').map(Number);
                    const [dayB, monthB] = birthdays[b].split('/').map(Number);

                    if (monthA !== monthB) {
                        return monthA - monthB;
                    }
                    return dayA - dayB
                });

                for (const name of sortedNames) {
                    const displayName = name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                    birthdayList += `${displayName} - ${birthdays[name]}\n`;
                }
                message.reply(birthdayList);
            } else {
                message.reply('Ainda não sei nenhum aniversário :(');
            }
        }
        // Comando !remove [Nome]
        if (message.body.startsWith('!remove')) {
            const parts = message.body.split(' ');
            if (parts.length >= 2) {
                const nameToRemove = parts.slice(1).join(' ');
                // Checa se a pessoa está tentando remover uma data ao invés de um nome
                if (/^\d{2}\/\d{2}$/.test(nameToRemove)) {
                    message.reply(`Use: !remove Nome (Tem que ser o nome completo da pessoa, ok? 👍🏽)`);
                    return;
                }

                const normalizedNameToRemove = nameToRemove.toLowerCase();

                if (birthdays[normalizedNameToRemove]) {
                    delete birthdays[normalizedNameToRemove];
                    saveBirthdays();
                    message.reply(`Esqueci quando ${nameToRemove} nasceu... 🪦`);
                    console.log(`Aniversário de ${nameToRemove} removido.`)
                } else {
                    message.reply(`Eu nem sabia que ${nameToRemove} tinha nascido! 👁️👄👁️`);
                }
            } else {
                message.reply(`Use: !remove Nome (Tem que ser o nome completo da pessoa, ok? 👍🏽)`);
            }
        }
        // Comando !proximos
        if (message.body === '!proximos') {
            if (Object.keys(birthdays).length === 0) {
                message.reply(`Não sei nenhum aniversário, então não sei quais estão chegando!`);
                return;
            }

            const today = new Date();
            today.setHours(0,0,0,0);

            const upcomingBirthdays = [];

            for (const name in birthdays) {
                const dateParts = birthdays[name].split('/');
                const day = parseInt(dateParts[0], 10);
                const month = parseInt(dateParts[1], 10);

                const nextDate = getNextBdayDate(day, month);

                upcomingBirthdays.push({
                    name: name,
                    date: nextDate,
                    displayDate: `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}`
                });
            }
            // Organiza os próximos aniversários
            upcomingBirthdays.sort((a, b) => a.date.getTime() - b.date.getTime());

            let replyMessage = '🎉 Próximos aniversários: 🎈\n';
            if (upcomingBirthdays.length > 0) {
                const birthdaysToShow = upcomingBirthdays.slice(0, 3);

                birthdaysToShow.forEach(bday => {
                    const displayName = bday.name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

                    replyMessage += `${displayName} - ${bday.displayDate}\n`;                });
            } else {
                replyMessage += `Ih, gente! Nenhum aniversário a vista...`
            }
            message.reply(replyMessage);
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

client.initialize();

// Servidor express para manter o replit ativo
app.get('/', (req, res) => {
    res.send('DataJambu está online!');
});

app.listen(PORT, () => {
    console.log(`Servidor web rodando na porta ${PORT}`);
});
