const ADJECTIVES = [
  'Anonymous', 'Silent', 'Quiet', 'Peaceful', 'Calm', 'Gentle',
  'Mystery', 'Hidden', 'Secret', 'Unknown', 'Shadow', 'Ghost',
  'Lone', 'Solo', 'Free', 'Wild', 'Brave', 'Bold',
  'Kind', 'Warm', 'Cool', 'Swift', 'Bright', 'Dark',
  'Lost', 'Found', 'Seeking', 'Wandering', 'Dreaming', 'Hoping'
];

const NOUNS = [
  'Soul', 'Spirit', 'Heart', 'Mind', 'Voice', 'Echo',
  'Stranger', 'Friend', 'Traveler', 'Wanderer', 'Seeker', 'Dreamer',
  'Star', 'Moon', 'Sun', 'Sky', 'Cloud', 'Rain',
  'River', 'Ocean', 'Wind', 'Fire', 'Storm', 'Wave',
  'Phoenix', 'Dragon', 'Wolf', 'Fox', 'Owl', 'Hawk'
];

export function generateRandomUsername(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const number = Math.floor(Math.random() * 999);
  
  return `${adjective}${noun}${number}`;
}
