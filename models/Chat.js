import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  senderId: { type: String, required: true },
  senderName: { type: String, required: true },
  message: { type: String }, // For plain messages
  ciphertext: { type: String }, // For encrypted messages
  nonce: { type: String }, // For encryption
  sentAt: { type: Date, default: Date.now }
}, { _id: false });

const chatSchema = new mongoose.Schema({
  rideId: { type: mongoose.Schema.Types.ObjectId, ref: "Ride", required: true },
  participants: [{ type: String, required: true }],
  messages: [messageSchema],
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } }
}, { timestamps: true });

// Index for faster queries
chatSchema.index({ rideId: 1 });

// Auto-delete expired chats after fetching
chatSchema.post("find", async function (docs) {
  const now = new Date();
  for (let doc of docs) {
    if (doc.expiresAt && doc.expiresAt < now) {
      await doc.deleteOne();
    }
  }
});

chatSchema.post("findOne", async function (doc) {
  if (!doc) return;
  const now = new Date();
  if (doc.expiresAt && doc.expiresAt < now) {
    await doc.deleteOne();
  }
});

export default mongoose.model("Chat", chatSchema);
