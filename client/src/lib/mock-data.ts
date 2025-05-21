export const coverImages = [
  "https://images.unsplash.com/photo-1514525253161-7a46d19cd819",
  "https://images.unsplash.com/photo-1614680376573-df3480f0c6ff",
  "https://images.unsplash.com/photo-1518609878373-06d740f60d8b",
  "https://images.unsplash.com/photo-1496337589254-7e19d01cec44",
  "https://images.unsplash.com/photo-1458560871784-56d23406c091",
  "https://images.unsplash.com/photo-1566554273541-37a9ca77b91f",
  "https://images.unsplash.com/photo-1511379938547-c1f69419868d"
];

export const suggestedPlaylists = [
  {
    type: "workout",
    name: "Workout Energy Boost",
    description: "High-energy tracks to power through your workout"
  },
  {
    type: "chill",
    name: "Evening Serenity",
    description: "Calm, ambient tracks for relaxation"
  },
  {
    type: "focus",
    name: "Deep Focus",
    description: "Instrumental tracks to help you concentrate"
  },
  {
    type: "party",
    name: "Party Mix",
    description: "Upbeat tracks to get the party started"
  }
];

export const welcomeSuggestions = [
  "Create a workout playlist with upbeat songs",
  "Make me a relaxing playlist for the evening",
  "I need a focus playlist for studying",
  "Generate a party mix for this weekend"
];

export function getRandomCoverImage() {
  return coverImages[Math.floor(Math.random() * coverImages.length)];
}
