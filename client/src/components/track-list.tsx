import { Track } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/utils";
import { useState } from "react";

interface TrackListProps {
  tracks: Track[];
  preview?: boolean;
  maxPreviewTracks?: number;
}

export function TrackList({ 
  tracks, 
  preview = true, 
  maxPreviewTracks = 3 
}: TrackListProps) {
  const [showAllTracks, setShowAllTracks] = useState(!preview);
  
  const displayTracks = showAllTracks
    ? tracks
    : tracks.slice(0, maxPreviewTracks);
  
  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {displayTracks.map((track, index) => (
          <div
            key={track.id || index}
            className="flex items-center justify-between py-2 hover:bg-spotify-gray hover:bg-opacity-20 transition-colors rounded px-2"
          >
            <div className="flex items-center">
              <span className="w-6 text-center text-spotify-light-gray">
                {index + 1}
              </span>
              <div className="ml-3">
                <p className="font-medium">{track.title}</p>
                <p className="text-xs text-spotify-light-gray">{track.artist}</p>
              </div>
            </div>
            <span className="text-sm text-spotify-light-gray">
              {formatDuration(track.duration)}
            </span>
          </div>
        ))}
      </div>

      {preview && tracks.length > maxPreviewTracks && !showAllTracks && (
        <Button
          variant="ghost"
          onClick={() => setShowAllTracks(true)}
          className="w-full text-center text-spotify-light-gray text-sm hover:text-white transition-colors mt-2"
        >
          View all tracks
        </Button>
      )}
      
      {preview && tracks.length > maxPreviewTracks && showAllTracks && (
        <Button
          variant="ghost"
          onClick={() => setShowAllTracks(false)}
          className="w-full text-center text-spotify-light-gray text-sm hover:text-white transition-colors mt-2"
        >
          Show less
        </Button>
      )}
    </div>
  );
}
