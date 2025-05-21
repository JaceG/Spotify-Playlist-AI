import type { Express, Request, Response } from 'express';
import { createServer, type Server } from 'http';
import { storage } from './storage';
import {
	insertUserSchema,
	insertPlaylistSchema,
	insertTrackSchema,
	insertChatMessageSchema,
} from '@shared/schema';
import { z } from 'zod';
import spotifyRoutes from './routes/spotify-routes';
import { isAuthenticated } from './auth/spotify-auth';

export async function registerRoutes(app: Express): Promise<Server> {
	// Spotify auth route
	app.get('/auth/spotify', (req, res) => {
		console.log('Spotify auth route called');
		// Use the redirect URI from environment variables
		// This must exactly match what's registered in Spotify Developer Dashboard
		const redirectUri =
			process.env.SPOTIFY_REDIRECT_URI ||
			'http://127.0.0.1:3000/auth/spotify/callback';

		console.log('Using redirect URI:', redirectUri);

		// Using the client ID from environment
		const clientId = process.env.SPOTIFY_CLIENT_ID || '';

		// Construct the authorization URL with the correct redirect URI
		res.redirect(
			`https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(
				redirectUri
			)}&scope=user-read-private%20user-read-email%20playlist-read-private%20playlist-modify-private%20playlist-modify-public%20user-library-read%20user-top-read%20user-read-email%20user-read-playback-state%20streaming`
		);
	});

	// Logout route
	app.get('/auth/logout', (req, res) => {
		console.log('Logout route called');
		// In a real implementation with sessions, we would destroy the session here
		res.redirect('/?logout=success');
	});

	// Spotify auth callback route
	app.get('/auth/spotify/callback', async (req, res) => {
		// For PKCE flow, we need to let the client handle the code exchange
		// Instead of trying to exchange the code here, redirect to the client's callback handler
		const code = req.query.code;
		const error = req.query.error;

		// Just redirect to the client-side handler with the same parameters
		const redirectUrl = `/?${new URLSearchParams(
			req.query as any
		).toString()}`;
		console.log('Redirecting to client handler:', redirectUrl);

		res.redirect(redirectUrl);
	});

	// API routes
	app.get('/api/user', async (req, res) => {
		// For demo purposes, return the first user
		const user = await storage.getUser(1);
		if (!user) {
			return res.status(404).json({ message: 'User not found' });
		}
		return res.json(user);
	});

	// Get current user's Spotify profile - direct connection to Spotify's API
	app.get('/api/spotify/me', async (req, res) => {
		try {
			const SpotifyWebApi = require('spotify-web-api-node');

			// Get the access token from environment (set during auth callback)
			const accessToken = process.env.SPOTIFY_ACCESS_TOKEN;

			if (!accessToken) {
				console.log(
					'No Spotify access token found - user not authenticated'
				);
				return res
					.status(401)
					.json({ error: 'Not authenticated with Spotify' });
			}

			console.log(
				'Found access token, attempting to fetch Spotify profile'
			);

			// Create Spotify API instance with the correct credentials
			const spotifyApi = new SpotifyWebApi({
				clientId: process.env.SPOTIFY_CLIENT_ID || '',
				clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
			});

			// Set the access token for the API request
			spotifyApi.setAccessToken(accessToken);

			// Get user profile from Spotify API
			console.log('Making API call to Spotify...');
			const userData = await spotifyApi.getMe();

			// Log the actual response for debugging
			console.log('Raw Spotify response:', JSON.stringify(userData.body));

			// Return the Spotify user profile directly from Spotify API
			const profile = {
				id: userData.body.id,
				displayName: userData.body.display_name,
				email: userData.body.email,
				profileImage:
					userData.body.images && userData.body.images.length > 0
						? userData.body.images[0].url
						: '',
				spotifyUrl: userData.body.external_urls?.spotify,
				isPremium: userData.body.product === 'premium',
			};

			console.log('Returning profile to client:', profile);
			res.json(profile);
		} catch (error: any) {
			console.error('Error fetching Spotify profile:', error.message);
			console.error('Stack trace:', error.stack);
			res.status(401).json({
				error: 'Failed to get Spotify profile',
				details: error.message,
			});
		}
	});

	// Get all playlists for a user
	app.get('/api/playlists', async (req, res) => {
		const userId = 1; // Demo user
		const playlists = await storage.getPlaylists(userId);
		return res.json(playlists);
	});

	// Get AI-generated playlists for a user
	app.get('/api/playlists/ai', async (req, res) => {
		const userId = 1; // Demo user
		const playlists = await storage.getAIGeneratedPlaylists(userId);
		return res.json(playlists);
	});

	// Get user playlists (non-AI generated) for a user
	app.get('/api/playlists/user', async (req, res) => {
		const userId = 1; // Demo user
		const playlists = await storage.getUserPlaylists(userId);
		return res.json(playlists);
	});

	// Get a specific playlist
	app.get('/api/playlists/:id', async (req, res) => {
		const id = parseInt(req.params.id);
		if (isNaN(id)) {
			return res.status(400).json({ message: 'Invalid playlist ID' });
		}

		const playlist = await storage.getPlaylist(id);
		if (!playlist) {
			return res.status(404).json({ message: 'Playlist not found' });
		}

		// Get tracks for this playlist
		const tracks = await storage.getTracksByPlaylist(id);

		return res.json({ playlist, tracks });
	});

	// Create a new playlist
	app.post('/api/playlists', async (req, res) => {
		try {
			const userId = 1; // Demo user
			const playlistData = insertPlaylistSchema.parse({
				...req.body,
				userId,
			});

			const playlist = await storage.createPlaylist(playlistData);

			// If tracks are provided, add them to the playlist
			if (req.body.tracks && Array.isArray(req.body.tracks)) {
				for (const trackData of req.body.tracks) {
					await storage.createTrack({
						...trackData,
						playlistId: playlist.id,
					});
				}
			}

			return res.status(201).json(playlist);
		} catch (error) {
			if (error instanceof z.ZodError) {
				return res.status(400).json({
					message: 'Invalid playlist data',
					errors: error.errors,
				});
			}
			throw error;
		}
	});

	// Get chat history
	app.get('/api/chat', async (req, res) => {
		const userId = 1; // Demo user
		const limit = req.query.limit
			? parseInt(req.query.limit as string)
			: undefined;

		const chatHistory = await storage.getChatHistory(userId, limit);
		return res.json(chatHistory);
	});

	// Send a new chat message
	app.post('/api/chat', async (req, res) => {
		try {
			const userId = 1; // Demo user
			const messageData = insertChatMessageSchema.parse({
				...req.body,
				userId,
				isUserMessage: true,
			});

			const message = await storage.createChatMessage(messageData);

			// Generate a bot response
			setTimeout(async () => {
				// This would normally be handled by more complex logic or an external API
				const responseContent = generateBotResponse(req.body.content);

				await storage.createChatMessage({
					userId,
					content: responseContent,
					isUserMessage: false,
				});
			}, 500);

			return res.status(201).json(message);
		} catch (error) {
			if (error instanceof z.ZodError) {
				return res.status(400).json({
					message: 'Invalid message data',
					errors: error.errors,
				});
			}
			throw error;
		}
	});

	// Create a playlist from chat request
	app.post('/api/chat/generate-playlist', async (req, res) => {
		try {
			const userId = 1; // Demo user
			const { description, type } = req.body;

			if (!description || !type) {
				return res
					.status(400)
					.json({ message: 'Missing required fields' });
			}

			// In a real app, this would call an AI service or analyze user's music
			// For now, we'll use mock data based on the type requested
			const playlistData = generateMockPlaylist(type);

			const playlist = await storage.createPlaylist({
				name: playlistData.name,
				userId,
				coverImage: playlistData.coverImage,
				description: playlistData.description,
				isAIGenerated: true,
				tracksCount: playlistData.tracks.length,
				duration: playlistData.tracks.reduce(
					(total, track) => total + track.duration,
					0
				),
			});

			// Add tracks to the playlist
			for (const trackData of playlistData.tracks) {
				await storage.createTrack({
					title: trackData.title,
					artist: trackData.artist,
					albumArt: trackData.albumArt,
					duration: trackData.duration,
					playlistId: playlist.id,
				});
			}

			return res
				.status(201)
				.json({ playlist, tracks: playlistData.tracks });
		} catch (error) {
			if (error instanceof z.ZodError) {
				return res.status(400).json({
					message: 'Invalid request data',
					errors: error.errors,
				});
			}
			throw error;
		}
	});

	const httpServer = createServer(app);
	return httpServer;
}

// Helper functions for generating mock responses
function generateBotResponse(userMessage: string): string {
	const lowerMessage = userMessage.toLowerCase();

	if (
		lowerMessage.includes('workout') ||
		lowerMessage.includes('exercise') ||
		lowerMessage.includes('gym')
	) {
		return 'I can create a high-energy workout playlist for you. What kind of music do you prefer for your workouts?';
	} else if (
		lowerMessage.includes('relax') ||
		lowerMessage.includes('chill') ||
		lowerMessage.includes('calm')
	) {
		return "I'd be happy to create a relaxing playlist for you. Do you prefer ambient sounds, acoustic tracks, or something else?";
	} else if (
		lowerMessage.includes('focus') ||
		lowerMessage.includes('study') ||
		lowerMessage.includes('concentration')
	) {
		return 'I can help you with a focus playlist. Would you like instrumental tracks or do you prefer music with minimal lyrics?';
	} else if (
		lowerMessage.includes('party') ||
		lowerMessage.includes('dance') ||
		lowerMessage.includes('celebration')
	) {
		return "I'll create an upbeat party playlist for you. Any specific genres or decades you'd like to include?";
	} else {
		return "I'd be happy to create a custom playlist for you. Could you tell me more about the mood or style you're looking for?";
	}
}

function generateMockPlaylist(type: string) {
	if (type === 'workout') {
		return {
			name: 'Workout Energy Boost',
			coverImage:
				'https://images.unsplash.com/photo-1514525253161-7a46d19cd819',
			description: 'High-energy tracks to power through your workout',
			tracks: [
				{
					title: 'Power Up',
					artist: 'Electronic Momentum',
					albumArt: '',
					duration: 204,
				},
				{
					title: 'Energy Flow',
					artist: 'Beats Collective',
					albumArt: '',
					duration: 252,
				},
				{
					title: 'Maximum Drive',
					artist: 'Rhythm Pushers',
					albumArt: '',
					duration: 238,
				},
			],
		};
	} else if (type === 'chill') {
		return {
			name: 'Evening Serenity',
			coverImage:
				'https://images.unsplash.com/photo-1614680376573-df3480f0c6ff',
			description: 'Calm, ambient tracks for relaxation',
			tracks: [
				{
					title: 'Gentle Waves',
					artist: 'Ambient Soundscapes',
					albumArt: '',
					duration: 318,
				},
				{
					title: 'Moonlit Path',
					artist: 'Acoustic Dreams',
					albumArt: '',
					duration: 275,
				},
				{
					title: 'Drifting',
					artist: 'Peaceful Piano',
					albumArt: '',
					duration: 222,
				},
			],
		};
	} else if (type === 'focus') {
		return {
			name: 'Deep Focus',
			coverImage:
				'https://images.unsplash.com/photo-1518609878373-06d740f60d8b',
			description: 'Instrumental tracks to help you concentrate',
			tracks: [
				{
					title: 'Clarity',
					artist: 'Mind Flow',
					albumArt: '',
					duration: 267,
				},
				{
					title: 'Thought Process',
					artist: 'Concentration',
					albumArt: '',
					duration: 315,
				},
				{
					title: 'Study Session',
					artist: 'Brain Waves',
					albumArt: '',
					duration: 294,
				},
			],
		};
	} else if (type === 'party') {
		return {
			name: 'Party Mix',
			coverImage:
				'https://images.unsplash.com/photo-1496337589254-7e19d01cec44',
			description: 'Upbeat tracks to get the party started',
			tracks: [
				{
					title: 'Dance Floor',
					artist: 'Night Groove',
					albumArt: '',
					duration: 190,
				},
				{
					title: 'Celebration',
					artist: 'Party People',
					albumArt: '',
					duration: 210,
				},
				{
					title: 'Weekend Vibes',
					artist: 'Good Times',
					albumArt: '',
					duration: 225,
				},
			],
		};
	} else {
		return {
			name: 'Custom Mix',
			coverImage:
				'https://images.unsplash.com/photo-1458560871784-56d23406c091',
			description: 'A custom playlist just for you',
			tracks: [
				{
					title: 'Discovery',
					artist: 'New Sounds',
					albumArt: '',
					duration: 240,
				},
				{
					title: 'Personal Favorite',
					artist: 'Your Taste',
					albumArt: '',
					duration: 255,
				},
				{
					title: 'Curated Selection',
					artist: 'AI Picks',
					albumArt: '',
					duration: 228,
				},
			],
		};
	}
}
