FROM node:20

WORKDIR /app

# Копіюємо package files
COPY package*.json ./

# Встановлюємо залежності
RUN npm ci --only=production

# Встановлюємо Playwright Chromium з системними залежностями
RUN npx playwright install --with-deps chromium

# Копіюємо весь код
COPY . .

# Змінна середовища для timezone
ENV TZ=Europe/Kyiv

# Expose port for webhook/health check
EXPOSE 3000

# Запускаємо бота
CMD ["node", "src/index.js"]
