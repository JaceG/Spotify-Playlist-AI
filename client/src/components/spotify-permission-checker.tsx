import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { getValidAccessToken } from '@/lib/fixed-auth';

export function SpotifyPermissionChecker() {
	const [isChecking, setIsChecking] = useState(false);
	const [result, setResult] = useState<{
		success?: boolean;
		message?: string;
		userId?: string;
		canCreatePlaylists?: boolean;
		error?: string;
	} | null>(null);

	const checkPermissions = async () => {
		setIsChecking(true);
		setResult(null);

		try {
			// Get a valid access token
			const token = await getValidAccessToken();

			if (!token) {
				setResult({
					success: false,
					message:
						'No valid access token found. Please log in to Spotify.',
				});
				return;
			}

			// Call our test endpoint
			const response = await fetch('/api/spotify/test-permissions', {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			});

			if (!response.ok) {
				throw new Error(
					`Server responded with status: ${response.status}`
				);
			}

			const data = await response.json();
			setResult(data);
		} catch (error: any) {
			console.error('Error checking permissions:', error);
			setResult({
				success: false,
				message: 'Error checking permissions',
				error: error.message,
			});
		} finally {
			setIsChecking(false);
		}
	};

	return (
		<div className='space-y-4'>
			<Button
				onClick={checkPermissions}
				disabled={isChecking}
				variant='outline'>
				{isChecking ? (
					<>
						<Loader2 className='mr-2 h-4 w-4 animate-spin' />
						Checking Permissions...
					</>
				) : (
					'Check Spotify Permissions'
				)}
			</Button>

			{result && (
				<Alert variant={result.success ? 'default' : 'destructive'}>
					<div className='flex items-start'>
						{result.success ? (
							<ShieldCheck className='h-5 w-5 mr-2 text-green-500' />
						) : (
							<ShieldAlert className='h-5 w-5 mr-2' />
						)}
						<div>
							<AlertTitle>
								{result.success
									? 'Permissions Verified'
									: 'Permission Error'}
							</AlertTitle>
							<AlertDescription className='mt-2 space-y-2'>
								<p>{result.message}</p>
								{result.userId && (
									<p className='text-sm text-muted-foreground'>
										User ID: {result.userId}
									</p>
								)}
								{result.canCreatePlaylists !== undefined && (
									<p className='font-medium'>
										Can create playlists:{' '}
										{result.canCreatePlaylists
											? 'Yes ✓'
											: 'No ✗'}
									</p>
								)}
								{result.error && (
									<p className='text-sm text-red-500'>
										Error: {result.error}
									</p>
								)}
							</AlertDescription>
						</div>
					</div>
				</Alert>
			)}
		</div>
	);
}
