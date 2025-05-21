import passport from 'passport';
import { Strategy as SpotifyStrategy } from 'passport-spotify';
import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import User from '../models/User';
import { IUser } from '../models/User';

dotenv.config();

// Setup passport for Spotify authentication
export const setupSpotifyAuth = (app: express.Express) => {
	// Check if we should use PKCE (client-side auth) instead of server-side auth
	const usePKCE = process.env.NODE_ENV === 'development';

	if (usePKCE) {
		console.log('Using flexible authentication - Development mode');
		// In development mode with PKCE, we only initialize passport but don't set up routes
		app.use(passport.initialize());
		return;
	}

	// Only set up full server-side OAuth if not using PKCE
	console.log('Using server-side authentication - Production mode');

	// Configure Spotify strategy
	passport.use(
		new SpotifyStrategy(
			{
				clientID: process.env.SPOTIFY_CLIENT_ID || '',
				clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
				callbackURL: process.env.SPOTIFY_REDIRECT_URI || '',
				scope: [
					'user-read-email',
					'user-read-private',
					'playlist-read-private',
					'playlist-read-collaborative',
					'playlist-modify-public',
					'playlist-modify-private',
					'user-library-read',
				],
			},
			async (accessToken, refreshToken, expires_in, profile, done) => {
				try {
					// Calculate token expiration
					const tokenExpiration = new Date();
					tokenExpiration.setSeconds(
						tokenExpiration.getSeconds() + expires_in
					);

					// Find or create user
					let user = await User.findOne({ spotifyId: profile.id });

					if (user) {
						// Update existing user with new tokens
						user.accessToken = accessToken;
						user.refreshToken = refreshToken;
						user.tokenExpiration = tokenExpiration;
						user.updatedAt = new Date();
						await user.save();
					} else {
						// Create new user
						user = await User.create({
							spotifyId: profile.id,
							username: profile.username || profile.displayName,
							displayName: profile.displayName,
							email: profile.emails?.[0]?.value || '',
							profileImage: profile.photos?.[0]?.value || '',
							isPremium: profile._json.product === 'premium',
							accessToken,
							refreshToken,
							tokenExpiration,
						});
					}

					return done(null, user);
				} catch (error) {
					return done(error as Error);
				}
			}
		)
	);

	// Serialize user to session
	passport.serializeUser((user: any, done) => {
		done(null, user.id);
	});

	// Deserialize user from session
	passport.deserializeUser(async (id: string, done) => {
		try {
			const user = await User.findById(id);
			done(null, user);
		} catch (error) {
			done(error);
		}
	});

	// Initialize passport
	app.use(passport.initialize());
	app.use(passport.session());

	// Authentication routes
	app.get('/auth/spotify', passport.authenticate('spotify'));

	app.get(
		'/auth/spotify/callback',
		passport.authenticate('spotify', { failureRedirect: '/' }),
		(req: Request, res: Response) => {
			// Successfully authenticated with Spotify
			console.log('Spotify authentication successful');

			// Get the authenticated user
			const user: any = req.user;
			if (user) {
				console.log('User successfully authenticated:', user.spotifyId);
				console.log('Access token available:', !!user.accessToken);
				console.log('Token expiration:', user.tokenExpiration);
			}

			// Set a session flag
			if (req.session) {
				req.session.spotifyAuthenticated = true;
				req.session.save((err) => {
					if (err) {
						console.error('Error saving session:', err);
					} else {
						console.log('Session saved successfully');
					}
				});
			}

			// Add debug output to show auth state
			console.log('Authenticated: ', req.isAuthenticated());
			console.log('User:', req.user ? 'User exists' : 'No user');

			// Successful authentication, redirect to home page
			res.redirect('/?spotify_auth=success');
		}
	);

	app.get('/auth/logout', (req: Request, res: Response) => {
		req.logout(() => {
			res.redirect('/');
		});
	});

	// Add a status endpoint to check authentication
	app.get('/auth/spotify/status', (req: Request, res: Response) => {
		if (req.isAuthenticated() && req.user) {
			res.json({
				authenticated: true,
				user: req.user,
			});
		} else {
			res.json({
				authenticated: false,
			});
		}
	});

	// Allow all access to Spotify endpoints for development purposes
	// In production, you would add authentication checks back
};

// Check if user is authenticated
export const isAuthenticated = (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	if (req.isAuthenticated()) {
		return next();
	}
	res.status(401).json({
		message: 'Unauthorized - Please log in with Spotify',
	});
};
