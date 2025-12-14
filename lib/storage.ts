import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys
export const STORAGE_KEYS = {
  MESSAGES: 'cached_messages',
  USERS: 'cached_users',
  CHATS: 'cached_chats',
  CONNECTIONS: 'cached_connections',
  USER_PROFILE: 'cached_user_profile',
} as const;

// Generic storage utilities
export class LocalStorage {
  static async get<T>(key: string): Promise<T | null> {
    try {
      const data = await AsyncStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('LocalStorage get error:', error);
      return null;
    }
  }

  static async set<T>(key: string, data: T): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error('LocalStorage set error:', error);
    }
  }

  static async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error('LocalStorage remove error:', error);
    }
  }
}

// Message caching
export interface CachedMessage {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  type: 'text';
  encrypted: boolean;
  status: 'sent' | 'delivered' | 'read' | 'sending' | 'failed';
  createdAt: string; // ISO string
  editedAt?: string;
  readBy: string[];
  deletedBy?: string[];
  replyTo?: string;
  synced?: boolean; // Whether synced with server
}

export class MessageCache {
  private static cache: Map<string, CachedMessage[]> = new Map();

  static async load(): Promise<void> {
    try {
      const data = await LocalStorage.get<Record<string, CachedMessage[]>>(STORAGE_KEYS.MESSAGES);
      if (data) {
        this.cache = new Map(Object.entries(data));
      }
    } catch (error) {
      console.error('MessageCache load error:', error);
    }
  }

  static async save(): Promise<void> {
    try {
      const data = Object.fromEntries(this.cache);
      await LocalStorage.set(STORAGE_KEYS.MESSAGES, data);
    } catch (error) {
      console.error('MessageCache save error:', error);
    }
  }

  static getMessages(chatId: string): CachedMessage[] {
    return this.cache.get(chatId) || [];
  }

  static addMessage(chatId: string, message: CachedMessage): void {
    const messages = this.cache.get(chatId) || [];
    messages.push(message);
    this.cache.set(chatId, messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
  }

  static updateMessage(chatId: string, messageId: string, updates: Partial<CachedMessage>): void {
    const messages = this.cache.get(chatId) || [];
    const index = messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      messages[index] = { ...messages[index], ...updates };
      this.cache.set(chatId, messages);
    }
  }

  static deleteMessage(chatId: string, messageId: string): void {
    const messages = this.cache.get(chatId) || [];
    this.cache.set(chatId, messages.filter(m => m.id !== messageId));
  }

  static markDeleted(chatId: string, messageId: string, userId: string): void {
    const messages = this.cache.get(chatId) || [];
    const index = messages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      if (!messages[index].deletedBy) {
        messages[index].deletedBy = [];
      }
      if (!messages[index].deletedBy!.includes(userId)) {
        messages[index].deletedBy!.push(userId);
      }
      this.cache.set(chatId, messages);
    }
  }

  static getUnsyncedMessages(): CachedMessage[] {
    const allMessages: CachedMessage[] = [];
    for (const messages of this.cache.values()) {
      allMessages.push(...messages.filter(m => !m.synced));
    }
    return allMessages;
  }

  static markSynced(messageId: string, chatId: string): void {
    this.updateMessage(chatId, messageId, { synced: true });
  }

  static clear(chatId?: string): void {
    if (chatId) {
      this.cache.delete(chatId);
    } else {
      this.cache.clear();
    }
    this.save();
  }
}

// User caching
export interface CachedUser {
  id: string;
  username: string;
  gender: 'male' | 'female' | 'other';
  avatar: string;
  rating: number;
  verified: boolean;
  status: 'online' | 'offline';
  lastSeen: string | undefined;
  connectionCount?: number;
  synced?: boolean;
}

export class UserCache {
  private static cache = new Map<string, CachedUser>();

  static async load(): Promise<void> {
    try {
      const data = await LocalStorage.get<Record<string, CachedUser>>(STORAGE_KEYS.USERS);
      if (data) {
        this.cache = new Map(Object.entries(data));
      }
    } catch (error) {
      console.error('UserCache load error:', error);
    }
  }

  static async save(): Promise<void> {
    try {
      const data = Object.fromEntries(this.cache);
      await LocalStorage.set(STORAGE_KEYS.USERS, data);
    } catch (error) {
      console.error('UserCache save error:', error);
    }
  }

  static getUser(userId: string): CachedUser | null {
    return this.cache.get(userId) || null;
  }

  static setUser(user: CachedUser): void {
    this.cache.set(user.id, user);
  }

  static updateUser(userId: string, updates: Partial<CachedUser>): void {
    const user = this.cache.get(userId);
    if (user) {
      this.cache.set(userId, { ...user, ...updates });
    }
  }

  static getAllUsers(): CachedUser[] {
    return Array.from(this.cache.values());
  }

  static clear(): void {
    this.cache.clear();
    this.save();
  }
}

// Chat caching
export interface CachedChat {
  id: string;
  participants: string[];
  lastMessage?: {
    content: string;
    senderId: string;
    createdAt: string;
    readBy: string[];
  };
  lastActivity: string;
  unreadCount: Record<string, number>;
  typing?: Record<string, boolean>;
  synced?: boolean;
}

export class ChatCache {
  private static cache = new Map<string, CachedChat>();

  static async load(): Promise<void> {
    try {
      const data = await LocalStorage.get<Record<string, CachedChat>>(STORAGE_KEYS.CHATS);
      if (data) {
        this.cache = new Map(Object.entries(data));
      }
    } catch (error) {
      console.error('ChatCache load error:', error);
    }
  }

  static async save(): Promise<void> {
    try {
      const data = Object.fromEntries(this.cache);
      await LocalStorage.set(STORAGE_KEYS.CHATS, data);
    } catch (error) {
      console.error('ChatCache save error:', error);
    }
  }

  static getChat(chatId: string): CachedChat | null {
    return this.cache.get(chatId) || null;
  }

  static setChat(chat: CachedChat): void {
    this.cache.set(chat.id, chat);
  }

  static updateChat(chatId: string, updates: Partial<CachedChat>): void {
    const chat = this.cache.get(chatId);
    if (chat) {
      this.cache.set(chatId, { ...chat, ...updates });
    }
  }

  static getAllChats(): CachedChat[] {
    return Array.from(this.cache.values());
  }

  static incrementUnread(chatId: string, userId: string): void {
    const chat = this.cache.get(chatId);
    if (chat) {
      if (!chat.unreadCount) chat.unreadCount = {};
      chat.unreadCount[userId] = (chat.unreadCount[userId] || 0) + 1;
      this.cache.set(chatId, chat);
    }
  }

  static resetUnread(chatId: string, userId: string): void {
    const chat = this.cache.get(chatId);
    if (chat && chat.unreadCount) {
      chat.unreadCount[userId] = 0;
      this.cache.set(chatId, chat);
    }
  }

  static clear(): void {
    this.cache.clear();
    this.save();
  }
}

// Connection caching
export interface CachedConnection {
  id: string;
  userId: string;
  connectedUserId: string;
  chatId: string;
  createdAt: string;
  synced?: boolean;
}

export class ConnectionCache {
  private static cache: CachedConnection[] = [];

  static async load(): Promise<void> {
    try {
      const data = await LocalStorage.get<CachedConnection[]>(STORAGE_KEYS.CONNECTIONS);
      if (data) {
        this.cache = data;
      }
    } catch (error) {
      console.error('ConnectionCache load error:', error);
    }
  }

  static async save(): Promise<void> {
    try {
      await LocalStorage.set(STORAGE_KEYS.CONNECTIONS, this.cache);
    } catch (error) {
      console.error('ConnectionCache save error:', error);
    }
  }

  static getUserConnections(userId: string): CachedConnection[] {
    return this.cache.filter(conn => conn.userId === userId);
  }

  static addConnection(connection: CachedConnection): void {
    this.cache.push(connection);
  }

  static removeConnection(connectionId: string): void {
    this.cache = this.cache.filter(conn => conn.id !== connectionId);
  }

  static getAllConnections(): CachedConnection[] {
    return this.cache;
  }

  static clear(): void {
    this.cache = [];
    this.save();
  }
}

export class OfflineManager {
  private static initialized = false;

  static async initialize(): Promise<void> {
    if (this.initialized) return;

    await Promise.all([
      MessageCache.load(),
      UserCache.load(),
      ChatCache.load(),
      ConnectionCache.load(),
    ]);

    this.initialized = true;
  }

  static async syncWithServer(): Promise<void> {
    // This will be called to sync pending messages and updates
    await MessageCache.save();
    await UserCache.save();
    await ChatCache.save();
    await ConnectionCache.save();
  }

  static clearAll(): void {
    MessageCache.clear();
    UserCache.clear();
    ChatCache.clear();
    ConnectionCache.clear();
    LocalStorage.remove(STORAGE_KEYS.USER_PROFILE);
  }
}

// Initialize on module load
OfflineManager.initialize();
