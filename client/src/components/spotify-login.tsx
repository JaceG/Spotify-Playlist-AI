import { Button } from '@/components/ui/button';
import { Music, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SiSpotify } from 'react-icons/si';
import { queryClient } from '@/lib/queryClient';
import { clearTokens } from '@/lib/fixed-auth';

interface SpotifyLoginProps {
	onLoginClick?: () => void;
}

// Interface for Spotify user profile
interface SpotifyProfile {
	id: string;
	displayName: string;
	email?: string;
	profileImage?: string;
	isPremium?: boolean;
}

export function SpotifyLogin({ onLoginClick }: SpotifyLoginProps) {
	const [isAuthenticating, setIsAuthenticating] = useState(false);

	// Check if user is already logged in with Spotify - this connects to the real Spotify API
	const {
		data: spotifyUser,
		isLoading,
		refetch,
	} = useQuery<SpotifyProfile>({
		queryKey: ['/api/spotify/me'],
		retry: 1,
		staleTime: 10000,
		refetchOnWindowFocus: true,
		// Don't throw errors for auth issues
		throwOnError: false,
	});

	// Check URL for auth response parameters
	useEffect(() => {
		const url = window.location.href;
		if (url.includes('spotify_auth=success')) {
			console.log('Detected successful authentication');

			// Invalidate all Spotify-related queries to refresh data
			queryClient.invalidateQueries({ queryKey: ['/api/spotify/me'] });
			queryClient.invalidateQueries({
				queryKey: ['/api/spotify/playlists'],
			});

			// Refresh this component's data
			refetch();

			// Clean up the URL
			window.history.replaceState(
				{},
				document.title,
				window.location.pathname
			);
		}
	}, [refetch]);

	// Log state for debugging
	useEffect(() => {
		console.log('Spotify auth state:', {
			spotifyUser,
			isLoading,
			isAuthenticating,
		});
	}, [spotifyUser, isLoading, isAuthenticating]);

	const handleLogin = () => {
		setIsAuthenticating(true);

		// Clear any existing tokens before starting a new auth flow
		clearTokens();

		// Import and use our latest improved auth module with enhanced debugging
		import('../lib/fixed-auth')
			.then((auth) => {
				console.log(
					'Redirecting to Spotify authorization page with consistent redirect URI'
				);
				auth.redirectToSpotifyAuth();
			})
			.catch((error) => {
				console.error('Error initiating Spotify auth:', error);
				setIsAuthenticating(false);
			});
	};

	// While checking Spotify login status or during authentication
	if (isLoading || isAuthenticating) {
		return (
			<Button
				className='w-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center'
				disabled>
				<Loader2 className='mr-2 h-4 w-4 animate-spin' />
				<span>
					{isAuthenticating ? 'Connecting...' : 'Checking...'}
				</span>
			</Button>
		);
	}

	// Already connected to Spotify
	if (spotifyUser) {
		return (
			<div className='flex items-center space-x-2 px-2 py-1 bg-gray-800 rounded-md'>
				<SiSpotify className='h-4 w-4 text-[#1DB954]' />
				<span className='text-sm text-gray-300'>
					Connected as {spotifyUser.displayName}
				</span>
			</div>
		);
	}

	// Not connected yet - show connect button
	return (
		<Button
			onClick={handleLogin}
			disabled={isAuthenticating}
			className='w-full bg-[#1DB954] text-black hover:bg-opacity-90 transition-colors flex items-center justify-center'>
			<SiSpotify className='h-4 w-4 mr-2' />
			<span>Connect to Spotify</span>
		</Button>
	);
}
