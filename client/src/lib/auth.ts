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
  localStorage.setItem("spotify_verifier", verifier);
  
  // Use the specific redirect URI that's registered in Spotify Developer Dashboard
  const redirectUri = "https://3095b203-1854-4fe4-94cc-bec38e317854-00-1lcef2spkt33c.janeway.replit.dev/";
  
  // Build authorization parameters
  const params = new URLSearchParams();
  params.append("client_id", clientId);
  params.append("response_type", "code");
  params.append("redirect_uri", redirectUri);
  // Add all required scopes for full playlist access
  params.append("scope", "user-read-private user-read-email playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private user-library-read user-top-read");
  params.append("code_challenge_method", "S256");
  params.append("code_challenge", challenge);
  
  // Redirect to Spotify authorization page
  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for access token using PKCE
 */
export async function getAccessToken(code: string): Promise<string> {
  // Get stored code verifier
  const verifier = localStorage.getItem("spotify_verifier");
  if (!verifier) {
    throw new Error("No code verifier found in localStorage");
  }
  
  // Use the specific redirect URI that's registered in Spotify Developer Dashboard
  const redirectUri = "https://3095b203-1854-4fe4-94cc-bec38e317854-00-1lcef2spkt33c.janeway.replit.dev/";
  
  // Build token request parameters
  const params = new URLSearchParams();
  params.append("client_id", clientId);
  params.append("grant_type", "authorization_code");
  params.append("code", code);
  params.append("redirect_uri", redirectUri);
  params.append("code_verifier", verifier);
  
  // Exchange code for token
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
  }
  
  const { access_token, refresh_token, expires_in } = await response.json();
  
  // Store tokens in localStorage
  const expiresAt = Date.now() + (expires_in * 1000);
  localStorage.setItem("spotify_access_token", access_token);
  localStorage.setItem("spotify_refresh_token", refresh_token);
  localStorage.setItem("spotify_expires_at", expiresAt.toString());
  
  return access_token;
}

/**
 * Generate a random string for the code verifier
 */
function generateCodeVerifier(length: number) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  
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
  
  return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Check if we have a valid access token, refresh if expired
 */
export async function getValidAccessToken(): Promise<string | null> {
  const accessToken = localStorage.getItem("spotify_access_token");
  const refreshToken = localStorage.getItem("spotify_refresh_token");
  const expiresAt = localStorage.getItem("spotify_expires_at");
  
  // No token available
  if (!accessToken || !refreshToken) {
    return null;
  }
  
  // Check if token is expired
  if (expiresAt && Date.now() > parseInt(expiresAt)) {
    // Token is expired, try to refresh
    try {
      return await refreshAccessToken(refreshToken);
    } catch (error) {
      console.error("Failed to refresh token:", error);
      // Clear invalid tokens
      clearTokens();
      return null;
    }
  }
  
  // Valid token exists
  return accessToken;
}

/**
 * Refresh an expired access token
 */
async function refreshAccessToken(refreshToken: string): Promise<string> {
  const params = new URLSearchParams();
  params.append("client_id", clientId);
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", refreshToken);
  
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });
  
  if (!response.ok) {
    throw new Error(`Refresh token failed: ${response.status}`);
  }
  
  const { access_token, expires_in } = await response.json();
  
  // Store new token and expiration
  const expiresAt = Date.now() + (expires_in * 1000);
  localStorage.setItem("spotify_access_token", access_token);
  localStorage.setItem("spotify_expires_at", expiresAt.toString());
  
  return access_token;
}

/**
 * Clear all stored tokens
 */
export function clearTokens() {
  localStorage.removeItem("spotify_verifier");
  localStorage.removeItem("spotify_access_token");
  localStorage.removeItem("spotify_refresh_token");
  localStorage.removeItem("spotify_expires_at");
}