FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NODE_ENV=production
EXPOSE 4000
# Applies the (idempotent) schema, then starts the API.
CMD ["sh", "-c", "npm run db:migrate && npm start"]
