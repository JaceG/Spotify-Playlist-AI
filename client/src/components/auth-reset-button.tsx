import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCcw } from 'lucide-react';
import { clearTokens } from '@/lib/fixed-auth';
import { useToast } from '@/hooks/use-toast';

export function AuthResetButton() {
	const [isResetting, setIsResetting] = useState(false);
	const { toast } = useToast();

	const handleReset = async () => {
		setIsResetting(true);

		try {
			// 1. Clear all localStorage tokens
			clearTokens();

			// 2. Try to revoke app permissions at Spotify (will redirect user to Spotify)
			// This forces them to completely reapprove all permissions
			window.open('https://www.spotify.com/account/apps/', '_blank');

			toast({
				title: 'Authorization Reset',
				description:
					'Local tokens cleared. Please also revoke app access on Spotify and reconnect.',
				duration: 10000,
			});

			// 3. Force reload the application after a short delay
			setTimeout(() => {
				window.location.reload();
			}, 2000);
		} catch (error) {
			console.error('Error during auth reset:', error);
			toast({
				title: 'Reset Error',
				description:
					'There was a problem resetting authorization. Please try again.',
				variant: 'destructive',
			});
		} finally {
			setIsResetting(false);
		}
	};

	return (
		<Button
			variant='outline'
			size='sm'
			onClick={handleReset}
			disabled={isResetting}
			className='flex items-center space-x-2 text-red-500 border-red-300 hover:bg-red-50 hover:text-red-600'>
			<RefreshCcw className='h-4 w-4' />
			<span>Reset Auth</span>
		</Button>
	);
}
