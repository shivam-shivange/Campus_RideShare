import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";
import { Server } from "socket.io";
import { connectMongo } from "./config/mongo.js";
import { supabaseAdmin } from "./config/supabase.js";
import authRoutes from "./routes/authRoutes.js";
import rideRoutes from "./routes/rideRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import Ride from "./models/Ride.js";
import { verifyToken } from "./utils/jwt.js";
import path from "path";
import locationRoutes from './routes/locationRoutes.js';

// Load environment variables first
dotenv.config();

// Connect to MongoDB
await connectMongo();

const app = express();
const httpServer = createServer(app);

// Configure CORS origins - include your Render frontend URL
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:3000", "https://campus-rideshare.onrender.com"];

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST"]
  }
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? true : false,
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({ 
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static('public'));

// Health check endpoint
app.get("/health", (_req, res) => {
  res.status(200).json({ 
    ok: true, 
    time: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/rides", rideRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/locations", locationRoutes);

// Socket.IO authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("No token provided"));
    
    const decoded = verifyToken(token);
    
    // Get user from Supabase
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('id, name, email, college_id')
      .eq('id', decoded.id);
    
    if (error) {
      console.error("Supabase error in socket auth:", error);
      return next(new Error("Database error"));
    }
    
    if (!users || users.length === 0) {
      return next(new Error("User not found"));
    }
    
    // Map college_id to collegeId for consistency
    socket.user = {
      ...users[0],
      collegeId: users[0].college_id
    };
    next();
  } catch (error) {
    console.error("Socket authentication error:", error);
    next(new Error("Authentication failed"));
  }
});

// Socket.IO connection handling
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

      // Check authorization
      const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === undefined;
      const isCreator = ride.creatorId === socket.user.id;
      const isParticipant = [ride.creatorId, ...ride.requests, ...ride.confirmedUsers].includes(socket.user.id);
      
      if (!isDevelopment && !isCreator && !isParticipant) {
        socket.emit("error", { message: "Not authorized for this ride" });
        return;
      }

      socket.join(`ride:${rideId}`);
      socket.emit("chat:joined", { rideId });
      console.log(`User ${socket.user.id} joined ride:${rideId}`);
    } catch (error) {
      console.error("Chat join error:", error);
      socket.emit("error", { message: "Failed to join chat" });
    }
  });

  // Handle chat messages
  socket.on("chat:send", async ({ rideId, message, ciphertext, nonce }) => {
    try {
      const ride = await Ride.findById(rideId);
      if (!ride) return;

      const isAuthorized = [ride.creatorId, ...ride.requests, ...ride.confirmedUsers].includes(socket.user.id);
      if (!isAuthorized) return;

      if (!ride.allowChat) {
        socket.emit("error", { message: "Chat is disabled for this ride" });
        return;
      }

      const messageData = {
        rideId,
        userId: socket.user.id,
        userName: socket.user.name,
        message: message || null,
        ciphertext: ciphertext || null,
        nonce: nonce || null,
        sentAt: new Date().toISOString()
      };

      // Broadcast to all users in the ride room
      io.to(`ride:${rideId}`).emit("chat:new", messageData);
      
    } catch (error) {
      console.error("Chat send error:", error);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  socket.on("disconnect", () => {
    console.log(`User ${socket.user.id} disconnected`);
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    success: false, 
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Route not found' 
  });
});

// Server startup - CRITICAL FIX for Render
const port = process.env.PORT || 10000;

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  // console.log(`CORS Origins: ${allowedOrigins.join(', ')}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  httpServer.close(() => {
    console.log('Process terminated');
  });
});
