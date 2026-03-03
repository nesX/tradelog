# 1. Use an official Node.js image as the base
FROM node:20-alpine

# 2. Create a directory inside the container for your app
WORKDIR /usr/src/app

# 3. Copy package.json and package-lock.json first (for faster builds)
COPY package*.json ./

# 4. Install dependencies
RUN npm install

# 5. Copy the rest of your application code
COPY . .

# 6. Expose the port your Express app runs on
EXPOSE 3000

# 7. Start the application
CMD ["npm", "start"]