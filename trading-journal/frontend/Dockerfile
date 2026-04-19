# 1. Use a Node image to build the app
FROM node:20-alpine

# 2. Set the working directory
WORKDIR /app

# 3. Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# 4. Copy the rest of the source code
COPY . .

# 5. Expose the Vite default port
EXPOSE 5173

# 6. Run the development server
# We use --host to make sure it's accessible outside the container
CMD ["npm", "run", "dev", "--", "--host"]