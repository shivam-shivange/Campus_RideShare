import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validate.js";
import {
  createRide, listRides, searchRides, getPopularDestinations, getRecentRides,
  getUserRides, getRideDetails, requestRide, cancelRequest, decideRequest, 
  updateRideTime, closeRide, createRideSchema, searchRidesSchema, getUserRidesSchema,
  getRideDetailsSchema, requestRideSchema, cancelRequestSchema, 
  decideRequestSchema, updateTimeSchema, closeRideSchema
} from "../controllers/rideController.js";

const router = express.Router();

// Public routes (require authentication but no additional validation)
router.get("/", protect, listRides);
router.get("/search", protect, validate(searchRidesSchema), searchRides);
router.get("/popular-destinations", protect, getPopularDestinations);
router.get("/recent", protect, getRecentRides);

// User-specific rides
router.get("/my-rides", protect, validate(getUserRidesSchema), getUserRides);
router.get("/:rideId", protect, getRideDetails);

// Ride management
router.post("/", protect, validate(createRideSchema), createRide);
router.post("/request", protect, validate(requestRideSchema), requestRide);
router.post("/cancel-request", protect, validate(cancelRequestSchema), cancelRequest);
router.post("/decide", protect, validate(decideRequestSchema), decideRequest);
router.post("/update-time", protect, validate(updateTimeSchema), updateRideTime);
router.post("/close", protect, validate(closeRideSchema), closeRide);

export default router;
