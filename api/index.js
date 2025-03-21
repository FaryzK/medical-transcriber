import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { createServer } from 'http'
import { Server } from 'socket.io'
import testRoute from './routes/test.route.js'
import { handleSocketConnection } from './controllers/transcription.controller.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

// Create HTTP server and Socket.IO instance
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 30000
  },
  transports: ['polling', 'websocket'],
  path: '/socket.io'
})

// Middleware
app.use(cors({
  origin: "*",
  credentials: true
}))
app.use(express.json())

// Routes
app.use('/api', testRoute)

// Logging middleware for Socket.IO
io.use((socket, next) => {
  console.log(`New socket connection: ${socket.id}`);
  socket.onAny((event, ...args) => {
    console.log(`[Socket ${socket.id}] Event: ${event}`, args.length > 0 ? args : '');
  });
  next();
});

// Set up Socket.IO for real-time transcription
const transcriptionNamespace = io.of('/transcription');

transcriptionNamespace.on('connection', (socket) => {
  console.log(`New transcription connection: ${socket.id}`);
  handleSocketConnection(socket);
});

// Start the server
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
  console.log(`WebSocket server available at ws://localhost:${PORT}/transcription`)
})