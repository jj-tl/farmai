FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY index.js .

EXPOSE 3001

CMD ["npm", "start"]
