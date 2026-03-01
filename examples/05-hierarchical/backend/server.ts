import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { authMiddleware } from "./src/middleware/auth";
import { registerRoutes } from "./src/routes";

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(express.json());
app.use("/api", authMiddleware);

// Routes
registerRoutes(app);

// Health check (no auth required)
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// WebSocket setup
wss.on("connection", (ws) => {
  console.log("WebSocket client connected");
  ws.on("close", () => console.log("WebSocket client disconnected"));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
