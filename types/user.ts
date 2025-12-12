export type Gender = 'male' | 'female' | 'other';

export type UserStatus = 'online' | 'offline';

export interface User {
  id: string;
  username: string;
  gender: Gender;
  avatar: string;
  rating: number;
  totalRatings: number;
  verified: boolean;
  connectionCount: number;
  joinDate: Date;
  status: UserStatus;
  lastSeen: Date;
  email?: string;
}

export interface UserProfile extends User {
  connections: string[];
  blockedUsers: string[];
  reportCount: number;
}

export interface PublicUserProfile {
  id: string;
  username: string;
  gender: Gender;
  avatar: string;
  rating: number;
  verified: boolean;
  connectionCount: number;
  joinDate: Date;
  status: UserStatus;
  lastSeen: Date;
  connections: {
    userId: string;
    username: string;
    avatar: string;
  }[];
}
