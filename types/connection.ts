export interface Connection {
  id: string;
  userId: string;
  connectedUserId: string;
  chatId: string;
  createdAt: Date;
  lastInteraction: Date;
}

export type RatingType = 'positive' | 'negative';

export interface Rating {
  id: string;
  fromUserId: string;
  toUserId: string;
  chatId: string;
  type: RatingType;
  tags: string[];
  comment?: string;
  createdAt: Date;
}

export type ReportReason = 'abuse' | 'harassment' | 'inappropriate' | 'privacy_violation' | 'spam' | 'other';

export interface Report {
  id: string;
  reporterId: string;
  reportedUserId: string;
  chatId?: string;
  messageId?: string;
  reason: ReportReason;
  description: string;
  createdAt: Date;
  resolved: boolean;
  resolvedAt?: Date;
  adminNotes?: string;
}

export interface Block {
  id: string;
  userId: string;
  blockedUserId: string;
  reason?: string;
  createdAt: Date;
}
