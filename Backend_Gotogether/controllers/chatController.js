import Joi from "joi";
import Chat from "../models/Chat.js";
import Ride from "../models/Ride.js";
import { supabaseAdmin } from "../config/supabase.js"; // Changed from pg import

export const sendMessageSchema = Joi.object({
  rideId: Joi.string().required(),
  message: Joi.string().optional(), // For non-encrypted messages
  ciphertext: Joi.string().optional(),
  nonce: Joi.string().optional()
}).or('message', 'ciphertext'); // At least one should be present

export const listMessagesSchema = Joi.object({
  rideId: Joi.string().required()
});

// Get ride details endpoint
export const getRideDetailsSchema = Joi.object({
  rideId: Joi.string().required()
});

const ensureChat = async (rideId, participants, retentionDays = 30) => {
  let chat = await Chat.findOne({ rideId });
  if (!chat) {
    chat = await Chat.create({
      rideId,
      participants,
      messages: [],
      expiresAt: new Date(Date.now() + retentionDays * 24 * 3600 * 1000)
    });
  } else {
    chat.expiresAt = new Date(Date.now() + retentionDays * 24 * 3600 * 1000);
  }
  return chat;
};

export const sendMessage = async (req, res) => {
  const { rideId, message, ciphertext, nonce } = req.body;
  try {
    const ride = await Ride.findById(rideId);
    if (!ride) return res.status(404).json({ message: "Ride not found" });
    
    if (!ride.allowChat) return res.status(403).json({ message: "Chat disabled by creator" });
    
    const canChat = [ride.creatorId, ...ride.requests, ...ride.confirmedUsers].includes(req.user.id);
    if (!canChat) return res.status(403).json({ message: "You are not part of this ride" });
    
    const participants = Array.from(new Set([ride.creatorId, ...ride.requests, ...ride.confirmedUsers]));
    const chat = await ensureChat(ride._id, participants);
    
    const messageData = {
      senderId: req.user.id,
      senderName: req.user.name,
      message: message || null,
      ciphertext: ciphertext || null,
      nonce: nonce || null,
      sentAt: new Date()
    };
    
    chat.messages.push(messageData);
    await chat.save();
    
    res.status(201).json({ 
      message: "Message sent successfully",
      data: messageData
    });
    
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const listMessages = async (req, res) => {
  const { rideId } = req.query;
  try {
    const ride = await Ride.findById(rideId).lean();
    if (!ride) return res.status(404).json({ message: "Ride not found" });
    
    const canRead = [ride.creatorId, ...ride.requests, ...ride.confirmedUsers].includes(req.user.id);
    if (!canRead) return res.status(403).json({ message: "You are not part of this ride" });
    
    const chat = await Chat.findOne({ rideId }).lean();
    const messages = chat ? chat.messages : [];
    
    res.json({ messages });
    
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getRideDetails = async (req, res) => {
  const { rideId } = req.query;
  try {
    const ride = await Ride.findById(rideId).lean();
    if (!ride) return res.status(404).json({ message: "Ride not found" });
    
    const canView = [ride.creatorId, ...ride.requests, ...ride.confirmedUsers].includes(req.user.id);
    if (!canView) return res.status(403).json({ message: "You are not part of this ride" });
    
    // Get user details for participants - UPDATED TO USE SUPABASE
    const allParticipants = [ride.creatorId, ...ride.requests, ...ride.confirmedUsers];
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('id, name, email')
      .in('id', allParticipants);
    
    if (error) {
      console.error("Error fetching users from Supabase:", error);
      return res.status(500).json({ message: "Error fetching user data" });
    }
    
    const userMap = {};
    users.forEach(user => {
      userMap[user.id] = user;
    });
    
    res.json({
      ride: {
        ...ride,
        creatorName: userMap[ride.creatorId]?.name || 'Unknown',
        participants: allParticipants.map(id => ({
          id,
          name: userMap[id]?.name || 'Unknown',
          email: userMap[id]?.email
        }))
      }
    });
    
  } catch (error) {
    console.error("Error fetching ride details:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
