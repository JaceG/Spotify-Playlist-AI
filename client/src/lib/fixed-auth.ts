// Spotify authentication helper functions
import { clientId } from './spotify-config';

/**
 * Redirect to Spotify's OAuth authorization page
 */
export async function redirectToSpotifyAuth() {
	// Generate and store PKCE code verifier
	const verifier = generateCodeVerifier(128);
	const challenge = await generateCodeChallenge(verifier);

	// Store verifier in localStorage for later token exchange
	localStorage.setItem('spotify_verifier', verifier);

	// Use the callback URL that matches what you registered in Spotify Developer Dashboard
	const redirectUri = 'http://127.0.0.1:3000/auth/spotify/callback';
	console.log('Redirecting to Spotify with URI:', redirectUri);
	console.log('Using redirect URI for authorization:', redirectUri);

	// Build authorization parameters
	const params = new URLSearchParams();
	params.append('client_id', clientId);
	params.append('response_type', 'code');
	params.append('redirect_uri', redirectUri);
	params.append(
		'scope',
		'user-read-private user-read-email playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private user-library-read user-library-modify user-top-read user-follow-read'
	);
	params.append('code_challenge_method', 'S256');
	params.append('code_challenge', challenge);

	// Redirect to Spotify authorization page
	window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for access token using PKCE
 */
export async function getAccessToken(code: string): Promise<string> {
	// Get stored code verifier
	const verifier = localStorage.getItem('spotify_verifier');
	if (!verifier) {
		throw new Error('No code verifier found in localStorage');
	}

	// Use the same redirect URI as in the authorization step
	const redirectUri = 'http://127.0.0.1:3000/auth/spotify/callback';
	console.log('Exchanging code with redirect URI:', redirectUri);

	// Build token request parameters
	const params = new URLSearchParams();
	params.append('client_id', clientId);
	params.append('grant_type', 'authorization_code');
	params.append('code', code);
	params.append('redirect_uri', redirectUri);
	params.append('code_verifier', verifier);

	// Exchange code for token
	const response = await fetch('https://accounts.spotify.com/api/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: params,
	});

	if (!response.ok) {
		let errorText = '';
		try {
			const errorData = await response.json();
			errorText =
				errorData.error_description ||
				errorData.error ||
				response.statusText;
		} catch (e) {
			errorText = 'Failed to parse error response';
		}
		throw new Error(`Token exchange failed: ${errorText}`);
	}

	const data = await response.json();
	console.log('Token exchange successful, expires in:', data.expires_in);

	// Store tokens in localStorage
	localStorage.setItem('spotify_access_token', data.access_token);

	if (data.refresh_token) {
		localStorage.setItem('spotify_refresh_token', data.refresh_token);
	}

	// Calculate expiration time (subtract 5 minutes to be safe)
	const expiresIn = data.expires_in;
	const expirationTime = new Date();
	expirationTime.setSeconds(expirationTime.getSeconds() + expiresIn - 300);
	localStorage.setItem('spotify_token_expiration', expirationTime.toString());

	return data.access_token;
}

/**
 * Check if we have a valid access token, refresh if expired
 */
export async function getValidAccessToken(): Promise<string | null> {
	// Check if we have an access token
	const accessToken = localStorage.getItem('spotify_access_token');
	if (!accessToken) {
		return null;
	}

	// Check if token is expired
	const expirationTime = localStorage.getItem('spotify_token_expiration');
	if (expirationTime && new Date() > new Date(expirationTime)) {
		// Token is expired, try to refresh
		const refreshToken = localStorage.getItem('spotify_refresh_token');
		if (refreshToken) {
			try {
				return await refreshAccessToken(refreshToken);
			} catch (error) {
				console.error('Failed to refresh token:', error);
				// Clear tokens if refresh fails
				clearTokens();
				return null;
			}
		} else {
			// No refresh token, clear everything
			clearTokens();
			return null;
		}
	}

	// Token is still valid
	return accessToken;
}

/**
 * Refresh an expired access token
 */
async function refreshAccessToken(refreshToken: string): Promise<string> {
	const params = new URLSearchParams();
	params.append('client_id', clientId);
	params.append('grant_type', 'refresh_token');
	params.append('refresh_token', refreshToken);

	const response = await fetch('https://accounts.spotify.com/api/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: params,
	});

	if (!response.ok) {
		throw new Error(`Token refresh failed: ${response.statusText}`);
	}

	const data = await response.json();

	// Update stored tokens
	localStorage.setItem('spotify_access_token', data.access_token);

	if (data.refresh_token) {
		localStorage.setItem('spotify_refresh_token', data.refresh_token);
	}

	// Update expiration time
	const expiresIn = data.expires_in;
	const expirationTime = new Date();
	expirationTime.setSeconds(expirationTime.getSeconds() + expiresIn - 300);
	localStorage.setItem('spotify_token_expiration', expirationTime.toString());

	return data.access_token;
}

/**
 * Clear all stored tokens
 */
export function clearTokens() {
	localStorage.removeItem('spotify_access_token');
	localStorage.removeItem('spotify_refresh_token');
	localStorage.removeItem('spotify_token_expiration');
	localStorage.removeItem('spotify_verifier');
}

/**
 * Generate a random string for the code verifier
 */
function generateCodeVerifier(length: number) {
	let text = '';
	const possible =
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

	for (let i = 0; i < length; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}

	return text;
}

/**
 * Generate code challenge from verifier using SHA-256
 */
async function generateCodeChallenge(codeVerifier: string) {
	const data = new TextEncoder().encode(codeVerifier);
	const digest = await window.crypto.subtle.digest('SHA-256', data);

	return btoa(String.fromCharCode(...new Uint8Array(digest)))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}
