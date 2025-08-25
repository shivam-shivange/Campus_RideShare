import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Debug environment variables
console.log('SUPABASE_URL:', SUPABASE_URL ? 'Set' : 'Missing');
console.log('SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? 'Set' : 'Missing');
console.log('SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'Missing');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing required Supabase credentials');
}

// Main client with anon key (for most operations)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Admin client with service role key (for admin operations)
export const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY 
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false
        }
    })
    : supabase; // Fallback to regular client if no service role key

console.log('✅ Supabase clients created successfully');

export default supabase;
    