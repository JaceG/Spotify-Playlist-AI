import { useState, useEffect } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Loader2, Clock, Zap, Database, Server } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { getValidAccessToken } from '@/lib/fixed-auth';
import { useToast } from '@/hooks/use-toast';
import { API } from '@/lib/api-proxy';

// Define types for our component props and state
export interface PlaylistInfo {
	id: string;
	name: string;
	description?: string;
	trackCount: number;
	imageUrl?: string;
	isCollaborative: boolean;
	isPublic: boolean;
}

export interface ProcessingModeConfig {
	maxTracksPerPlaylist: number;
	maxPlaylists: number;
	useAudioFeatures: boolean;
	fetchAllPages: boolean;
	requestDelay: number;
	prioritizeByRelevance: boolean;
	targetPoolSize: number;
}

export interface ProcessingModeInfo {
	mode: string;
	config: ProcessingModeConfig;
	estimatedSeconds: number;
	warningLevel: 'low' | 'medium' | 'high';
	estimatedTime: string;
}

export interface PlaylistSourceOptions {
	useLikedSongs: boolean;
	useTopTracks: boolean;
	useRecommendations: boolean;
	playlists: string[];
}

export interface PlaylistSourceSelectorProps {
	onChange: (options: {
		sources: PlaylistSourceOptions;
		processingMode: string;
		targetTrackCount: number;
	}) => void;
	defaultOptions?: {
		sources?: PlaylistSourceOptions;
		processingMode?: string;
		targetTrackCount?: number;
	};
}

export function PlaylistSourceSelector({
	onChange,
	defaultOptions,
}: PlaylistSourceSelectorProps) {
	// State for source selection
	const [sources, setSources] = useState<PlaylistSourceOptions>(
		defaultOptions?.sources || {
			useLikedSongs: true,
			useTopTracks: true,
			useRecommendations: true,
			playlists: [],
		}
	);

	// State for processing mode
	const [processingMode, setProcessingMode] = useState<string>(
		defaultOptions?.processingMode || 'standard'
	);

	// State for target track count
	const [targetTrackCount, setTargetTrackCount] = useState<number>(
		defaultOptions?.targetTrackCount || 20
	);

	// State for available playlists and estimates
	const [playlists, setPlaylists] = useState<PlaylistInfo[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [availableModes, setAvailableModes] = useState<ProcessingModeInfo[]>(
		[]
	);
	const [selectedMode, setSelectedMode] = useState<ProcessingModeInfo | null>(
		null
	);

	const { toast } = useToast();

	// Fetch playlists and processing time estimates when component mounts
	useEffect(() => {
		fetchPlaylists();
	}, []);

	// Update estimates when sources or processing mode changes
	useEffect(() => {
		if (playlists.length > 0) {
			updateEstimates();
		}
	}, [sources, processingMode, playlists.length]);

	// Call onChange prop when options change
	useEffect(() => {
		onChange({
			sources,
			processingMode,
			targetTrackCount,
		});
	}, [sources, processingMode, targetTrackCount, onChange]);

	// Function to fetch user's playlists and initial estimates
	const fetchPlaylists = async () => {
		try {
			setIsLoading(true);

			// Get valid access token
			const token = await getValidAccessToken();

			if (!token) {
				toast({
					title: 'Authentication required',
					description:
						'Please log in with Spotify to view your playlists.',
					variant: 'destructive',
				});
				setIsLoading(false);
				return;
			}

			// First fetch playlists directly from Spotify API
			const playlistsResponse = await fetch('/api/spotify/playlists', {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${token}`,
				},
			});

			if (!playlistsResponse.ok) {
				throw new Error('Failed to fetch playlists from Spotify');
			}

			const playlistsData = await playlistsResponse.json();

			// Transform the data to match our PlaylistInfo interface
			const transformedPlaylists: PlaylistInfo[] =
				playlistsData.items.map((item: any) => ({
					id: item.id,
					name: item.name,
					description: item.description || '',
					trackCount: item.tracks?.total || 0,
					imageUrl: item.images?.[0]?.url,
					isCollaborative: item.collaborative || false,
					isPublic: item.public || false,
				}));

			// Update playlists state
			setPlaylists(transformedPlaylists);

			// Now get the processing estimates
			const estimatesResponse = await fetch(
				'/api/ai/estimate-processing',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({
						sources,
						processingMode,
					}),
				}
			);

			if (!estimatesResponse.ok) {
				throw new Error('Failed to fetch processing estimates');
			}

			const estimatesData = await estimatesResponse.json();

			// Update state with fetched estimates data
			setAvailableModes(estimatesData.availableModes || []);
			setSelectedMode(estimatesData.selectedMode || null);
		} catch (error: any) {
			toast({
				title: 'Error fetching playlists',
				description: error.message || 'Something went wrong',
				variant: 'destructive',
			});
			console.error('Playlist fetching error:', error);
		} finally {
			setIsLoading(false);
		}
	};

	// Function to update time estimates without fetching playlists again
	const updateEstimates = async () => {
		try {
			// Get valid access token
			const token = await getValidAccessToken();

			if (!token) return;

			// Call our API endpoint for just the estimates
			const response = await fetch('/api/ai/estimate-processing', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({
					sources,
					processingMode,
				}),
			});

			if (!response.ok) {
				throw new Error('Failed to fetch estimates');
			}

			const data = await response.json();

			// Update just the mode information without touching playlists
			setAvailableModes(data.availableModes || []);
			setSelectedMode(data.selectedMode || null);
		} catch (error) {
			console.error('Error updating estimates:', error);
		}
	};

	// Handler for playlist selection
	const handlePlaylistToggle = (playlistId: string, checked: boolean) => {
		console.log(
			`Toggling playlist ${playlistId} to ${
				checked ? 'selected' : 'unselected'
			}`
		);
		setSources((prev) => {
			if (checked) {
				return { ...prev, playlists: [...prev.playlists, playlistId] };
			} else {
				return {
					...prev,
					playlists: prev.playlists.filter((id) => id !== playlistId),
				};
			}
		});
	};

	// Handler for selecting all playlists
	const handleSelectAllPlaylists = () => {
		const allPlaylistIds = playlists.map((playlist) => playlist.id);
		setSources((prev) => ({
			...prev,
			playlists: allPlaylistIds,
		}));
		console.log('Selected all playlists:', allPlaylistIds);
	};

	// Handler for deselecting all playlists
	const handleDeselectAllPlaylists = () => {
		setSources((prev) => ({
			...prev,
			playlists: [],
		}));
		console.log('Deselected all playlists');
	};

	// Helper to get badge color based on warning level
	const getWarningLevelColor = (level: string) => {
		switch (level) {
			case 'high':
				return 'bg-red-500';
			case 'medium':
				return 'bg-yellow-500';
			case 'low':
				return 'bg-green-500';
			default:
				return 'bg-blue-500';
		}
	};

	// Helper to get mode icon
	const getModeIcon = (mode: string) => {
		switch (mode) {
			case 'quick':
				return <Zap className='h-4 w-4 mr-2' />;
			case 'standard':
				return <Clock className='h-4 w-4 mr-2' />;
			case 'comprehensive':
				return <Database className='h-4 w-4 mr-2' />;
			case 'complete':
				return <Server className='h-4 w-4 mr-2' />;
			default:
				return null;
		}
	};

	return (
		<div className='space-y-6'>
			{/* Data Source Selection */}
			<Card>
				<CardHeader>
					<CardTitle>Data Sources</CardTitle>
					<CardDescription>
						Select which sources to use for generating your playlist
					</CardDescription>
				</CardHeader>
				<CardContent className='space-y-4'>
					<div className='space-y-2'>
						<div className='flex items-center space-x-2'>
							<Checkbox
								id='useLikedSongs'
								checked={sources.useLikedSongs}
								onCheckedChange={(checked) =>
									setSources((prev) => ({
										...prev,
										useLikedSongs: checked as boolean,
									}))
								}
							/>
							<Label htmlFor='useLikedSongs'>Liked Songs</Label>
						</div>

						<div className='flex items-center space-x-2'>
							<Checkbox
								id='useTopTracks'
								checked={sources.useTopTracks}
								onCheckedChange={(checked) =>
									setSources((prev) => ({
										...prev,
										useTopTracks: checked as boolean,
									}))
								}
							/>
							<Label htmlFor='useTopTracks'>
								Your Top Tracks
							</Label>
						</div>

						<div className='flex items-center space-x-2'>
							<Checkbox
								id='useRecommendations'
								checked={sources.useRecommendations}
								onCheckedChange={(checked) =>
									setSources((prev) => ({
										...prev,
										useRecommendations: checked as boolean,
									}))
								}
							/>
							<Label htmlFor='useRecommendations'>
								Spotify Recommendations
							</Label>
						</div>
					</div>

					{/* Playlist Selection */}
					<div>
						<div className='flex justify-between items-center mb-2'>
							<h3 className='text-sm font-medium'>
								Your Playlists
							</h3>
							<div className='space-x-2'>
								<Button
									variant='outline'
									size='sm'
									onClick={handleSelectAllPlaylists}
									disabled={
										isLoading || playlists.length === 0
									}>
									Select All
								</Button>
								<Button
									variant='outline'
									size='sm'
									onClick={handleDeselectAllPlaylists}
									disabled={
										isLoading ||
										sources.playlists.length === 0
									}>
									Deselect All
								</Button>
							</div>
						</div>

						{isLoading ? (
							<div className='flex justify-center py-4'>
								<Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
							</div>
						) : playlists.length === 0 ? (
							<div className='text-center py-4 text-muted-foreground'>
								No playlists found
							</div>
						) : (
							<ScrollArea className='h-60 border rounded-md p-2'>
								<div className='space-y-2'>
									{playlists.map((playlist) => (
										<div
											key={playlist.id}
											className='flex items-center space-x-3 py-1'>
											<Checkbox
												id={`playlist-${playlist.id}`}
												checked={sources.playlists.includes(
													playlist.id
												)}
												onCheckedChange={(checked) =>
													handlePlaylistToggle(
														playlist.id,
														checked as boolean
													)
												}
											/>
											<div className='flex items-center space-x-2 overflow-hidden'>
												{playlist.imageUrl && (
													<img
														src={playlist.imageUrl}
														alt={playlist.name}
														className='h-8 w-8 rounded object-cover'
													/>
												)}
												<div className='truncate'>
													<Label
														htmlFor={`playlist-${playlist.id}`}
														className='font-medium cursor-pointer'>
														{playlist.name}
													</Label>
													<p className='text-xs text-muted-foreground truncate'>
														{playlist.trackCount}{' '}
														tracks
													</p>
												</div>
											</div>
										</div>
									))}
								</div>
							</ScrollArea>
						)}
					</div>
				</CardContent>
			</Card>

			{/* Processing Mode Selection */}
			<Card>
				<CardHeader>
					<CardTitle>Processing Mode</CardTitle>
					<CardDescription>
						Choose how thoroughly to analyze your music collection
					</CardDescription>
				</CardHeader>
				<CardContent>
					<RadioGroup
						value={processingMode}
						onValueChange={setProcessingMode}
						className='space-y-3'>
						{availableModes.map((mode) => (
							<div
								key={mode.mode}
								className='flex items-start space-x-3 p-2 rounded hover:bg-accent cursor-pointer'>
								<RadioGroupItem
									value={mode.mode}
									id={`mode-${mode.mode}`}
									className='mt-1'
								/>
								<div className='flex-1'>
									<div className='flex items-center space-x-2'>
										<Label
											htmlFor={`mode-${mode.mode}`}
											className='capitalize font-medium flex items-center'>
											{getModeIcon(mode.mode)}
											{mode.mode}
										</Label>
										<Badge
											variant='outline'
											className={`text-white ${getWarningLevelColor(
												mode.warningLevel
											)}`}>
											{mode.estimatedTime}
										</Badge>
									</div>
									<p className='text-xs text-muted-foreground mt-1'>
										{mode.mode === 'quick' &&
											'Fast but limited analysis. Good for quick results.'}
										{mode.mode === 'standard' &&
											'Balanced speed and thoroughness. Recommended for most users.'}
										{mode.mode === 'comprehensive' &&
											'Deeper analysis of more tracks. Better results but slower.'}
										{mode.mode === 'complete' &&
											'Exhaustive analysis of all available tracks. May take significant time.'}
									</p>
									<div className='text-xs mt-2 flex flex-wrap gap-2'>
										<span className='inline-flex items-center px-2 py-1 rounded-full bg-secondary text-secondary-foreground'>
											Up to{' '}
											{mode.config
												.maxTracksPerPlaylist === 0
												? 'All'
												: mode.config
														.maxTracksPerPlaylist}{' '}
											tracks per playlist
										</span>
										<span className='inline-flex items-center px-2 py-1 rounded-full bg-secondary text-secondary-foreground'>
											{mode.config.fetchAllPages
												? 'Full pagination'
												: 'Limited pages'}
										</span>
										<span className='inline-flex items-center px-2 py-1 rounded-full bg-secondary text-secondary-foreground'>
											Target pool:{' '}
											{mode.config.targetPoolSize} tracks
										</span>
									</div>
								</div>
							</div>
						))}
					</RadioGroup>
				</CardContent>
			</Card>
		</div>
	);
}
