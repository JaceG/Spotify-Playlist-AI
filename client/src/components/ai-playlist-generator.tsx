import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
	CardFooter,
} from '@/components/ui/card';
import { Loader2, Music, Check, Settings2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { getValidAccessToken } from '@/lib/fixed-auth';
import {
	PlaylistSourceSelector,
	PlaylistSourceOptions,
} from '@/components/playlist-source-selector';
import { PlaylistGenerationProgress } from '@/components/playlist-generation-progress';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface AIPlaylistGeneratorProps {
	onPlaylistCreated?: (playlistId: string) => void;
}

export function AIPlaylistGenerator({
	onPlaylistCreated,
}: AIPlaylistGeneratorProps) {
	const [prompt, setPrompt] = useState('');
	const [name, setName] = useState('');
	const [description, setDescription] = useState('');
	const [isGenerating, setIsGenerating] = useState(false);
	const [success, setSuccess] = useState(false);
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [createdPlaylistId, setCreatedPlaylistId] = useState<
		string | undefined
	>(undefined);

	// State for the source selection and processing mode
	const [sourceOptions, setSourceOptions] = useState({
		sources: {
			useLikedSongs: true,
			useTopTracks: true,
			useRecommendations: true,
			playlists: [],
		} as PlaylistSourceOptions,
		processingMode: 'standard',
		targetTrackCount: 20,
	});

	const { toast } = useToast();
	const queryClient = useQueryClient();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!prompt.trim()) {
			toast({
				title: 'Prompt required',
				description:
					'Please provide a description of the playlist you want to create.',
				variant: 'destructive',
			});
			return;
		}

		try {
			setIsGenerating(true);
			setSuccess(false);
			setCreatedPlaylistId(undefined);

			// Get a valid access token
			const token = await getValidAccessToken();

			if (!token) {
				toast({
					title: 'Authentication required',
					description:
						'Please log in with Spotify to create AI playlists.',
					variant: 'destructive',
				});
				setIsGenerating(false);
				return;
			}

			// Log the request payload for debugging
			const requestPayload = {
				prompt,
				name: name.trim() || undefined,
				description: description.trim() || undefined,
				sources: sourceOptions.sources,
				processingMode: sourceOptions.processingMode,
				targetTrackCount: sourceOptions.targetTrackCount,
			};

			console.log('Sending playlist generation request:', requestPayload);

			// Call our AI playlist generation endpoint with source options
			const response = await fetch('/api/ai/generate-playlist', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify(requestPayload),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(
					errorData.message || 'Failed to generate playlist'
				);
			}

			const data = await response.json();
			console.log('Playlist generation response:', data);

			// Store the playlist ID for the progress component
			setCreatedPlaylistId(data.playlist.id);

			// Success handling
			setSuccess(true);
			toast({
				title: 'Playlist created!',
				description: `Your new playlist "${data.playlist.name}" has been created with ${data.playlist.tracks.length} tracks.`,
				variant: 'default',
			});

			// Invalidate playlists queries to refresh the lists
			queryClient.invalidateQueries({
				queryKey: ['/api/spotify/playlists'],
			});
			queryClient.invalidateQueries({ queryKey: ['/api/playlists/ai'] });

			// Call the callback if provided
			if (onPlaylistCreated) {
				onPlaylistCreated(data.playlist.id);
			}

			// Optionally, reset form
			// setPrompt('');
			// setName('');
			// setDescription('');
		} catch (error: any) {
			toast({
				title: 'Error creating playlist',
				description: error.message || 'Something went wrong',
				variant: 'destructive',
			});
			setIsGenerating(false);
		}
	};

	// Handle completion of generation
	const handleGenerationComplete = () => {
		setIsGenerating(false);
	};

	// Handle changes from the source selector
	const handleSourceOptionsChange = (options: {
		sources: PlaylistSourceOptions;
		processingMode: string;
		targetTrackCount: number;
	}) => {
		setSourceOptions(options);
	};

	return (
		<Card className='w-full'>
			<CardHeader>
				<CardTitle className='flex items-center space-x-2'>
					<Music className='h-5 w-5' />
					<span>AI Playlist Generator</span>
				</CardTitle>
				<CardDescription>
					Describe the perfect playlist and let AI create it from your
					music library
				</CardDescription>
			</CardHeader>

			<form onSubmit={handleSubmit}>
				<CardContent className='space-y-4'>
					<div className='space-y-2'>
						<label htmlFor='prompt' className='text-sm font-medium'>
							Prompt <span className='text-red-500'>*</span>
						</label>
						<Textarea
							id='prompt'
							placeholder='I want a playlist to test out my new speakers and subwoofer, give me stuff to really push it'
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							className='min-h-[100px]'
							required
						/>
						<p className='text-xs text-muted-foreground'>
							Be specific about the mood, activity, or sound
							you're looking for
						</p>
					</div>

					<div className='space-y-2'>
						<label htmlFor='name' className='text-sm font-medium'>
							Playlist Name (optional)
						</label>
						<Input
							id='name'
							placeholder='My Awesome AI Playlist'
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
					</div>

					<div className='space-y-2'>
						<label
							htmlFor='description'
							className='text-sm font-medium'>
							Description (optional)
						</label>
						<Input
							id='description'
							placeholder='Created with Spotify Playlist AI'
							value={description}
							onChange={(e) => setDescription(e.target.value)}
						/>
					</div>

					{/* Advanced Options Collapsible */}
					<Collapsible
						open={showAdvanced}
						onOpenChange={setShowAdvanced}
						className='w-full'>
						<CollapsibleTrigger asChild>
							<Button
								type='button'
								variant='outline'
								className='flex items-center justify-center w-full'>
								<Settings2 className='h-4 w-4 mr-2' />
								{showAdvanced ? 'Hide' : 'Show'} Advanced
								Options
							</Button>
						</CollapsibleTrigger>
						<CollapsibleContent className='mt-4'>
							<PlaylistSourceSelector
								onChange={handleSourceOptionsChange}
								defaultOptions={sourceOptions}
							/>
						</CollapsibleContent>
					</Collapsible>

					{/* Progress component */}
					<PlaylistGenerationProgress
						isGenerating={isGenerating}
						playlistId={createdPlaylistId}
						onComplete={handleGenerationComplete}
						processingMode={sourceOptions.processingMode}
						initialMessage={`Processing with ${sourceOptions.processingMode} mode...`}
					/>
				</CardContent>

				<CardFooter>
					<Button
						type='submit'
						className='w-full'
						disabled={isGenerating || !prompt.trim()}>
						{isGenerating ? (
							<>
								<Loader2 className='mr-2 h-4 w-4 animate-spin' />
								Generating Playlist...
							</>
						) : success ? (
							<>
								<Check className='mr-2 h-4 w-4' />
								Playlist Created!
							</>
						) : (
							'Generate Playlist'
						)}
					</Button>
				</CardFooter>
			</form>
		</Card>
	);
}
