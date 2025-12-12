export const MALE_AVATARS = [
  '👨',
  '👨‍💼',
  '👨‍🎓',
  '👨‍🏫',
  '👨‍⚕️',
  '👨‍🔬',
  '👨‍💻',
  '👨‍🎨',
  '👨‍🚀',
  '🧔',
  '👨‍🦰',
  '👨‍🦱',
  '👨‍🦳',
  '👨‍🦲',
];

export const FEMALE_AVATARS = [
  '👩',
  '👩‍💼',
  '👩‍🎓',
  '👩‍🏫',
  '👩‍⚕️',
  '👩‍🔬',
  '👩‍💻',
  '👩‍🎨',
  '👩‍🚀',
  '👩‍🦰',
  '👩‍🦱',
  '👩‍🦳',
  '👩‍🦲',
];

export const OTHER_AVATARS = [
  '🧑',
  '🧑‍💼',
  '🧑‍🎓',
  '🧑‍🏫',
  '🧑‍⚕️',
  '🧑‍🔬',
  '🧑‍💻',
  '🧑‍🎨',
  '🧑‍🚀',
];

export function getAvatarsByGender(gender: 'male' | 'female' | 'other'): string[] {
  switch (gender) {
    case 'male':
      return MALE_AVATARS;
    case 'female':
      return FEMALE_AVATARS;
    case 'other':
      return OTHER_AVATARS;
    default:
      return OTHER_AVATARS;
  }
}

export function getRandomAvatar(gender: 'male' | 'female' | 'other'): string {
  const avatars = getAvatarsByGender(gender);
  return avatars[Math.floor(Math.random() * avatars.length)];
}
