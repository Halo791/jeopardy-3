FROM node:20-slim

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY server.js .
COPY flag.txt /flag.txt

EXPOSE 8000
CMD ["npm", "start"]

