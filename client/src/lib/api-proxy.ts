// API proxy utility

// Helper to handle proxy requests to the server API
export const proxyFetch = async (
	endpoint: string,
	options: RequestInit = {}
): Promise<Response> => {
	// In development, proxy to the server
	const baseUrl = import.meta.env.DEV ? 'http://localhost:3001' : '';

	const url = `${baseUrl}${endpoint}`;

	try {
		return await fetch(url, {
			...options,
			headers: {
				'Content-Type': 'application/json',
				...options.headers,
			},
		});
	} catch (error) {
		console.error(`Error making request to ${url}:`, error);
		throw error;
	}
};

// API endpoints
export const API = {
	// AI endpoints
	ai: {
		generatePlaylist: (options: RequestInit = {}) =>
			proxyFetch('/api/ai/generate-playlist', options),
		estimateProcessing: (options: RequestInit = {}) =>
			proxyFetch('/api/ai/estimate-processing', options),
	},

	// Spotify endpoints
	spotify: {
		getProfile: (options: RequestInit = {}) =>
			proxyFetch('/api/spotify/me', options),
		getPlaylists: (options: RequestInit = {}) =>
			proxyFetch('/api/spotify/playlists', options),
		getPlaylist: (id: string, options: RequestInit = {}) =>
			proxyFetch(`/api/spotify/playlists/${id}`, options),
		getPlaylistTracks: (id: string, options: RequestInit = {}) =>
			proxyFetch(`/api/spotify/playlists/${id}/tracks`, options),
	},

	// Auth endpoints
	auth: {
		login: (options: RequestInit = {}) =>
			proxyFetch('/api/auth/login', options),
		logout: (options: RequestInit = {}) =>
			proxyFetch('/api/auth/logout', options),
		status: (options: RequestInit = {}) =>
			proxyFetch('/api/auth/status', options),
	},
};
