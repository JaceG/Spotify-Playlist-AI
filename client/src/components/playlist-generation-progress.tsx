import { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, RefreshCw, Check, AlertCircle } from 'lucide-react';
import { getValidAccessToken } from '@/lib/fixed-auth';

export interface GenerationProgress {
	stage: string;
	progress: number;
	message: string;
	remainingTimeEstimate: number;
}

interface PlaylistGenerationProgressProps {
	playlistId?: string;
	isGenerating: boolean;
	onComplete?: () => void;
	initialMessage?: string;
	processingMode?: string;
}

export function PlaylistGenerationProgress({
	playlistId,
	isGenerating,
	onComplete,
	initialMessage = 'Preparing to generate...',
	processingMode = 'standard',
}: PlaylistGenerationProgressProps) {
	const [progress, setProgress] = useState<GenerationProgress>({
		stage: 'preparing',
		progress: 0,
		message: initialMessage,
		remainingTimeEstimate: 60,
	});
	const [error, setError] = useState<string | null>(null);
	const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(
		null
	);

	// Reset progress when generating starts
	useEffect(() => {
		if (isGenerating) {
			setProgress({
				stage: 'preparing',
				progress: 0,
				message: `Processing with ${processingMode} mode...`,
				remainingTimeEstimate: getEstimatedTimeForMode(processingMode),
			});
			setError(null);
		}
	}, [isGenerating, processingMode]);

	// Poll for real progress updates if we have a playlist ID
	useEffect(() => {
		if (isGenerating && playlistId) {
			// Start polling for progress
			pollForProgress();

			// Cleanup function to clear interval
			return () => {
				if (pollInterval) {
					clearInterval(pollInterval);
				}
			};
		}
	}, [isGenerating, playlistId]);

	// Function to estimate time based on processing mode
	const getEstimatedTimeForMode = (mode: string): number => {
		switch (mode) {
			case 'quick':
				return 30;
			case 'standard':
				return 60;
			case 'comprehensive':
				return 120;
			case 'complete':
				return 300;
			default:
				return 60;
		}
	};

	// Function to poll for progress updates
	const pollForProgress = async () => {
		if (!playlistId) return;

		// Clear existing interval if any
		if (pollInterval) {
			clearInterval(pollInterval);
		}

		// Setup polling
		const interval = setInterval(async () => {
			try {
				const token = await getValidAccessToken();

				if (!token) return;

				const response = await fetch(
					`/api/ai/generate-playlist/progress?playlistId=${playlistId}`,
					{
						headers: {
							Authorization: `Bearer ${token}`,
						},
					}
				);

				if (!response.ok) {
					throw new Error('Failed to fetch progress');
				}

				const data = await response.json();
				console.log('Progress update:', data);

				// Update progress state
				if (data.progress) {
					setProgress(data.progress);
				}

				// Check if complete
				if (
					data.progress?.progress === 100 ||
					data.progress?.stage === 'complete'
				) {
					clearInterval(interval);
					if (onComplete) {
						onComplete();
					}
				}
			} catch (error) {
				console.error('Error fetching progress:', error);
				// Don't clear interval on error, just log it
			}
		}, 2000);

		setPollInterval(interval);
	};

	// Since we might not have real progress updates yet, this is our fallback
	useEffect(() => {
		if (!isGenerating || playlistId) {
			return; // Don't simulate if we're not generating or if we have a real playlist ID
		}

		let intervalId: NodeJS.Timeout;

		// Simulate progress updates
		const simulateProgress = () => {
			const stages = [
				{
					stage: 'analyzing',
					message: 'Analyzing your prompt...',
					progress: 10,
				},
				{
					stage: 'collecting',
					message: 'Collecting tracks from your library...',
					progress: 30,
				},
				{
					stage: 'processing',
					message: 'Processing audio features...',
					progress: 50,
				},
				{
					stage: 'selecting',
					message: 'Selecting the best tracks...',
					progress: 70,
				},
				{
					stage: 'finalizing',
					message: 'Creating your playlist...',
					progress: 90,
				},
				{
					stage: 'complete',
					message: 'Playlist created successfully!',
					progress: 100,
				},
			];

			let currentStageIndex = 0;

			intervalId = setInterval(() => {
				if (currentStageIndex < stages.length) {
					const currentStage = stages[currentStageIndex];
					setProgress({
						...currentStage,
						remainingTimeEstimate: Math.max(
							0,
							getEstimatedTimeForMode(processingMode) -
								currentStage.progress / 2
						),
					});
					currentStageIndex++;

					if (currentStageIndex === stages.length) {
						clearInterval(intervalId);
						if (onComplete) {
							setTimeout(onComplete, 1000); // Delay to show 100%
						}
					}
				}
			}, 2000); // Update every 2 seconds
		};

		simulateProgress();

		// Cleanup
		return () => {
			if (intervalId) {
				clearInterval(intervalId);
			}
		};
	}, [isGenerating, onComplete, playlistId, processingMode]);

	// Function to format remaining time
	const formatRemainingTime = (seconds: number): string => {
		if (seconds < 60) {
			return `${Math.max(0, Math.ceil(seconds))} seconds remaining`;
		} else {
			const minutes = Math.floor(seconds / 60);
			const remainingSeconds = Math.ceil(seconds % 60);
			return `${minutes} min ${remainingSeconds} sec remaining`;
		}
	};

	// Get stage icon
	const getStageIcon = () => {
		switch (progress.stage) {
			case 'complete':
				return <Check className='h-5 w-5 text-green-500' />;
			case 'error':
				return <AlertCircle className='h-5 w-5 text-red-500' />;
			case 'analyzing':
				return (
					<RefreshCw className='h-5 w-5 animate-spin text-blue-500' />
				);
			default:
				return <Loader2 className='h-5 w-5 animate-spin' />;
		}
	};

	if (!isGenerating && progress.progress < 100 && !error) {
		return null;
	}

	return (
		<Card className='w-full mt-4'>
			<CardContent className='pt-6'>
				<div className='space-y-4'>
					<div className='flex items-center justify-between'>
						<div className='flex items-center space-x-2'>
							{getStageIcon()}
							<span className='font-medium capitalize'>
								{progress.stage}
							</span>
						</div>
						<span className='text-sm text-muted-foreground'>
							{progress.progress < 100 &&
								!error &&
								formatRemainingTime(
									progress.remainingTimeEstimate
								)}
							{progress.progress === 100 && 'Complete!'}
							{error && 'Error'}
						</span>
					</div>

					<Progress value={progress.progress} className='h-2' />

					<p className='text-sm text-center text-muted-foreground'>
						{error || progress.message}
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
