export type MessageType = 'text' | 'voice';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  type: MessageType;
  encrypted: boolean;
  status: MessageStatus;
  createdAt: Date;
  voiceUrl?: string;
  voiceDuration?: number;
  replyTo?: string; // ID of the message being replied to
}

export interface Chat {
  id: string;
  participants: string[];
  encryptionKey: string;
  createdAt: Date;
  lastMessage?: Message;
  lastActivity: Date;
  expiresAt?: Date;
  unreadCount: { [userId: string]: number };
}

export type ChatRequestStatus = 'pending' | 'accepted' | 'rejected';

export interface ChatRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: ChatRequestStatus;
  message?: string;
  createdAt: Date;
  respondedAt?: Date;
}

export interface TypingIndicator {
  chatId: string;
  userId: string;
  isTyping: boolean;
  timestamp: Date;
}

export interface VoiceRecordingIndicator {
  chatId: string;
  userId: string;
  isRecording: boolean;
  timestamp: Date;
}
