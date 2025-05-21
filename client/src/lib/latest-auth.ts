// Spotify authentication helper functions
import { clientId, redirectUri } from './spotify-config';

/**
 * Redirect to Spotify's OAuth authorization page
 */
export async function redirectToSpotifyAuth() {
  // Generate and store PKCE code verifier
  const verifier = generateCodeVerifier(128);
  const challenge = await generateCodeChallenge(verifier);
  
  // Store verifier in localStorage for later token exchange
  localStorage.setItem("spotify_verifier", verifier);
  
  console.log("Initiating Spotify auth with redirect URI:", redirectUri);
  
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
    console.error("No code verifier found in localStorage");
    throw new Error("No code verifier found in localStorage");
  }
  
  console.log("Exchanging code for token with redirect URI:", redirectUri);
  
  // Build token request parameters
  const params = new URLSearchParams();
  params.append("client_id", clientId);
  params.append("grant_type", "authorization_code");
  params.append("code", code);
  params.append("redirect_uri", redirectUri);
  params.append("code_verifier", verifier);
  
  // Exchange code for token
  try {
    console.log("Sending token request to Spotify");
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Token exchange failed:", response.status, errorText);
      throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log("Successfully received token response:", Object.keys(data).join(", "));
    
    // Store tokens in localStorage
    localStorage.setItem("spotify_access_token", data.access_token);
    
    if (data.refresh_token) {
      localStorage.setItem("spotify_refresh_token", data.refresh_token);
    }
    
    // Calculate expiration time (subtract 5 minutes to be safe)
    const expiresIn = data.expires_in;
    const expirationTime = new Date();
    expirationTime.setSeconds(expirationTime.getSeconds() + expiresIn - 300);
    localStorage.setItem("spotify_token_expiration", expirationTime.toString());
    
    return data.access_token;
  } catch (error) {
    console.error("Error in token exchange:", error);
    throw error;
  }
}

/**
 * Check if we have a valid access token, refresh if expired
 */
export async function getValidAccessToken(): Promise<string | null> {
  // Check if we have an access token
  const accessToken = localStorage.getItem("spotify_access_token");
  if (!accessToken) {
    console.log("No access token found in localStorage");
    return null;
  }
  
  // Check if token is expired
  const expirationTime = localStorage.getItem("spotify_token_expiration");
  if (expirationTime && new Date() > new Date(expirationTime)) {
    console.log("Access token expired, attempting to refresh");
    // Token is expired, try to refresh
    const refreshToken = localStorage.getItem("spotify_refresh_token");
    if (refreshToken) {
      try {
        return await refreshAccessToken(refreshToken);
      } catch (error) {
        console.error("Failed to refresh token:", error);
        // Clear tokens if refresh fails
        clearTokens();
        return null;
      }
    } else {
      console.log("No refresh token available");
      // No refresh token, clear everything
      clearTokens();
      return null;
    }
  }
  
  // Token is still valid
  console.log("Using existing valid access token");
  return accessToken;
}

/**
 * Refresh an expired access token
 */
async function refreshAccessToken(refreshToken: string): Promise<string> {
  console.log("Refreshing access token");
  const params = new URLSearchParams();
  params.append("client_id", clientId);
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", refreshToken);
  
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Token refresh failed:", response.status, errorText);
    throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  console.log("Successfully refreshed token");
  
  // Update stored tokens
  localStorage.setItem("spotify_access_token", data.access_token);
  
  if (data.refresh_token) {
    localStorage.setItem("spotify_refresh_token", data.refresh_token);
  }
  
  // Update expiration time
  const expiresIn = data.expires_in;
  const expirationTime = new Date();
  expirationTime.setSeconds(expirationTime.getSeconds() + expiresIn - 300);
  localStorage.setItem("spotify_token_expiration", expirationTime.toString());
  
  return data.access_token;
}

/**
 * Clear all stored tokens
 */
export function clearTokens() {
  console.log("Clearing all Spotify tokens from localStorage");
  localStorage.removeItem("spotify_access_token");
  localStorage.removeItem("spotify_refresh_token");
  localStorage.removeItem("spotify_token_expiration");
  localStorage.removeItem("spotify_verifier");
}

/**
 * Generate a random string for the code verifier
 */
function generateCodeVerifier(length: number) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;
}

/**
 * Generate code challenge from verifier using SHA-256
 */
async function generateCodeChallenge(codeVerifier: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  
  // Convert digest to base64url string
  return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}