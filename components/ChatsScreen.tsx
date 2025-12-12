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

      // Get chat details and connected user info
      const chatsWithDetails = await Promise.all(
        connections.map(async (conn) => {
          // Get connected user details
          const connectedUserDoc = await getDoc(doc(db, 'users', conn.connectedUserId));
          const connectedUserData = connectedUserDoc.data();

          // Get last message from chat
          const chatDoc = await getDoc(doc(db, 'chats', conn.chatId));
          const chatData = chatDoc.data();

          return {
            ...conn,
            connectedUserUsername: connectedUserData?.username || 'Unknown',
            connectedUserAvatar: connectedUserData?.avatar || '👤',
            lastMessage: chatData?.lastMessage?.content || 'No messages yet',
            lastMessageTime: chatData?.lastMessage?.createdAt?.toDate() || conn.createdAt,
          };
        })
      );

      // Sort by last message time
      chatsWithDetails.sort((a, b) => {
        const aTime = a.lastMessageTime || new Date(0);
        const bTime = b.lastMessageTime || new Date(0);
        return bTime.getTime() - aTime.getTime();
      });

      setChats(chatsWithDetails);
      setLoading(false);
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
      <Text style={styles.chatTime}>
        {item.lastMessageTime ? new Date(item.lastMessageTime).toLocaleDateString() : ''}
      </Text>
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
