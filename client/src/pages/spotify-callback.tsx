import { useEffect, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { queryClient } from '@/lib/queryClient';

// Spotify Callback handler
// This component handles the OAuth callback from Spotify's authorization server
export default function SpotifyCallback() {
	const [error, setError] = useState<string | null>(null);
	const [, setLocation] = useLocation();
	const [, params] = useRoute('/auth/spotify/callback');

	useEffect(() => {
		async function handleAuthCallback() {
			// Get the authorization code from URL parameters
			const urlParams = new URLSearchParams(window.location.search);
			const code = urlParams.get('code');
			const errorParam = urlParams.get('error');

			if (errorParam) {
				console.error('Authorization error:', errorParam);
				setError(`Authorization failed: ${errorParam}`);
				setTimeout(() => setLocation('/'), 3000);
				return;
			}

			if (!code) {
				console.error('No authorization code found in URL');
				setError('No authorization code received');
				setTimeout(() => setLocation('/'), 3000);
				return;
			}

			try {
				// Import our latest auth module with enhanced debugging
				const auth = await import('../lib/fixed-auth');

				// Exchange code for access token
				const accessToken = await auth.getAccessToken(code);
				console.log('Successfully obtained access token');

				// Test the token immediately by making a request to Spotify
				try {
					const spotifyApi = await import('../lib/spotify-api');
					const profile = await spotifyApi.getCurrentUserProfile();
					console.log(
						'Successfully retrieved Spotify profile:',
						profile.display_name
					);

					// Try to get playlists as well
					const playlists =
						await spotifyApi.getCurrentUserPlaylists();
					console.log(
						'Successfully retrieved playlists:',
						playlists.total
					);
				} catch (apiError) {
					console.error(
						'Error testing Spotify API with new token:',
						apiError
					);
				}

				// Invalidate all Spotify-related queries to refresh data
				console.log(
					'Invalidating all Spotify-related queries after successful authentication'
				);
				queryClient.invalidateQueries(); // Invalidate all queries to refresh everything

				// Redirect back to home with success indicator
				setLocation('/?spotify_auth=success');
			} catch (err) {
				console.error('Error exchanging code for token:', err);
				setError('Authentication failed. Please try again.');
				setTimeout(() => setLocation('/'), 3000);
			}
		}

		handleAuthCallback();
	}, [setLocation]);

	return (
		<div className='flex items-center justify-center min-h-screen bg-black bg-opacity-95'>
			<div className='p-8 bg-spotify-gray bg-opacity-30 rounded-lg max-w-md w-full'>
				<div className='animate-pulse flex flex-col items-center'>
					{error ? (
						<>
							<div className='h-12 w-12 rounded-full bg-red-500 flex items-center justify-center mb-4'>
								<span className='text-white text-xl'>✕</span>
							</div>
							<h1 className='text-xl font-bold mb-2 text-red-400'>
								Authentication Error
							</h1>
							<p className='text-spotify-light-gray text-center mb-4'>
								{error}
							</p>
							<p className='text-spotify-light-gray text-center'>
								Redirecting back to the app...
							</p>
						</>
					) : (
						<>
							<div className='h-12 w-12 rounded-full bg-spotify-green flex items-center justify-center mb-4'>
								<span className='animate-spin h-6 w-6 border-2 border-white border-t-transparent rounded-full'></span>
							</div>
							<h1 className='text-xl font-bold mb-2'>
								Completing Authentication
							</h1>
							<p className='text-spotify-light-gray text-center'>
								Connecting to your Spotify account...
							</p>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
