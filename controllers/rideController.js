import Joi from "joi";
import Ride from "../models/Ride.js";
import { supabaseAdmin } from "../config/supabase.js";

// Utility to escape regex special characters
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Schema exports
export const createRideSchema = Joi.object({
  fromLocation: Joi.string().min(2).max(120).required(),
  toLocation: Joi.string().min(2).max(120).required(),
  availableSeats: Joi.number().integer().min(1).max(10).required(),
  preferredGender: Joi.string().valid("Any", "Male", "Female").default("Any"),
  luggageSpace: Joi.boolean().default(false),
  timeNegotiation: Joi.boolean().default(false),
  additionalNotes: Joi.string().max(500).optional().allow(''),
  dateTime: Joi.date().iso().required(),
  allowChat: Joi.boolean().default(true)
});

export const searchRidesSchema = Joi.object({
  from: Joi.string().optional().allow('', null),
  to: Joi.string().optional().allow('', null),
  date: Joi.date().iso().optional().allow('', null),
  limit: Joi.number().integer().min(1).max(50).default(20)
});

export const getUserRidesSchema = Joi.object({
  status: Joi.string().valid('all', 'open', 'full', 'closed').optional().default('all'),
  type: Joi.string().valid('all', 'created', 'requested', 'confirmed').optional().default('all')
});

export const getRideDetailsSchema = Joi.object({
  rideId: Joi.string().required()
});

export const requestRideSchema = Joi.object({
  rideId: Joi.string().required()
});

export const cancelRequestSchema = Joi.object({
  rideId: Joi.string().required()
});

export const decideRequestSchema = Joi.object({
  rideId: Joi.string().required(),
  userId: Joi.string().required(),
  decision: Joi.string().valid("accept", "reject").required()
});

export const updateTimeSchema = Joi.object({
  rideId: Joi.string().required(),
  dateTime: Joi.date().iso().required()
});

export const closeRideSchema = Joi.object({
  rideId: Joi.string().required()
});

// Controller functions

export const createRide = async (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized: user not found" });
  
  try {
    const {
      fromLocation, toLocation, availableSeats, preferredGender,
      luggageSpace, timeNegotiation, additionalNotes, dateTime, allowChat
    } = req.body;

    const parsedDate = new Date(dateTime);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    const ride = await Ride.create({
      creatorId: req.user.id,
      creatorCollegeId: req.user.collegeId,
      fromLocation,
      toLocation,
      availableSeats,
      preferredGender,
      luggageSpace,
      timeNegotiation,
      additionalNotes: additionalNotes || '',
      dateTime: parsedDate,
      allowChat,
      status: "OPEN",
      expiresAt: new Date(parsedDate.getTime() + 7 * 24 * 3600 * 1000)
    });

    res.status(201).json({
      message: "Ride created successfully",
      ride
    });
  } catch (error) {
    console.error("Error creating ride:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const listRides = async (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized: user not found" });

  try {
    console.log("User in listRides:", req.user);

    const rides = await Ride.find({
      creatorCollegeId: req.user.collegeId,
      status: { $in: ["OPEN", "FULL"] },
      dateTime: { $gte: new Date(Date.now() - 12 * 3600 * 1000) }
    }).sort({ dateTime: 1 }).lean();

    const creatorIds = rides.map(ride => ride.creatorId);
    
    if (creatorIds.length === 0) {
      return res.json([]);
    }

    const { data: creators, error } = await supabaseAdmin
      .from('users')
      .select('id, name')
      .in('id', creatorIds);

    if (error || !creators) {
      console.error("Error fetching creators:", error);
      return res.json(rides); // Fallback: return rides without creator names
    }

    const creatorMap = {};
    creators.forEach(creator => {
      creatorMap[creator.id] = creator.name;
    });

    const ridesWithCreators = rides.map(ride => ({
      ...ride,
      creatorName: creatorMap[ride.creatorId] || 'Unknown'
    }));

    res.json(ridesWithCreators);
  } catch (error) {
    console.error("Error listing rides:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const searchRides = async (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized: user not found" });

  try {
    console.log("User in searchRides:", req.user);
    
    const { from, to, date, limit = 20 } = req.query;
    const userGender = req.user.gender ? req.user.gender.toLowerCase() : 'any';

    // Helper function to safely get string values
    const safeString = (val) => {
      if (typeof val === "string") return val.trim();
      if (val && typeof val.toString === "function") return val.toString().trim();
      return "";
    };

    // Helper function to safely check if date is valid
    const isValidDate = (dateVal) => {
      if (!dateVal) return false;
      const dateStr = typeof dateVal === "string" ? dateVal.trim() : dateVal.toString();
      return dateStr && !isNaN(new Date(dateStr).getTime());
    };

    // Sanitize input parameters
    const fromStr = safeString(from);
    const toStr = safeString(to);
    const dateStr = safeString(date);

    // Check if at least one search parameter is provided
    if (!fromStr && !toStr && !dateStr) {
      return res.status(400).json({ message: "Please specify at least one search parameter" });
    }

    let searchQuery = {
      creatorCollegeId: req.user.collegeId,
      status: { $in: ["OPEN", "FULL"] },
      dateTime: { $gte: new Date() }
    };

    // Add location filters
    if (fromStr) {
      searchQuery.fromLocation = { $regex: escapeRegex(fromStr), $options: 'i' };
    }
    if (toStr) {
      searchQuery.toLocation = { $regex: escapeRegex(toStr), $options: 'i' };
    }
    
    // Add date filter with proper validation
    if (dateStr && isValidDate(dateStr)) {
      const startDate = new Date(dateStr + 'T00:00:00.000Z');
      const endDate = new Date(dateStr + 'T23:59:59.999Z');
      
      // Only apply date filter if the dates are valid
      if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
        searchQuery.dateTime = { $gte: startDate, $lte: endDate };
      }
    }

    // Add gender matching filter
    searchQuery.$or = [
      { preferredGender: 'Any' },
      { preferredGender: { $regex: new RegExp(`^${userGender}$`, 'i') } }
    ];

    const rides = await Ride.find(searchQuery)
      .sort({ dateTime: 1 })
      .limit(parseInt(limit) || 20)
      .lean();

    const creatorIds = rides.map(ride => ride.creatorId);
    if (creatorIds.length === 0) {
      return res.json([]);
    }

    const { data: creators, error } = await supabaseAdmin
      .from('users')
      .select('id, name')
      .in('id', creatorIds);

    if (error || !creators) {
      console.error("Error fetching creators:", error);
      return res.json(rides);
    }

    const creatorMap = {};
    creators.forEach(creator => {
      creatorMap[creator.id] = creator.name;
    });

    const ridesWithCreators = rides.map(ride => ({
      ...ride,
      creatorName: creatorMap[ride.creatorId] || 'Unknown'
    }));

    res.json(ridesWithCreators);
  } catch (error) {
    console.error("Error searching rides:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


export const getPopularDestinations = async (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized: user not found" });

  try {
    const destinations = await Ride.aggregate([
      {
        $match: {
          creatorCollegeId: req.user.collegeId,
          dateTime: { $gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) }
        }
      },
      { $group: { _id: "$toLocation", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 6 },
      { $project: { destination: "$_id", count: 1, _id: 0 } }
    ]);
    
    res.json(destinations);
  } catch (error) {
    console.error("Error getting popular destinations:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getRecentRides = async (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized: user not found" });

  try {
    const limit = parseInt(req.query.limit) || 6;
    const rides = await Ride.find({
      creatorCollegeId: req.user.collegeId,
      status: { $in: ["OPEN", "FULL"] },
      dateTime: { $gte: new Date() }
    }).sort({ dateTime: 1 }).limit(limit).lean();

    const creatorIds = rides.map(ride => ride.creatorId);
    if (creatorIds.length === 0) {
      return res.json([]);
    }

    const { data: creators, error } = await supabaseAdmin
      .from('users')
      .select('id, name')
      .in('id', creatorIds);

    if (error || !creators) {
      console.error("Error fetching creators:", error);
      return res.json(rides);
    }

    const creatorMap = {};
    creators.forEach(creator => {
      creatorMap[creator.id] = creator.name;
    });

    const ridesWithCreators = rides.map(ride => ({
      ...ride,
      creatorName: creatorMap[ride.creatorId] || 'Unknown'
    }));

    res.json(ridesWithCreators);
  } catch (error) {
    console.error("Error getting recent rides:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const requestRide = async (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized: user not found" });

  try {
    const { rideId } = req.body;
    const ride = await Ride.findById(rideId);
    
    if (!ride) return res.status(404).json({ message: "Ride not found" });
    if (ride.creatorCollegeId !== req.user.collegeId)
      return res.status(403).json({ message: "Cross-college access denied" });
    if (ride.status === "CLOSED")
      return res.status(400).json({ message: "Ride is closed" });
    if (ride.creatorId === req.user.id)
      return res.status(400).json({ message: "Cannot request your own ride" });
    if (ride.requests.includes(req.user.id) || ride.confirmedUsers.includes(req.user.id))
      return res.status(400).json({ message: "Already requested/confirmed" });

    const userGender = req.user.gender ? req.user.gender.toLowerCase() : 'any';
    const rideGender = ride.preferredGender.toLowerCase();

    if (rideGender !== 'any' && rideGender !== userGender) {
      return res.status(403).json({ message: `This ride is for ${ride.preferredGender} only.` });
    }

    ride.requests.push(req.user.id);
    await ride.save();

    res.json({ message: "Request sent successfully", ride });
  } catch (error) {
    console.error("Error requesting ride:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const cancelRequest = async (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized: user not found" });

  try {
    const { rideId } = req.body;
    const ride = await Ride.findById(rideId);

    if (!ride) return res.status(404).json({ message: "Ride not found" });
    if (!ride.requests.includes(req.user.id))
      return res.status(400).json({ message: "No pending request to cancel" });

    ride.requests = ride.requests.filter(u => u !== req.user.id);
    await ride.save();

    res.json({ message: "Request cancelled successfully", ride });
  } catch (error) {
    console.error("Error cancelling request:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const decideRequest = async (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized: user not found" });

  try {
    const { rideId, userId, decision } = req.body;
    
    if (!rideId || !userId || !decision) {
      return res.status(400).json({ message: "Missing required parameters" });
    }
    if (!['accept', 'reject'].includes(decision)) {
      return res.status(400).json({ message: "Invalid decision value" });
    }

    const ride = await Ride.findById(rideId);
    if (!ride) return res.status(404).json({ message: "Ride not found" });
    if (ride.creatorId !== req.user.id)
      return res.status(403).json({ message: "Only creator can decide" });
    if (!ride.requests.includes(userId))
      return res.status(400).json({ message: "User did not request this ride" });

    // Get user details with fallback
    let userData = { id: userId, name: 'Unknown User', email: null };
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select('id, name, email')
        .eq('id', userId)
        .single();
      if (!error && data) userData = data;
    } catch (err) {
      console.error("Supabase connection error:", err);
    }

    if (decision === "reject") {
      ride.requests = ride.requests.filter(u => u !== userId);
    } else if (decision === "accept") {
      if (ride.availableSeats <= 0) {
        return res.status(400).json({ message: "No seats available" });
      }
      ride.confirmedUsers.push(userId);
      ride.requests = ride.requests.filter(u => u !== userId);
      ride.availableSeats -= 1;
      if (ride.availableSeats === 0) ride.status = "FULL";
      ride.expiresAt = new Date(new Date(ride.dateTime).getTime() + 30 * 24 * 3600 * 1000);
    }

    await ride.save();

    const userName = userData?.name || 'User';
    const message = decision === "accept"
      ? `${userName} has been confirmed for the ride`
      : `${userName}'s request has been rejected`;

    res.json({
      message,
      ride: ride.toObject()
    });
  } catch (error) {
    console.error("Error in decideRequest:", error);
    res.status(500).json({
      message: "Internal server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const updateRideTime = async (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized: user not found" });

  try {
    const { rideId, dateTime } = req.body;
    
    const parsedDate = new Date(dateTime);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }
    
    const ride = await Ride.findById(rideId);
    if (!ride) return res.status(404).json({ message: "Ride not found" });
    if (ride.creatorId !== req.user.id)
      return res.status(403).json({ message: "Only creator can update time" });

    ride.dateTime = parsedDate;
    const baseRetention = ride.confirmedUsers.length ? 30 : 7;
    ride.expiresAt = new Date(parsedDate.getTime() + baseRetention * 24 * 3600 * 1000);

    await ride.save();
    res.json({ message: "Ride time updated", ride });
  } catch (error) {
    console.error("Error updating ride time:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getUserRides = async (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized: user not found" });

  try {
    const { status, type } = req.query;
    let rideQuery = { creatorCollegeId: req.user.collegeId };

    // Filter by status
    if (status !== 'all') {
      if (status === 'open') rideQuery.status = 'OPEN';
      else if (status === 'full') rideQuery.status = 'FULL';
      else if (status === 'closed') rideQuery.status = 'CLOSED';
    }

    // Filter by user relationship to ride
    if (type === 'created') {
      rideQuery.creatorId = req.user.id;
    } else if (type === 'requested') {
      rideQuery.requests = req.user.id;
    } else if (type === 'confirmed') {
      rideQuery.confirmedUsers = req.user.id;
    } else if (type === 'all') {
      rideQuery.$or = [
        { creatorId: req.user.id },
        { requests: req.user.id },
        { confirmedUsers: req.user.id }
      ];
    }

    const rides = await Ride.find(rideQuery).sort({ dateTime: 1 });

    const allUserIds = new Set();
    rides.forEach(ride => {
      allUserIds.add(ride.creatorId);
      ride.requests.forEach(id => allUserIds.add(id));
      ride.confirmedUsers.forEach(id => allUserIds.add(id));
    });

    const userIdsArray = Array.from(allUserIds);

    if (userIdsArray.length === 0) {
      return res.json([]);
    }

    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('id, name, email, phone, department, year')
      .in('id', userIdsArray);

    if (error || !users) {
      console.error("Error fetching users:", error);
      return res.json(rides.map(ride => ({
        ...ride.toObject(),
        creatorName: 'Unknown'
      })));
    }

    const userMap = {};
    users.forEach(user => {
      userMap[user.id] = user;
    });

    const enrichedRides = rides.map(ride => {
      const userRole = ride.creatorId === req.user.id ? 'creator' :
        ride.requests.includes(req.user.id) ? 'requested' :
          ride.confirmedUsers.includes(req.user.id) ? 'confirmed' : 'none';

      return {
        ...ride.toObject(),
        creatorName: userMap[ride.creatorId]?.name || 'Unknown',
        userRole,
        requestDetails: ride.requests.map(id => ({
          id,
          name: userMap[id]?.name || 'Unknown',
          email: userMap[id]?.email,
          phone: userMap[id]?.phone,
          department: userMap[id]?.department,
          year: userMap[id]?.year
        })),
        confirmedDetails: ride.confirmedUsers.map(id => ({
          id,
          name: userMap[id]?.name || 'Unknown',
          email: userMap[id]?.email,
          phone: userMap[id]?.phone,
          department: userMap[id]?.department,
          year: userMap[id]?.year
        }))
      };
    });

    res.json(enrichedRides);
  } catch (error) {
    console.error("Error getting user rides:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getRideDetails = async (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized: user not found" });

  try {
    const { rideId } = req.params;
    const ride = await Ride.findById(rideId).lean();
    
    if (!ride) {
      return res.status(404).json({ message: "Ride not found" });
    }

    // Check if user has access to this ride
    const hasAccess = ride.creatorCollegeId === req.user.collegeId;
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const allUserIds = [ride.creatorId, ...ride.requests, ...ride.confirmedUsers];
    const uniqueUserIds = [...new Set(allUserIds)];

    if (uniqueUserIds.length === 0) {
      return res.json(ride);
    }

    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('id, name, email')
      .in('id', uniqueUserIds);

    if (error || !users) {
      console.error("Error fetching users:", error);
      return res.json(ride);
    }

    const userMap = {};
    users.forEach(user => {
      userMap[user.id] = user;
    });

    const userRole = ride.creatorId === req.user.id ? 'creator' :
      ride.requests.includes(req.user.id) ? 'requested' :
        ride.confirmedUsers.includes(req.user.id) ? 'confirmed' : 'none';

    const enrichedRide = {
      ...ride,
      creatorName: userMap[ride.creatorId]?.name || 'Unknown',
      userRole,
      requestDetails: ride.requests.map(id => ({
        id,
        name: userMap[id]?.name || 'Unknown',
        email: userMap[id]?.email
      })),
      confirmedDetails: ride.confirmedUsers.map(id => ({
        id,
        name: userMap[id]?.name || 'Unknown',
        email: userMap[id]?.email
      }))
    };

    res.json(enrichedRide);
  } catch (error) {
    console.error("Error getting ride details:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const closeRide = async (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized: user not found" });

  try {
    const { rideId } = req.body;
    const ride = await Ride.findById(rideId);

    if (!ride) return res.status(404).json({ message: "Ride not found" });
    if (ride.creatorId !== req.user.id)
      return res.status(403).json({ message: "Only creator can close" });

    ride.status = "CLOSED";
    await ride.save();

    res.json({ message: "Ride closed successfully", ride });
  } catch (error) {
    console.error("Error closing ride:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
