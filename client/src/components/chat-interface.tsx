import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { User, ChatMessage } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CircleHelp, RefreshCcw, Forward } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { ChatMessageComponent } from "./chat-message";
import { Skeleton } from "@/components/ui/skeleton";
import { useChat } from "@/hooks/use-chat";

interface ChatInterfaceProps {
  user: User | null;
}

export function ChatInterface({ user }: ChatInterfaceProps) {
  const [inputValue, setInputValue] = useState("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const { messages, isLoading: chatLoading, sendMessage } = useChat();

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input on component mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && user) {
      sendMessage(inputValue);
      setInputValue("");
    }
  };

  const handleSuggestedPrompt = (prompt: string) => {
    if (user) {
      sendMessage(prompt);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="bg-spotify-black bg-opacity-90 py-4 px-6 flex items-center justify-between shadow-md sticky top-0 z-10">
        <div className="flex items-center">
          <h2 className="text-xl font-bold">Spotify Playlist AI</h2>
        </div>
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:text-spotify-green transition-colors"
          >
            <CircleHelp className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:text-spotify-green transition-colors"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/chat"] })}
          >
            <RefreshCcw className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Chat messages area */}
      <div
        ref={scrollAreaRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide"
      >
        {chatLoading ? (
          // Loading skeleton
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-start space-x-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-24 w-64 rounded-2xl" />
              </div>
            </div>
          ))
        ) : messages.length > 0 ? (
          // Render messages
          messages.map((message) => (
            <ChatMessageComponent
              key={message.id}
              message={message}
              user={user}
            />
          ))
        ) : (
          // Welcome message when no messages exist
          <div className="flex items-start space-x-3 animate-fade-in">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-spotify-green flex items-center justify-center">
              <span className="text-xl text-black font-bold">S</span>
            </div>
            <div className="bg-spotify-gray bg-opacity-30 rounded-2xl rounded-tl-none p-4 max-w-3xl">
              <p className="text-white">
                👋 Welcome to Spotify Playlist AI! I can analyze your music taste and
                create personalized playlists for you. What kind of playlist would you
                like to create today?
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full bg-spotify-black text-white border-none hover:bg-spotify-gray"
                  onClick={() => handleSuggestedPrompt("Create a workout playlist with upbeat songs")}
                >
                  Workout playlist
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full bg-spotify-black text-white border-none hover:bg-spotify-gray"
                  onClick={() => handleSuggestedPrompt("Create a chill playlist for relaxation")}
                >
                  Chill vibes
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full bg-spotify-black text-white border-none hover:bg-spotify-gray"
                  onClick={() => handleSuggestedPrompt("Create a focus playlist for studying")}
                >
                  Study focus
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full bg-spotify-black text-white border-none hover:bg-spotify-gray"
                  onClick={() => handleSuggestedPrompt("Create an upbeat party mix")}
                >
                  Party mix
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-spotify-gray border-opacity-30 p-4 sticky bottom-0 bg-spotify-dark">
        <div className="max-w-4xl mx-auto">
          <form className="flex items-center gap-4" onSubmit={handleSubmit}>
            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                type="text"
                placeholder="Ask Spotify AI to create a playlist..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="bg-spotify-black py-6 px-4 rounded-full focus:outline-none focus:ring-2 focus:ring-spotify-green"
              />
            </div>
            <Button
              type="submit"
              size="icon"
              disabled={!inputValue.trim() || !user}
              className="bg-spotify-green text-black p-3 rounded-full hover:bg-opacity-90 transition-colors flex-shrink-0 h-12 w-12"
            >
              <Forward className="h-5 w-5" />
            </Button>
          </form>
          <div className="mt-2 text-xs text-spotify-light-gray text-center">
            AI-powered playlist generation based on your music taste and preferences.
          </div>
        </div>
      </div>
    </div>
  );
}
