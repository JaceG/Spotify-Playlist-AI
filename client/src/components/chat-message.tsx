import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { User, ChatMessage as ChatMessageType } from "@shared/schema";
import { UserAvatar } from "./user-avatar";
import { PlaylistCard } from "./playlist-card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

interface ChatMessageProps {
  message: ChatMessageType;
  user: User | null;
}

export function ChatMessageComponent({ message, user }: ChatMessageProps) {
  const [isGeneratingPlaylist, setIsGeneratingPlaylist] = useState(false);
  const [generatedPlaylist, setGeneratedPlaylist] = useState<any>(null);
  const [playlistType, setPlaylistType] = useState<string | null>(null);
  const isUserMessage = message.isUserMessage;
  
  // Check if message content contains a playlist request
  useEffect(() => {
    if (!isUserMessage && !generatedPlaylist) {
      const content = message.content.toLowerCase();
      const workoutTerms = ["workout", "exercise", "gym", "fitness"];
      const chillTerms = ["chill", "relax", "calm", "evening", "peace"];
      const focusTerms = ["focus", "study", "concentration", "work"];
      const partyTerms = ["party", "dance", "celebration", "fun"];
      
      if (workoutTerms.some(term => content.includes(term))) {
        setPlaylistType("workout");
      } else if (chillTerms.some(term => content.includes(term))) {
        setPlaylistType("chill");
      } else if (focusTerms.some(term => content.includes(term))) {
        setPlaylistType("focus");
      } else if (partyTerms.some(term => content.includes(term))) {
        setPlaylistType("party");
      }
    }
  }, [message, isUserMessage, generatedPlaylist]);
  
  const generatePlaylist = async () => {
    if (!playlistType || !user) return;
    
    setIsGeneratingPlaylist(true);
    try {
      const response = await apiRequest("POST", "/api/chat/generate-playlist", {
        description: message.content,
        type: playlistType
      });
      
      const data = await response.json();
      setGeneratedPlaylist(data);
      queryClient.invalidateQueries({ queryKey: ["/api/playlists/ai"] });
    } catch (error) {
      console.error("Failed to generate playlist:", error);
    } finally {
      setIsGeneratingPlaylist(false);
    }
  };
  
  if (isUserMessage) {
    return (
      <div className="flex items-start justify-end space-x-3 animate-fade-in">
        <div className="bg-user-message rounded-2xl rounded-tr-none p-4 max-w-3xl">
          <p>{message.content}</p>
        </div>
        <div className="flex-shrink-0">
          {user && <UserAvatar user={user} />}
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex items-start space-x-3 animate-fade-in">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-spotify-green flex items-center justify-center">
        <span className="text-black font-bold">S</span>
      </div>
      <div className="bg-spotify-gray bg-opacity-30 rounded-2xl rounded-tl-none p-4 max-w-3xl">
        <p className="text-white">{message.content}</p>
        
        {playlistType && !generatedPlaylist && (
          <div className="mt-4">
            {isGeneratingPlaylist ? (
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-spotify-green rounded-full animate-pulse"></div>
                <div className="w-2 h-2 bg-spotify-green rounded-full animate-pulse" style={{ animationDelay: "0.2s" }}></div>
                <div className="w-2 h-2 bg-spotify-green rounded-full animate-pulse" style={{ animationDelay: "0.4s" }}></div>
                <span className="ml-2 text-sm text-spotify-light-gray">Creating playlist...</span>
              </div>
            ) : (
              <Button
                className="bg-spotify-green text-black hover:bg-opacity-90 transition-colors mt-2"
                onClick={generatePlaylist}
              >
                Generate Playlist
              </Button>
            )}
          </div>
        )}
        
        {generatedPlaylist && (
          <div className="mt-4">
            <PlaylistCard 
              playlist={generatedPlaylist.playlist} 
              tracks={generatedPlaylist.tracks}
            />
          </div>
        )}
      </div>
    </div>
  );
}
