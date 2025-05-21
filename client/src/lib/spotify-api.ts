// Client-side functions for interacting with Spotify's Web API
import { getValidAccessToken } from './fixed-auth';

// Base URL for Spotify API
const API_BASE_URL = 'https://api.spotify.com/v1';

/**
 * Fetch the current user's Spotify profile
 */
export async function getCurrentUserProfile() {
	const token = await getValidAccessToken();
	if (!token) {
		throw new Error('No valid access token available');
	}

	const response = await fetch(`${API_BASE_URL}/me`, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch user profile: ${response.status}`);
	}

	return await response.json();
}

/**
 * Fetch the current user's playlists
 */
export async function getCurrentUserPlaylists(limit = 50, offset = 0) {
	const token = await getValidAccessToken();
	if (!token) {
		throw new Error('No valid access token available');
	}

	// Use the /me/playlists endpoint as specified in the Spotify API docs
	const response = await fetch(
		`${API_BASE_URL}/me/playlists?limit=${limit}&offset=${offset}`,
		{
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
		}
	);

	if (!response.ok) {
		console.error('Playlist fetch error:', await response.text());
		throw new Error(`Failed to fetch playlists: ${response.status}`);
	}

	// Log the response for debugging
	const data = await response.json();
	console.log('Spotify playlists fetched successfully:', data.total);
	return data;
}

/**
 * Get playlist details
 */
export async function getPlaylist(playlistId: string) {
	const token = await getValidAccessToken();
	if (!token) {
		throw new Error('No valid access token available');
	}

	const response = await fetch(`${API_BASE_URL}/playlists/${playlistId}`, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch playlist: ${response.status}`);
	}

	return await response.json();
}

/**
 * Get tracks from a playlist
 */
export async function getPlaylistTracks(
	playlistId: string,
	limit = 100,
	offset = 0
) {
	const token = await getValidAccessToken();
	if (!token) {
		throw new Error('No valid access token available');
	}

	const response = await fetch(
		`${API_BASE_URL}/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`,
		{
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
		}
	);

	if (!response.ok) {
		throw new Error(`Failed to fetch playlist tracks: ${response.status}`);
	}

	return await response.json();
}

/**
 * Create a new playlist
 */
export async function createPlaylist(
	userId: string,
	name: string,
	description = '',
	isPublic = false
) {
	const token = await getValidAccessToken();
	if (!token) {
		throw new Error('No valid access token available');
	}

	const response = await fetch(`${API_BASE_URL}/users/${userId}/playlists`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			name,
			description,
			public: isPublic,
		}),
	});

	if (!response.ok) {
		throw new Error(`Failed to create playlist: ${response.status}`);
	}

	return await response.json();
}

/**
 * Add tracks to a playlist
 */
export async function addTracksToPlaylist(
	playlistId: string,
	trackUris: string[]
) {
	const token = await getValidAccessToken();
	if (!token) {
		throw new Error('No valid access token available');
	}

	const response = await fetch(
		`${API_BASE_URL}/playlists/${playlistId}/tracks`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				uris: trackUris,
			}),
		}
	);

	if (!response.ok) {
		throw new Error(`Failed to add tracks to playlist: ${response.status}`);
	}

	return await response.json();
}

/**
 * Search Spotify for tracks, artists, albums, etc.
 */
export async function search(
	query: string,
	types: string[] = ['track'],
	limit = 20
) {
	const token = await getValidAccessToken();
	if (!token) {
		throw new Error('No valid access token available');
	}

	const typeString = types.join(',');
	const encodedQuery = encodeURIComponent(query);

	const response = await fetch(
		`${API_BASE_URL}/search?q=${encodedQuery}&type=${typeString}&limit=${limit}`,
		{
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
		}
	);

	if (!response.ok) {
		throw new Error(`Failed to search: ${response.status}`);
	}

	return await response.json();
}
