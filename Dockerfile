# Build + run the Node.js/Express app
FROM node:20-alpine

WORKDIR /app

# Install dependencies (full install: `tsx` runs server.ts in production)
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

# Copy sources and build the React front-end
COPY . .
RUN npm run build

# Run in production mode (serves dist/ + /api endpoints)
ENV NODE_ENV=production
EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]
