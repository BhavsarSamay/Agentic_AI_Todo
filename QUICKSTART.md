# Quick Start Guide - TODO AI Application

## 🚀 Get Started in 5 Minutes

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Ensure MongoDB is Running
Make sure MongoDB is running on your local machine:
```bash
# On macOS with Homebrew
brew services start mongodb-community

# On Linux
sudo systemctl start mongodb

# Or with Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

### Step 3: Start the Server
```bash
npm start
```

You should see:
```
🚀 TODO AI Server is running on port 5000
📚 API Documentation: http://localhost:5000/api-docs
💚 Health Check: http://localhost:5000/health
🔧 Environment: development
```

### Step 4: Test the API

#### Option 1: Using Swagger UI
1. Open: `http://localhost:5000/api-docs`
2. Username: `admin`
3. Password: `admin@123`
4. Click on endpoints to test them

#### Option 2: Using Postman
1. Import the API endpoints from the Swagger documentation
2. Start testing!

#### Option 3: Using curl
```bash
# Register a user
curl -X POST http://localhost:5000/api/v1/user/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "password": "password123"
  }'

# Login
curl -X POST http://localhost:5000/api/v1/user/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'

# Get your token from the response and use it
# Create a todo
curl -X POST http://localhost:5000/api/v1/todo \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My first todo",
    "description": "This is my first todo",
    "category": "personal",
    "priority": "high"
  }'
```

## 📋 Features to Try

1. **User Registration & Login**
   - Create an account
   - Login with credentials
   - Get JWT token

2. **Create Todos**
   - Create todos with different categories and priorities
   - Add tags and due dates
   - Add descriptions

3. **Manage Todos**
   - View all todos with filtering
   - Update todo details
   - Mark todos as completed
   - Delete todos
   - Star/favorite todos

4. **Get Statistics**
   - View todo overview
   - Analysis by priority and category

## 🔐 API Authentication

All endpoints except `/register` and `/login` require authentication.

Include the token in headers:
```
Authorization: Bearer <your_jwt_token>
```

## 📚 Environment Variables

The `.env` file contains all configuration:

```env
PORT=5000                              # Server port
NODE_ENV=development                   # Environment
MONGO_URL=mongodb://localhost:27017/todo_ai_db  # MongoDB connection
JWT_SECRET=todo_ai_secret_key_12345!@#$%      # JWT secret
JWT_EXPIRY=7d                         # Token expiry
SWAGGER_USER=admin                    # Swagger UI username
SWAGGER_PASSWORD=admin@123            # Swagger UI password
```

## 🆘 Troubleshooting

### Port 5000 is already in use?
```bash
# Change the port in .env
PORT=5001

# Or kill the process
lsof -ti:5000 | xargs kill -9
```

### Cannot connect to MongoDB?
```bash
# Check if MongoDB is running
mongosh

# If not, start it
brew services start mongodb-community  # macOS
sudo systemctl start mongodb           # Linux
```

### Swagger UI not loading?
- Clear browser cache
- Try incognito mode
- Check credentials: admin / admin@123

## 📖 Full Documentation

See [README.md](./README.md) for complete documentation.

## 💡 Next Steps

1. Explore all endpoints in Swagger UI
2. Create multiple todos and manage them
3. Try different categories and priorities
4. Test filtering and pagination
5. Integrate with a frontend application

---

Happy coding! 🎉
