import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

import path from 'path';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'colyseus';
import { monitor } from '@colyseus/monitor';

// Import arena room definition (we'll create this next)
import { ArenaRoom } from './ArenaRoom';

const port = Number(process.env.PORT) || 2567;
const app = express();

// CORS Configuration
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:3010', // Allow production client URL from env, fallback to localhost
  // Add any other specific development origins if needed, e.g.:
  // 'http://172.233.128.250:3010'
];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  credentials: true, // Allow cookies if needed by Colyseus auth or other parts
  allowedHeaders: ['Content-Type', 'Authorization'], // Add other headers if your client sends them
};

app.use(cors(corsOptions)); // Use cors middleware BEFORE other routes/middleware

app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Create Colyseus game server instance
const gameServer = new Server({
  server: server,
});

// Define "arena" room
// This name ("arena") will be used by the client to connect
gameServer.define('arena', ArenaRoom);

// Register Colyseus monitor AFTER room definitions
// (accessible at /colyseus on this server)
app.use('/colyseus', monitor());

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Start listening
gameServer.listen(port);
console.log(`[GameServer] Listening on http://localhost:${port}`);
