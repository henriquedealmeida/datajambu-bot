FROM node:22-slim

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y \
  chromium \
  libgobject-2.0-0 \
  libnss3 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxss1 \
  libxtst6 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libgbm1 \
  libasound2 \
  libpangocairo-1.0-0 \
  libgtk-3-0 \
  libuuid1 \
  libu2f-udev \
  udev \
  fonts-noto-color-emoji \
  libwoff1 \
  libharfbuzz-icu0 \
  libgdk-pixbuf2.0-0 \
  libwebp-dev \
  libglib2.0-0 \
  libfreetype6 \
  libfontconfig1 \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["node", "main.js"]
