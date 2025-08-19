import bcrypt from "bcryptjs";
import supabase from "../config/supabase.js";
import { signToken } from "../utils/jwt.js";
import Joi from "joi";
import crypto from "crypto";

export const signupSchema = Joi.object({
    name: Joi.string().min(2).max(80).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).max(72).required(),
    phone: Joi.string().pattern(/^[0-9+\s-]{10,15}$/),
    department: Joi.string().max(100),
    year: Joi.number().integer().min(1).max(4)
});

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required()
});

export const resetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  password: Joi.string().min(8).max(72).required()
});

export const getProfile = async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select(`
        id, name, email, phone, department, year,
        college_id,
        role,
        colleges (
          name,
          email_domain
        )
      `)
      .eq('id', req.user.id)
      .single();
    
    if (error || !user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Transform the response to match the expected format
    const transformedUser = {
      ...user,
      collegeId: user.college_id,
      collegeName: user.colleges.name,
      emailDomain: user.colleges.email_domain
    };
    delete transformedUser.colleges;
    delete transformedUser.college_id;
    
    res.json({ user: transformedUser });
  } catch (error) {
    console.error("Error getting profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getCollegeLocations = async (req, res) => {
    try {
        const { data: rows, error } = await supabase
            .from('college_locations')
            .select('location_name, location_type')
            .eq('college_id', req.user.collegeId)
            .eq('is_active', true)
            .order('location_type')
            .order('location_name');
            
        if (error) {
            throw error;
        }
        
        const locations = {
            starting: rows.filter(r => r.location_type === 'starting'),
            destinations: rows.filter(r => r.location_type === 'destination')
        };
        
        res.json(locations);
    } catch (error) {
        res.status(500).json({ message: "Error fetching locations" });
    }
};

export const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate email domain
    const emailDomain = email.split("@")[1]?.trim().toLowerCase();
    console.log('Attempting to find college for domain:', emailDomain);
    
    const { data: college, error: collegeError } = await supabase
      .from('colleges')
      .select('id, name, email_domain')
      .eq('email_domain', emailDomain)
      .single();
    
    console.log('Query result:', college);
   
    if (collegeError || !college) {
      return res.status(400).json({ 
        message: `Email domain '${emailDomain}' not allowed. Your college is not onboarded.`,
        field: "email"
      });
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ 
        message: "User already exists with this email",
        field: "email"
      });
    }

    // Create user
    const hash = await bcrypt.hash(password, 12);
    const { data: user, error: insertError } = await supabase
      .from('users')
      .insert([{
        name,
        email,
        college_id: college.id,
        password_hash: hash
      }])
      .select('id, name, email, college_id, role')
      .single();

    if (insertError) {
      throw insertError;
    }

    const token = signToken({ 
      id: user.id, 
      collegeId: user.college_id, // Fixed: use college_id from database
      role: user.role 
    });

    // Return user with college info
    res.status(201).json({ 
      user: {
        ...user,
        collegeId: user.college_id, // Add this for consistency
        collegeName: college.name
      }, 
      token,
      message: "Account created successfully!"
    });

  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data: users, error } = await supabase
      .from('users')
      .select(`
        id, name, email, college_id, role, password_hash,
        colleges (
          name
        )
      `)
      .eq('email', email)
      .single();

    if (error || !users) {
      return res.status(400).json({ 
        message: "Invalid email or password",
        field: "email"
      });
    }

    const isValidPassword = await bcrypt.compare(password, users.password_hash);
    
    if (!isValidPassword) {
      return res.status(400).json({ 
        message: "Invalid email or password",
        field: "password"
      });
    }

    // Transform user data to match expected format
    const user = {
      id: users.id,
      name: users.name,
      email: users.email,
      collegeId: users.college_id,
      role: users.role,
      collegeName: users.colleges.name
    };

    const token = signToken({ 
      id: user.id, 
      collegeId: user.collegeId, 
      role: user.role 
    });

    res.json({ 
      user, 
      token,
      message: "Login successful!"
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).max(72).required(),
  confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
});

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Get current password hash
    const { data: user, error: findError } = await supabase
      .from('users')
      .select('password_hash')
      .eq('id', req.user.id)
      .single();
    
    if (findError || !user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) {
      return res.status(400).json({ 
        message: "Current password is incorrect",
        field: "currentPassword"
      });
    }
    
    // Hash new password
    const newHash = await bcrypt.hash(newPassword, 12);
    
    // Update password
    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: newHash })
      .eq('id', req.user.id);

    if (updateError) {
      throw new Error('Failed to update password');
    }
    
    res.json({ message: "Password changed successfully" });
    
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(80).optional(),
  phone: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).min(10).max(15).optional(),
  department: Joi.string().max(100).optional(),
  year: Joi.number().integer().min(1).max(5).optional()
});

export const updateProfile = async (req, res) => {
  try {
    const { name, phone, department, year } = req.body;
    
    // Build update object
    const updateData = {};
    
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (department) updateData.department = department;
    if (year) updateData.year = year;
    
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', req.user.id)
      .select('id, name, email, phone, department, year, college_id, role')
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      throw new Error('Failed to update profile');
    }

    // Transform response to match expected format
    const user = {
      ...data,
      collegeId: data.college_id
    };
    delete user.college_id;
    
    res.json({ user, message: "Profile updated successfully" });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const { data: user, error: findError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();
    
    if (!user || findError) {
      // Don't reveal if email exists or not for security
      return res.json({ 
        message: "If an account with that email exists, we've sent a password reset link." 
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const { error: updateError } = await supabase
      .from('users')
      .update({
        reset_token: resetToken,
        reset_expires: resetExpires
      })
      .eq('email', email);

    if (updateError) {
      throw updateError;
    }

    // In a real app, you would send an email here
    // For now, we'll just return the token (remove this in production)
    res.json({ 
      message: "Password reset token generated",
      token: resetToken // Remove this in production!
    });

  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    const { data: user, error: findError } = await supabase
      .from('users')
      .select('id')
      .eq('reset_token', token)
      .gt('reset_expires', new Date().toISOString())
      .single();

    if (!user || findError) {
      return res.status(400).json({ 
        message: "Invalid or expired reset token" 
      });
    }

    const hash = await bcrypt.hash(password, 12);
    
    const { error: updateError } = await supabase
      .from('users')
      .update({
        password_hash: hash,
        reset_token: null,
        reset_expires: null
      })
      .eq('id', user.id);

    if (updateError) {
      throw updateError;
    }

    res.json({ message: "Password reset successfully" });

  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
