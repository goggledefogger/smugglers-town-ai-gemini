import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

import path from 'path';
import http from 'http';
import express from 'express';
import { Server } from 'colyseus';
import { monitor } from '@colyseus/monitor';

// Import arena room definition (we'll create this next)
import { ArenaRoom } from './ArenaRoom';

const port = Number(process.env.PORT) || 2567;
const app = express();

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
