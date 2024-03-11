FROM node:18.12

WORKDIR /bybit-order

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 7100

CMD [ "node", "index.js"]
