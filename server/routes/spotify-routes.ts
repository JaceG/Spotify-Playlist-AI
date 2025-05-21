import express, { Request, Response } from 'express';
import spotifyApi from '../config/spotify';
import { isAuthenticated } from '../auth/spotify-auth';
import User from '../models/User';
import Playlist from '../models/Playlist';
import Track from '../models/Track';

const router = express.Router();

// Middleware to check if access token needs refreshing
const refreshTokenIfNeeded = async (
	req: Request,
	res: Response,
	next: Function
) => {
	if (!req.user) {
		return res.status(401).json({ message: 'User not authenticated' });
	}

	const user: any = req.user;

	// Check if token has expired
	if (user.tokenExpiration && new Date() > new Date(user.tokenExpiration)) {
		try {
			// Set refresh token and refresh
			spotifyApi.setRefreshToken(user.refreshToken);
			const data = await spotifyApi.refreshAccessToken();

			// Update user with new token information
			const tokenExpiration = new Date();
			tokenExpiration.setSeconds(
				tokenExpiration.getSeconds() + data.body.expires_in
			);

			user.accessToken = data.body.access_token;
			user.tokenExpiration = tokenExpiration;
			await User.findByIdAndUpdate(user._id, {
				accessToken: data.body.access_token,
				tokenExpiration,
			});

			// Set the new access token for the API calls
			spotifyApi.setAccessToken(data.body.access_token);
		} catch (error) {
			console.error('Error refreshing access token', error);
			return res.status(500).json({ message: 'Failed to refresh token' });
		}
	} else {
		// Set the current access token
		spotifyApi.setAccessToken(user.accessToken);
	}

	next();
};

// Make the middleware optional to help with debugging
const useAuth = process.env.NODE_ENV === 'production';

// Modify middleware application based on environment
if (useAuth) {
	console.log('Applying full authentication middleware - Production mode');
	router.use(isAuthenticated, refreshTokenIfNeeded);
} else {
	console.log('Using flexible authentication - Development mode');
	// In development, use direct API connection with hard tokens if available
	router.use(async (req: Request, res: Response, next: Function) => {
		try {
			if (req.isAuthenticated() && req.user) {
				// User is authenticated, use their token
				console.log('User is authenticated, using their token');
				await refreshTokenIfNeeded(req, res, next);
			} else {
				// Try to use environment variables directly if available
				if (
					process.env.SPOTIFY_CLIENT_ID &&
					process.env.SPOTIFY_CLIENT_SECRET
				) {
					console.log('Using direct Spotify API access');

					// Set the API credentials directly
					spotifyApi.setClientId(process.env.SPOTIFY_CLIENT_ID);
					spotifyApi.setClientSecret(
						process.env.SPOTIFY_CLIENT_SECRET
					);

					// Note: Without a user token, we can't access protected resources
					// But we'll allow the request to proceed
				}

				next();
			}
		} catch (error) {
			console.error('Error in authentication middleware:', error);
			next(error);
		}
	});
}

// Get current user profile
router.get('/me', async (req: Request, res: Response) => {
	try {
		console.log('Attempting to get Spotify profile with token');

		// Check if user is authenticated via Spotify
		if (req.isAuthenticated() && req.user) {
			console.log('User is authenticated, using Spotify API');

			// Set access token from user object
			const user: any = req.user;
			spotifyApi.setAccessToken(user.accessToken);

			const data = await spotifyApi.getMe();
			console.log('Spotify profile data retrieved successfully');

			return res.json({
				id: data.body.id,
				displayName: data.body.display_name,
				email: data.body.email,
				profileImage: data.body.images?.[0]?.url,
				spotifyUrl: data.body.external_urls?.spotify,
				isPremium: data.body.product === 'premium',
			});
		} else {
			// User not authenticated with Spotify
			console.log('User not authenticated with Spotify');
			return res.status(401).json({
				message: 'Not authenticated with Spotify',
				authenticated: false,
			});
		}
	} catch (error: any) {
		console.error('Error getting Spotify profile', error.message);
		return res.status(500).json({
			message: 'Failed to fetch Spotify profile',
			error: error.message,
		});
	}
});

// Get current user's playlists
router.get('/playlists', async (req: Request, res: Response) => {
	try {
		// First check if the user is authenticated via session
		if (req.isAuthenticated() && req.user) {
			console.log(
				'User is authenticated via session, fetching their playlists'
			);
			const user: any = req.user;

			// Set the access token from the authenticated user
			spotifyApi.setAccessToken(user.accessToken);

			try {
				// First, get the user's profile to get their Spotify ID
				const userProfile = await spotifyApi.getMe();
				const userId = userProfile.body.id;
				console.log('Got user profile with ID:', userId);

				// Fetch the user's playlists with their specific ID and a proper limit
				const userPlaylists = await spotifyApi.getUserPlaylists(
					userId,
					{ limit: 50 }
				);

				// Log success with count
				const playlistCount = userPlaylists.body.items?.length || 0;
				console.log(
					'User playlists retrieved successfully:',
					playlistCount
				);

				// Return the user's actual playlists
				return res.json(userPlaylists.body);
			} catch (apiError: any) {
				// Handle session token errors...
				console.error(
					'Error accessing user playlists with session token:',
					apiError.message
				);
			}
		}

		// If session auth failed or we're using PKCE, try to use the Authorization header
		const authHeader = req.headers.authorization;
		if (authHeader && authHeader.startsWith('Bearer ')) {
			const accessToken = authHeader.substring(7);
			console.log('Using token from Authorization header');

			// Set the access token
			spotifyApi.setAccessToken(accessToken);

			try {
				// Get user profile
				const userProfile = await spotifyApi.getMe();
				const userId = userProfile.body.id;
				console.log('Got user profile with header token, ID:', userId);

				// Fetch the user's playlists
				const userPlaylists = await spotifyApi.getUserPlaylists(
					userId,
					{ limit: 50 }
				);

				// Log success
				const playlistCount = userPlaylists.body.items?.length || 0;
				console.log(
					'User playlists retrieved successfully with header token:',
					playlistCount
				);

				return res.json(userPlaylists.body);
			} catch (authError: any) {
				console.error(
					'Error with Authorization header token:',
					authError.message
				);
			}
		}

		// If we couldn't get any playlists, let client know authentication is required
		console.log('Authentication required for real playlists');

		// Return an empty successful response with a message instead of error
		return res.json({
			items: [],
			total: 0,
			message: 'Authentication required for real playlists',
		});
	} catch (error: any) {
		console.error('Error getting Spotify playlists', error.message);
		return res.status(500).json({
			message: 'Failed to fetch Spotify playlists',
			error: error.message,
		});
	}
});

// Get a specific playlist
router.get('/playlists/:id', async (req: Request, res: Response) => {
	try {
		const data = await spotifyApi.getPlaylist(req.params.id);
		return res.json(data.body);
	} catch (error) {
		console.error('Error getting Spotify playlist', error);
		return res
			.status(500)
			.json({ message: 'Failed to fetch Spotify playlist' });
	}
});

// Get tracks from a playlist
router.get('/playlists/:id/tracks', async (req: Request, res: Response) => {
	try {
		const data = await spotifyApi.getPlaylistTracks(req.params.id);
		return res.json(data.body);
	} catch (error) {
		console.error('Error getting playlist tracks', error);
		return res
			.status(500)
			.json({ message: 'Failed to fetch playlist tracks' });
	}
});

// Create a new playlist on Spotify
router.post('/playlists', async (req: Request, res: Response) => {
	try {
		const user: any = req.user;
		const { name, description, tracks, isAIGenerated } = req.body;

		if (!name) {
			return res
				.status(400)
				.json({ message: 'Playlist name is required' });
		}

		// Create playlist on Spotify
		const playlistData = await spotifyApi.createPlaylist(name, {
			description: description || 'Created with Spotify Playlist AI',
			public: false,
		});

		const playlistId = playlistData.body.id;

		// Add tracks to the playlist if provided
		if (tracks && tracks.length > 0) {
			const trackUris = tracks.map((track: any) => track.uri);
			await spotifyApi.addTracksToPlaylist(playlistId, trackUris);
		}

		// Save playlist to our database
		const playlist = await Playlist.create({
			name,
			userId: user._id,
			spotifyId: playlistId,
			coverImage: playlistData.body.images[0]?.url || '',
			description: description || '',
			isAIGenerated: isAIGenerated || false,
			tracksCount: tracks ? tracks.length : 0,
			duration: tracks
				? tracks.reduce(
						(total: number, track: any) =>
							total + track.duration_ms / 1000,
						0
				  )
				: 0,
		});

		return res.status(201).json({
			message: 'Playlist created successfully',
			playlist,
		});
	} catch (error) {
		console.error('Error creating playlist', error);
		return res.status(500).json({ message: 'Failed to create playlist' });
	}
});

// Search Spotify for tracks
router.get('/search/tracks', async (req: Request, res: Response) => {
	try {
		const query = req.query.q as string;
		const limit = parseInt(req.query.limit as string) || 20;

		if (!query) {
			return res
				.status(400)
				.json({ message: 'Search query is required' });
		}

		const data = await spotifyApi.searchTracks(query, { limit });
		return res.json(data.body);
	} catch (error) {
		console.error('Error searching tracks', error);
		return res.status(500).json({ message: 'Failed to search tracks' });
	}
});

// Get user's saved tracks (liked songs) with pagination
router.get('/me/tracks', async (req: Request, res: Response) => {
	try {
		const limit = parseInt(req.query.limit as string) || 50;
		const offset = parseInt(req.query.offset as string) || 0;

		// Handle Authorization header for PKCE flow
		const authHeader = req.headers.authorization;
		if (authHeader && authHeader.startsWith('Bearer ')) {
			const accessToken = authHeader.substring(7);
			spotifyApi.setAccessToken(accessToken);
		} else if (req.isAuthenticated() && req.user) {
			// Use session token if available
			const user: any = req.user;
			spotifyApi.setAccessToken(user.accessToken);
		} else {
			return res.status(401).json({
				message: 'Authentication required to access saved tracks',
				items: [],
				total: 0,
			});
		}

		const data = await spotifyApi.getMySavedTracks({ limit, offset });
		console.log(
			`Retrieved ${data.body.items.length} saved tracks, total: ${data.body.total}`
		);
		return res.json(data.body);
	} catch (error: any) {
		console.error('Error getting saved tracks:', error.message);
		return res.status(500).json({
			message: 'Failed to fetch saved tracks',
			error: error.message,
		});
	}
});

// Get audio features for multiple tracks
router.post('/audio-features', async (req: Request, res: Response) => {
	try {
		const { trackIds } = req.body;

		if (!trackIds || !Array.isArray(trackIds) || trackIds.length === 0) {
			return res
				.status(400)
				.json({ message: 'Track IDs array is required' });
		}

		// Handle Authorization header for PKCE flow
		const authHeader = req.headers.authorization;
		if (authHeader && authHeader.startsWith('Bearer ')) {
			const accessToken = authHeader.substring(7);
			spotifyApi.setAccessToken(accessToken);
		} else if (req.isAuthenticated() && req.user) {
			// Use session token if available
			const user: any = req.user;
			spotifyApi.setAccessToken(user.accessToken);
		} else {
			return res.status(401).json({
				message: 'Authentication required to get audio features',
			});
		}

		// Process in batches of 100 (Spotify API limit)
		const batchSize = 100;
		let allFeatures: SpotifyApi.AudioFeaturesObject[] = [];

		for (let i = 0; i < trackIds.length; i += batchSize) {
			const batch = trackIds.slice(i, i + batchSize);
			const data = await spotifyApi.getAudioFeaturesForTracks(batch);
			allFeatures = [...allFeatures, ...data.body.audio_features];
		}

		return res.json({ audio_features: allFeatures });
	} catch (error: any) {
		console.error('Error getting audio features:', error.message);
		return res.status(500).json({
			message: 'Failed to fetch audio features',
			error: error.message,
		});
	}
});

// Get all user's library data for AI analysis
router.get('/library', async (req: Request, res: Response) => {
	try {
		// Handle Authorization header for PKCE flow
		const authHeader = req.headers.authorization;
		if (authHeader && authHeader.startsWith('Bearer ')) {
			const accessToken = authHeader.substring(7);
			spotifyApi.setAccessToken(accessToken);
		} else if (req.isAuthenticated() && req.user) {
			// Use session token if available
			const user: any = req.user;
			spotifyApi.setAccessToken(user.accessToken);
		} else {
			return res
				.status(401)
				.json({ message: 'Authentication required to access library' });
		}

		// Get user's top tracks
		const topTracks = await spotifyApi.getMyTopTracks({ limit: 50 });

		// Get user's saved tracks (first 50 only for this summary)
		const savedTracks = await spotifyApi.getMySavedTracks({ limit: 50 });

		// Get user's playlists
		const userProfile = await spotifyApi.getMe();
		const userId = userProfile.body.id;
		const playlists = await spotifyApi.getUserPlaylists(userId, {
			limit: 50,
		});

		// Return combined library data
		return res.json({
			top_tracks: topTracks.body.items,
			saved_tracks: savedTracks.body.items,
			playlists: playlists.body.items,
			summary: {
				total_playlists: playlists.body.total,
				total_saved_tracks: savedTracks.body.total,
				user_id: userId,
				display_name: userProfile.body.display_name,
			},
		});
	} catch (error: any) {
		console.error('Error getting library data:', error.message);
		return res.status(500).json({
			message: 'Failed to fetch library data',
			error: error.message,
		});
	}
});

// Test endpoint to diagnose permissions and token status
router.get('/test-permissions', async (req: Request, res: Response) => {
	try {
		// Handle Authorization header for PKCE flow
		const authHeader = req.headers.authorization;
		if (authHeader && authHeader.startsWith('Bearer ')) {
			const accessToken = authHeader.substring(7);
			spotifyApi.setAccessToken(accessToken);
			console.log('Using token from Authorization header for test');
		} else if (req.isAuthenticated() && req.user) {
			// Use session token if available
			const user: any = req.user;
			spotifyApi.setAccessToken(user.accessToken);
			console.log('Using session token for test');
		} else {
			return res
				.status(401)
				.json({ message: 'Authentication required for test' });
		}

		// 1. Test fetching user profile
		console.log('Testing user profile access...');
		const userProfile = await spotifyApi.getMe();
		const userId = userProfile.body.id;

		// 2. Try to create a test playlist
		console.log('Testing playlist creation permission...');
		try {
			const testPlaylist = await spotifyApi.createPlaylist(
				'Test Playlist (Will Delete)',
				{
					description:
						'This is just a test playlist to check permissions',
					public: false,
				}
			);

			console.log(
				'Playlist creation successful, ID:',
				testPlaylist.body.id
			);

			// 3. Try to delete the test playlist if created
			try {
				await spotifyApi.unfollowPlaylist(testPlaylist.body.id);
				console.log('Successfully deleted test playlist');
			} catch (deleteError: any) {
				console.error(
					'Error deleting test playlist:',
					deleteError.message
				);
			}

			return res.json({
				success: true,
				message: 'All permissions verified successfully',
				userId: userId,
				canCreatePlaylists: true,
			});
		} catch (playlistError: any) {
			console.error('Playlist creation failed:', playlistError.message);
			if (playlistError.body) {
				console.error(
					'Error details:',
					JSON.stringify(playlistError.body, null, 2)
				);
			}

			return res.json({
				success: false,
				message: 'Cannot create playlists with current token',
				userId: userId,
				error: playlistError.message,
				canCreatePlaylists: false,
			});
		}
	} catch (error: any) {
		console.error('Error in permission test:', error.message);
		return res.status(500).json({
			success: false,
			message: 'Failed to test permissions',
			error: error.message,
		});
	}
});

export default router;
