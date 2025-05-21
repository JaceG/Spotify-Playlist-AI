import { Playlist, Track } from "@shared/schema";
import { formatDuration } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TrackList } from "./track-list";

interface PlaylistCardProps {
  playlist: Playlist;
  tracks: Track[];
  preview?: boolean;
}

export function PlaylistCard({ playlist, tracks, preview = true }: PlaylistCardProps) {
  // Format the total duration
  const totalDurationFormatted = formatDuration(playlist.duration);
  
  return (
    <Card className="bg-spotify-black rounded-lg overflow-hidden shadow-lg transition-all duration-300 hover:transform hover:-translate-y-1 hover:shadow-xl">
      {/* Playlist cover image */}
      {playlist.coverImage && (
        <div className="w-full h-48 overflow-hidden">
          <img
            src={playlist.coverImage}
            alt={`${playlist.name} playlist visualization`}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      
      <CardContent className="p-4">
        {/* Playlist header */}
        <div className="flex justify-between items-start">
          <div>
            <h3 className="font-bold text-lg">{playlist.name}</h3>
            <p className="text-sm text-spotify-light-gray">
              {playlist.tracksCount} tracks • {totalDurationFormatted}
            </p>
          </div>
          <Button className="bg-spotify-green text-black font-medium hover:bg-opacity-90 transition-colors">
            Play
          </Button>
        </div>
        
        {/* Track preview */}
        <div className="mt-4 space-y-2">
          <p className="text-sm uppercase font-bold text-spotify-light-gray">
            Tracks preview
          </p>
          
          {/* Track list */}
          <TrackList 
            tracks={tracks} 
            preview={preview} 
            maxPreviewTracks={3}
          />
        </div>
      </CardContent>
    </Card>
  );
}
