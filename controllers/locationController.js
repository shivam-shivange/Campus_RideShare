import { supabaseAdmin } from '../config/supabase.js';

// Get starting locations for the user's college
export const getStartingLocations = async (req, res) => {
    try {
        console.log('User object:', req.user); // Debug line
        console.log('College ID:', req.user?.collegeId); // Debug line
        
        if (!req.user?.collegeId) {
            console.log('Missing collegeId in user object');
            return res.status(400).json({ message: "College ID not found in user profile" });
        }

        // CORRECTED SUPABASE QUERY
        const { data: routes, error } = await supabaseAdmin
            .from('valid_routes')
            .select(`
                from_location:locations!from_location_id (
                    name,
                    type
                )
            `)
            .eq('college_id', req.user.collegeId)
            .eq('is_active', true);

        if (error) {
            console.error('Supabase error fetching starting locations:', error);
            return res.status(500).json({ message: "Error fetching locations" });
        }

        console.log('Raw routes data:', routes); // Debug line

        // Extract unique locations
        const uniqueLocations = [];
        const seen = new Set();
        
        routes.forEach(route => {
            const location = route.from_location; // Fixed: use from_location
            if (location && !seen.has(location.name)) {
                uniqueLocations.push({
                    name: location.name,
                    type: location.type
                });
                seen.add(location.name);
            }
        });

        // Sort alphabetically
        uniqueLocations.sort((a, b) => a.name.localeCompare(b.name));
        
        console.log('Found starting locations:', uniqueLocations);
        res.json(uniqueLocations);
    } catch (error) {
        console.error('Error fetching starting locations:', error);
        res.status(500).json({ message: "Error fetching locations" });
    }
};

// Get valid destinations based on the starting location
export const getDestinations = async (req, res) => {
    try {
        const { fromLocation } = req.query;
        
        console.log('Getting destinations for:', fromLocation); // Debug line
        console.log('User college ID:', req.user?.collegeId); // Debug line
        
        if (!fromLocation) {
            return res.status(400).json({ message: "Starting location is required" });
        }
        if (!req.user?.collegeId) {
            return res.status(400).json({ message: "College ID not found in user profile" });
        }

        // CORRECTED SUPABASE QUERY - Two separate queries approach
        // First, get the from_location_id
        const { data: fromLocationData, error: fromError } = await supabaseAdmin
            .from('locations')
            .select('id')
            .eq('name', fromLocation)
            .single();

        if (fromError || !fromLocationData) {
            console.error('Error finding from location:', fromError);
            return res.status(404).json({ message: "Starting location not found" });
        }

        console.log('From location ID:', fromLocationData.id); // Debug line

        // Then get destinations for this college and from_location
        const { data: routes, error } = await supabaseAdmin
            .from('valid_routes')
            .select(`
                to_location:locations!to_location_id (
                    name,
                    type
                )
            `)
            .eq('college_id', req.user.collegeId)
            .eq('is_active', true)
            .eq('from_location_id', fromLocationData.id);

        if (error) {
            console.error('Supabase error fetching destinations:', error);
            return res.status(500).json({ 
                message: "Error fetching destinations",
                details: error.message 
            });
        }

        console.log('Raw destinations data:', routes); // Debug line

        // Extract unique destinations
        const uniqueDestinations = [];
        const seen = new Set();
        
        routes.forEach(route => {
            const destination = route.to_location; // Fixed: use to_location
            if (destination && !seen.has(destination.name)) {
                uniqueDestinations.push({
                    name: destination.name,
                    type: destination.type
                });
                seen.add(destination.name);
            }
        });

        // Sort alphabetically
        uniqueDestinations.sort((a, b) => a.name.localeCompare(b.name));
        
        console.log('Found destinations for', fromLocation, ':', uniqueDestinations);
        res.json(uniqueDestinations);
    } catch (error) {
        console.error('Error fetching destinations:', error);
        res.status(500).json({ 
            message: "Error fetching destinations",
            details: error.message 
        });
    }
};
