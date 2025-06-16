FROM ghcr.io/puppeteer/puppeteer:latest

WORKDIR /usr/src/app

COPY package*.json ./

# ALGORITMO PARA CORRIGIR ERRO DE PERMISSÃO (EACCES)
USER root
RUN chown -R pptruser:pptruser /usr/src/app
USER pptruser

RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "main.js"]
