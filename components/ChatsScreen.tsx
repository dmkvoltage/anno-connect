import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import React, { useState, useEffect } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { collection, query, where, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Connection } from "@/types/connection";

interface ChatItem extends Connection {
  connectedUserUsername: string;
  connectedUserAvatar: string;
  lastMessage?: string;
  lastMessageTime?: Date;
  unreadCount: number;
}

export default function ChatsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;

    setLoading(true);

    // Listen to connections with chats
    const connectionsQuery = query(
      collection(db, 'connections'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(connectionsQuery, async (snapshot) => {
      const connections = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Connection[];

      // Set up real-time listeners for each chat
      const chatUnsubscribes: (() => void)[] = [];
      const chatPromises = connections.map(async (conn) => {
        return new Promise<ChatItem>((resolve) => {
          // Get connected user details
          const connectedUserDoc = getDoc(doc(db, 'users', conn.connectedUserId));
          const chatDoc = getDoc(doc(db, 'chats', conn.chatId));

          Promise.all([connectedUserDoc, chatDoc]).then(([connectedUserSnap, chatSnap]) => {
            const connectedUserData = connectedUserSnap.data();
            const chatData = chatSnap.data();

            const lastMessageData = chatData?.lastMessage;
            let lastMessageText = 'No messages yet';
            let lastMessageSender = '';

            if (lastMessageData) {
              const isOwnMessage = lastMessageData.senderId === user.uid;
              lastMessageSender = isOwnMessage ? 'You' : connectedUserData?.username || 'Unknown';

              // Show typing indicator if user is typing
              const typingUsers = Object.keys(chatData?.typing || {}).filter(
                uid => chatData.typing[uid] && uid !== user.uid
              );

              if (typingUsers.length > 0) {
                lastMessageText = 'typing...';
              } else {
                // Show message preview
                lastMessageText = lastMessageData.content;
                if (lastMessageText.length > 30) {
                  lastMessageText = lastMessageText.substring(0, 30) + '...';
                }
              }
            }

            const chatItem: ChatItem = {
              ...conn,
              connectedUserUsername: connectedUserData?.username || 'Unknown',
              connectedUserAvatar: connectedUserData?.avatar || '👤',
              lastMessage: lastMessageText,
              lastMessageTime: lastMessageData?.createdAt?.toDate() || conn.createdAt,
              unreadCount: chatData?.unreadCount?.[user.uid] || 0,
            };

            // Set up real-time listener for this chat
            const chatUnsubscribe = onSnapshot(doc(db, 'chats', conn.chatId), (chatSnapshot) => {
              const updatedChatData = chatSnapshot.data();
              const lastMessageData = updatedChatData?.lastMessage;

              let updatedLastMessage = 'No messages yet';
              if (lastMessageData) {
                const isOwnMessage = lastMessageData.senderId === user.uid;

                // Show typing indicator if user is typing
                const typingUsers = Object.keys(updatedChatData?.typing || {}).filter(
                  uid => updatedChatData.typing[uid] && uid !== user.uid
                );

                if (typingUsers.length > 0) {
                  updatedLastMessage = 'typing...';
                } else {
                  // Show message preview
                  updatedLastMessage = lastMessageData.content;
                  if (updatedLastMessage.length > 30) {
                    updatedLastMessage = updatedLastMessage.substring(0, 30) + '...';
                  }
                }
              }

              setChats(prevChats => {
                return prevChats.map(chat =>
                  chat.chatId === conn.chatId
                    ? {
                        ...chat,
                        lastMessage: updatedLastMessage,
                        lastMessageTime: lastMessageData?.createdAt?.toDate() || chat.createdAt,
                        unreadCount: updatedChatData?.unreadCount?.[user.uid] || 0,
                      }
                    : chat
                ).sort((a, b) => {
                  const aTime = a.lastMessageTime || new Date(0);
                  const bTime = b.lastMessageTime || new Date(0);
                  return bTime.getTime() - aTime.getTime();
                });
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
          const aTime = a.lastMessageTime || new Date(0);
          const bTime = b.lastMessageTime || new Date(0);
          return bTime.getTime() - aTime.getTime();
        });

        setChats(chatsWithDetails);
        setLoading(false);
      });

      return () => {
        unsubscribe();
        chatUnsubscribes.forEach(unsub => unsub());
      };
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const renderChat = ({ item }: { item: ChatItem }) => (
    <TouchableOpacity style={styles.chatCard} onPress={() => {
      router.push(`/chat/${item.chatId}`);
    }}>
      <Text style={styles.chatAvatar}>{item.connectedUserAvatar}</Text>
      <View style={styles.chatInfo}>
        <Text style={styles.chatUsername}>{item.connectedUserUsername}</Text>
        <Text style={styles.chatLastMessage} numberOfLines={1}>
          {item.lastMessage}
        </Text>
      </View>
      <View style={styles.chatMeta}>
        <Text style={styles.chatTime}>
          {item.lastMessageTime ? new Date(item.lastMessageTime).toLocaleDateString() : ''}
        </Text>
        {item.unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>
              {item.unreadCount > 99 ? '99+' : item.unreadCount}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
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
            <Text style={styles.subtitle}>
              Connect with people to start chatting
            </Text>
          </View>
        }
      />
    </View>
  );
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
  chatUsername: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#1a1a1a",
    marginBottom: 2,
  },
  chatLastMessage: {
    fontSize: 14,
    color: "#666",
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
    backgroundColor: "#007AFF",
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
});
