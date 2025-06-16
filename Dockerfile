# Use uma imagem Node.js completa (não-slim).
FROM node:22

# Define o diretório de trabalho dentro do container
WORKDIR /usr/src/app

# Instala as dependências do sistema operacional necessárias para o Puppeteer (AGORA SEM 'chromium' AQUI)
RUN apt-get update && apt-get install -y \
    libnss3 \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgobject-2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxtst6 \
    xdg-utils \
    fonts-noto-color-emoji \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Copia os arquivos package.json e package-lock.json primeiro para alavancar o cache do Docker
COPY package*.json ./

# Instala as dependências do Node.js (agora incluindo o Puppeteer, que baixará o Chromium)
RUN npm install

# Copia o restante do código da sua aplicação para o diretório de trabalho
COPY . .

# Expõe a porta que seu servidor Express vai escutar (seu main.js escuta na porta 3000)
EXPOSE 3000

# Comando para iniciar sua aplicação
CMD ["node", "main.js"]
