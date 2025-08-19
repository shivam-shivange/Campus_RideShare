import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";
import { Server } from "socket.io";
import { connectMongo } from "./config/mongo.js";
import { supabaseAdmin } from "./config/supabase.js"; // Changed from pg import
import authRoutes from "./routes/authRoutes.js";
import rideRoutes from "./routes/rideRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import Ride from "./models/Ride.js";
import { verifyToken } from "./utils/jwt.js";
import path from "path";
import locationRoutes from './routes/locationRoutes.js';
dotenv.config();

await connectMongo();
// Removed: await pg.connect(); - No longer needed for Supabase

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: (process.env.ALLOWED_ORIGINS || "http://localhost:3000").split(","),
    credentials: true
  }
});

// Basic hardening
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for development
}));

app.use(cors({ 
  origin: (process.env.ALLOWED_ORIGINS || "http://localhost:3000").split(","), 
  credentials: true 
}));

app.use(express.json({ limit: "1mb" }));
app.use(express.static('public')); // Serve static files

app.get("/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/rides", rideRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/locations", locationRoutes);

// Socket.IO authentication middleware - UPDATED TO USE SUPABASE
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("No token provided"));
    
    const decoded = verifyToken(token);
    
    // Replaced pg.query with Supabase call
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('id, name, email, college_id')
      .eq('id', decoded.id);
    
    if (error) {
      console.error("Supabase error in socket auth:", error);
      return next(new Error("Database error"));
    }
    
    if (!users || users.length === 0) return next(new Error("User not found"));
    
    // Map college_id to collegeId for consistency
    socket.user = {
      ...users[0],
      collegeId: users[0].college_id
    };
    next();
  } catch (error) {
    next(new Error("Authentication failed"));
  }
});

// Socket.IO for realtime chat (rest remains the same)
io.on("connection", (socket) => {
  console.log(`User ${socket.user.id} connected`);

  // Join ride chat room
  socket.on("chat:join", async ({ rideId }) => {
    try {
      const ride = await Ride.findById(rideId);
      if (!ride) {
        socket.emit("error", { message: "Ride not found" });
        return;
      }

      // Allow self-chat for testing in development environment
      const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === undefined;
      const isCreator = ride.creatorId === socket.user.id;
      const allowed = isDevelopment ? true : [ride.creatorId, ...ride.requests, ...ride.confirmedUsers].includes(socket.user.id);
      
      if (!allowed && !isCreator) {
        socket.emit("error", { message: "Not authorized for this ride" });
        return;
      }

      socket.join(`ride:${rideId}`);
      socket.emit("chat:joined", { rideId });
      console.log(`User ${socket.user.id} joined ride:${rideId}`);
    } catch (error) {
      socket.emit("error", { message: "Failed to join chat" });
    }
  });

  // Handle direct chat message via socket
  socket.on("chat:send", async ({ rideId, message, ciphertext, nonce }) => {
    try {
      const ride = await Ride.findById(rideId);
      if (!ride) return;

      const allowed = [ride.creatorId, ...ride.requests, ...ride.confirmedUsers].includes(socket.user.id);
      if (!allowed) return;

      if (!ride.allowChat) {
        socket.emit("error", { message: "Chat is disabled for this ride" });
        return;
      }

      const messageData = {
        rideId,
        userId: socket.user.id,
        userName: socket.user.name,
        message: message || null, // For non-encrypted fallback
        ciphertext: ciphertext || null,
        nonce: nonce || null,
        sentAt: new Date().toISOString()
      };

      // Broadcast to all users in the ride room
      io.to(`ride:${rideId}`).emit("chat:new", messageData);
      
    } catch (error) {
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  socket.on("disconnect", () => {
    console.log(`User ${socket.user.id} disconnected`);
  });
});

const port = process.env.PORT || 5000;
httpServer.listen(port, () => console.log(`🚀 Server running at http://localhost:${port}`));
