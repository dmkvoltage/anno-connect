export type RoomCategory = 'stress_relief' | 'motivation' | 'tech' | 'relationships' | 'gaming' | 'mental_health' | 'other';

export interface CommunityRoom {
  id: string;
  name: string;
  description: string;
  category: RoomCategory;
  creatorId: string;
  memberIds: string[];
  maxMembers: number;
  isPublic: boolean;
  createdAt: Date;
  lastActivity: Date;
  expiresAt?: Date;
}

export interface RoomMember {
  userId: string;
  roomId: string;
  tempNickname: string;
  joinedAt: Date;
}

export interface RoomMessage {
  id: string;
  roomId: string;
  senderId: string;
  tempNickname: string;
  content: string;
  createdAt: Date;
}

export interface JoinRequest {
  id: string;
  roomId: string;
  userId: string;
  status: 'pending' | 'accepted' | 'rejected';
  message?: string;
  createdAt: Date;
  respondedAt?: Date;
}
