import { verifyToken } from '../utils/jwt.js';
import { supabaseAdmin } from '../config/supabase.js';

export const protect = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        console.log('[Auth] Authorization header:', authHeader ? 'Present' : 'Missing');
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.log('[Auth] No Bearer token found');
            return res.status(401).json({ message: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        console.log('[Auth] Token extracted:', token ? 'Present' : 'Missing');

        const decoded = verifyToken(token);
        console.log('[Auth] Token verified successfully for user:', decoded.id);

        // Get user from Supabase using supabaseAdmin
        const { data: user, error } = await supabaseAdmin
            .from('users')
            .select(`
                id, name, email, college_id, role,
                colleges (
                    id,
                    name,
                    email_domain
                )
            `)
            .eq('id', decoded.id)
            .single();

        console.log('[Auth] Supabase query result:', { user: user ? 'Found' : 'Not found', error });

        if (error || !user) {
            console.log('[Auth] User not found in database:', error?.message);
            return res.status(401).json({ message: 'Invalid token - user not found' });
        }

        console.log('[Auth] User found:', user.name, 'College ID:', user.college_id);

        // Attach user to request with proper mapping
        req.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            collegeId: user.college_id, // Map college_id to collegeId
            role: user.role,
            college: user.colleges // Include college info if needed
        };

        console.log('[Auth] req.user set with collegeId:', req.user.collegeId);
        next();
    } catch (error) {
        console.error('[Auth] Unexpected error during authentication:', error.message);
        if (error.message.includes('jwt') || error.message.includes('token')) {
            return res.status(401).json({ message: 'Invalid or expired token' });
        }
        res.status(500).json({ message: 'Authentication server error' });
    }
};

// Alternative export for compatibility
export const authenticateToken = protect;

// Middleware for optional authentication (doesn't block if no token)
export const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // No token provided, but continue without user
            req.user = null;
            return next();
        }

        const token = authHeader.split(' ')[1];
        const decoded = verifyToken(token);

        const { data: user, error } = await supabaseAdmin
            .from('users')
            .select(`
                id, name, email, college_id, role,
                colleges (
                    id,
                    name,
                    email_domain
                )
            `)
            .eq('id', decoded.id)
            .single();

        if (!error && user) {
            req.user = {
                id: user.id,
                name: user.name,
                email: user.email,
                collegeId: user.college_id,
                role: user.role,
                college: user.colleges
            };
        } else {
            req.user = null;
        }

        next();
    } catch (error) {
        // On error, continue without user
        req.user = null;
        next();
    }
};
