import express, { Request, Response } from 'express';
import spotifyApi from '../config/spotify';
import { isAuthenticated } from '../auth/spotify-auth';
import User from '../models/User';
import Playlist from '../models/Playlist';
import axios from 'axios';
import OpenAI from 'openai';

// Initialize OpenAI with API key from environment variable
// NOTE: We should set this in environment variables, not directly in code
const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY || '',
});

// Source selection interface for playlist generation
interface PlaylistSources {
	useLikedSongs: boolean;
	useTopTracks: boolean;
	useRecommendations: boolean;
	playlists: string[]; // Array of playlist IDs to include
}

// Processing mode options with corresponding configurations
type ProcessingMode = 'quick' | 'standard' | 'comprehensive' | 'complete';

interface ProcessingConfig {
	maxTracksPerPlaylist: number; // 0 means unlimited
	maxPlaylists: number; // Maximum playlists to process
	useAudioFeatures: boolean; // Whether to fetch audio features
	fetchAllPages: boolean; // Whether to paginate through all tracks
	requestDelay: number; // Milliseconds between API requests
	prioritizeByRelevance: boolean; // Whether to prioritize relevant playlists
	targetPoolSize: number; // Ideal number of tracks to analyze
}

// Processing configurations for each mode
const PROCESSING_CONFIGS: Record<ProcessingMode, ProcessingConfig> = {
	quick: {
		maxTracksPerPlaylist: 30,
		maxPlaylists: 5,
		useAudioFeatures: true,
		fetchAllPages: false,
		requestDelay: 50,
		prioritizeByRelevance: true,
		targetPoolSize: 200,
	},
	standard: {
		maxTracksPerPlaylist: 50,
		maxPlaylists: 10,
		useAudioFeatures: true,
		fetchAllPages: false,
		requestDelay: 100,
		prioritizeByRelevance: true,
		targetPoolSize: 500,
	},
	comprehensive: {
		maxTracksPerPlaylist: 100,
		maxPlaylists: 20,
		useAudioFeatures: true,
		fetchAllPages: true,
		requestDelay: 150,
		prioritizeByRelevance: true,
		targetPoolSize: 1000,
	},
	complete: {
		maxTracksPerPlaylist: 0, // No limit
		maxPlaylists: 50,
		useAudioFeatures: true,
		fetchAllPages: true,
		requestDelay: 200,
		prioritizeByRelevance: false,
		targetPoolSize: 5000,
	},
};

// Function to estimate processing time based on source selection and mode
function estimateProcessingTime(
	sources: PlaylistSources,
	processingMode: ProcessingMode,
	playlistSizes: Record<string, number> = {}
): { estimatedSeconds: number; warningLevel: 'low' | 'medium' | 'high' } {
	const config = PROCESSING_CONFIGS[processingMode];

	// Base time for prompt analysis and playlist creation
	let baseTime = 5; // seconds

	// Time for liked songs
	const likedSongsTime = sources.useLikedSongs ? 5 : 0;

	// Time for top tracks
	const topTracksTime = sources.useTopTracks ? 3 : 0;

	// Time for recommendations
	const recommendationsTime = sources.useRecommendations ? 5 : 0;

	// Estimate playlist processing time
	let playlistTime = 0;
	if (sources.playlists && sources.playlists.length > 0) {
		// Calculate total tracks to process
		let totalEstimatedTracks = 0;

		for (const playlistId of sources.playlists) {
			const playlistSize = playlistSizes[playlistId] || 50; // Default assumption
			const tracksToProcess =
				config.maxTracksPerPlaylist === 0
					? playlistSize
					: Math.min(playlistSize, config.maxTracksPerPlaylist);

			totalEstimatedTracks += tracksToProcess;
		}

		// Adjust for pagination if needed
		if (config.fetchAllPages) {
			playlistTime += (totalEstimatedTracks / 100) * 2; // 2 seconds per 100 tracks for pagination
		}

		// Time for processing tracks (API calls, audio features, etc.)
		playlistTime += totalEstimatedTracks * 0.05; // 0.05 seconds per track
	}

	// Audio features processing
	const audioFeaturesTime = config.useAudioFeatures
		? Math.min(config.targetPoolSize, 500) * 0.02 // 0.02 seconds per track for audio features
		: 0;

	// Total estimated time
	const estimatedSeconds =
		baseTime +
		likedSongsTime +
		topTracksTime +
		recommendationsTime +
		playlistTime +
		audioFeaturesTime;

	// Determine warning level
	let warningLevel: 'low' | 'medium' | 'high' = 'low';
	if (estimatedSeconds > 60) {
		warningLevel = 'medium';
	}
	if (estimatedSeconds > 180) {
		warningLevel = 'high';
	}

	return {
		estimatedSeconds: Math.ceil(estimatedSeconds),
		warningLevel,
	};
}

// Progress tracking interface
interface ProcessingProgress {
	stage: string;
	progress: number; // 0-100
	message: string;
	remainingTimeEstimate: number;
}

const router = express.Router();

// Cache for genre seeds to avoid frequent API calls
let genreSeedsCache: string[] = [];
let genreSeedsCacheTime = 0;

// Function to get available genre seeds from Spotify
async function getAvailableGenreSeeds(accessToken: string): Promise<string[]> {
	// Check cache first (valid for 24 hours)
	const cacheValidityPeriod = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
	if (
		genreSeedsCache.length > 0 &&
		Date.now() - genreSeedsCacheTime < cacheValidityPeriod
	) {
		console.log('Using cached genre seeds');
		return genreSeedsCache;
	}

	try {
		console.log('Fetching available genre seeds from Spotify API');
		const response = await fetch(
			'https://api.spotify.com/v1/recommendations/available-genre-seeds',
			{
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			}
		);

		if (!response.ok) {
			throw new Error(
				`Failed to get genre seeds: ${response.statusText}`
			);
		}

		const data = await response.json();
		genreSeedsCache = data.genres || [];
		genreSeedsCacheTime = Date.now();

		console.log(`Retrieved ${genreSeedsCache.length} genre seeds`);
		return genreSeedsCache;
	} catch (error: any) {
		console.error('Error fetching genre seeds:', error.message);
		return [];
	}
}

// Function to get track recommendations based on genre, tracks, artists and audio features
async function getRecommendations(
	accessToken: string,
	seedGenres: string[],
	audioFeatures: any,
	limit: number = 50,
	seedTracks: string[] = [],
	seedArtists: string[] = []
): Promise<any[]> {
	try {
		// Spotify API allows a maximum of 5 seed values total across genres, artists and tracks
		const maxSeeds = 5;
		let usedSeeds = 0;

		// Build seeds object to track what we're using
		const seeds: {
			genres: string[];
			tracks: string[];
			artists: string[];
		} = {
			genres: [],
			tracks: [],
			artists: [],
		};

		// Priority: First use up to 2 tracks if available
		if (seedTracks.length > 0) {
			const tracksToUse = seedTracks.slice(
				0,
				Math.min(2, maxSeeds - usedSeeds)
			);
			seeds.tracks = tracksToUse;
			usedSeeds += tracksToUse.length;
		}

		// Then use up to 1 artist if available
		if (seedArtists.length > 0 && usedSeeds < maxSeeds) {
			const artistsToUse = seedArtists.slice(
				0,
				Math.min(1, maxSeeds - usedSeeds)
			);
			seeds.artists = artistsToUse;
			usedSeeds += artistsToUse.length;
		}

		// Fill remaining slots with genres
		if (seedGenres.length > 0 && usedSeeds < maxSeeds) {
			const genresToUse = seedGenres.slice(0, maxSeeds - usedSeeds);
			seeds.genres = genresToUse;
			usedSeeds += genresToUse.length;
		}

		// If we still have space and no genres, add more artists
		if (
			seeds.genres.length === 0 &&
			seedArtists.length > seeds.artists.length &&
			usedSeeds < maxSeeds
		) {
			const additionalArtists = seedArtists.slice(
				seeds.artists.length,
				seeds.artists.length + (maxSeeds - usedSeeds)
			);
			seeds.artists = [...seeds.artists, ...additionalArtists];
			usedSeeds += additionalArtists.length;
		}

		// If still space, add more tracks
		if (usedSeeds < maxSeeds && seedTracks.length > seeds.tracks.length) {
			const additionalTracks = seedTracks.slice(
				seeds.tracks.length,
				seeds.tracks.length + (maxSeeds - usedSeeds)
			);
			seeds.tracks = [...seeds.tracks, ...additionalTracks];
		}

		// If we have no seeds at all, use a default genre
		if (
			seeds.genres.length === 0 &&
			seeds.tracks.length === 0 &&
			seeds.artists.length === 0
		) {
			seeds.genres = ['pop'];
			console.log('No seeds available, using default "pop" genre');
		}

		// Log what seeds we're using
		console.log('Using recommendation seeds:', JSON.stringify(seeds));

		// Format seed parameters
		const seedParams = new URLSearchParams();

		if (seeds.genres.length > 0) {
			seedParams.append('seed_genres', seeds.genres.join(','));
		}

		if (seeds.tracks.length > 0) {
			seedParams.append('seed_tracks', seeds.tracks.join(','));
		}

		if (seeds.artists.length > 0) {
			seedParams.append('seed_artists', seeds.artists.join(','));
		}

		// Always set the limit
		seedParams.append('limit', limit.toString());

		// Add audio feature parameters
		// Target values (ideal points)
		seedParams.append(
			'target_energy',
			(
				(audioFeatures.energy_range[0] +
					audioFeatures.energy_range[1]) /
				2
			).toString()
		);
		seedParams.append(
			'target_danceability',
			(
				(audioFeatures.danceability_range[0] +
					audioFeatures.danceability_range[1]) /
				2
			).toString()
		);
		seedParams.append(
			'target_acousticness',
			(
				(audioFeatures.acousticness_range[0] +
					audioFeatures.acousticness_range[1]) /
				2
			).toString()
		);
		seedParams.append(
			'target_instrumentalness',
			(
				(audioFeatures.instrumentalness_range[0] +
					audioFeatures.instrumentalness_range[1]) /
				2
			).toString()
		);
		seedParams.append(
			'target_valence',
			(
				(audioFeatures.valence_range[0] +
					audioFeatures.valence_range[1]) /
				2
			).toString()
		);

		// Min values
		seedParams.append(
			'min_energy',
			Math.max(0, audioFeatures.energy_range[0] * 0.8).toString()
		);
		seedParams.append(
			'min_danceability',
			Math.max(0, audioFeatures.danceability_range[0] * 0.8).toString()
		);
		seedParams.append(
			'min_acousticness',
			Math.max(0, audioFeatures.acousticness_range[0] * 0.8).toString()
		);
		seedParams.append(
			'min_instrumentalness',
			Math.max(
				0,
				audioFeatures.instrumentalness_range[0] * 0.8
			).toString()
		);
		seedParams.append(
			'min_valence',
			Math.max(0, audioFeatures.valence_range[0] * 0.8).toString()
		);

		// Max values
		seedParams.append(
			'max_energy',
			Math.min(1, audioFeatures.energy_range[1] * 1.2).toString()
		);
		seedParams.append(
			'max_danceability',
			Math.min(1, audioFeatures.danceability_range[1] * 1.2).toString()
		);
		seedParams.append(
			'max_acousticness',
			Math.min(1, audioFeatures.acousticness_range[1] * 1.2).toString()
		);
		seedParams.append(
			'max_instrumentalness',
			Math.min(
				1,
				audioFeatures.instrumentalness_range[1] * 1.2
			).toString()
		);
		seedParams.append(
			'max_valence',
			Math.min(1, audioFeatures.valence_range[1] * 1.2).toString()
		);

		// Add tempo parameters if they're in a reasonable range
		if (audioFeatures.tempo_range[0] > 0) {
			seedParams.append(
				'min_tempo',
				Math.max(0, audioFeatures.tempo_range[0] * 0.8).toString()
			);
		}
		if (audioFeatures.tempo_range[1] < 300) {
			seedParams.append(
				'max_tempo',
				Math.min(300, audioFeatures.tempo_range[1] * 1.2).toString()
			);
		}

		// Handle popularity based on the analysis or filter logic
		if (audioFeatures.popularity_level) {
			// Use the explicit popularity level if provided
			switch (audioFeatures.popularity_level.toLowerCase()) {
				case 'high':
					seedParams.append('min_popularity', '70');
					break;
				case 'medium':
					seedParams.append('min_popularity', '40');
					seedParams.append('max_popularity', '80');
					break;
				case 'low':
					seedParams.append('max_popularity', '40');
					break;
				// For 'any', don't set popularity constraints
			}
		} else {
			// Fall back to filter_logic analysis
			const filterLogic = audioFeatures.filter_logic.toLowerCase();
			if (
				filterLogic.includes('popular') ||
				filterLogic.includes('mainstream')
			) {
				seedParams.append('min_popularity', '70');
			} else if (
				filterLogic.includes('obscure') ||
				filterLogic.includes('underground')
			) {
				seedParams.append('max_popularity', '30');
			}
		}

		const url = `https://api.spotify.com/v1/recommendations?${seedParams.toString()}`;
		console.log(`Recommendation request URL: ${url}`);

		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});

		if (!response.ok) {
			throw new Error(
				`Failed to get recommendations: ${response.statusText}`
			);
		}

		const data = await response.json();
		console.log(`Retrieved ${data.tracks?.length || 0} recommended tracks`);

		return data.tracks || [];
	} catch (error: any) {
		console.error('Error getting recommendations:', error.message);
		return [];
	}
}

// Function to match AI genres to Spotify's available genre seeds
async function matchGenresToAvailableSeeds(
	aiGenres: string[],
	availableGenres: string[]
): Promise<string[]> {
	if (!aiGenres || aiGenres.length === 0) {
		return [];
	}

	// Convert everything to lowercase for matching
	const lowerCaseAvailableGenres = availableGenres.map((g) =>
		g.toLowerCase()
	);

	// Try exact matches first
	const exactMatches = aiGenres
		.map((g) => g.toLowerCase())
		.filter((g) => lowerCaseAvailableGenres.includes(g));

	if (exactMatches.length > 0) {
		return exactMatches.map(
			(m) => availableGenres[lowerCaseAvailableGenres.indexOf(m)]
		);
	}

	// Try partial matches
	const partialMatches = [];
	for (const aiGenre of aiGenres) {
		const lowercaseAiGenre = aiGenre.toLowerCase();

		// Find available genres that contain this genre as a substring
		const matches = availableGenres.filter(
			(g) =>
				g.toLowerCase().includes(lowercaseAiGenre) ||
				lowercaseAiGenre.includes(g.toLowerCase())
		);

		if (matches.length > 0) {
			partialMatches.push(...matches);
		}
	}

	return [...new Set(partialMatches)].slice(0, 5); // Deduplicate and limit to 5
}

// Middleware to setup the Spotify API client with the appropriate token
const setupSpotifyClient = async (
	req: Request,
	res: Response,
	next: Function
) => {
	try {
		// Handle Authorization header for PKCE flow
		const authHeader = req.headers.authorization;
		if (authHeader && authHeader.startsWith('Bearer ')) {
			const accessToken = authHeader.substring(7);
			// Store token directly in request for consistent use
			(req as any).accessToken = accessToken;

			// Validate token by making a direct API call
			try {
				const response = await fetch('https://api.spotify.com/v1/me', {
					headers: {
						Authorization: `Bearer ${accessToken}`,
					},
				});

				if (!response.ok) {
					return res.status(401).json({
						message: 'Invalid Spotify token',
						error: 'Token validation failed',
					});
				}

				const userData = await response.json();
				console.log(`Token validated for user: ${userData.id}`);
				(req as any).userId = userData.id;
			} catch (tokenError: any) {
				console.error('Token validation failed:', tokenError.message);
				return res.status(401).json({
					message: 'Invalid Spotify token',
					error: 'Token validation failed',
				});
			}
		} else if (req.isAuthenticated() && req.user) {
			// Use session token if available
			const user: any = req.user;
			(req as any).accessToken = user.accessToken;
		} else {
			return res
				.status(401)
				.json({ message: 'Authentication required for AI operations' });
		}
		next();
	} catch (error: any) {
		console.error('Error setting up authentication:', error.message);
		return res.status(500).json({
			message: 'Failed to setup authentication',
			error: error.message,
		});
	}
};

// Apply the middleware to all routes
router.use(setupSpotifyClient);

// Function to analyze user prompt using GPT-4
async function analyzePlaylistPrompt(prompt: string) {
	try {
		console.log(`Analyzing prompt with GPT-4: "${prompt}"`);

		const completion = await openai.chat.completions.create({
			model: 'gpt-4-turbo',
			messages: [
				{
					role: 'system',
					content: `You are a music curation expert who analyzes playlist requests and translates them into specific characteristics that can be used to filter songs.
					
					Output a JSON object with the following parameters:
					- genres: Array of relevant music genres (string[]). Be specific and accurate with genre names. Include both broad genres and specific sub-genres when appropriate.
					- moods: Array of moods (string[])
					- energy_range: Range of energy values [min, max] (0.0-1.0)
					- tempo_range: Range of BPM [min, max] (e.g., [60, 180])
					- danceability_range: Range of danceability values [min, max] (0.0-1.0)
					- acousticness_range: Range of acousticness values [min, max] (0.0-1.0)
					- instrumentalness_range: Range of instrumentalness values [min, max] (0.0-1.0)
					- valence_range: Range of valence (happiness) values [min, max] (0.0-1.0)
					- description: Brief description of the playlist style (KEEP UNDER 100 CHARACTERS)
					- filter_logic: Concise explanation of the most important parameters to prioritize
					- popularity_level: String indicating desired popularity level ("high", "medium", "low", or "any")
					
					For audio features:
					- Energy represents intensity and activity (0.0 to 1.0)
					- Danceability describes how suitable a track is for dancing (0.0 to 1.0)
					- Acousticness represents acoustic elements vs electronic/electric (0.0 to 1.0)
					- Instrumentalness predicts vocals (0.0) vs instrumental tracks (1.0)
					- Valence describes musical positiveness/happiness (0.0 to 1.0)
					
					Be specific but concise in your analysis. Your output will be used directly to filter songs. KEEP THE DESCRIPTION UNDER 100 CHARACTERS.`,
				},
				{
					role: 'user',
					content: `Analyze this playlist request for a complex, accurate representation of genres and audio features: "${prompt}"`,
				},
			],
			response_format: { type: 'json_object' },
		});

		// Fix for linter error - safely handle null message content
		const content = completion.choices[0].message.content || '{}';
		const analysis = JSON.parse(content);

		// Ensure the description is within limits
		if (analysis.description && analysis.description.length > 100) {
			analysis.description =
				analysis.description.substring(0, 97) + '...';
		}

		// Ensure all expected properties exist
		const defaultAnalysis = {
			genres: [],
			moods: ['general'],
			energy_range: [0.0, 1.0],
			tempo_range: [0, 300],
			danceability_range: [0.0, 1.0],
			acousticness_range: [0.0, 1.0],
			instrumentalness_range: [0.0, 1.0],
			valence_range: [0.0, 1.0],
			description: 'General playlist based on popular tracks',
			filter_logic: 'Sort by popularity as fallback',
			popularity_level: 'medium',
		};

		// Merge with defaults for any missing properties
		const mergedAnalysis = { ...defaultAnalysis, ...analysis };

		console.log(
			'GPT-4 analysis complete:',
			JSON.stringify(mergedAnalysis, null, 2)
		);
		return mergedAnalysis;
	} catch (error: any) {
		console.error('Error analyzing prompt with GPT-4:', error.message);
		// Return default values if GPT-4 analysis fails
		return {
			genres: [],
			moods: ['general'],
			energy_range: [0.0, 1.0],
			tempo_range: [0, 300],
			danceability_range: [0.0, 1.0],
			acousticness_range: [0.0, 1.0],
			instrumentalness_range: [0.0, 1.0],
			valence_range: [0.0, 1.0],
			description: 'General playlist based on popular tracks',
			filter_logic: 'Sort by popularity as fallback',
			popularity_level: 'medium',
		};
	}
}

// Function to apply AI-generated filters to tracks
function filterTracksByAIAnalysis(
	tracks: any[],
	analysis: any,
	maxTracks: number = 20
) {
	console.log(
		`Starting AI filtering on ${tracks.length} tracks with analysis:`,
		JSON.stringify(analysis, null, 2)
	);

	// Log how many tracks have audio features
	const tracksWithAudioFeatures = tracks.filter((track) => track.features);
	console.log(
		`${tracksWithAudioFeatures.length} out of ${tracks.length} tracks have audio features`
	);

	// If we don't have enough tracks with features, include some without features
	let candidateTracks = tracksWithAudioFeatures;
	if (candidateTracks.length < maxTracks * 2) {
		// We need more candidate tracks - include tracks without features
		console.log(
			`Not enough tracks with features, including tracks without features in selection pool`
		);
		// Sort tracks without features by popularity
		const tracksWithoutFeatures = tracks
			.filter((track) => !track.features)
			.sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
			.slice(0, maxTracks * 3); // Get top tracks by popularity

		candidateTracks = [
			...tracksWithAudioFeatures,
			...tracksWithoutFeatures,
		];
		console.log(
			`Selection pool now has ${candidateTracks.length} tracks (${tracksWithAudioFeatures.length} with features, ${tracksWithoutFeatures.length} without)`
		);
	}

	// Calculate weighted score for each track instead of binary filtering
	const scoredTracks = candidateTracks
		.map((track) => {
			// Base score starts at 0
			let score = 0;

			if (track.features) {
				const features = track.features;
				// Identify primary feature from filter_logic
				const filterLogic = analysis.filter_logic.toLowerCase();

				// Score based on how well each track matches the target ranges
				// Formula: 1 - (distance from ideal / possible range)

				// Energy score (0-10 points)
				const energyIdeal =
					(analysis.energy_range[0] + analysis.energy_range[1]) / 2;
				const energyDistance = Math.abs(features.energy - energyIdeal);
				const energyScore = 10 * (1 - energyDistance);

				// Tempo score (0-10 points, normalized for the large range)
				const tempoIdeal =
					(analysis.tempo_range[0] + analysis.tempo_range[1]) / 2;
				const tempoDistance =
					Math.abs(features.tempo - tempoIdeal) / 200; // Normalize by max possible distance
				const tempoScore = 10 * (1 - Math.min(1, tempoDistance));

				// Danceability score (0-10 points)
				const danceabilityIdeal =
					(analysis.danceability_range[0] +
						analysis.danceability_range[1]) /
					2;
				const danceabilityDistance = Math.abs(
					features.danceability - danceabilityIdeal
				);
				const danceabilityScore = 10 * (1 - danceabilityDistance);

				// Acousticness score (0-10 points)
				const acousticnessIdeal =
					(analysis.acousticness_range[0] +
						analysis.acousticness_range[1]) /
					2;
				const acousticnessDistance = Math.abs(
					features.acousticness - acousticnessIdeal
				);
				const acousticnessScore = 10 * (1 - acousticnessDistance);

				// Valence score (0-10 points)
				const valenceIdeal =
					(analysis.valence_range[0] + analysis.valence_range[1]) / 2;
				const valenceDistance = Math.abs(
					features.valence - valenceIdeal
				);
				const valenceScore = 10 * (1 - valenceDistance);

				// Instrumentalness score (0-10 points)
				const instrumentalnessIdeal =
					(analysis.instrumentalness_range[0] +
						analysis.instrumentalness_range[1]) /
					2;
				const instrumentalnessDistance = Math.abs(
					features.instrumentalness - instrumentalnessIdeal
				);
				const instrumentalnessScore =
					10 * (1 - instrumentalnessDistance);

				// Weight scores based on filter_logic
				if (filterLogic.includes('energy')) {
					score += energyScore * 3;
					score += tempoScore * 1.5;
					score +=
						danceabilityScore +
						valenceScore +
						acousticnessScore +
						instrumentalnessScore;
				} else if (
					filterLogic.includes('tempo') ||
					filterLogic.includes('bpm')
				) {
					score += tempoScore * 3;
					score += energyScore * 1.5;
					score +=
						danceabilityScore +
						valenceScore +
						acousticnessScore +
						instrumentalnessScore;
				} else if (filterLogic.includes('dance')) {
					score += danceabilityScore * 3;
					score += energyScore * 1.5;
					score +=
						tempoScore +
						valenceScore +
						acousticnessScore +
						instrumentalnessScore;
				} else if (filterLogic.includes('acoustic')) {
					score += acousticnessScore * 3;
					score += valenceScore * 1.5;
					score +=
						energyScore +
						tempoScore +
						danceabilityScore +
						instrumentalnessScore;
				} else if (filterLogic.includes('instrument')) {
					score += instrumentalnessScore * 3;
					score += acousticnessScore * 1.5;
					score +=
						energyScore +
						tempoScore +
						danceabilityScore +
						valenceScore;
				} else if (
					filterLogic.includes('valence') ||
					filterLogic.includes('happ')
				) {
					score += valenceScore * 3;
					score += energyScore * 1.5;
					score +=
						tempoScore +
						danceabilityScore +
						acousticnessScore +
						instrumentalnessScore;
				} else {
					// Balanced approach if no specific emphasis
					score +=
						energyScore +
						tempoScore +
						danceabilityScore +
						valenceScore +
						acousticnessScore +
						instrumentalnessScore;
				}

				// Store the score details
				track.scoreDetails = {
					energy: energyScore,
					tempo: tempoScore,
					danceability: danceabilityScore,
					acousticness: acousticnessScore,
					valence: valenceScore,
					instrumentalness: instrumentalnessScore,
					genre: 0,
					mood: 0,
				};
			}

			// Genre score (0-15 points) - significant bonus for genre matches
			let genreScore = 0;
			if (track.extractedGenres && analysis.genres.length > 0) {
				const trackGenres = new Set(
					track.extractedGenres.map((g: string) => g.toLowerCase())
				);
				const promptGenres = analysis.genres.map((g: string) =>
					g.toLowerCase()
				);

				// Check for exact matches (3 points each)
				promptGenres.forEach((genre: string) => {
					if (trackGenres.has(genre)) {
						genreScore += 3;
					}
				});

				// Check for partial matches (1.5 points each)
				if (genreScore === 0) {
					// Only check partial matches if no exact matches
					track.extractedGenres.forEach((trackGenre: string) => {
						const trackGenreLower = trackGenre.toLowerCase();
						promptGenres.forEach((promptGenre: string) => {
							if (
								trackGenreLower.includes(promptGenre) ||
								promptGenre.includes(trackGenreLower)
							) {
								genreScore += 1.5;
							}
						});
					});
				}

				// Cap genre score at 15
				genreScore = Math.min(15, genreScore);

				if (track.scoreDetails) {
					track.scoreDetails.genre = genreScore;
				}
			}

			// Add popularity for tracks without audio features or as a tiebreaker
			const popularityScore = (track.popularity || 0) / 10;
			score += popularityScore;

			// Add genre scores
			score += genreScore;

			// Always include at least some popular tracks
			if (!track.features && track.popularity > 70) {
				score += 20; // Boost popular tracks without features
			}

			return {
				...track,
				score,
			};
		})
		.sort((a, b) => b.score - a.score); // Sort by score, highest first

	console.log(`Scored ${scoredTracks.length} tracks based on available data`);

	// Select top tracks by score
	const selectedTracks = scoredTracks.slice(0, maxTracks);

	// Display first few and last few selected tracks for debugging
	if (selectedTracks.length > 0) {
		console.log('Selected tracks sample with selection reasons:');
		console.log(
			'First 3 tracks:',
			selectedTracks.slice(0, 3).map((t) => {
				const hasFeatures = t.features ? 'yes' : 'no';
				const selectionReason = t.features
					? `Audio features match (score: ${
							t.score?.toFixed(2) || 'N/A'
					  })`
					: `Popularity-based (${t.popularity || 0}/100)`;

				let details = '';
				if (t.scoreDetails) {
					details = Object.entries(t.scoreDetails)
						.filter(([_, value]) => Number(value) > 0)
						.map(
							([key, value]) =>
								`${key}: ${Number(value).toFixed(1)}`
						)
						.join(', ');
				}

				return `${t.name} by ${
					t.artists[0].name
				} - Selected by: ${selectionReason}${
					details ? ` - Details: ${details}` : ''
				}`;
			})
		);

		if (selectedTracks.length > 5) {
			console.log(
				'Last 3 tracks:',
				selectedTracks.slice(-3).map((t) => {
					const hasFeatures = t.features ? 'yes' : 'no';
					const selectionReason = t.features
						? `Audio features match (score: ${
								t.score?.toFixed(2) || 'N/A'
						  })`
						: `Popularity-based (${t.popularity || 0}/100)`;

					let details = '';
					if (t.scoreDetails) {
						details = Object.entries(t.scoreDetails)
							.filter(([_, value]) => Number(value) > 0)
							.map(
								([key, value]) =>
									`${key}: ${Number(value).toFixed(1)}`
							)
							.join(', ');
					}

					return `${t.name} by ${
						t.artists[0].name
					} - Selected by: ${selectionReason}${
						details ? ` - Details: ${details}` : ''
					}`;
				})
			);
		}
	}

	// Return the selected tracks
	return selectedTracks;
}

// Helper function to sample tracks from a playlist based on relevance to the prompt
function samplePlaylistTracks(
	tracks: any[],
	promptAnalysis: any,
	maxTracks: number = 50
): any[] {
	// If we have fewer tracks than the max, return all of them
	if (tracks.length <= maxTracks) {
		return tracks;
	}

	// Extract genres from track artists if available
	const tracksWithGenres = tracks.map((track) => {
		// Some tracks have genres in their artists object
		const genres =
			track.artists?.reduce((acc: string[], artist: any) => {
				if (artist.genres && Array.isArray(artist.genres)) {
					return [...acc, ...artist.genres];
				}
				return acc;
			}, []) || [];

		return {
			...track,
			extractedGenres: genres,
		};
	});

	// First, try to find tracks that match the requested genres
	const promptGenres = new Set(
		promptAnalysis.genres.map((g: string) => g.toLowerCase())
	);

	// Score tracks by genre match
	const scoredTracks = tracksWithGenres.map((track) => {
		let genreScore = 0;

		// Check for genre matches
		if (track.extractedGenres.length > 0) {
			track.extractedGenres.forEach((genre: string) => {
				const genreLower = genre.toLowerCase();
				if (promptGenres.has(genreLower)) {
					genreScore += 2; // Direct match
				} else {
					// Check for partial matches
					promptAnalysis.genres.forEach((promptGenre: string) => {
						if (
							genreLower.includes(promptGenre.toLowerCase()) ||
							promptGenre.toLowerCase().includes(genreLower)
						) {
							genreScore += 1; // Partial match
						}
					});
				}
			});
		}

		// Popularity can be a secondary factor
		const popularityScore = track.popularity ? track.popularity / 100 : 0;

		return {
			...track,
			selectionScore: genreScore + popularityScore * 0.5, // Weight popularity less than genre matches
		};
	});

	// Sort by score and take the top tracks
	const sortedTracks = [...scoredTracks].sort(
		(a, b) => b.selectionScore - a.selectionScore
	);

	// Take the top scored tracks plus some random ones for diversity
	const topTracks = sortedTracks.slice(0, Math.floor(maxTracks * 0.7)); // 70% top tracks

	// For the remaining 30%, sample randomly from the rest
	const remainingTracks = sortedTracks.slice(Math.floor(maxTracks * 0.7));
	const randomIndices = new Set();
	const randomCount = Math.min(
		maxTracks - topTracks.length,
		remainingTracks.length
	);

	while (randomIndices.size < randomCount) {
		randomIndices.add(Math.floor(Math.random() * remainingTracks.length));
	}

	const randomTracks = Array.from(randomIndices).map(
		(i) => remainingTracks[i as number]
	);

	return [...topTracks, ...randomTracks];
}

// Function to fetch all pages of a Spotify API endpoint with pagination
async function fetchAllPages(
	accessToken: string,
	initialUrl: string,
	delay: number = 100
): Promise<any[]> {
	let results: any[] = [];
	let nextUrl: string | null = initialUrl;

	while (nextUrl) {
		// Add delay between requests to avoid rate limiting
		if (results.length > 0) {
			await new Promise((resolve) => setTimeout(resolve, delay));
		}

		try {
			const response = await fetch(nextUrl, {
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			});

			if (!response.ok) {
				console.error(
					`API error: ${response.status} - ${response.statusText}`
				);
				break;
			}

			const data = await response.json();

			// Add items from this page
			if (data.items) {
				results = [...results, ...data.items];
			}

			// Get next page URL, if any
			nextUrl = data.next;
		} catch (error) {
			console.error('Error fetching paginated data:', error);
			break;
		}
	}

	return results;
}

// Function to fetch limited number of items from a Spotify API endpoint
async function fetchLimitedItems(
	accessToken: string,
	url: string,
	limit: number = 50
): Promise<any[]> {
	try {
		// Append limit parameter to URL
		const apiUrl = url.includes('?')
			? `${url}&limit=${limit}`
			: `${url}?limit=${limit}`;

		const response = await fetch(apiUrl, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});

		if (!response.ok) {
			throw new Error(
				`API error: ${response.status} - ${response.statusText}`
			);
		}

		const data = await response.json();
		return data.items || [];
	} catch (error) {
		console.error('Error fetching limited items:', error);
		return [];
	}
}

// Fetch user's liked songs
async function fetchLikedSongs(
	accessToken: string,
	config: ProcessingConfig
): Promise<any[]> {
	console.log("Fetching user's liked songs...");

	try {
		let tracks;

		if (config.fetchAllPages) {
			// Fetch all pages of liked songs
			const items = await fetchAllPages(
				accessToken,
				'https://api.spotify.com/v1/me/tracks?limit=50',
				config.requestDelay
			);
			tracks = items.map((item) => item.track);
		} else {
			// Fetch just one page with limited tracks
			const items = await fetchLimitedItems(
				accessToken,
				'https://api.spotify.com/v1/me/tracks',
				50
			);
			tracks = items.map((item) => item.track);
		}

		console.log(`Retrieved ${tracks.length} liked songs`);
		return tracks;
	} catch (error) {
		console.error('Error fetching liked songs:', error);
		return [];
	}
}

// Fetch user's top tracks
async function fetchTopTracks(
	accessToken: string,
	config: ProcessingConfig
): Promise<any[]> {
	console.log("Fetching user's top tracks...");

	try {
		// Get top tracks with multiple time ranges for better variety
		const timeRanges = ['short_term', 'medium_term', 'long_term'];
		let allTopTracks: any[] = [];

		for (const timeRange of timeRanges) {
			const tracks = await fetchLimitedItems(
				accessToken,
				`https://api.spotify.com/v1/me/top/tracks?time_range=${timeRange}`,
				50
			);

			allTopTracks = [...allTopTracks, ...tracks];
		}

		// Remove duplicates
		const uniqueTracks = Array.from(
			new Map(allTopTracks.map((track) => [track.id, track])).values()
		);

		console.log(`Retrieved ${uniqueTracks.length} unique top tracks`);
		return uniqueTracks;
	} catch (error) {
		console.error('Error fetching top tracks:', error);
		return [];
	}
}

// Fetch tracks from a specific playlist
async function fetchPlaylistTracks(
	accessToken: string,
	playlistId: string,
	config: ProcessingConfig
): Promise<any[]> {
	console.log(`Fetching tracks from playlist: ${playlistId}`);

	try {
		let tracks;

		if (config.fetchAllPages) {
			// Fetch all pages
			const items = await fetchAllPages(
				accessToken,
				`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`,
				config.requestDelay
			);
			tracks = items.map((item) => item.track).filter((track) => track); // Filter out null tracks
		} else {
			// Fetch limited tracks
			const limit =
				config.maxTracksPerPlaylist === 0
					? 100
					: config.maxTracksPerPlaylist;
			const items = await fetchLimitedItems(
				accessToken,
				`https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
				limit
			);
			tracks = items.map((item) => item.track).filter((track) => track);
		}

		// Limit the number of tracks if specified
		if (
			config.maxTracksPerPlaylist > 0 &&
			tracks.length > config.maxTracksPerPlaylist
		) {
			tracks = tracks.slice(0, config.maxTracksPerPlaylist);
		}

		console.log(
			`Retrieved ${tracks.length} tracks from playlist ${playlistId}`
		);
		return tracks;
	} catch (error) {
		console.error(
			`Error fetching tracks from playlist ${playlistId}:`,
			error
		);
		return [];
	}
}

// Fetch tracks from multiple playlists
async function fetchSelectedPlaylistTracks(
	accessToken: string,
	playlistIds: string[],
	config: ProcessingConfig,
	progressCallback?: (progress: number) => void
): Promise<any[]> {
	console.log(`Fetching tracks from ${playlistIds.length} playlists...`);

	const allTracks: any[] = [];
	const limitedPlaylistIds = playlistIds.slice(0, config.maxPlaylists);

	for (let i = 0; i < limitedPlaylistIds.length; i++) {
		const playlistId = limitedPlaylistIds[i];
		const tracks = await fetchPlaylistTracks(
			accessToken,
			playlistId,
			config
		);
		allTracks.push(...tracks);

		// Report progress if callback provided
		if (progressCallback) {
			const progress = Math.round(
				((i + 1) / limitedPlaylistIds.length) * 100
			);
			progressCallback(progress);
		}
	}

	// Remove duplicate tracks
	const uniqueTracks = Array.from(
		new Map(allTracks.map((track) => [track.id, track])).values()
	);

	console.log(
		`Retrieved ${uniqueTracks.length} unique tracks from ${limitedPlaylistIds.length} playlists`
	);
	return uniqueTracks;
}

// Master function to collect all tracks from specified sources
async function collectTracks(
	accessToken: string,
	sources: PlaylistSources,
	processingMode: ProcessingMode,
	progressCallback?: (progress: ProcessingProgress) => void
): Promise<any[]> {
	const config = PROCESSING_CONFIGS[processingMode];
	const allTracks: any[] = [];

	// Progress tracking
	let currentProgress: ProcessingProgress = {
		stage: 'collecting',
		progress: 0,
		message: 'Starting track collection...',
		remainingTimeEstimate: 60, // Initial estimate
	};

	// Function to update and report progress
	const updateProgress = (
		stage: string,
		progress: number,
		message: string
	) => {
		currentProgress = {
			stage,
			progress,
			message,
			remainingTimeEstimate: Math.max(
				5,
				currentProgress.remainingTimeEstimate - 5
			),
		};

		if (progressCallback) {
			progressCallback(currentProgress);
		}
	};

	// 1. Fetch liked songs if selected
	if (sources.useLikedSongs) {
		updateProgress('collecting', 10, 'Fetching your liked songs...');
		const likedSongs = await fetchLikedSongs(accessToken, config);
		allTracks.push(...likedSongs);
	}

	// 2. Fetch top tracks if selected
	if (sources.useTopTracks) {
		updateProgress('collecting', 30, 'Fetching your top tracks...');
		const topTracks = await fetchTopTracks(accessToken, config);
		allTracks.push(...topTracks);
	}

	// 3. Fetch playlist tracks if selected
	if (sources.playlists && sources.playlists.length > 0) {
		updateProgress(
			'collecting',
			40,
			'Fetching tracks from your playlists...'
		);

		const playlistTracksProgress = (progress: number) => {
			updateProgress(
				'collecting',
				40 + Math.floor(progress * 0.4), // 40-80% of total progress
				`Fetching playlist tracks: ${progress}% complete`
			);
		};

		const playlistTracks = await fetchSelectedPlaylistTracks(
			accessToken,
			sources.playlists,
			config,
			playlistTracksProgress
		);

		allTracks.push(...playlistTracks);
	}

	// 4. Remove duplicates
	updateProgress('processing', 85, 'Removing duplicate tracks...');
	const uniqueTracks = Array.from(
		new Map(allTracks.map((track) => [track.id, track])).values()
	);

	// 5. Limit to target pool size if necessary
	let resultTracks = uniqueTracks;
	if (
		config.targetPoolSize > 0 &&
		uniqueTracks.length > config.targetPoolSize
	) {
		updateProgress('processing', 90, 'Sampling tracks to optimal size...');
		// When implementing sampling, this is where we'd add the code
		resultTracks = uniqueTracks.slice(0, config.targetPoolSize);
	}

	updateProgress('complete', 100, 'Track collection complete');
	console.log(
		`Collection complete. ${resultTracks.length} unique tracks collected.`
	);

	return resultTracks;
}

// First, let's add a new object to store progress for each playlist

// Progress tracking storage
const playlistProgressMap = new Map<
	string,
	{
		stage: string;
		progress: number;
		message: string;
		remainingTimeEstimate: number;
		processingMode: string;
		startTime: number;
	}
>();

// Let's add the progress endpoint
router.get(
	'/api/ai/generate-playlist/progress',
	isAuthenticated,
	async (req, res) => {
		try {
			const { playlistId } = req.query;

			if (!playlistId) {
				return res
					.status(400)
					.json({ error: 'Missing playlistId parameter' });
			}

			// Get progress for the requested playlist
			const progress = playlistProgressMap.get(playlistId as string);

			if (!progress) {
				// If no progress found, return a default "initializing" state
				return res.json({
					progress: {
						stage: 'initializing',
						progress: 5,
						message: 'Initializing playlist generation...',
						remainingTimeEstimate: 60,
					},
				});
			}

			// Update the remaining time estimate based on elapsed time
			const elapsedSeconds = (Date.now() - progress.startTime) / 1000;
			const totalEstimate = getEstimatedTimeForMode(
				progress.processingMode
			);
			let remainingEstimate = Math.max(0, totalEstimate - elapsedSeconds);

			// Don't let the estimate drop too quickly at the beginning
			if (progress.progress < 20) {
				remainingEstimate = Math.max(
					remainingEstimate,
					totalEstimate * 0.8
				);
			}

			// Return the current progress
			return res.json({
				progress: {
					...progress,
					remainingTimeEstimate: remainingEstimate,
				},
			});
		} catch (error) {
			console.error(
				'Error fetching playlist generation progress:',
				error
			);
			return res.status(500).json({ error: 'Failed to get progress' });
		}
	}
);

// Helper function to estimate time based on processing mode
function getEstimatedTimeForMode(mode: string): number {
	switch (mode) {
		case 'quick':
			return 30;
		case 'standard':
			return 60;
		case 'comprehensive':
			return 120;
		case 'complete':
			return 300;
		default:
			return 60;
	}
}

// Helper function to update progress during generation
function updatePlaylistProgress(
	playlistId: string,
	stage: string,
	progress: number,
	message: string,
	processingMode: string = 'standard'
) {
	// Get the existing progress or create a new one
	const existing = playlistProgressMap.get(playlistId) || {
		stage: 'initializing',
		progress: 0,
		message: 'Starting playlist generation...',
		remainingTimeEstimate: getEstimatedTimeForMode(processingMode),
		processingMode,
		startTime: Date.now(),
	};

	// Update the progress
	playlistProgressMap.set(playlistId, {
		...existing,
		stage,
		progress,
		message,
		processingMode,
	});

	console.log(
		`Updated progress for playlist ${playlistId}: ${stage} - ${progress}%`
	);
}

// First find and update the generate-playlist route to initialize tracking
router.post('/generate-playlist', async (req: Request, res: Response) => {
	try {
		const {
			prompt,
			name,
			description,
			sources = {
				useLikedSongs: true,
				useTopTracks: true,
				useRecommendations: true,
				playlists: [],
			},
			processingMode = 'standard' as ProcessingMode,
			targetTrackCount = 20,
		} = req.body;

		const accessToken = (req as any).accessToken;
		const userId = (req as any).userId;

		if (!prompt) {
			return res.status(400).json({ message: 'Prompt is required' });
		}

		if (!accessToken || !userId) {
			return res.status(401).json({ message: 'Authentication required' });
		}

		console.log(
			`Generating playlist for prompt: "${prompt}" with ${processingMode} mode`
		);
		console.log(`Using token: ${accessToken.substring(0, 10)}...`);

		// Get playlist data from user's account to calculate processing time
		let playlistSizes: Record<string, number> = {};

		if (sources.playlists && sources.playlists.length > 0) {
			try {
				const playlistsResponse = await fetch(
					'https://api.spotify.com/v1/me/playlists?limit=50',
					{
						headers: { Authorization: `Bearer ${accessToken}` },
					}
				);

				if (playlistsResponse.ok) {
					const playlistsData = await playlistsResponse.json();
					const playlists = playlistsData.items || [];

					// Create map of playlist ID to track count
					playlists.forEach((playlist: any) => {
						if (
							playlist.id &&
							playlist.tracks &&
							playlist.tracks.total
						) {
							playlistSizes[playlist.id] = playlist.tracks.total;
						}
					});
				}
			} catch (error) {
				console.error('Error fetching playlist metadata:', error);
			}
		}

		// Estimate processing time
		const { estimatedSeconds, warningLevel } = estimateProcessingTime(
			sources,
			processingMode,
			playlistSizes
		);

		console.log(
			`Estimated processing time: ${estimatedSeconds} seconds (${warningLevel} impact)`
		);

		// 1. Analyze prompt
		updatePlaylistProgress(
			'preparing', // Temporary ID until we create the playlist
			'analyzing',
			5,
			'Analyzing prompt with AI...',
			processingMode
		);

		const promptAnalysis = await analyzePlaylistPrompt(prompt);
		console.log(
			'Prompt analysis completed with genres:',
			promptAnalysis.genres
		);

		// 2. Get available genre seeds and match them
		updatePlaylistProgress(
			'preparing',
			'analyzing',
			10,
			'Matching genres...',
			processingMode
		);

		const availableGenres = await getAvailableGenreSeeds(accessToken);
		const matchedGenres = await matchGenresToAvailableSeeds(
			promptAnalysis.genres,
			availableGenres
		);
		console.log('Matched genres for recommendations:', matchedGenres);

		// 3. Create the playlist shell
		updatePlaylistProgress(
			'preparing',
			'creating',
			15,
			'Creating playlist...',
			processingMode
		);

		let playlistTitle = name || 'AI Playlist';

		// Create an extremely short description - Spotify limit is 300 chars
		let playlistDesc = '';
		if (description) {
			// If user provided their own description, use it (truncated)
			playlistDesc = description.substring(0, 250);
		} else if (promptAnalysis && promptAnalysis.description) {
			// Use only the AI-generated description, no prompt text
			playlistDesc = promptAnalysis.description.substring(0, 250);
		} else {
			// Fallback to a generic description
			playlistDesc = 'AI-generated playlist based on your prompt.';
		}

		// Final safety check
		if (playlistDesc.length > 250) {
			playlistDesc = playlistDesc.substring(0, 250);
		}

		console.log(
			`Creating playlist: "${playlistTitle}" with description: "${playlistDesc}"`
		);

		// Create playlist with strictly limited description
		const createResponse = await fetch(
			`https://api.spotify.com/v1/users/${userId}/playlists`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${accessToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					name: playlistTitle,
					description: playlistDesc.substring(0, 250), // Extra safety
					public: false,
				}),
			}
		);

		if (!createResponse.ok) {
			const errorData = await createResponse.json();
			console.error('Failed to create playlist:', errorData);
			return res.status(createResponse.status).json({
				message: 'Failed to create playlist',
				error: errorData,
			});
		}

		const playlist = await createResponse.json();
		console.log(`Playlist created successfully, ID: ${playlist.id}`);

		// Now that we have a playlist ID, use it for progress tracking
		// Move the progress from temporary ID to the actual playlist ID
		const tempProgress = playlistProgressMap.get('preparing');
		if (tempProgress) {
			playlistProgressMap.set(playlist.id, tempProgress);
			playlistProgressMap.delete('preparing');
		}

		// 4. Collect tracks from selected sources
		updatePlaylistProgress(
			playlist.id,
			'collecting',
			20,
			'Collecting tracks from selected sources...',
			processingMode
		);

		// Use our new flexible track collection system with progress tracking
		const collectedTracks = await collectTracks(
			accessToken,
			sources,
			processingMode,
			(progress) => {
				// Update our progress tracking with the information
				updatePlaylistProgress(
					playlist.id,
					progress.stage,
					progress.progress,
					progress.message,
					processingMode
				);
			}
		);

		// 5. Process audio features for collected tracks
		updatePlaylistProgress(
			playlist.id,
			'processing',
			75,
			'Analyzing audio features...',
			processingMode
		);

		// Get audio features for tracks
		let tracksWithFeatures: any[] = [];
		try {
			if (collectedTracks.length === 0) {
				console.warn(
					'No tracks collected to analyze for audio features'
				);
			} else {
				console.log(
					`Attempting to get audio features for ${collectedTracks.length} tracks`
				);

				// Get audio features in batches to avoid URL length limits
				const batchSize = 50;
				for (let i = 0; i < collectedTracks.length; i += batchSize) {
					const trackBatch = collectedTracks.slice(i, i + batchSize);
					const trackIds = trackBatch
						.map((track) => track.id)
						.join(',');

					if (!trackIds || trackIds.length === 0) {
						console.warn('Empty track IDs batch, skipping');
						continue;
					}

					console.log(
						`Requesting audio features for batch ${
							i / batchSize + 1
						}/${Math.ceil(collectedTracks.length / batchSize)} (${
							trackBatch.length
						} tracks)`
					);

					const featuresResponse = await fetch(
						`https://api.spotify.com/v1/audio-features?ids=${trackIds}`,
						{
							headers: {
								Authorization: `Bearer ${accessToken}`,
							},
						}
					);

					if (featuresResponse.ok) {
						const featuresData = await featuresResponse.json();

						if (
							!featuresData.audio_features ||
							!Array.isArray(featuresData.audio_features)
						) {
							console.error(
								'Invalid audio features response format:',
								featuresData
							);
							continue;
						}

						const features = featuresData.audio_features;
						console.log(
							`Received ${
								features.filter((f: any) => f !== null).length
							} valid audio features out of ${
								features.length
							} requested`
						);

						// Combine tracks with their features
						const batchWithFeatures = trackBatch.map((track) => {
							const trackFeatures = features.find(
								(f: any) => f && f.id === track.id
							);
							return {
								...track,
								features: trackFeatures || null,
							};
						});

						tracksWithFeatures = [
							...tracksWithFeatures,
							...batchWithFeatures,
						];
					} else {
						// Log detailed error information
						console.error(
							`Failed to get audio features. Status: ${featuresResponse.status} ${featuresResponse.statusText}`
						);
						try {
							const errorData = await featuresResponse.json();
							console.error(
								'Error details:',
								JSON.stringify(errorData)
							);
						} catch (e) {
							console.error('Could not parse error response');
						}

						// Try an alternative approach - get features one by one
						console.log(
							'Trying alternative approach to get audio features one by one...'
						);
						const batchWithFeatures = [];

						for (const track of trackBatch) {
							try {
								// Small delay to avoid rate limiting
								await new Promise((resolve) =>
									setTimeout(resolve, 100)
								);

								// Try to get feature for a single track using the track endpoint
								const singleTrackResponse = await fetch(
									`https://api.spotify.com/v1/audio-features/${track.id}`,
									{
										headers: {
											Authorization: `Bearer ${accessToken}`,
										},
									}
								);

								if (singleTrackResponse.ok) {
									const trackFeature =
										await singleTrackResponse.json();
									batchWithFeatures.push({
										...track,
										features: trackFeature,
									});
									console.log(
										`Successfully got features for track: ${track.name}`
									);
								} else {
									// Still include the track without features
									batchWithFeatures.push({
										...track,
										features: null,
									});
									console.log(
										`Failed to get features for track: ${track.name}`
									);
								}
							} catch (singleTrackError) {
								console.error(
									`Error getting features for track ${track.id}:`,
									singleTrackError
								);
								batchWithFeatures.push({
									...track,
									features: null,
								});
							}
						}

						tracksWithFeatures = [
							...tracksWithFeatures,
							...batchWithFeatures,
						];
					}

					// Add a small delay between API calls to avoid rate limiting
					await new Promise((resolve) => setTimeout(resolve, 200)); // Use fixed delay instead of config
				}
			}

			console.log(
				`Retrieved audio features for ${
					tracksWithFeatures.filter((t) => t.features).length
				} tracks out of ${tracksWithFeatures.length} total tracks`
			);
		} catch (featuresError) {
			console.error(
				'Failed to get audio features, using tracks without features:',
				featuresError instanceof Error
					? featuresError.message
					: String(featuresError)
			);
			// Still use the tracks we collected even without features
			tracksWithFeatures = collectedTracks.map((track) => ({
				...track,
				features: null,
			}));
		}

		// 6. Use our filtering/scoring system even if some tracks are missing features
		updatePlaylistProgress(
			playlist.id,
			'selecting',
			85,
			'Selecting the best tracks for your playlist...',
			processingMode
		);

		// Modify the selection process to handle missing features
		let selectedTracks;

		if (tracksWithFeatures.some((track) => track.features)) {
			console.log(
				`Filtering ${
					tracksWithFeatures.filter((t) => t.features).length
				} tracks with audio features`
			);
			selectedTracks = filterTracksByAIAnalysis(
				tracksWithFeatures,
				promptAnalysis,
				targetTrackCount
			);
		} else {
			// If no tracks have features, select based on popularity or random selection
			console.log(
				'No tracks have audio features, selecting based on popularity'
			);
			selectedTracks = collectedTracks
				.sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
				.slice(0, targetTrackCount);
		}

		console.log(
			`Selected ${selectedTracks.length} tracks for the playlist`
		);

		// 7. Add tracks to the playlist
		updatePlaylistProgress(
			playlist.id,
			'finalizing',
			90,
			'Adding tracks to your playlist...',
			processingMode
		);

		if (selectedTracks.length > 0) {
			console.log(
				`Adding ${selectedTracks.length} tracks to playlist...`
			);
			const trackUris = selectedTracks.map((t) => t.uri);

			const addTracksResponse = await fetch(
				`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`,
				{
					method: 'POST',
					headers: {
						Authorization: `Bearer ${accessToken}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ uris: trackUris }),
				}
			);

			if (!addTracksResponse.ok) {
				console.error(
					'Failed to add tracks to playlist:',
					await addTracksResponse.json()
				);
			} else {
				console.log('Tracks added to playlist successfully');
			}
		} else {
			console.log('No tracks selected, creating empty playlist');
		}

		// 8. Save to our database
		updatePlaylistProgress(
			playlist.id,
			'finalizing',
			95,
			'Finalizing playlist...',
			processingMode
		);

		try {
			const user: any = req.user;
			const savedPlaylist = await Playlist.create({
				name: playlistTitle,
				userId: user?._id,
				spotifyId: playlist.id,
				coverImage: playlist.images?.[0]?.url || '',
				description: playlistDesc,
				isAIGenerated: true,
				tracksCount: selectedTracks.length,
				duration: selectedTracks.reduce(
					(total, track) => total + (track.duration_ms || 0) / 1000,
					0
				),
				prompt: prompt,
				aiAnalysis: promptAnalysis,
				genresUsed: matchedGenres,
				processingMode: processingMode,
				sourceStats: {
					likedSongs: sources.useLikedSongs,
					topTracks: sources.useTopTracks,
					useRecommendations: sources.useRecommendations,
					playlistCount: sources.playlists?.length || 0,
				},
			});
			console.log('Playlist saved to database');
		} catch (dbError) {
			console.error(
				'Failed to save playlist to database, continuing anyway'
			);
		}

		// 9. Mark as complete and return the playlist data
		updatePlaylistProgress(
			playlist.id,
			'complete',
			100,
			'Playlist created successfully!',
			processingMode
		);

		// Log detailed track selection information
		console.log('\nPlaylist selection summary:');
		console.log(`Processing mode: ${processingMode}`);
		console.log(`Total tracks collected: ${collectedTracks.length}`);
		console.log(
			`Tracks with audio features: ${
				tracksWithFeatures.filter((t) => t.features).length
			}/${tracksWithFeatures.length}`
		);
		console.log(
			`Selection method: ${
				tracksWithFeatures.some((t) => t.features)
					? 'audio_features'
					: 'popularity'
			}`
		);
		console.log(`Target track count: ${targetTrackCount}`);
		console.log(`Actual selected tracks: ${selectedTracks.length}`);
		console.log(
			`Average popularity of selected tracks: ${(
				selectedTracks.reduce(
					(sum, t) => sum + (t.popularity || 0),
					0
				) / selectedTracks.length
			).toFixed(1)}`
		);

		// All selected tracks with their selection reasons
		console.log('\nSelected tracks:');
		selectedTracks.forEach((track, index) => {
			console.log(
				`${index + 1}. "${track.name}" by ${
					track.artists?.[0]?.name || 'Unknown'
				} - Popularity: ${track.popularity || 0} | Has features: ${
					track.features ? 'yes' : 'no'
				}`
			);
		});
		console.log('\n');

		return res.status(201).json({
			message: 'AI playlist created successfully',
			playlist: {
				id: playlist.id,
				name: playlistTitle,
				description: playlistDesc,
				tracks: selectedTracks.map((track) => ({
					id: track.id,
					name: track.name,
					artist: track.artists.map((a: any) => a.name).join(', '),
					uri: track.uri,
					score: track.score || null,
					scoreDetails: track.scoreDetails || null,
					popularity: track.popularity || 0,
					selectionReason: track.features
						? `Selected based on audio features matching your request (score: ${
								track.score ? track.score.toFixed(2) : 'N/A'
						  })`
						: `Selected based on popularity (${
								track.popularity || 0
						  }/100)`,
				})),
				url:
					playlist.external_urls?.spotify ||
					`https://open.spotify.com/playlist/${playlist.id}`,
				aiAnalysis: promptAnalysis,
				genresUsed: matchedGenres,
			},
			processingStats: {
				mode: processingMode,
				totalTimeSeconds: Math.ceil(
					(Date.now() - new Date().getTime()) / 1000
				),
				tracksAnalyzed: tracksWithFeatures.length,
				tracksSelected: selectedTracks.length,
				estimatedSeconds: estimatedSeconds,
				tracksWithFeatures: tracksWithFeatures.filter((t) => t.features)
					.length,
				audioFeaturesStatus: tracksWithFeatures.some((t) => t.features)
					? 'available'
					: 'unavailable',
				selectionMethod: tracksWithFeatures.some((t) => t.features)
					? 'audio_features'
					: 'popularity',
			},
			refinementData: {
				promptAnalysis,
				playlistId: playlist.id,
			},
		});
	} catch (error: any) {
		console.error('Error generating AI playlist:', error.message);
		return res.status(500).json({
			message: 'Failed to generate AI playlist',
			error: error.message,
		});
	}
});

// Test endpoint to estimate processing time without creating a playlist
router.post('/estimate-processing', async (req: Request, res: Response) => {
	try {
		const {
			sources = {
				useLikedSongs: true,
				useTopTracks: true,
				useRecommendations: true,
				playlists: [],
			},
			processingMode = 'standard' as ProcessingMode,
		} = req.body;

		const accessToken = (req as any).accessToken;

		if (!accessToken) {
			return res.status(401).json({ message: 'Authentication required' });
		}

		// Get playlist data from user's account to calculate processing time
		let playlistSizes: Record<string, number> = {};

		if (sources.playlists && sources.playlists.length > 0) {
			try {
				const playlistsResponse = await fetch(
					'https://api.spotify.com/v1/me/playlists?limit=50',
					{
						headers: { Authorization: `Bearer ${accessToken}` },
					}
				);

				if (playlistsResponse.ok) {
					const playlistsData = await playlistsResponse.json();
					const playlists = playlistsData.items || [];

					// Create map of playlist ID to track count
					playlists.forEach((playlist: any) => {
						if (
							playlist.id &&
							playlist.tracks &&
							playlist.tracks.total
						) {
							playlistSizes[playlist.id] = playlist.tracks.total;
						}
					});

					// Return playlist information too for UI selection
					const playlistInfo = playlists.map((playlist: any) => ({
						id: playlist.id,
						name: playlist.name,
						description: playlist.description,
						trackCount: playlist.tracks?.total || 0,
						imageUrl: playlist.images?.[0]?.url || '',
						isCollaborative: playlist.collaborative,
						isPublic: playlist.public,
					}));

					// Estimate processing time
					const { estimatedSeconds, warningLevel } =
						estimateProcessingTime(
							sources,
							processingMode,
							playlistSizes
						);

					// Get all available mode configurations
					const modeConfigs = Object.entries(PROCESSING_CONFIGS).map(
						([mode, config]) => {
							const { estimatedSeconds, warningLevel } =
								estimateProcessingTime(
									sources,
									mode as ProcessingMode,
									playlistSizes
								);

							return {
								mode,
								config,
								estimatedSeconds,
								warningLevel,
							};
						}
					);

					return res.json({
						playlists: playlistInfo,
						playlistSizes,
						selectedMode: {
							mode: processingMode,
							config: PROCESSING_CONFIGS[processingMode],
							estimatedSeconds,
							warningLevel,
							estimatedTime: formatTime(estimatedSeconds),
						},
						availableModes: modeConfigs.map((m) => ({
							...m,
							estimatedTime: formatTime(m.estimatedSeconds),
						})),
					});
				}
			} catch (error) {
				console.error('Error fetching playlist metadata:', error);
				return res.status(500).json({
					error: 'Error fetching playlist information',
					message:
						error instanceof Error ? error.message : String(error),
				});
			}
		}

		// If we reach here, we don't have playlists or couldn't fetch them
		const { estimatedSeconds, warningLevel } = estimateProcessingTime(
			sources,
			processingMode
		);

		return res.json({
			playlists: [],
			playlistSizes: {},
			selectedMode: {
				mode: processingMode,
				config: PROCESSING_CONFIGS[processingMode],
				estimatedSeconds,
				warningLevel,
				estimatedTime: formatTime(estimatedSeconds),
			},
			availableModes: Object.entries(PROCESSING_CONFIGS).map(
				([mode, config]) => {
					const { estimatedSeconds, warningLevel } =
						estimateProcessingTime(sources, mode as ProcessingMode);

					return {
						mode,
						config,
						estimatedSeconds,
						warningLevel,
						estimatedTime: formatTime(estimatedSeconds),
					};
				}
			),
		});
	} catch (error: any) {
		console.error('Error estimating processing time:', error.message);
		return res.status(500).json({
			message: 'Failed to estimate processing time',
			error: error.message,
		});
	}
});

// Helper function to format seconds into readable time
function formatTime(seconds: number): string {
	if (seconds < 60) {
		return `${seconds} seconds`;
	} else if (seconds < 3600) {
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;
		return `${minutes} minute${
			minutes !== 1 ? 's' : ''
		} ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
	} else {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${
			minutes !== 1 ? 's' : ''
		}`;
	}
}

export default router;
