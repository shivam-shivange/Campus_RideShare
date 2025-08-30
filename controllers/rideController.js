import Joi from "joi";
import Ride from "../models/Ride.js";
import { supabaseAdmin } from "../config/supabase.js";

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
  try {
    const { 
      fromLocation, 
      toLocation, 
      availableSeats, 
      preferredGender, 
      luggageSpace, 
      timeNegotiation,
      additionalNotes,
      dateTime, 
      allowChat 
    } = req.body;

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
      dateTime: new Date(dateTime),
      allowChat,
      status: "OPEN",
      expiresAt: new Date(new Date(dateTime).getTime() + 7 * 24 * 3600 * 1000)
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
  try {
    const rides = await Ride.find({
      creatorCollegeId: req.user.collegeId,
      status: { $in: ["OPEN", "FULL"] },
      dateTime: { $gte: new Date(Date.now() - 12 * 3600 * 1000) }
    })
    .sort({ dateTime: 1 })
    .lean();

    // Get creator names using Supabase
    const creatorIds = rides.map(ride => ride.creatorId);
    
    if (creatorIds.length > 0) {
      const { data: creators, error } = await supabaseAdmin
        .from('users')
        .select('id, name')
        .in('id', creatorIds);

      if (error) {
        console.error("Error fetching creators:", error);
        return res.status(500).json({ message: "Error fetching user data" });
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
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error("Error listing rides:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const searchRides = async (req, res) => {
  try {
    const { from, to, date, limit = 20 } = req.query;
    
    // Build search query
    let searchQuery = {
      creatorCollegeId: req.user.collegeId,
      status: { $in: ["OPEN", "FULL"] },
      dateTime: { $gte: new Date() } // Only future rides
    };

    // Only add filters if values exist
    if (from && from.trim() && from !== '') {
      searchQuery.fromLocation = { $regex: from.trim(), $options: 'i' };
    }

    if (to && to.trim() && to !== '') {
      searchQuery.toLocation = { $regex: to.trim(), $options: 'i' };
    }

    if (date && date !== '') {
      const searchDate = new Date(date);
      const nextDay = new Date(searchDate);
      nextDay.setDate(nextDay.getDate() + 1);
      
      searchQuery.dateTime = {
        $gte: searchDate,
        $lt: nextDay
      };
    }

    const rides = await Ride.find(searchQuery)
      .sort({ dateTime: 1 })
      .limit(parseInt(limit) || 20)
      .lean();

    // Get creator names using Supabase
    const creatorIds = rides.map(ride => ride.creatorId);
    if (creatorIds.length > 0) {
      const { data: creators, error } = await supabaseAdmin
        .from('users')
        .select('id, name')
        .in('id', creatorIds);

      if (error) {
        console.error("Error fetching creators:", error);
        return res.status(500).json({ message: "Error fetching user data" });
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
    } else {
      res.json([]);
    }

  } catch (error) {
    console.error("Error searching rides:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getPopularDestinations = async (req, res) => {
  try {
    const destinations = await Ride.aggregate([
      {
        $match: {
          creatorCollegeId: req.user.collegeId,
          dateTime: { $gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) } // Last 30 days
        }
      },
      {
        $group: {
          _id: "$toLocation",
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 6
      },
      {
        $project: {
          destination: "$_id",
          count: 1,
          _id: 0
        }
      }
    ]);

    res.json(destinations);
  } catch (error) {
    console.error("Error getting popular destinations:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getRecentRides = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;
    
    const rides = await Ride.find({
      creatorCollegeId: req.user.collegeId,
      status: { $in: ["OPEN", "FULL"] },
      dateTime: { $gte: new Date() }
    })
    .sort({ dateTime: 1 })
    .limit(limit)
    .lean();

    // Get creator names using Supabase
    const creatorIds = rides.map(ride => ride.creatorId);
    if (creatorIds.length > 0) {
      const { data: creators, error } = await supabaseAdmin
        .from('users')
        .select('id, name')
        .in('id', creatorIds);

      if (error) {
        console.error("Error fetching creators:", error);
        return res.status(500).json({ message: "Error fetching user data" });
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
    } else {
      res.json([]);
    }

  } catch (error) {
    console.error("Error getting recent rides:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const requestRide = async (req, res) => {
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

    ride.requests.push(req.user.id);
    await ride.save();

    res.json({ message: "Request sent successfully", ride });
  } catch (error) {
    console.error("Error requesting ride:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const cancelRequest = async (req, res) => {
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
  try {
    const { rideId, userId, decision } = req.body;
    const ride = await Ride.findById(rideId);
    
    if (!ride) return res.status(404).json({ message: "Ride not found" });
    if (ride.creatorId !== req.user.id) 
      return res.status(403).json({ message: "Only creator can decide" });
    if (!ride.requests.includes(userId)) 
      return res.status(400).json({ message: "User did not request" });

    // Get user details using Supabase
    const { data: userData, error } = await supabaseAdmin
      .from('users')
      .select('id, name, email')
      .eq('id', userId)
      .single();

    if (error) {
      console.error("Error fetching user:", error);
      return res.status(500).json({ message: "Error fetching user data" });
    }

    const user = userData;

    if (decision === "reject") {
      ride.requests = ride.requests.filter(u => u !== userId);
    } else {
      if (ride.availableSeats <= 0) 
        return res.status(400).json({ message: "No seats left" });
      
      ride.confirmedUsers.push(userId);
      ride.requests = ride.requests.filter(u => u !== userId);
      ride.availableSeats -= 1;
      
      if (ride.availableSeats === 0) ride.status = "FULL";
      ride.expiresAt = new Date(new Date(ride.dateTime).getTime() + 30 * 24 * 3600 * 1000);
    }

    await ride.save();
    res.json({ 
      message: decision === "accept" ? `${user?.name || 'User'} confirmed for the ride` : `${user?.name || 'User'} rejected`, 
      ride 
    });
  } catch (error) {
    console.error("Error deciding request:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updateRideTime = async (req, res) => {
  try {
    const { rideId, dateTime } = req.body;
    const ride = await Ride.findById(rideId);
    
    if (!ride) return res.status(404).json({ message: "Ride not found" });
    if (ride.creatorId !== req.user.id) 
      return res.status(403).json({ message: "Only creator can update time" });

    ride.dateTime = new Date(dateTime);
    const baseRetention = ride.confirmedUsers.length ? 30 : 7;
    ride.expiresAt = new Date(new Date(ride.dateTime).getTime() + baseRetention * 24 * 3600 * 1000);
    
    await ride.save();
    res.json({ message: "Ride time updated", ride });
  } catch (error) {
    console.error("Error updating ride time:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getUserRides = async (req, res) => {
  try {
    const { status, type } = req.query;
    
    let rideQuery = { creatorCollegeId: req.user.collegeId };
    
    // Filter by status
    if (status !== 'all') {
      if (status === 'open') rideQuery.status = 'OPEN';
      else if (status === 'full') rideQuery.status = 'FULL';
      else if (status === 'closed') rideQuery.status = 'CLOSED';
    }
    
    // Filter by user relationship to ride - FIXED ARRAY QUERYING
    if (type === 'created') {
      rideQuery.creatorId = req.user.id;
    } else if (type === 'requested') {
      rideQuery.requests = req.user.id; // Simple array contains check
    } else if (type === 'confirmed') {
      rideQuery.confirmedUsers = req.user.id; // Simple array contains check
    } else if (type === 'all') {
      rideQuery.$or = [
        { creatorId: req.user.id },
        { requests: req.user.id }, // Simplified
        { confirmedUsers: req.user.id } // Simplified
      ];
    }

    console.log('MongoDB Query:', JSON.stringify(rideQuery, null, 2));

    const rides = await Ride.find(rideQuery)
      .sort({ dateTime: 1 });

    console.log('Found rides:', rides.length);

    // Get complete user details for all participants using Supabase
    const allUserIds = new Set();
    rides.forEach(ride => {
      allUserIds.add(ride.creatorId);
      ride.requests.forEach(id => allUserIds.add(id));
      ride.confirmedUsers.forEach(id => allUserIds.add(id));
    });

    const userIdsArray = Array.from(allUserIds);
    
    if (userIdsArray.length > 0) {
      const { data: users, error } = await supabaseAdmin
        .from('users')
        .select('id, name, email, phone, department, year')
        .in('id', userIdsArray);

      if (error) {
        console.error("Error fetching users:", error);
        return res.status(500).json({ message: "Error fetching user data" });
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
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error("Error getting user rides:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getRideDetails = async (req, res) => {
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

    // Get all user details using Supabase
    const allUserIds = [ride.creatorId, ...ride.requests, ...ride.confirmedUsers];
    const uniqueUserIds = [...new Set(allUserIds)];
    
    if (uniqueUserIds.length > 0) {
      const { data: users, error } = await supabaseAdmin
        .from('users')
        .select('id, name, email')
        .in('id', uniqueUserIds);

      if (error) {
        console.error("Error fetching users:", error);
        return res.status(500).json({ message: "Error fetching user data" });
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
    } else {
      res.json(ride);
    }
  } catch (error) {
    console.error("Error getting ride details:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const closeRide = async (req, res) => {
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
