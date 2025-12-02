// app.js
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { Queue, Worker } from 'bullmq';
import { 
  createUserSession, 
  createMessage, 
  getMessagesBySession,
  updateSessionActivity 
} from './mysqlservices.js';

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with error handling
let io;
try {
  io = new Server(server, {
    cors: {
      origin: 'http://localhost:4200',
      methods: ['GET', 'POST']
    }
  });
  console.log('✅ Socket.IO initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize Socket.IO:', error);
  process.exit(1);
}

app.use(cors());
app.use(express.json());

// Static admin responses for testing
const ADMIN_RESPONSES = [
  "Hello! Thanks for reaching out. How can I help you today?",
  "I've received your message. Let me assist you with that."
];

// Redis connection for BullMQ with error handling
let messageQueue;
let worker;

try {
  const redisConnection = {
    host: '127.0.0.1',
    port: 6379,
    maxRetriesPerRequest: null,
  };

  console.log("redisConnection===", redisConnection);

  messageQueue = new Queue('messages', { connection: redisConnection });
  console.log('✅ Redis queue connected successfully');

  // Worker to process queued messages
  worker = new Worker(
    'messages',
    async (job) => {
      try {
        const messageData = job.data;
        const { text, sessionId, sender = 'user' } = messageData;
        console.log("messageData===", messageData);

        // Save user message to DB
        const saved = await createMessage(text, sessionId, sender);
        console.log("saved====", saved);

        // Broadcast user message to all connected clients
        io.to(sessionId).emit('newMessage', saved);
        io.emit('newMessage_admin', saved);
        
        console.log(`✅ Message processed for session ${sessionId}: ${text}`);

        // Send automatic admin responses (only for user messages)
        // if (sender === 'user') {
          await sendAutoAdminResponses(sessionId);
        // }
      } catch (err) {
        console.error('❌ Error processing message in worker:', err);
        throw err;
      }
    },
    { connection: redisConnection }
  );

  // Worker logs
  worker.on('completed', (job) => {
    console.log(`✅ Job ${job.id} completed for session:`, job.data.sessionId);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('❌ Worker error:', err);
  });

  console.log('✅ Redis worker started successfully');

} catch (error) {
  console.error('❌ Redis connection failed:', error.message);
  console.log('ℹ️ Continuing without Redis queue functionality');
  messageQueue = null;
  worker = null;
}

// Function to send automatic admin responses
async function sendAutoAdminResponses(sessionId) {
  try {
    console.log(`🤖 Starting auto admin responses for session: ${sessionId}`);
    
    // Send both static responses with a delay
    for (let i = 0; i < ADMIN_RESPONSES.length; i++) {
      // Add delay between responses (1 second)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const adminResponse = ADMIN_RESPONSES[i];
      
      console.log(`🤖 Sending admin response ${i + 1}: "${adminResponse}"`);
      
      // Save admin response to DB
      const savedAdminMsg = await createMessage(adminResponse, sessionId, 'admin');
      
      console.log(`💾 Admin response saved to DB:`, savedAdminMsg);
      
      // Broadcast admin response to the specific session
      io.to(sessionId).emit('newMessage', savedAdminMsg);
      console.log(`📤 Emitted to room ${sessionId}`);
      
      // Also broadcast to admin panel
      io.emit('newMessage_admin', savedAdminMsg);
      
      console.log(`✅ Auto admin response ${i + 1} sent to session ${sessionId}`);
    }
  } catch (err) {
    console.error('❌ Error sending auto admin responses:', err);
  }
}

// Simple health check
app.get('/', (req, res) => {
  try {
    res.send('Chat support server is running');
  } catch (error) {
    console.error('❌ Health check error:', error);
    res.status(500).send('Server error');
  }
});

// Get messages for a specific session
app.get('/messages/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 50 } = req.query;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const messages = await getMessagesBySession(sessionId, parseInt(limit));
    res.json(messages);
    
  } catch (err) {
    console.error('❌ Error fetching session messages:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Socket.IO with session management
io.on('connection', (socket) => {
  try {
    console.log('✅ Client connected:', socket.id);
    
    const sessionId = socket.id;

    // IMPORTANT: Join the socket to its own room
    socket.join(sessionId);
    console.log(`🔗 Socket ${socket.id} joined room: ${sessionId}`);
    
    // Create or update user session
    createUserSession(sessionId)
      .then(() => {
        console.log('✅ Session created/updated:', sessionId);
        
        socket.emit('session_created', { sessionId });
        
        // Send chat history
        getMessagesBySession(sessionId, 100)
          .then(messages => {
            socket.emit('chat_history', messages);
            console.log(`✅ Sent ${messages.length} historical messages to session: ${sessionId}`);
          })
          .catch(err => {
            console.error('❌ Error fetching chat history:', err);
            socket.emit('chat_history', []);
          });
      })
      .catch(err => {
        console.error('❌ Error creating session:', err);
        socket.emit('session_error', { error: 'Failed to create session' });
      });

    socket.on('message', async (messageData) => {
      try {
        console.log('📨 Received message:', messageData);
        
        if (!messageData.text) {
          console.warn('⚠️ Received message without text:', messageData);
          return;
        }
        
        const messageWithSession = {
          ...messageData,
          sessionId: messageData.sessionId
        };
        
        if (messageQueue) {
          await messageQueue.add('newMessage', messageWithSession);
          console.log('✅ Message added to queue');
        } else {
          await processMessageDirectly(messageWithSession);
        }
      } catch (err) {
        console.error('❌ Error adding message to queue:', err);
        socket.emit('message_error', { error: 'Failed to send message' });
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('❌ Client disconnected:', socket.id, 'Reason:', reason);
    });

    socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
    });

  } catch (error) {
    console.error('❌ Error in socket connection handler:', error);
  }
});

// Function to process messages directly (without Redis)
async function processMessageDirectly(messageData) {
  try {
    const { text, sessionId, sender = 'user' } = messageData;

    if (!text || !sessionId) {
      throw new Error('Invalid message data: missing text or sessionId');
    }

    // Save user message to DB
    const saved = await createMessage(text, sessionId, sender);

    // Broadcast user message
    io.to(sessionId).emit('newMessage', saved);
    io.emit('newMessage_admin', saved);
    
    console.log(`✅ Message processed directly for session ${sessionId}: ${text}`);

    // Send automatic admin responses (only for user messages)
    if (sender === 'user') {
      await sendAutoAdminResponses(sessionId);
    }
  } catch (err) {
    console.error('❌ Error processing message directly:', err);
    throw err;
  }
}

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Graceful shutdown
function gracefulShutdown() {
  console.log('🔄 Received shutdown signal, closing server gracefully...');
  
  server.close((err) => {
    if (err) {
      console.error('❌ Error during server shutdown:', err);
      process.exit(1);
    }
    
    console.log('✅ HTTP server closed');
    
    if (worker) {
      worker.close();
      console.log('✅ Worker closed');
    }
    
    process.exit(0);
  });
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const PORT = process.env.PORT || 3000;

try {
  server.listen(PORT, () => {
    console.log(`✅ Server listening on port ${PORT}`);
    console.log(`✅ Health check available at: http://localhost:${PORT}/`);
  });
} catch (error) {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
}

// Export for testing
export { app, io, messageQueue, worker };