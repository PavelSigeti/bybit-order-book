FROM node:18.12

WORKDIR /socket

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 7000

CMD [ "node", "index.js"]