import express, { type Request, Response, NextFunction } from 'express';
import session from 'express-session';
import { registerRoutes } from './routes';
import { setupVite, serveStatic, log } from './vite';
import { connectToDatabase } from './config/database';
import { setupSpotifyAuth } from './auth/spotify-auth';
import spotifyRoutes from './routes/spotify-routes';
import aiRoutes from './routes/ai-routes';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectToDatabase();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Configure session
app.use(
	session({
		secret: process.env.SESSION_SECRET || 'your_session_secret_here',
		resave: false,
		saveUninitialized: false,
		cookie: {
			secure: process.env.NODE_ENV === 'production',
			maxAge: 24 * 60 * 60 * 1000, // 24 hours
		},
	})
);

// Setup Spotify authentication
setupSpotifyAuth(app);

// Register Spotify API routes
app.use('/api/spotify', spotifyRoutes);
app.use('/api/ai', aiRoutes);

app.use((req, res, next) => {
	const start = Date.now();
	const path = req.path;
	let capturedJsonResponse: Record<string, any> | undefined = undefined;

	const originalResJson = res.json;
	res.json = function (bodyJson, ...args) {
		capturedJsonResponse = bodyJson;
		return originalResJson.apply(res, [bodyJson, ...args]);
	};

	res.on('finish', () => {
		const duration = Date.now() - start;
		if (path.startsWith('/api')) {
			let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
			if (capturedJsonResponse) {
				logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
			}

			if (logLine.length > 80) {
				logLine = logLine.slice(0, 79) + '…';
			}

			log(logLine);
		}
	});

	next();
});

(async () => {
	const server = await registerRoutes(app);

	app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
		const status = err.status || err.statusCode || 500;
		const message = err.message || 'Internal Server Error';

		res.status(status).json({ message });
		throw err;
	});

	// importantly only setup vite in development and after
	// setting up all the other routes so the catch-all route
	// doesn't interfere with the other routes
	if (app.get('env') === 'development') {
		await setupVite(app, server);
	} else {
		serveStatic(app);
	}

	// ALWAYS serve the app on port 5000
	// this serves both the API and the client.
	// It is the only port that is not firewalled.
	const port = 3000;
	server.listen(
		{
			port,
			host: '0.0.0.0',
			reusePort: true,
		},
		() => {
			log(`serving on port ${port}`);
		}
	);
})();
