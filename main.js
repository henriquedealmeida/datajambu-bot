const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

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

function getNextBdayDate(day, month) {
    const today = new Date();
    const currentYear = today.getFullYear();

    let bdayThisYear = new Date(currentYear, month - 1, day);

    if (bdayThisYear < today) {
        bdayThisYear = new Date(currentYear + 1, month - 1, day);
    }
    return bdayThisYear
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
});

// When the client received QR-Code
client.on('qr', qr => {
    qrcode.generate(qr, {small:true});
});

client.on('message_create', async message => {
    const chat = await message.getChat();

    if(chat.isGroup) {
        // Comando !add [Nome] [DD/MM]
        if (message.body.startsWith('!add')) {
            const parts = message.body.split(' ');
            if (parts.length >= 3) {
                const date = parts[parts.length - 1];
                const name = parts.slice(1, -1).join(' ');

                if (/^\d{2}\/\d{2}$/.test(date)) {
                    const normalizedName = name.toLowerCase();
                    birthdays[normalizedName] = date;
                    saveBirthdays();
                    message.reply(`Agora sei o aniversário de ${name}! ✨`);
                    console.log(`Aniversário de ${name} adicionado.`);
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
                } else {
                    message.reply(`Eu nem sabia o aniversário de ${nameToRemove}! 👁️👄👁️`);
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