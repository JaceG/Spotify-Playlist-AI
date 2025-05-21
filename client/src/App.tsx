import { Switch, Route, useLocation } from 'wouter';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useEffect } from 'react';
import NotFound from '@/pages/not-found';
import Home from '@/pages/home';
import SpotifyCallback from '@/pages/spotify-callback';

function Router() {
	const [location, setLocation] = useLocation();

	// Handle Spotify auth code in the URL parameters on app load
	useEffect(() => {
		if (location === '/') {
			const urlParams = new URLSearchParams(window.location.search);
			const code = urlParams.get('code');
			const error = urlParams.get('error');

			if (code) {
				console.log(
					'Detected auth code in URL params, redirecting to callback handler'
				);
				setLocation(`/auth/spotify/callback${window.location.search}`);
			}
		}
	}, [location, setLocation]);

	return (
		<Switch>
			<Route path='/' component={Home} />
			<Route path='/auth/spotify/callback' component={SpotifyCallback} />
			<Route component={NotFound} />
		</Switch>
	);
}

function App() {
	return (
		<TooltipProvider>
			<Toaster />
			<Router />
		</TooltipProvider>
	);
}

export default App;
