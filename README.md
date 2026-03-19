# TODO AI Application API

A full-fledged TODO application built with **Node.js**, **Express.js**, and **MongoDB**. This application provides comprehensive todo management features with user authentication, task organization, and API documentation.

## Features

### User Management
- ✅ User Registration
- ✅ User Login with JWT authentication
- ✅ User Profile Management
- ✅ Password Change
- ✅ Account Deletion
- ✅ User Preferences (dark mode, email notifications, language settings)

### Todo Management
- ✅ Create, Read, Update, Delete (CRUD) todos
- ✅ Organize todos by category (work, personal, shopping, health, other)
- ✅ Priority levels (low, medium, high, urgent)
- ✅ Status tracking (pending, in-progress, completed, archived)
- ✅ Due dates and reminders
- ✅ Tags and color coding
- ✅ Checklist items within todos
- ✅ File attachments
- ✅ Todo collaboration
- ✅ Star/favorite todos
- ✅ Todo statistics and analytics

### API Features
- ✅ RESTful API design
- ✅ JWT-based authentication
- ✅ Swagger API documentation
- ✅ Agentic command endpoint for natural-language todo creation
- ✅ LangGraph-powered command endpoint with LangSmith tracing support
- ✅ Pagination support
- ✅ Error handling and logging
- ✅ Request validation
- ✅ CORS enabled

## Tech Stack

- **Backend**: Node.js with Express.js
- **Database**: MongoDB (Local)
- **Authentication**: JWT (JSON Web Tokens)
- **Password Encryption**: bcryptjs
- **API Documentation**: Swagger/OpenAPI 3.0
- **Validation**: node-input-validator
- **Development**: Nodemon

## Project Structure

```
Todo-AI/
├── api/
│   ├── config/
│   │   └── db.js                 # MongoDB connection
│   ├── controller/
│   │   ├── userController.js     # User operations
│   │   └── todoController.js     # Todo operations
│   ├── helper/
│   │   ├── helper.js             # Utility functions
│   │   └── index.js              # Helper exports
│   ├── middleware/
│   │   └── authMiddleware.js     # Authentication & Authorization
│   ├── models/
│   │   ├── userModel.js          # User schema
│   │   └── todoModel.js          # Todo schema
│   └── routes/
│       ├── userRoutes.js         # User endpoints
│       └── todoRoutes.js         # Todo endpoints
├── Logs/
│   ├── Error_log/               # Error logs
│   └── Request_log/             # Request logs
├── uploads/                     # File uploads
├── template/                    # Email templates
├── app.js                       # Express app setup
├── server.js                    # Server initialization
├── swagger.js                   # Swagger configuration
├── package.json                 # Dependencies
├── .env                         # Environment configuration
└── res_msg.json                 # Response messages
```

## Prerequisites

Before running the application, make sure you have:

- **Node.js** (v14 or higher)
- **npm** (v6 or higher)
- **MongoDB** running locally on port 27017

### Install MongoDB

#### Windows
1. Download from: https://www.mongodb.com/try/download/community
2. Run the installer
3. Select "Install MongoDB as a Service"
4. MongoDB will start automatically

#### macOS
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

#### Linux (Ubuntu/Debian)
```bash
sudo apt-get install -y mongodb
sudo systemctl start mongodb
```

#### Docker (Optional)
```bash
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

## Installation

1. **Clone or navigate to the project directory**
   ```bash
   cd Todo-AI
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   - The `.env` file is already created with default values
   - Modify if needed (especially for production)
   ```env
   PORT=5000
   NODE_ENV=development
   MONGO_URL=mongodb://localhost:27017/todo_ai_db
   JWT_SECRET=todo_ai_secret_key_12345!@#$%
   JWT_EXPIRY=7d
   SWAGGER_USER=admin
   SWAGGER_PASSWORD=admin@123
  OPENAI_API_KEY=your_openai_api_key
  LANGSMITH_TRACING=true
  LANGSMITH_ENDPOINT=https://api.smith.langchain.com
  LANGSMITH_API_KEY=your_langsmith_api_key
  LANGSMITH_PROJECT=todo-ai-langgraph
   ```

### LangSmith Setup (LangGraph Endpoint)

The LangGraph endpoint can send traces to LangSmith when these variables are present:

- `LANGSMITH_TRACING=true`
- `LANGSMITH_ENDPOINT=https://api.smith.langchain.com`
- `LANGSMITH_API_KEY=<your_langsmith_api_key>`
- `LANGSMITH_PROJECT=todo-ai-langgraph`

Endpoint using LangGraph + LangSmith-compatible tracing:

- `POST /api/v1/agent/command/langgraph`

## Running the Application

### Development Mode (with Nodemon)
```bash
npm start
```

### Production Mode
```bash
NODE_ENV=production node server.js
```

The server will start on `http://localhost:5000`

## API Endpoints

### User Authentication

#### Register
```
POST /api/v1/user/register
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "password": "password123",
  "phone": "+1234567890"
}
```

#### Login
```
POST /api/v1/user/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

### Todo Endpoints

#### Create Todo
```
POST /api/v1/todo
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Buy groceries",
  "description": "Milk, eggs, bread",
  "category": "shopping",
  "priority": "high",
  "dueDate": "2024-03-20T18:00:00Z",
  "tags": ["important", "urgent"]
}
```

#### Get All Todos
```
GET /api/v1/todo?page=1&limit=10&status=pending&priority=high
Authorization: Bearer <token>
```

#### Get Todo by ID
```
GET /api/v1/todo/{todoId}
Authorization: Bearer <token>
```

#### Update Todo
```
PUT /api/v1/todo/{todoId}
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Updated title",
  "status": "in-progress",
  "priority": "medium"
}
```

#### Mark Todo Complete
```
PATCH /api/v1/todo/{todoId}/complete
Authorization: Bearer <token>
```

#### Delete Todo
```
DELETE /api/v1/todo/{todoId}
Authorization: Bearer <token>
```

#### Get Todo Statistics
```
GET /api/v1/todo/stats
Authorization: Bearer <token>
```

#### Add Checklist Item
```
POST /api/v1/todo/{todoId}/checklist
Authorization: Bearer <token>
Content-Type: application/json

{
  "item": "Buy milk"
}
```

#### Toggle Star Status
```
PATCH /api/v1/todo/{todoId}/star
Authorization: Bearer <token>
```

### Agent Command Endpoint

#### Execute Command (Create Todo from text)
```
POST /api/v1/agent/command
Authorization: Bearer <token>
Content-Type: application/json

{
  "command": "create a todo buy groceries tomorrow with high priority"
}
```

If `OPENAI_API_KEY` is configured, the command is interpreted using OpenAI. Without API key, fallback parsing still supports basic create commands like:
- `create a todo buy milk`
- `add todo prepare presentation`

Supported command examples:
- `create a todo buy groceries tomorrow with high priority`
- `list my todos`
- `list todos with status pending`
- `show todo buy groceries`
- `update todo buy groceries set priority urgent`
- `complete todo buy groceries`
- `set status of todo buy groceries to in-progress`
- `star todo buy groceries`
- `delete todo buy groceries`
- `add checklist buy milk to buy groceries`
- `show todo stats`

## API Documentation

### Swagger UI
Access the interactive API documentation at:
```
http://localhost:5000/api-docs
```

**Credentials:**
- Username: `admin`
- Password: `admin@123`

### Response Format

All API responses follow a consistent format:

**Success Response:**
```json
{
  "success": true,
  "message": "Operation successful",
  "data": {
    // Response data
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Error message",
  "error": "Error details (only in development mode)"
}
```

## Authentication

This API uses **JWT (JSON Web Tokens)** for authentication.

### How to Authenticate:

1. Register or login to get a token
2. Include the token in all subsequent requests using the `Authorization` header:
   ```
   Authorization: Bearer <your_token_here>
   ```

### Token Expiry

By default, tokens expire in **7 days**. Update `JWT_EXPIRY` in `.env` to change this.

## Error Handling

The API includes comprehensive error handling with proper HTTP status codes:

- **400**: Bad Request (validation error)
- **401**: Unauthorized (missing or invalid token)
- **403**: Forbidden (insufficient permissions)
- **404**: Not Found (resource doesn't exist)
- **409**: Conflict (resource already exists)
- **500**: Internal Server Error

## Logging

### Error Logs
All errors are automatically logged to `Logs/Error_log/YYYY-MM-DD.log`

### Request Logs
Request details are logged to `Logs/Request_log/YYYY-MM-DD.log`

## Database Models

### User Model
- firstName (String, required)
- lastName (String, required)
- email (String, unique, required)
- password (String, hashed, required)
- phone (String, optional)
- profilePicture (String, optional)
- bio (String, optional)
- role (String: 'user' | 'admin')
- isActive (Boolean)
- lastLogin (Date)
- preferences (Object)
- timestamps (createdAt, updatedAt)

### Todo Model
- userId (ObjectId, ref: User)
- title (String, required)
- description (String)
- category (String: 'work' | 'personal' | 'shopping' | 'health' | 'other')
- priority (String: 'low' | 'medium' | 'high' | 'urgent')
- status (String: 'pending' | 'in-progress' | 'completed' | 'archived')
- dueDate (Date)
- completedDate (Date)
- tags (Array of Strings)
- checklist (Array of Objects)
- attachments (Array of Objects)
- reminders (Array of Dates)
- collaborators (Array of Objects)
- isStarred (Boolean)
- color (String)
- timestamps (createdAt, updatedAt)

## Development Tips

### Testing Endpoints
Use tools like:
- **Postman**: https://www.postman.com/
- **Insomnia**: https://insomnia.rest/
- **curl**: Command-line tool
- **Thunder Client**: VS Code extension

### Database Management
- Use **MongoDB Compass** for GUI management: https://www.mongodb.com/try/download/compass

### Debugging
Enable detailed logging by setting:
```env
NODE_ENV=development
```

## Common Issues

### MongoDB Connection Error
**Problem**: `Cannot connect to MongoDB`
- Solution: Ensure MongoDB is running on localhost:27017
- Use `mongosh` to verify: `mongosh`

### Port Already in Use
**Problem**: `EADDRINUSE: address already in use :::5000`
- Solution: Change PORT in .env or kill the process using that port

### JWT Token Errors
**Problem**: `Invalid or expired token`
- Solution: Re-login to get a fresh token

## License

ISC

## Author

SaturnCube

## Support

For issues or questions, please create an issue in the repository or contact the author.

---

**Happy coding! 🚀**
