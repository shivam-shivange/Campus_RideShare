import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { getStartingLocations, getDestinations } from "../controllers/locationController.js";

const router = express.Router();

// Get starting locations for the user's college
router.get("/starting-points", protect, getStartingLocations);

// Get destinations for a given starting location
router.get("/destinations", protect, getDestinations);

export default router;
