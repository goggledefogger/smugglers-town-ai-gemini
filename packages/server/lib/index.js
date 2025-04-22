"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config(); // Load environment variables from .env file
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const colyseus_1 = require("colyseus");
const monitor_1 = require("@colyseus/monitor");
// Import arena room definition (we'll create this next)
const ArenaRoom_1 = require("./ArenaRoom");
const port = Number(process.env.PORT) || 2567;
const app = (0, express_1.default)();
app.use(express_1.default.json());
// Create HTTP server
const server = http_1.default.createServer(app);
// Create Colyseus game server instance
const gameServer = new colyseus_1.Server({
    server: server,
});
// Define "arena" room
// This name ("arena") will be used by the client to connect
gameServer.define('arena', ArenaRoom_1.ArenaRoom);
// Register Colyseus monitor AFTER room definitions
// (accessible at /colyseus on this server)
app.use('/colyseus', (0, monitor_1.monitor)());
// Basic health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});
// Start listening
gameServer.listen(port);
console.log(`[GameServer] Listening on http://localhost:${port}`);
//# sourceMappingURL=index.js.map