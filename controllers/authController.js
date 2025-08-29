// import bcrypt from "bcryptjs";
// import { supabaseAdmin } from "../config/supabase.js";

// import { signToken } from "../utils/jwt.js";
// import Joi from "joi";
// import crypto from "crypto";
// import { sendEmail } from "../config/mailer.js";

// export const signupSchema = Joi.object({
//     name: Joi.string().min(2).max(80).required(),
//     email: Joi.string().email().required(),
//     password: Joi.string().min(8).max(72).required(),
//     phone: Joi.string().pattern(/^[0-9+\s-]{10,15}$/).required(),
//     gender: Joi.string().valid('male', 'female', 'other').required(),
//     role: Joi.string().valid('student', 'professor', 'employee').required(),
//     department: Joi.string().max(100),
//     year: Joi.number().integer().min(1).max(4)
// });

// export const loginSchema = Joi.object({
//   email: Joi.string().email().required(),
//   password: Joi.string().required()
// });

// export const forgotPasswordSchema = Joi.object({
//   email: Joi.string().email().required()
// });

// export const resetPasswordSchema = Joi.object({
//   token: Joi.string().required(),
//   password: Joi.string().min(8).max(72).required()
// });

// // Make sure this is exported in your authController
// export const getProfile = async (req, res) => {
//     try {
//         const { data: user, error } = await supabaseAdmin
//             .from('users')
//             .select('id, name, email, phone, gender, department, year, college_id, role, colleges(name, email_domain)')
//             .eq('id', req.user.id)
//             .single();

//         if (error || !user) {
//             return res.status(404).json({ message: "User not found" });
//         }

//         // Transform the response to match the expected format
//         const transformedUser = {
//             ...user,
//             collegeId: user.college_id,
//             collegeName: user.colleges.name,
//             emailDomain: user.colleges.email_domain
//         };
//         delete transformedUser.colleges;
//         delete transformedUser.college_id;

//         res.json({ user: transformedUser });
//     } catch (error) {
//         console.error('Error getting profile:', error);
//         res.status(500).json({ message: "Internal server error" });
//     }
// };


// export const getCollegeLocations = async (req, res) => {
//     try {
//         const { data: rows, error } = await supabaseAdmin
//             .from('college_locations')
//             .select('location_name, location_type')
//             .eq('college_id', req.user.collegeId)
//             .eq('is_active', true)
//             .order('location_type')
//             .order('location_name');
            
//         if (error) {
//             throw error;
//         }
        
//         const locations = {
//             starting: rows.filter(r => r.location_type === 'starting'),
//             destinations: rows.filter(r => r.location_type === 'destination')
//         };
        
//         res.json(locations);
//     } catch (error) {
//         res.status(500).json({ message: "Error fetching locations" });
//     }
// };

// export const signup = async (req, res) => {
//   try {
//     const { name, email, password, phone, gender, role, department, year } = req.body;

//     // Validate email domain
//     const emailDomain = email.split("@")[1]?.trim().toLowerCase();
//     console.log('Full email:', email);
//     console.log('Extracted domain:', emailDomain);
//     console.log('Attempting to find college for domain:', emailDomain);
    
//     const { data: college, error: collegeError } = await supabaseAdmin
//       .from('colleges')
//       .select('id, name, email_domain')
//       .eq('email_domain', emailDomain)
//       .single();
    
//     console.log('College query result:', college);
//     console.log('College query error:', collegeError);
    
//     // Also check what colleges exist in the database
//     const { data: allColleges } = await supabaseAdmin
//       .from('colleges')
//       .select('*');
//     console.log('All colleges in database:', allColleges);
   
//     if (collegeError || !college) {
//       return res.status(400).json({ 
//         message: `Email domain '${emailDomain}' not allowed. Your college is not onboarded.`,
//         field: "email"
//       });
//     }

//     // Check if user already exists
//     const { data: existingUser } = await supabaseAdmin
//       .from('users')
//       .select('id, is_verified')
//       .eq('email', email)
//       .single();

//     if (existingUser) {
//       if (!existingUser.is_verified) {
//         return res.status(403).json({
//           message: "An account with this email exists but is not verified. Please verify your email or resend the verification.",
//           field: "email",
//           email
//         });
//       }
//       return res.status(400).json({ 
//         message: "User already exists with this email",
//         field: "email"
//       });
//     }

//     // Create user
//     const hash = await bcrypt.hash(password, 12);

//     // Prepare verification token
//     const verifyToken = crypto.randomBytes(32).toString('hex');
//     const verifyExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

//     const { data: user, error: insertError } = await supabaseAdmin
//       .from('users')
//       .insert([{
//         name,
//         email,
//         college_id: college.id,
//         password_hash: hash,
//         is_verified: false,
//         verify_token: verifyToken,
//         verify_expires: verifyExpires,
//         phone,
//         gender,
//         role,
//         department: department || null,
//         year: year || null
//       }])
//       .select('id, name, email, college_id, role')
//       .single();

//     if (insertError) {
//       throw insertError;
//     }

//     // Send verification email
//     const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 5000}`;
//     const verifyUrl = `${appUrl}/verify_email.html?token=${verifyToken}`;
//     try {
//       await sendEmail({
//         to: email,
//         subject: "Verify your GoTogether email",
//         html: `
//           <div style="font-family:Arial,sans-serif;line-height:1.6">
//             <h2>Welcome to GoTogether, ${name}!</h2>
//             <p>Please verify your email address to activate your account.</p>
//             <p><a href="${verifyUrl}" style="display:inline-block;padding:10px 16px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px">Verify Email</a></p>
//             <p>Or copy and paste this URL into your browser:<br/>
//             <code>${verifyUrl}</code></p>
//             <p>This link expires in 15 minutes.</p>
//           </div>
//         `
//       });
//     } catch (mailError) {
//       console.error("Failed to send verification email:", mailError);
//     }

//     // Do not auto-login before verification. Return success message.
//     res.status(201).json({ 
//       user: {
//         ...user,
//         collegeId: user.college_id,
//         collegeName: college.name
//       },
//       message: "Account created. Please check your email to verify your account."
//     });

//   } catch (error) {
//     console.error("Signup error:", error);
//     res.status(500).json({ message: "Internal server error" });
//   }
// };

// export const login = async (req, res) => {
//   try {
//     const { email, password } = req.body;

//     const { data: users, error } = await supabaseAdmin
//       .from('users')
//       .select(`
//         id, name, email, college_id, role, password_hash, is_verified,
//         colleges (
//           name
//         )
//       `)
//       .eq('email', email)
//       .single();

//     if (error || !users) {
//       return res.status(400).json({ 
//         message: "Invalid email or password",
//         field: "email"
//       });
//     }

//     const isValidPassword = await bcrypt.compare(password, users.password_hash);
    
//     if (!isValidPassword) {
//       return res.status(400).json({ 
//         message: "Invalid email or password",
//         field: "password"
//       });
//     }

//     if (!users.is_verified) {
//       return res.status(403).json({
//         message: "Please verify your email to continue",
//         field: "email"
//       });
//     }

//     // Transform user data to match expected format
//     const user = {
//       id: users.id,
//       name: users.name,
//       email: users.email,
//       collegeId: users.college_id,
//       role: users.role,
//       collegeName: users.colleges.name
//     };

//     const token = signToken({ 
//       id: user.id, 
//       collegeId: user.collegeId, 
//       role: user.role 
//     });

//     res.json({ 
//       user, 
//       token,
//       message: "Login successful!"
//     });

//   } catch (error) {
//     console.error("Login error:", error);
//     res.status(500).json({ message: "Internal server error" });
//   }
// };

// export const changePasswordSchema = Joi.object({
//   currentPassword: Joi.string().required(),
//   newPassword: Joi.string().min(8).max(72).required(),
//   confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
// });

// export const changePassword = async (req, res) => {
//   try {
//     const { currentPassword, newPassword } = req.body;
    
//     // Get current password hash
//     const { data: user, error: findError } = await supabaseAdmin
//       .from('users')
//       .select('password_hash')
//       .eq('id', req.user.id)
//       .single();
    
//     if (findError || !user) {
//       return res.status(404).json({ message: "User not found" });
//     }
    
//     // Verify current password
//     const isValid = await bcrypt.compare(currentPassword, user.password_hash);
//     if (!isValid) {
//       return res.status(400).json({ 
//         message: "Current password is incorrect",
//         field: "currentPassword"
//       });
//     }
    
//     // Hash new password
//     const newHash = await bcrypt.hash(newPassword, 12);
    
//     // Update password
//     const { error: updateError } = await supabaseAdmin
//       .from('users')
//       .update({ password_hash: newHash })
//       .eq('id', req.user.id);

//     if (updateError) {
//       throw new Error('Failed to update password');
//     }
    
//     res.json({ message: "Password changed successfully" });
    
//   } catch (error) {
//     console.error("Error changing password:", error);
//     res.status(500).json({ message: "Internal server error" });
//   }
// };

// export const updateProfileSchema = Joi.object({
//   name: Joi.string().min(2).max(80).optional(),
//   phone: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).min(10).max(15).optional(),
//   gender: Joi.string().valid('male', 'female', 'other').optional(),
//   role: Joi.string().valid('student', 'professor', 'employee').optional(),
//   department: Joi.string().max(100).optional(),
//   year: Joi.number().integer().min(1).max(5).optional()
// });

// export const updateProfile = async (req, res) => {
//   try {
//     const { name, phone, department, year } = req.body;
    
//     // Build update object
//     const updateData = {};
    
//     if (name) updateData.name = name;
//     if (phone) updateData.phone = phone;
//     if (req.body.gender) updateData.gender = req.body.gender;
//     if (req.body.role) updateData.role = req.body.role;
//     if (department) updateData.department = department;
//     if (year) updateData.year = year;
    
//     if (Object.keys(updateData).length === 0) {
//       return res.status(400).json({ message: "No fields to update" });
//     }

//     const { data, error } = await supabaseAdmin
//       .from('users')
//       .update(updateData)
//       .eq('id', req.user.id)
//       .select('id, name, email, phone, gender, department, year, college_id, role')
//       .single();

//     if (error) {
//       console.error('Error updating profile:', error);
//       throw new Error('Failed to update profile');
//     }

//     // Transform response to match expected format
//     const user = {
//       ...data,
//       collegeId: data.college_id
//     };
//     delete user.college_id;
    
//     res.json({ user, message: "Profile updated successfully" });
//   } catch (error) {
//     console.error("Error updating profile:", error);
//     res.status(500).json({ message: "Internal server error" });
//   }
// };


import bcrypt from "bcryptjs";
import { supabaseAdmin } from "../config/supabase.js";
import { signToken } from "../utils/jwt.js";
import Joi from "joi";
import crypto from "crypto";
import { sendEmail } from "../config/mailer.js";

export const signupSchema = Joi.object({
    name: Joi.string().min(2).max(80).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).max(72).required(),
    phone: Joi.string().pattern(/^[0-9+\s-]{10,15}$/).required(),
    gender: Joi.string().valid('male', 'female', 'other').required(),
    role: Joi.string().valid('student', 'professor', 'employee').required(),
    department: Joi.string().max(100).optional().allow('', null),
    year: Joi.number().integer().min(1).max(4).optional().allow(null)
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

// Fixed getProfile function
export const getProfile = async (req, res) => {
    try {
        const { data: user, error } = await supabaseAdmin
            .from('users')
            .select('id, name, email, phone, gender, department, year, college_id, role, colleges(name, email_domain)')
            .eq('id', req.user.id)
            .single();

        if (error || !user) {
            console.error('Error fetching user profile:', error);
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
        console.error('Error getting profile:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const getCollegeLocations = async (req, res) => {
    try {
        const { data: rows, error } = await supabaseAdmin
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
    const { name, email, password, phone, gender, role, department, year } = req.body;

    // Validate email domain
    const emailDomain = email.split("@")[1]?.trim().toLowerCase();
    console.log('Full email:', email);
    console.log('Extracted domain:', emailDomain);
    console.log('Attempting to find college for domain:', emailDomain);
    
    const { data: college, error: collegeError } = await supabaseAdmin
      .from('colleges')
      .select('id, name, email_domain')
      .eq('email_domain', emailDomain)
      .single();
    
    console.log('College query result:', college);
    console.log('College query error:', collegeError);
    
    if (collegeError || !college) {
      return res.status(400).json({ 
        message: `Email domain '${emailDomain}' not allowed. Your college is not onboarded.`,
        field: "email"
      });
    }

    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id, is_verified')
      .eq('email', email)
      .single();

    if (existingUser) {
      if (!existingUser.is_verified) {
        return res.status(403).json({
          message: "An account with this email exists but is not verified. Please verify your email or resend the verification.",
          field: "email",
          email
        });
      }
      return res.status(400).json({ 
        message: "User already exists with this email",
        field: "email"
      });
    }

    // Create user
    const hash = await bcrypt.hash(password, 12);

    // Prepare verification token
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const { data: user, error: insertError } = await supabaseAdmin
      .from('users')
      .insert([{
        name,
        email,
        college_id: college.id,
        password_hash: hash,
        is_verified: false,
        verify_token: verifyToken,
        verify_expires: verifyExpires,
        phone,
        gender,
        role,
        department: department || null,
        year: year || null
      }])
      .select('id, name, email, college_id, role')
      .single();

    if (insertError) {
      throw insertError;
    }

    // Send verification email
    const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 5000}`;
    const verifyUrl = `${appUrl}/verify_email.html?token=${verifyToken}`;
    try {
      await sendEmail({
        to: email,
        subject: "Verify your GoTogether email",
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6">
            <h2>Welcome to GoTogether, ${name}!</h2>
            <p>Please verify your email address to activate your account.</p>
            <p><a href="${verifyUrl}" style="display:inline-block;padding:10px 16px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px">Verify Email</a></p>
            <p>Or copy and paste this URL into your browser:<br/>
            <code>${verifyUrl}</code></p>
            <p>This link expires in 15 minutes.</p>
          </div>
        `
      });
    } catch (mailError) {
      console.error("Failed to send verification email:", mailError);
    }

    // Do not auto-login before verification. Return success message.
    res.status(201).json({ 
      user: {
        ...user,
        collegeId: user.college_id,
        collegeName: college.name
      },
      message: "Account created. Please check your email to verify your account."
    });

  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select(`
        id, name, email, college_id, role, password_hash, is_verified,
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

    if (!users.is_verified) {
      return res.status(403).json({
        message: "Please verify your email to continue",
        field: "email"
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
    const { data: user, error: findError } = await supabaseAdmin
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
    const { error: updateError } = await supabaseAdmin
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
  phone: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).min(10).max(15).optional().allow('', null),
  gender: Joi.string().valid('male', 'female', 'other').optional(),
  role: Joi.string().valid('student', 'professor', 'employee').optional(),
  department: Joi.string().max(100).optional().allow('', null),
  year: Joi.number().integer().min(1).max(5).optional().allow(null)
});

export const updateProfile = async (req, res) => {
  try {
    const { name, phone, department, year } = req.body;
    
    // Build update object
    const updateData = {};
    
    if (name) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone || null;
    if (req.body.gender) updateData.gender = req.body.gender;
    if (req.body.role) updateData.role = req.body.role;
    if (department !== undefined) updateData.department = department || null;
    if (year !== undefined) updateData.year = year || null;
    
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updateData)
      .eq('id', req.user.id)
      .select('id, name, email, phone, gender, department, year, college_id, role')
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
// ✅ FIXED: Forgot Password Implementation
export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        
        // Validate input
        if (!email || !email.trim()) {
            return res.status(400).json({ 
                message: "Email is required" 
            });
        }

        // ✅ FIX: Use supabaseAdmin consistently
        const { data: user, error: findError } = await supabaseAdmin
            .from('users')
            .select('id, name, email, is_verified')
            .eq('email', email.trim().toLowerCase())
            .single();

        // Always return success for security (don't reveal if email exists)
        if (findError || !user) {
            return res.json({ 
                message: "If an account with that email exists, we've sent a password reset link." 
            });
        }

        // Check if user is verified
        if (!user.is_verified) {
            return res.json({ 
                message: "If an account with that email exists, we've sent a password reset link." 
            });
        }

        // Generate secure reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry

        // ✅ FIX: Use supabaseAdmin and handle errors properly
        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({
                reset_token: resetToken,
                reset_expires: resetExpires.toISOString()
            })
            .eq('id', user.id);

        if (updateError) {
            console.error('Database update error:', updateError);
            return res.json({ 
                message: "If an account with that email exists, we've sent a password reset link." 
            });
        }

        // ✅ IMPROVED: Enhanced email sending with better error handling
        const appUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 5000}`;
        const resetUrl = `${appUrl}/reset-password.html?token=${resetToken}`;

        try {
            await sendEmail({
                to: email,
                subject: 'RideShare - Password Reset Request',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                        <div style="background: linear-gradient(135deg, #2563eb, #1d4ed8); padding: 30px; text-align: center;">
                            <h1 style="color: white; margin: 0; font-size: 24px;">🔒 Password Reset</h1>
                        </div>
                        <div style="padding: 30px;">
                            <p style="color: #374151; font-size: 16px;">Hello ${user.name || 'there'},</p>
                            
                            <p style="color: #374151;">We received a request to reset your RideShare account password. If you didn't make this request, you can safely ignore this email.</p>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${resetUrl}" 
                                   style="background: linear-gradient(135deg, #2563eb, #1d4ed8); 
                                          color: white; 
                                          padding: 15px 30px; 
                                          text-decoration: none; 
                                          border-radius: 8px; 
                                          font-weight: 600; 
                                          display: inline-block;">
                                    Reset Your Password
                                </a>
                            </div>
                            
                            <p style="font-size: 14px; color: #6b7280; text-align: center;">
                                Or copy this link: <br>
                                <code style="background: #e5e7eb; padding: 5px 8px; border-radius: 4px; font-size: 12px;">${resetUrl}</code>
                            </p>
                            
                            <p style="font-size: 14px; color: #6b7280; border-top: 1px solid #d1d5db; padding-top: 20px; margin-top: 30px;">
                                ⏰ This link expires in 1 hour for security reasons.
                            </p>
                        </div>
                    </div>
                `
            });

            console.log(`✅ Password reset email sent successfully to ${email}`);
        } catch (mailError) {
            console.error('❌ Failed to send reset email:', mailError);
            // Don't fail the request - continue with success message for security
        }

        // Always return success message for security
        return res.json({ 
            message: "If an account with that email exists, we've sent a password reset link." 
        });

    } catch (error) {
        console.error('❌ Forgot password error:', error);
        res.status(500).json({ 
            message: "Internal server error" 
        });
    }
};

// ✅ FIXED: Reset Password Implementation  
export const resetPassword = async (req, res) => {
    try {
        const { token, password, confirmPassword } = req.body;

        // Validate inputs
        if (!token || !password || !confirmPassword) {
            return res.status(400).json({ 
                message: "All fields are required" 
            });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ 
                message: "Passwords do not match" 
            });
        }

        if (password.length < 8) {
            return res.status(400).json({ 
                message: "Password must be at least 8 characters long" 
            });
        }

        // ✅ FIX: Use supabaseAdmin consistently
        const { data: user, error: findError } = await supabaseAdmin
            .from('users')
            .select('id, email, name')
            .eq('reset_token', token)
            .gt('reset_expires', new Date().toISOString())
            .single();

        if (findError || !user) {
            return res.status(400).json({ 
                message: "Invalid or expired reset token. Please request a new password reset." 
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(password, 12);

        // ✅ FIX: Update password and clear reset token
        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({
                password_hash: hashedPassword,
                reset_token: null,
                reset_expires: null
            })
            .eq('id', user.id);

        if (updateError) {
            console.error('Password update error:', updateError);
            return res.status(500).json({ 
                message: "Failed to update password. Please try again." 
            });
        }

        console.log(`✅ Password reset successful for user: ${user.email}`);
        
        res.json({ 
            message: "Password reset successful! You can now log in with your new password." 
        });

    } catch (error) {
        console.error('❌ Reset password error:', error);
        res.status(500).json({ 
            message: "Internal server error" 
        });
    }
};




export const resendVerificationSchema = Joi.object({
  email: Joi.string().email().required()
});

export const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, name, email, is_verified')
      .eq('email', email)
      .single();

    if (error || !user) {
      // Do not reveal if user exists
      return res.json({ message: "If your account exists and is not verified, a new verification email has been sent." });
    }

    if (user.is_verified) {
      return res.json({ message: "Email is already verified." });
    }

    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyExpires = new Date(Date.now() + 15 * 60 * 1000);

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ verify_token: verifyToken, verify_expires: verifyExpires })
      .eq('id', user.id);

    if (updateError) throw updateError;

    // Updated code for your backend
    const appUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || `https://campus-rideshare.onrender.com`;
    const verifyUrl = `${appUrl}/verify_email.html?token=${verifyToken}`;

    try {
      await sendEmail({
        to: email,
        subject: "Verify your GoTogether email",
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6">
            <p>Hello${user.name ? ` ${user.name}` : ''},</p>
            <p>Please verify your email address to activate your account.</p>
            <p><a href="${verifyUrl}" style="display:inline-block;padding:10px 16px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px">Verify Email</a></p>
            <p>Or copy and paste this URL into your browser:<br/>
            <code>${verifyUrl}</code></p>
            <p>This link expires in 15 minutes.</p>
          </div>
        `
      });
    } catch (mailError) {
      console.error("Failed to send verification email:", mailError);
    }

    res.json({ message: "Verification email sent if the account is eligible." });
  } catch (error) {
    console.error("Resend verification error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const token = (req.query.token || req.body.token || '').trim();
    if (!token) {
      return res.status(400).send("Missing token");
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('verify_token', token)
      .gt('verify_expires', new Date().toISOString())
      .single();

    if (error || !user) {
      return res.status(400).send("Invalid or expired verification link");
    }

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ is_verified: true, verify_token: null, verify_expires: null })
      .eq('id', user.id);

    if (updateError) throw updateError;

    const frontendUrl = process.env.FRONTEND_URL;
    if (frontendUrl) {
      return res.redirect(`${frontendUrl}?verified=1`);
    }
    res.send("Email verified successfully. You can close this window and log in.");
  } catch (error) {
    console.error("Verify email error:", error);
    res.status(500).send("Internal server error");
  }
};


// Add this function to your existing authController.js
export const checkEmail = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }

    res.json({ exists: !!user });
  } catch (err) {
    console.error('Check email error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
