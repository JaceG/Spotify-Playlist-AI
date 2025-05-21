import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Playlist, User } from '@shared/schema';
import { UserAvatar } from './user-avatar';
import { SpotifyLogin } from './spotify-login';
import { cn } from '@/lib/utils';
import { Menu, X, Settings, Music, LogOut } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { AuthResetButton } from './auth-reset-button';

interface SidebarProps {
	user: User | null;
	isLoading: boolean;
}

export function Sidebar({ user, isLoading }: SidebarProps) {
	const [isMobileOpen, setIsMobileOpen] = useState(false);
	const [location] = useLocation();
	const { toast } = useToast();

	// Define Spotify user interface
	interface SpotifyUserProfile {
		id: string;
		displayName: string;
		email?: string;
		profileImage?: string;
		spotifyUrl?: string;
		isPremium: boolean;
	}

	// Check for Spotify auth status directly
	const {
		data: authStatus,
		isLoading: authStatusLoading,
		refetch: refetchAuthStatus,
	} = useQuery({
		queryKey: ['/auth/spotify/status'],
		retry: 2,
		retryDelay: 1000,
		throwOnError: false,
		refetchOnWindowFocus: true,
		refetchInterval: 10000, // Check every 10 seconds
	});

	// If authenticated, get Spotify user details
	const {
		data: spotifyUser,
		isLoading: spotifyLoading,
		refetch: refetchSpotifyUser,
	} = useQuery<SpotifyUserProfile>({
		queryKey: ['/api/spotify/me'],
		retry: 2,
		retryDelay: 1000,
		throwOnError: false,
		refetchOnWindowFocus: true,
		refetchInterval: 30000, // Refresh every 30 seconds to keep session alive
		refetchOnMount: true,
		enabled: true, // Always try to fetch profile data
	});

	// Log authentication and user data for debugging
	useEffect(() => {
		console.log('Auth status:', authStatus);
		console.log('Spotify user data:', spotifyUser);
	}, [authStatus, spotifyUser]);

	// Fetch AI generated playlists
	const { data: aiPlaylists = [], isLoading: aiPlaylistsLoading } = useQuery<
		Playlist[]
	>({
		queryKey: ['/api/playlists/ai'],
		enabled: !!user,
	});

	// Fetch user playlists
	const { data: userPlaylists = [], isLoading: userPlaylistsLoading } =
		useQuery<Playlist[]>({
			queryKey: ['/api/playlists/user'],
			enabled: !!user,
		});

	// Fetch Spotify playlists
	const {
		data: spotifyPlaylists,
		isLoading: spotifyPlaylistsLoading,
		refetch: refetchPlaylists,
	} = useQuery({
		queryKey: ['/api/spotify/playlists'],
		retry: 5,
		retryDelay: 1000,
		throwOnError: false,
		refetchOnWindowFocus: true,
		enabled: true, // Always try to fetch playlists
		queryFn: async () => {
			try {
				// Import the getValidAccessToken function from fixed-auth
				const { getValidAccessToken } = await import(
					'@/lib/fixed-auth'
				);
				const token = await getValidAccessToken();

				if (!token) {
					console.log(
						'No valid Spotify token available for fetching playlists'
					);
					return { items: [], total: 0 };
				}

				// Make the API request with the token in the Authorization header
				const response = await fetch('/api/spotify/playlists', {
					headers: {
						Authorization: `Bearer ${token}`,
						'Content-Type': 'application/json',
					},
				});

				if (!response.ok) {
					throw new Error(
						`Error fetching playlists: ${response.status}`
					);
				}

				const data = await response.json();
				console.log(
					'Successfully fetched Spotify playlists:',
					data.total || 0
				);
				return data;
			} catch (error) {
				console.error('Error fetching Spotify playlists:', error);
				return { items: [], total: 0 };
			}
		},
	});

	// Check for Spotify auth success and refresh data
	useEffect(() => {
		const url = window.location.href;
		if (url.includes('spotify_auth=success')) {
			console.log(
				'Detected successful Spotify authentication - refreshing playlists'
			);

			// Give the server a moment to process authentication
			setTimeout(() => {
				refetchAuthStatus();
				refetchSpotifyUser();
				refetchPlaylists();

				// Clean up the URL
				window.history.replaceState(
					{},
					document.title,
					window.location.pathname
				);
			}, 1000);
		}
	}, [refetchAuthStatus, refetchSpotifyUser, refetchPlaylists]);

	// Check URL for Spotify auth success and reload data if needed
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const spotifyAuth = params.get('spotify_auth');

		if (spotifyAuth === 'success') {
			console.log(
				'Spotify auth success detected in URL, refreshing data'
			);
			refetchAuthStatus();
			refetchSpotifyUser();

			// Clean the URL
			window.history.replaceState(
				{},
				document.title,
				window.location.pathname
			);
		}
	}, [refetchAuthStatus, refetchSpotifyUser]);

	// Log Spotify data for debugging
	useEffect(() => {
		console.log('Spotify playlists:', spotifyPlaylists);
	}, [spotifyPlaylists]);

	const handleLogout = () => {
		window.location.href = '/auth/logout';
		// Invalidate queries
		queryClient.invalidateQueries({ queryKey: ['/api/spotify/me'] });
		toast({
			title: 'Logged out',
			description: 'You have been logged out from your Spotify account',
		});
	};

	const toggleMobileSidebar = () => {
		setIsMobileOpen(!isMobileOpen);
	};

	// Mobile menu button
	const MobileMenuButton = () => (
		<div className='fixed top-4 left-4 z-40 lg:hidden'>
			<button
				onClick={toggleMobileSidebar}
				className='text-white p-2 rounded-md bg-spotify-black hover:bg-spotify-gray transition-colors'>
				<Menu className='h-5 w-5' />
			</button>
		</div>
	);

	return (
		<>
			<MobileMenuButton />

			<aside
				className={cn(
					'w-64 fixed inset-y-0 left-0 bg-black bg-opacity-90 transform transition-transform duration-300 ease-in-out z-30',
					isMobileOpen
						? 'translate-x-0'
						: '-translate-x-full lg:translate-x-0'
				)}>
				<div className='flex flex-col h-full'>
					{/* Logo area */}
					<div className='px-6 py-4 flex items-center border-b border-spotify-gray border-opacity-30'>
						<div className='h-8 w-8 bg-spotify-green flex items-center justify-center rounded-full mr-2'>
							<span className='text-black text-lg font-bold'>
								S
							</span>
						</div>
						<h1 className='text-xl font-bold'>Playlist AI</h1>
						<button
							onClick={toggleMobileSidebar}
							className='ml-auto lg:hidden text-white'>
							<X className='h-5 w-5' />
						</button>
					</div>

					{/* User profile */}
					<div className='px-6 py-4 flex items-center space-x-3 border-b border-spotify-gray border-opacity-30'>
						{spotifyLoading || isLoading ? (
							<>
								<Skeleton className='h-10 w-10 rounded-full' />
								<div className='space-y-1'>
									<Skeleton className='h-4 w-20' />
									<Skeleton className='h-3 w-24' />
								</div>
							</>
						) : spotifyUser ? (
							<>
								<div className='h-10 w-10 rounded-full overflow-hidden'>
									<img
										src={
											spotifyUser?.profileImage ||
											'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'
										}
										alt={
											spotifyUser.displayName ||
											'Spotify User'
										}
										className='h-full w-full object-cover'
									/>
								</div>
								<div>
									<p className='font-medium'>
										{spotifyUser.displayName}
									</p>
									<p className='text-xs text-spotify-light-gray'>
										{spotifyUser.email ||
											'Connected to Spotify'}
									</p>
								</div>
							</>
						) : user ? (
							<>
								<UserAvatar user={user} />
								<div>
									<p className='font-medium'>
										{user.displayName || user.username}
									</p>
									<p className='text-xs text-spotify-light-gray'>
										<span className='text-spotify-green'>
											Connected to Spotify
										</span>
									</p>
								</div>
							</>
						) : (
							<div className='flex flex-col space-y-2 py-2'>
								<div className='text-sm'>
									Sign in to see your playlists
								</div>
								<SpotifyLogin />
							</div>
						)}
					</div>

					{/* Navigation menu */}
					<ScrollArea className='flex-grow'>
						<nav className='px-4 py-4'>
							<h2 className='text-xs uppercase font-bold tracking-wider text-spotify-light-gray mb-4 px-2'>
								Playlists
							</h2>

							{/* AI Generated playlists section */}
							<div className='space-y-1 mb-6'>
								<p className='text-sm text-spotify-light-gray px-2 mb-2'>
									AI Generated
								</p>

								{aiPlaylistsLoading ? (
									<div className='space-y-2'>
										<Skeleton className='h-10 w-full' />
										<Skeleton className='h-10 w-full' />
										<Skeleton className='h-10 w-full' />
									</div>
								) : aiPlaylists.length > 0 ? (
									aiPlaylists.map((playlist: Playlist) => (
										<PlaylistItem
											key={playlist.id}
											playlist={playlist}
										/>
									))
								) : (
									<div className='text-sm text-spotify-light-gray px-2 py-2'>
										No AI playlists yet
									</div>
								)}
							</div>

							<Separator className='my-4 opacity-30' />

							{/* User playlists section */}
							<div className='space-y-1'>
								<p className='text-sm text-spotify-light-gray px-2 mb-2'>
									Your Playlists
								</p>

								{userPlaylistsLoading ||
								spotifyPlaylistsLoading ? (
									<div className='space-y-2'>
										<Skeleton className='h-10 w-full' />
										<Skeleton className='h-10 w-full' />
										<Skeleton className='h-10 w-full' />
									</div>
								) : (
									<>
										{/* Regular playlists */}
										{userPlaylists.length > 0 &&
											userPlaylists.map(
												(playlist: Playlist) => (
													<PlaylistItem
														key={playlist.id}
														playlist={playlist}
													/>
												)
											)}

										{/* Spotify playlists */}
										{spotifyPlaylists &&
											'items' in spotifyPlaylists &&
											Array.isArray(
												spotifyPlaylists.items
											) &&
											spotifyPlaylists.items.length >
												0 && (
												<>
													<div className='text-xs text-gray-300 px-2 py-1 mt-3'>
														Spotify Playlists
													</div>
													{spotifyPlaylists.items.map(
														(
															spotifyPlaylist: any
														) => (
															<div
																key={
																	spotifyPlaylist.id
																}
																className='flex items-center space-x-2 px-2 py-2 rounded-md hover:bg-gray-800 hover:bg-opacity-30 cursor-pointer'>
																<div className='h-8 w-8 rounded overflow-hidden'>
																	{spotifyPlaylist.images &&
																	spotifyPlaylist
																		.images[0] &&
																	spotifyPlaylist
																		.images[0]
																		.url ? (
																		<img
																			src={
																				spotifyPlaylist
																					.images[0]
																					.url
																			}
																			alt={
																				spotifyPlaylist.name
																			}
																			className='h-full w-full object-cover'
																		/>
																	) : (
																		<div className='h-full w-full bg-gray-800 flex items-center justify-center'>
																			<Music className='h-4 w-4 text-gray-300' />
																		</div>
																	)}
																</div>
																<span className='truncate'>
																	{
																		spotifyPlaylist.name
																	}
																</span>
															</div>
														)
													)}
												</>
											)}

										{/* Empty state */}
										{userPlaylists.length === 0 &&
											(!spotifyPlaylists ||
												!(
													'items' in spotifyPlaylists
												) ||
												!spotifyPlaylists.items
													.length) && (
												<div className='text-sm text-spotify-light-gray px-2 py-2'>
													No playlists found
												</div>
											)}
									</>
								)}
							</div>
						</nav>
					</ScrollArea>

					{/* Sidebar footer */}
					<div className='px-6 py-4 border-t border-spotify-gray border-opacity-30'>
						<div className='flex flex-col space-y-3'>
							{!spotifyUser && <SpotifyLogin />}

							<Button
								variant='destructive'
								size='sm'
								className='w-full flex items-center justify-center space-x-2'
								onClick={handleLogout}>
								<LogOut className='h-4 w-4' />
								<span>Logout</span>
							</Button>

							<div className='flex justify-between items-center'>
								<button className='flex items-center space-x-2 text-sm text-spotify-light-gray hover:text-white transition-colors'>
									<Settings className='h-4 w-4' />
									<span>Settings</span>
								</button>

								<AuthResetButton />
							</div>
						</div>
					</div>
				</div>
			</aside>

			{/* Background overlay when mobile sidebar is open */}
			{isMobileOpen && (
				<div
					className='fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden'
					onClick={toggleMobileSidebar}></div>
			)}
		</>
	);
}

interface PlaylistItemProps {
	playlist: Playlist;
}

function PlaylistItem({ playlist }: PlaylistItemProps) {
	return (
		<Link href={`/playlist/${playlist.id}`}>
			<a className='flex items-center px-2 py-2 text-sm rounded-md hover:bg-spotify-gray hover:bg-opacity-30 transition-colors'>
				<div className='w-8 h-8 rounded overflow-hidden mr-3 flex-shrink-0 bg-spotify-gray bg-opacity-30'>
					{playlist.coverImage ? (
						<img
							src={playlist.coverImage}
							alt={`${playlist.name} playlist cover`}
							className='w-full h-full object-cover'
						/>
					) : (
						<div className='w-full h-full flex items-center justify-center text-xs'>
							{playlist.name.substring(0, 2).toUpperCase()}
						</div>
					)}
				</div>
				<span>{playlist.name}</span>
			</a>
		</Link>
	);
}
