import express from "express";
import { 
  signup, login, getProfile, updateProfile, changePassword, forgotPassword, resetPassword,
  signupSchema, loginSchema, updateProfileSchema, changePasswordSchema, 
  forgotPasswordSchema, resetPasswordSchema,
  resendVerification, resendVerificationSchema, verifyEmail
} from "../controllers/authController.js";
import { validate } from "../middleware/validate.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/signup", validate(signupSchema), signup);
router.post("/login", validate(loginSchema), login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/resend-verification", validate(resendVerificationSchema), resendVerification);
router.get("/verify-email", verifyEmail);
router.get("/me", protect, getProfile);
router.put("/profile", protect, validate(updateProfileSchema), updateProfile);
router.put("/change-password", protect, validate(changePasswordSchema), changePassword);

export default router;
