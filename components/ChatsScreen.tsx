"use client"

import { StyleSheet, Text, View, FlatList, TouchableOpacity, ActivityIndicator } from "react-native"
import { useState, useEffect } from "react"
import { useRouter } from "expo-router"
import { useAuth } from "@/contexts/AuthContext"
import { collection, query, where, onSnapshot, doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { Check, CheckCheck, Star } from "lucide-react-native"
import { UserCache, ChatCache, MessageCache, ConnectionCache, OfflineManager } from "@/lib/storage"
import type { Connection } from "@/types/connection"
import React from "react"

interface ChatItem {
  id: string
  userId: string
  connectedUserId: string
  chatId: string
  createdAt: Date
  connectedUserUsername: string
  connectedUserAvatar: string
  verified: boolean
  lastMessage?: string
  lastMessageTime?: Date
  unreadCount: number
  isTyping: boolean
  lastMessageSenderId?: string
  lastMessageStatus?: "sent" | "delivered" | "read"
}

export default function ChatsScreen() {
  const { user } = useAuth()
  const router = useRouter()
  const [chats, setChats] = useState<ChatItem[]>([])
  const [loading, setLoading] = useState(false) // Remove loading state since we show cached data instantly

  useEffect(() => {
    if (!user?.uid) return

    // Load from cache immediately for instant display
    const loadFromCache = () => {
      const cachedConnections = ConnectionCache.getUserConnections(user.uid);
      const cachedChats = cachedConnections.map(conn => {
        const chatData = ChatCache.getChat(conn.chatId);
        const connectedUser = UserCache.getUser(conn.connectedUserId);

        // Get last message from cache
        const messages = MessageCache.getMessages(conn.chatId);
        const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

        let lastMessageText = "No messages yet";
        let lastMessageStatus: "sent" | "delivered" | "read" = "sent";

        if (lastMessage) {
          const isOwnMessage = lastMessage.senderId === user.uid;

          if (isOwnMessage) {
            const readBy = lastMessage.readBy || [];
            if (readBy.includes(conn.connectedUserId)) {
              lastMessageStatus = "read";
            } else if (readBy.length > 1) {
              lastMessageStatus = "delivered";
            } else {
              lastMessageStatus = "sent";
            }
          }

          // Show message preview with sender prefix
          const senderPrefix = isOwnMessage ? "You: " : "";
          lastMessageText = senderPrefix + lastMessage.content;
          if (lastMessageText.length > 40) {
            lastMessageText = lastMessageText.substring(0, 40) + "...";
          }
        }

        const chatItem: ChatItem = {
          id: conn.id,
          userId: conn.userId,
          connectedUserId: conn.connectedUserId,
          chatId: conn.chatId,
          createdAt: new Date(conn.createdAt),
          connectedUserUsername: connectedUser?.username || "Unknown",
          connectedUserAvatar: connectedUser?.avatar || "👤",
          verified: connectedUser?.verified || false,
          lastMessage: lastMessageText,
          lastMessageTime: lastMessage ? new Date(lastMessage.createdAt) : new Date(conn.createdAt),
          unreadCount: chatData?.unreadCount?.[user.uid] || 0,
          isTyping: false,
          lastMessageSenderId: lastMessage?.senderId,
          lastMessageStatus,
        };

        return chatItem;
      });

      // Sort by last message time
      cachedChats.sort((a, b) => {
        const aTime = a.lastMessageTime instanceof Date ? a.lastMessageTime.getTime() : new Date(a.lastMessageTime || 0).getTime();
        const bTime = b.lastMessageTime instanceof Date ? b.lastMessageTime.getTime() : new Date(b.lastMessageTime || 0).getTime();
        return bTime - aTime;
      });

      setChats(cachedChats);
      setLoading(false);
    };

    loadFromCache();

    // Sync with server in background
    const syncWithServer = async () => {
      try {
        // Listen to connections with chats
        const connectionsQuery = query(collection(db, "connections"), where("userId", "==", user.uid));

        const unsubscribe = onSnapshot(connectionsQuery, async (snapshot) => {
          const connections = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              userId: data.userId,
              connectedUserId: data.connectedUserId,
              chatId: data.chatId,
              createdAt: data.createdAt?.toDate?.() || new Date(),
              lastInteraction: data.lastInteraction?.toDate?.() || new Date(),
            }
          });

          // Cache connections
          connections.forEach(conn => {
            ConnectionCache.addConnection({
              id: conn.id,
              userId: conn.userId,
              connectedUserId: conn.connectedUserId,
              chatId: conn.chatId,
              createdAt: conn.createdAt.toISOString(),
              synced: true
            });
          });

          // Set up real-time listeners for each chat
          const chatUnsubscribes: (() => void)[] = [];
          const chatPromises = connections.map(async (conn) => {
            return new Promise<ChatItem>((resolve) => {
              // Get connected user details
              const connectedUserDoc = getDoc(doc(db, "users", conn.connectedUserId));
              const chatDoc = getDoc(doc(db, "chats", conn.chatId));

              Promise.all([connectedUserDoc, chatDoc]).then(([connectedUserSnap, chatSnap]) => {
                const connectedUserData = connectedUserSnap.data() as any;
                const chatData = chatSnap.data() as any;

                // Cache user data
                if (connectedUserData) {
                  UserCache.setUser({
                    id: conn.connectedUserId,
                    username: connectedUserData.username || "Unknown",
                    gender: connectedUserData.gender || "other",
                    avatar: connectedUserData.avatar || "👤",
                    rating: connectedUserData.rating || 0,
                    verified: connectedUserData.verified || false,
                    status: connectedUserData.status || "offline",
                    lastSeen: connectedUserData.lastSeen?.toDate?.()?.toISOString() || connectedUserData.lastSeen || new Date().toISOString(),
                    connectionCount: connectedUserData.connectionCount || 0,
                    synced: true
                  });
                }

                // Cache chat data
                if (chatData) {
                  ChatCache.setChat({
                    id: conn.chatId,
                    participants: chatData.participants || [user.uid, conn.connectedUserId],
                    lastMessage: chatData.lastMessage ? {
                      content: chatData.lastMessage.content,
                      senderId: chatData.lastMessage.senderId,
                      createdAt: chatData.lastMessage.createdAt?.toDate?.()?.toISOString() || chatData.lastMessage.createdAt,
                      readBy: chatData.lastMessage.readBy || []
                    } : undefined,
                    lastActivity: chatData.lastActivity?.toDate?.()?.toISOString() || new Date().toISOString(),
                    unreadCount: chatData.unreadCount || {},
                    synced: true
                  });
                }

                const lastMessageData = chatData?.lastMessage;
                let lastMessageText = "No messages yet";
                let lastMessageStatus: "sent" | "delivered" | "read" = "sent";

                if (lastMessageData) {
                  const isOwnMessage = lastMessageData.senderId === user.uid;

                  if (isOwnMessage) {
                    const readBy = lastMessageData.readBy || [];
                    if (readBy.includes(conn.connectedUserId)) {
                      lastMessageStatus = "read";
                    } else if (readBy.length > 1) {
                      lastMessageStatus = "delivered";
                    } else {
                      lastMessageStatus = "sent";
                    }
                  }

                  // Show typing indicator if user is typing
                  const typingUsers = Object.keys(chatData?.typing || {}).filter(
                    (uid) => chatData.typing[uid] && uid !== user.uid,
                  );

                  if (typingUsers.length > 0) {
                    lastMessageText = "typing...";
                  } else {
                    // Show message preview with sender prefix
                    const senderPrefix = isOwnMessage ? "You: " : "";
                    lastMessageText = senderPrefix + lastMessageData.content;
                    if (lastMessageText.length > 40) {
                      lastMessageText = lastMessageText.substring(0, 40) + "...";
                    }
                  }
                }

                const chatItem: ChatItem = {
                  ...conn,
                  connectedUserUsername: connectedUserData?.username || "Unknown",
                  connectedUserAvatar: connectedUserData?.avatar || "👤",
                  verified: connectedUserData?.verified || false,
                  lastMessage: lastMessageText,
                  lastMessageTime: lastMessageData?.createdAt?.toDate() || conn.createdAt,
                  unreadCount: chatData?.unreadCount?.[user.uid] || 0,
                  isTyping: false,
                  lastMessageSenderId: lastMessageData?.senderId,
                  lastMessageStatus,
                };

                // Set up real-time listener for this chat
                const chatUnsubscribe = onSnapshot(doc(db, "chats", conn.chatId), (chatSnapshot) => {
                  const updatedChatData = chatSnapshot.data() as any;
                  const lastMessageData = updatedChatData?.lastMessage;

                  let updatedLastMessage = "No messages yet";
                  let updatedStatus: "sent" | "delivered" | "read" = "sent";
                  let isTyping = false;

                  if (lastMessageData) {
                    const isOwnMessage = lastMessageData.senderId === user.uid;

                    if (isOwnMessage) {
                      const readBy = lastMessageData.readBy || [];
                      if (readBy.includes(conn.connectedUserId)) {
                        updatedStatus = "read";
                      } else if (readBy.length > 1) {
                        updatedStatus = "delivered";
                      } else {
                        updatedStatus = "sent";
                      }
                    }

                    // Show typing indicator if user is typing
                    const typingUsers = Object.keys(updatedChatData?.typing || {}).filter(
                      (uid) => updatedChatData.typing[uid] && uid !== user.uid,
                    );

                    if (typingUsers.length > 0) {
                      updatedLastMessage = "typing...";
                      isTyping = true;
                    } else {
                      // Show message preview with sender prefix
                      const senderPrefix = isOwnMessage ? "You: " : "";
                      updatedLastMessage = senderPrefix + lastMessageData.content;
                      if (updatedLastMessage.length > 40) {
                        updatedLastMessage = updatedLastMessage.substring(0, 40) + "...";
                      }
                    }
                  }

                  setChats((prevChats) => {
                    const updated = prevChats.map((chat) =>
                      chat.chatId === conn.chatId
                        ? {
                            ...chat,
                            lastMessage: updatedLastMessage,
                            lastMessageTime: lastMessageData?.createdAt?.toDate() || chat.createdAt || new Date(0),
                            unreadCount: updatedChatData?.unreadCount?.[user.uid] || 0,
                            isTyping,
                            lastMessageSenderId: lastMessageData?.senderId,
                            lastMessageStatus: updatedStatus,
                          }
                        : chat,
                    ).sort((a, b) => {
                      const aTime = a.lastMessageTime instanceof Date ? a.lastMessageTime : new Date(a.lastMessageTime || 0);
                      const bTime = b.lastMessageTime instanceof Date ? b.lastMessageTime : new Date(b.lastMessageTime || 0);
                      return bTime.getTime() - aTime.getTime();
                    });

                    // Update cache
                    ChatCache.updateChat(conn.chatId, {
                      lastMessage: lastMessageData ? {
                        content: lastMessageData.content,
                        senderId: lastMessageData.senderId,
                        createdAt: lastMessageData.createdAt?.toDate?.()?.toISOString() || lastMessageData.createdAt,
                        readBy: lastMessageData.readBy || []
                      } : undefined,
                      unreadCount: updatedChatData?.unreadCount || {}
                    });

                    return updated;
                  });
                });

                chatUnsubscribes.push(chatUnsubscribe);
                resolve(chatItem);
              });
            });
          });

          Promise.all(chatPromises).then((chatsWithDetails) => {
            // Sort by last message time
            chatsWithDetails.sort((a, b) => {
              const aTime = a.lastMessageTime instanceof Date ? a.lastMessageTime.getTime() : new Date(a.lastMessageTime || 0).getTime();
              const bTime = b.lastMessageTime instanceof Date ? b.lastMessageTime.getTime() : new Date(b.lastMessageTime || 0).getTime();
              return bTime - aTime;
            });

            setChats(chatsWithDetails);
          });

          return () => {
            unsubscribe();
            chatUnsubscribes.forEach((unsub) => unsub());
          };
        });

        return () => unsubscribe();
      } catch (error) {
        console.log('Background sync error, but cached data already displayed:', error);
      }
    };

    // Start background sync
    syncWithServer();

  }, [user?.uid]);

  const renderStatusIcon = (item: ChatItem) => {
    // Only show status for own messages
    if (item.lastMessageSenderId !== user?.uid) return null
    if (item.isTyping) return null

    const status = item.lastMessageStatus

    if (status === "read") {
      // Blue double checkmarks for read
      return <CheckCheck size={14} color="#53BDEB" style={styles.statusIcon} />
    } else if (status === "delivered") {
      // Grey double checkmarks for delivered
      return <CheckCheck size={14} color="#999" style={styles.statusIcon} />
    } else {
      // Single grey checkmark for sent
      return <Check size={14} color="#999" style={styles.statusIcon} />
    }
  }

  const renderChat = ({ item }: { item: ChatItem }) => (
    <TouchableOpacity
      style={styles.chatCard}
      onPress={() => {
        router.push(`/chat/${item.chatId}`)
      }}
    >
      <Text style={styles.chatAvatar}>{item.connectedUserAvatar}</Text>
      <View style={styles.chatInfo}>
        <View style={styles.usernameRow}>
          <Text style={styles.chatUsername}>{item.connectedUserUsername}</Text>
          {item.verified && <Star size={16} color="#013a96da" fill="#013a96da" />}
        </View>
        <View style={styles.lastMessageContainer}>
          {renderStatusIcon(item)}
          <Text
            style={[
              styles.chatLastMessage,
              item.isTyping && styles.typingText,
              item.unreadCount > 0 && styles.unreadMessageText,
            ]}
            numberOfLines={1}
          >
            {item.lastMessage}
          </Text>
        </View>
      </View>
      <View style={styles.chatMeta}>
        <Text style={styles.chatTime}>
          {item.lastMessageTime ? new Date(item.lastMessageTime).toLocaleDateString() : ""}
        </Text>
        {item.unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>{item.unreadCount > 99 ? "99+" : item.unreadCount}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  )

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#013a96da" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={chats}
        renderItem={renderChat}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emoji}>💬</Text>
            <Text style={styles.title}>No chats yet</Text>
            <Text style={styles.subtitle}>Connect with people to start chatting</Text>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  chatCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    flexDirection: "row",
    alignItems: "center",
  },
  chatAvatar: {
    fontSize: 48,
    marginRight: 12,
  },
  chatInfo: {
    flex: 1,
  },
  usernameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  chatUsername: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#1a1a1a",
  },
  lastMessageContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusIcon: {
    marginRight: 4,
  },
  chatLastMessage: {
    fontSize: 14,
    color: "#666",
    flex: 1,
  },
  typingText: {
    color: "#4CAF50",
    fontStyle: "italic",
  },
  unreadMessageText: {
    fontWeight: "600" as const,
    color: "#1a1a1a",
  },
  chatMeta: {
    alignItems: "flex-end",
    gap: 4,
  },
  chatTime: {
    fontSize: 12,
    color: "#999",
  },
  unreadBadge: {
    backgroundColor: "#4CAF50",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600" as const,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700" as const,
    color: "#1a1a1a",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
})
