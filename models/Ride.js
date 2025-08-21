import mongoose from "mongoose";

const rideSchema = new mongoose.Schema({
  creatorId: { type: String, required: true },
  creatorCollegeId: { type: String, required: true },
  fromLocation: { type: String, required: true },
  toLocation: { type: String, required: true },
  availableSeats: { type: Number, required: true, min: 1 },
  preferredGender: { type: String, enum: ["Any", "Male", "Female"], default: "Any" },
  luggageSpace: { type: Boolean, default: false },
  timeNegotiation: { type: Boolean, default: false },
  additionalNotes: { type: String, maxlength: 500 },
  dateTime: { type: Date, required: true },
  allowChat: { type: Boolean, default: true },
  requests: [{ type: String }],
  confirmedUsers: [{ type: String }],
  status: { type: String, enum: ["OPEN", "FULL", "CLOSED"], default: "OPEN" },
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } }
}, { timestamps: true });

// Auto-close expired rides after fetching - FIXED VERSION
rideSchema.post("find", async function (docs) {
  if (!docs || docs.length === 0) return;
  
  const now = new Date();
  const SIX_HOURS = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
  
  // Find rides that need to be closed
  const rideIdsToClose = docs
    .filter(doc => {
      const closeAfter = new Date(doc.dateTime.getTime() + SIX_HOURS);
      return now >= closeAfter && doc.status === "OPEN";
    })
    .map(doc => doc._id);
  
  // Bulk update without calling save() on individual docs
  if (rideIdsToClose.length > 0) {
    await this.model.updateMany(
      { _id: { $in: rideIdsToClose } },
      { status: "CLOSED" }
    );
  }
});

rideSchema.post("findOne", async function (doc) {
  if (!doc) return;
  
  const now = new Date();
  const SIX_HOURS = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
  
  const closeAfter = new Date(doc.dateTime.getTime() + SIX_HOURS);
  if (now >= closeAfter && doc.status === "OPEN") {
    // Use updateOne instead of save()
    await this.model.updateOne(
      { _id: doc._id },
      { status: "CLOSED" }
    );
  }
});

export default mongoose.model("Ride", rideSchema);
