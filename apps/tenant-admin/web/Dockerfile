FROM node:20-alpine
WORKDIR /app
COPY package.json ./package.json
COPY server.js ./server.js
COPY public ./public
ENV ADMIN_WEB_PUBLIC_DIR=./public
EXPOSE 3004
CMD ["node", "server.js"]
