import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { validate } from "../middleware/validate.js";
import { 
  sendMessage, 
  listMessages, 
  getRideDetails,
  sendMessageSchema, 
  listMessagesSchema,
  getRideDetailsSchema 
} from "../controllers/chatController.js";

const router = express.Router();

router.get("/messages", protect, validate(listMessagesSchema), listMessages);
router.post("/messages", protect, validate(sendMessageSchema), sendMessage);
router.get("/ride", protect, validate(getRideDetailsSchema), getRideDetails);

export default router;
