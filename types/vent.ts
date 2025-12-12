export type ReactionType = 'heart' | 'strength' | 'support';

export interface VentPost {
  id: string;
  authorId: string;
  content: string;
  reactions: {
    heart: number;
    strength: number;
    support: number;
  };
  createdAt: Date;
  expiresAt: Date;
}

export interface VentReaction {
  id: string;
  postId: string;
  userId: string;
  type: ReactionType;
  createdAt: Date;
}
