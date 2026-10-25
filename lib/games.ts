export interface GameMeta {
  id: string;
  displayName: string;
  tagline: string;
  minPlayers: number;
  maxPlayers: number;
  accent: string;
  tag: string;
  tilt: string;
}

export const GAME_META: GameMeta[] = [
  { id: 'sculptionary', displayName: 'Sculptionary', tagline: 'Sculpt it in 3D, shout the word', minPlayers: 3, maxPlayers: 8, accent: '#FF6B35', tag: '3D!', tilt: '-3deg' },
  { id: 'werewolf', displayName: 'Werewolf', tagline: 'Night falls. Trust no one.', minPlayers: 4, maxPlayers: 8, accent: '#5B2A86', tag: '🐺', tilt: '2deg' },
  { id: 'trivia', displayName: 'Trivia Podiums', tagline: 'Buzz fast, shine bright', minPlayers: 2, maxPlayers: 8, accent: '#FFC53D', tag: '🎙️', tilt: '2deg' },
  { id: 'tag', displayName: 'Tag Arena', tagline: 'Run. Tag. Survive 60 seconds.', minPlayers: 2, maxPlayers: 8, accent: '#38BDF8', tag: '🏃', tilt: '3deg' },
  { id: 'quickdraw', displayName: 'Quick Draw Duel', tagline: 'Best of 5. React to GO!', minPlayers: 2, maxPlayers: 2, accent: '#FFC53D', tag: '⚡', tilt: '-2deg' },
  { id: 'tugofwar', displayName: 'Tug of War', tagline: 'Rapid tap. Pull to your side.', minPlayers: 2, maxPlayers: 2, accent: '#FF6B35', tag: '💪', tilt: '-3deg' },
  { id: 'fogduel', displayName: 'Fog Duel', tagline: '3D battleship. Hide fleet. Hunt theirs.', minPlayers: 2, maxPlayers: 2, accent: '#38BDF8', tag: '🚢', tilt: '2deg' },
  { id: 'truthordare', displayName: 'Truth or Dare', tagline: 'Confess or commit. No in-between.', minPlayers: 3, maxPlayers: 8, accent: '#FF6B35', tag: '🔥', tilt: '-2deg' },
  { id: 'movietrivia', displayName: 'Movie Trivia', tagline: 'Lights, camera, buzz in!', minPlayers: 2, maxPlayers: 8, accent: '#FFC53D', tag: '🎬', tilt: '3deg' },
];

export const GAME_META_MAP = Object.fromEntries(GAME_META.map((g) => [g.id, g]));