import SpotifyWebApi from 'spotify-web-api-node';
import dotenv from 'dotenv';
import { clientId as frontendClientId } from '../../client/src/lib/spotify-config';

dotenv.config();

// Log the client ID configuration to help debug issues
const clientId = process.env.SPOTIFY_CLIENT_ID || frontendClientId;
console.log('Spotify API configured with client ID:', clientId);

// Create Spotify API instance
const spotifyApi = new SpotifyWebApi({
	clientId: clientId,
	clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
	redirectUri: process.env.SPOTIFY_REDIRECT_URI,
});

export default spotifyApi;
