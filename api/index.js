import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { createServer } from 'http'
import { Server } from 'socket.io'
import testRoute from './routes/test.route.js'
import { handleSocketConnection } from './controllers/transcription.controller.js'
import { transcribeFile } from './controllers/fileTranscription.controller.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

// Create HTTP server and Socket.IO instance
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  },
  path: '/socket.io'
})

// Middleware
app.use(cors())
app.use(express.json())

// Routes
app.use('/api', testRoute)

// File transcription endpoint
app.post('/api/transcribe-file', transcribeFile)

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