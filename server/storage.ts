import { 
  users, 
  playlists, 
  tracks, 
  chatMessages,
  type User, 
  type InsertUser,
  type Playlist,
  type InsertPlaylist,
  type Track,
  type InsertTrack,
  type ChatMessage,
  type InsertChatMessage
} from "@shared/schema";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Playlist operations
  getPlaylists(userId: number): Promise<Playlist[]>;
  getPlaylist(id: number): Promise<Playlist | undefined>;
  getAIGeneratedPlaylists(userId: number): Promise<Playlist[]>;
  getUserPlaylists(userId: number): Promise<Playlist[]>;
  createPlaylist(playlist: InsertPlaylist): Promise<Playlist>;
  
  // Track operations
  getTracksByPlaylist(playlistId: number): Promise<Track[]>;
  createTrack(track: InsertTrack): Promise<Track>;
  
  // Chat operations
  getChatHistory(userId: number, limit?: number): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private playlists: Map<number, Playlist>;
  private tracks: Map<number, Track>;
  private chatMessages: Map<number, ChatMessage>;
  private userId: number;
  private playlistId: number;
  private trackId: number;
  private chatMessageId: number;

  constructor() {
    this.users = new Map();
    this.playlists = new Map();
    this.tracks = new Map();
    this.chatMessages = new Map();
    this.userId = 1;
    this.playlistId = 1;
    this.trackId = 1;
    this.chatMessageId = 1;
    
    // Create a demo user
    this.createUser({
      username: "demo",
      password: "password",
      displayName: "Sarah Johnson",
      profileImage: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=60&h=60",
      isPremium: true
    });
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userId++;
    const user: User = { 
      ...insertUser, 
      id,
      displayName: insertUser.displayName ?? null,
      profileImage: insertUser.profileImage ?? null,
      isPremium: insertUser.isPremium ?? null
    };
    this.users.set(id, user);
    return user;
  }
  
  // Playlist operations
  async getPlaylists(userId: number): Promise<Playlist[]> {
    return Array.from(this.playlists.values()).filter(
      (playlist) => playlist.userId === userId,
    );
  }
  
  async getPlaylist(id: number): Promise<Playlist | undefined> {
    return this.playlists.get(id);
  }
  
  async getAIGeneratedPlaylists(userId: number): Promise<Playlist[]> {
    return Array.from(this.playlists.values()).filter(
      (playlist) => playlist.userId === userId && playlist.isAIGenerated,
    );
  }
  
  async getUserPlaylists(userId: number): Promise<Playlist[]> {
    return Array.from(this.playlists.values()).filter(
      (playlist) => playlist.userId === userId && !playlist.isAIGenerated,
    );
  }
  
  async createPlaylist(insertPlaylist: InsertPlaylist): Promise<Playlist> {
    const id = this.playlistId++;
    const now = new Date();
    const playlist: Playlist = { 
      ...insertPlaylist, 
      id, 
      createdAt: now,
      coverImage: insertPlaylist.coverImage ?? null,
      description: insertPlaylist.description ?? null,
      isAIGenerated: insertPlaylist.isAIGenerated ?? null,
      tracksCount: insertPlaylist.tracksCount ?? null,
      duration: insertPlaylist.duration ?? null
    };
    this.playlists.set(id, playlist);
    return playlist;
  }
  
  // Track operations
  async getTracksByPlaylist(playlistId: number): Promise<Track[]> {
    return Array.from(this.tracks.values()).filter(
      (track) => track.playlistId === playlistId,
    );
  }
  
  async createTrack(insertTrack: InsertTrack): Promise<Track> {
    const id = this.trackId++;
    const track: Track = { 
      ...insertTrack, 
      id,
      duration: insertTrack.duration ?? null,
      albumArt: insertTrack.albumArt ?? null
    };
    this.tracks.set(id, track);
    return track;
  }
  
  // Chat operations
  async getChatHistory(userId: number, limit: number = 50): Promise<ChatMessage[]> {
    return Array.from(this.chatMessages.values())
      .filter((message) => message.userId === userId)
      .sort((a, b) => {
        const aTime = a.timestamp ? a.timestamp.getTime() : 0;
        const bTime = b.timestamp ? b.timestamp.getTime() : 0;
        return aTime - bTime;
      })
      .slice(-limit);
  }
  
  async createChatMessage(insertMessage: InsertChatMessage): Promise<ChatMessage> {
    const id = this.chatMessageId++;
    const now = new Date();
    const message: ChatMessage = { 
      ...insertMessage, 
      id, 
      timestamp: now,
      isUserMessage: insertMessage.isUserMessage ?? null
    };
    this.chatMessages.set(id, message);
    return message;
  }
}

export const storage = new MemStorage();
