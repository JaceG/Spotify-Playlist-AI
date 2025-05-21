import { Sidebar } from '@/components/sidebar';
import { ChatInterface } from '@/components/chat-interface';
import { AIPlaylistGenerator } from '@/components/ai-playlist-generator';
import { SpotifyPermissionChecker } from '@/components/spotify-permission-checker';
import { useQuery } from '@tanstack/react-query';
import { User } from '@shared/schema';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, PlayCircle } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export default function Home() {
	// Fetch user data
	const { data: user, isLoading: isUserLoading } = useQuery<User>({
		queryKey: ['/api/user'],
	});

	const [activeTab, setActiveTab] = useState('chat');
	const { toast } = useToast();

	const handlePlaylistCreated = (playlistId: string) => {
		toast({
			title: 'Success!',
			description:
				'Your new playlist is ready. Check your Spotify account to listen.',
		});
		// Optionally navigate to the playlist
		// window.open(`https://open.spotify.com/playlist/${playlistId}`, '_blank');
	};

	return (
		<div className='flex h-screen overflow-hidden'>
			{/* Sidebar component */}
			<Sidebar user={user || null} isLoading={isUserLoading} />

			{/* Main content area */}
			<main className='flex-1 lg:ml-64 relative h-full overflow-hidden'>
				<Tabs
					value={activeTab}
					onValueChange={setActiveTab}
					className='h-full flex flex-col'>
					<div className='flex justify-center border-b'>
						<TabsList className='my-3'>
							<TabsTrigger
								value='chat'
								className='flex items-center gap-2'>
								<MessageSquare className='h-4 w-4' />
								<span>Chat</span>
							</TabsTrigger>
							<TabsTrigger
								value='generator'
								className='flex items-center gap-2'>
								<PlayCircle className='h-4 w-4' />
								<span>Playlist Generator</span>
							</TabsTrigger>
						</TabsList>
					</div>

					<TabsContent
						value='chat'
						className='flex-1 overflow-hidden m-0 border-0'>
						<ChatInterface user={user || null} />
					</TabsContent>

					<TabsContent
						value='generator'
						className='flex-1 overflow-auto m-0 border-0 p-4'>
						<div className='max-w-3xl mx-auto'>
							<h1 className='text-2xl font-bold mb-6'>
								AI Playlist Generator
							</h1>
							<p className='text-muted-foreground mb-6'>
								Describe your perfect playlist in natural
								language and our AI will create it for you from
								your Spotify library. Try prompts like "songs
								for running" or "bass-heavy tracks for testing
								speakers".
							</p>

							<div className='mb-8'>
								<h2 className='text-lg font-medium mb-4'>
									Check Spotify Permissions
								</h2>
								<p className='text-sm text-muted-foreground mb-4'>
									If you're having trouble creating playlists,
									check if your Spotify account has the
									required permissions. If permissions are
									missing, use the "Reset Auth" button in the
									sidebar and reconnect to Spotify.
								</p>
								<SpotifyPermissionChecker />
							</div>

							<AIPlaylistGenerator
								onPlaylistCreated={handlePlaylistCreated}
							/>
						</div>
					</TabsContent>
				</Tabs>
			</main>
		</div>
	);
}
