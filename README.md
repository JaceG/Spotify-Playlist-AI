# Spotify Playlist AI
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## 🎵 The Vision

Spotify Playlist AI is an application that combines the power of Spotify's vast music library with OpenAI's language capabilities to create personalized playlists based on natural language prompts. What started as an ambitious experiment in music curation evolved into a unique journey through API limitations, policy restrictions, and creative problem-solving.

## ✨ Features

- **Natural Language Playlist Generation**: Describe what you want in plain English
- **Multiple Processing Modes**: Quick, Standard, Comprehensive, or Complete modes
- **Source Selection**: Generate playlists from your liked songs, top tracks, or existing playlists
- **Real-time Progress Tracking**: Watch your playlist come together
- **Detailed Selection Information**: See why each track was chosen

## 🛠️ Technical Stack

- **Frontend**: React, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express
- **APIs**: Spotify Web API, OpenAI API
- **Authentication**: OAuth 2.0 PKCE flow for secure Spotify integration

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or later)
- A Spotify Developer account
- An OpenAI API key

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/SpotifyPlaylistAI.git
   cd SpotifyPlaylistAI
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```
   SPOTIFY_CLIENT_ID=your_spotify_client_id
   SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
   SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/auth/spotify/callback
   OPENAI_API_KEY=your_openai_api_key
   SESSION_SECRET=your_session_secret
   NODE_ENV=development
   ```

4. Update the Spotify client ID in `client/src/lib/spotify-config.ts`

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Open your browser and navigate to `http://127.0.0.1:3000`

## 📖 The Development Story

### The Inspiration

The project began with a simple question: "What if you could describe your perfect playlist and have AI create it from your music library?" I wanted to build something that understood not just genre preferences but emotional nuances, situational context, and audio characteristics.

### The Prompts That Shaped Development

During development, I used prompts like this to test the system:

```
"I want a playlist to test out my new speakers and subwoofer, give me about 20 songs that have good bass, prefferably something with a buildup to a drop like edm (prefferably house, not dubstep) and rap songs that have a thumping beat. These could be other genres as well as long as you find something that really tests the range, with a focus on bass at least some of the time"
```

These rich, descriptive prompts were intended to showcase the AI's understanding of both the emotional and technical aspects of music.

### The Technical Challenge

The core of the application involved:

1. Analyzing natural language prompts with OpenAI's GPT-4
2. Translating those descriptions into specific audio characteristics
3. Fetching user's music from Spotify (liked songs, playlists, top tracks)
4. Using Spotify's audio features API to match songs with the desired characteristics
5. Creating a new playlist with the selected tracks

### The Roadblock

During development, we encountered a significant limitation: All attempts to access Spotify's audio features API returned 403 Forbidden errors. After investigating, we discovered two critical issues:

1. The audio features endpoint was marked as deprecated in Spotify's documentation
2. Spotify's terms of service explicitly prohibit using their content for training ML/AI models

This fundamentally changed our approach. The original vision relied heavily on analyzing the detailed audio features of tracks (danceability, energy, valence, etc.) and finding precise matches for the user's prompt.

### The Pivot

Rather than abandoning the project, we pivoted to a solution that worked within Spotify's constraints:

1. We maintained the natural language prompt analysis using OpenAI
2. We implemented a fallback system using popularity-based track selection
3. We added comprehensive logging to show users why each track was selected
4. We focused on genre matching and artist preferences as primary selection criteria

The result is still useful, but represents a compromise from the original vision. Instead of precise audio feature matching, the application now prioritizes popularity and genre matching, which produces playlists that are generally relevant but lack the nuanced audio characteristic matching we originally envisioned.

## 🚧 Limitations & Learnings

### API Restrictions Matter

Spotify's decision to restrict access to audio features wasn't arbitrary - it reflects their policies around how their data can be used, particularly with AI applications. Always carefully review API terms of service before building applications that depend on specific endpoints.

### Fallbacks Are Essential

By building a robust fallback system, we were able to create a working application despite the core API limitation. The popularity-based selection method isn't as precise, but still provides value to users.

### UI Transparency Is Key

When technical limitations affect functionality, be transparent with users. Our detailed logging system shows users exactly how tracks were selected, even when the selection process isn't as sophisticated as originally planned.

## 🔮 Future Possibilities

While Spotify's current policies limit the full realization of our vision, the application demonstrates the potential for AI-assisted music curation. As streaming platforms develop their AI policies and potentially open new APIs for developers, applications like this could evolve to provide even more personalized music experiences.

## 🎯 Conclusion

Spotify Playlist AI represents both the exciting possibilities and the practical limitations of combining AI with streaming music platforms. While we couldn't achieve the full audio-characteristic matching we originally envisioned, we created a functional application that helps users discover music through natural language.

The journey taught us valuable lessons about API limitations, the importance of fallback systems, and how to adapt when core features become unavailable. Sometimes the constraints we encounter lead to creative solutions we might not have otherwise discovered.

Try it yourself, but remember - the perfect playlist might still require a human touch! 

## Contributing

Contributions, issues, and feature requests are welcome!

## Preview

![Main Page](/assets/screenshot.png)