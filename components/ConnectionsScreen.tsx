import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import React, { useState, useEffect } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { trpc } from "@/lib/trpc";
import RateUserModal from "./RateUserModal";
import { Star } from "lucide-react-native";
import type { ChatRequest } from "@/types/chat";
import type { Connection } from "@/types/connection";

type TabType = 'sent' | 'received' | 'friends';

interface RequestItem extends ChatRequest {
  senderUsername?: string;
  receiverUsername?: string;
}

interface FriendItem extends Connection {
  connectedUserUsername: string;
  connectedUserAvatar: string;
  hasChatted: boolean;
  rating: number;
  verified: boolean;
}

export default function ConnectionsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('friends');
  const [sentRequests, setSentRequests] = useState<RequestItem[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<RequestItem[]>([]);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [rateModalVisible, setRateModalVisible] = useState(false);
  const [selectedUserForRating, setSelectedUserForRating] = useState<FriendItem | null>(null);

  useEffect(() => {
    if (!user?.uid) return;

    setLoading(true);

    // Listen to sent requests
    const sentQuery = query(
      collection(db, 'chatRequests'),
      where('senderId', '==', user.uid),
      where('status', '==', 'pending')
    );

    const sentUnsubscribe = onSnapshot(sentQuery, async (snapshot) => {
      const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as RequestItem[];

      // Get receiver usernames
      const requestsWithUsernames = await Promise.all(
        requests.map(async (req) => {
          const receiverDoc = await getDoc(doc(db, 'users', req.receiverId));
          const receiverData = receiverDoc.data();
          return {
            ...req,
            receiverUsername: receiverData?.username || 'Unknown',
          };
        })
      );

      setSentRequests(requestsWithUsernames);
    });

    // Listen to received requests
    const receivedQuery = query(
      collection(db, 'chatRequests'),
      where('receiverId', '==', user.uid),
      where('status', '==', 'pending')
    );

    const receivedUnsubscribe = onSnapshot(receivedQuery, async (snapshot) => {
      const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as RequestItem[];

      // Get sender usernames
      const requestsWithUsernames = await Promise.all(
        requests.map(async (req) => {
          const senderDoc = await getDoc(doc(db, 'users', req.senderId));
          const senderData = senderDoc.data();
          return {
            ...req,
            senderUsername: senderData?.username || 'Unknown',
          };
        })
      );

      setReceivedRequests(requestsWithUsernames);
    });

    // Listen to connections
    const connectionsQuery = query(
      collection(db, 'connections'),
      where('userId', '==', user.uid)
    );

    const connectionsUnsubscribe = onSnapshot(connectionsQuery, async (snapshot) => {
      const connections = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as FriendItem[];

      // Get connected user details
      const connectionsWithDetails = await Promise.all(
        connections.map(async (conn) => {
          const connectedUserDoc = await getDoc(doc(db, 'users', conn.connectedUserId));
          const connectedUserData = connectedUserDoc.data();
          const chatDoc = await getDoc(doc(db, 'chats', conn.chatId));
          const chatData = chatDoc.data();

          // Convert Firestore Timestamp to Date if needed
          const createdAt = (conn.createdAt as any)?.toDate ? (conn.createdAt as any).toDate() : new Date(conn.createdAt as any);

          return {
            ...conn,
            createdAt,
            connectedUserUsername: connectedUserData?.username || 'Unknown',
            connectedUserAvatar: connectedUserData?.avatar || '👤',
            hasChatted: chatData?.lastMessage ? true : false,
            rating: connectedUserData?.rating || 0,
            verified: connectedUserData?.verified || false,
          };
        })
      );

      setFriends(connectionsWithDetails);
      setLoading(false);
    });

    return () => {
      sentUnsubscribe();
      receivedUnsubscribe();
      connectionsUnsubscribe();
    };
  }, [user?.uid]);

  const handleAcceptRequest = async (requestId: string) => {
    try {
      const requestDoc = await getDoc(doc(db, 'chatRequests', requestId));
      if (!requestDoc.exists) {
        throw new Error('Request not found');
      }
      const requestData = requestDoc.data();
      if (!requestData) {
        throw new Error('Request data not found');
      }

      // Create chat
      const chatDoc = {
        participants: [requestData.senderId, requestData.receiverId],
        encryptionKey: '',
        createdAt: new Date(),
        lastActivity: new Date(),
        unreadCount: {
          [requestData.senderId]: 0,
          [requestData.receiverId]: 0,
        },
      };
      const chatRef = await addDoc(collection(db, 'chats'), chatDoc);

      // Create connections
      const connectionDoc1 = {
        userId: requestData.senderId,
        connectedUserId: requestData.receiverId,
        chatId: chatRef.id,
        createdAt: new Date(),
        lastInteraction: new Date(),
      };
      const connectionDoc2 = {
        userId: requestData.receiverId,
        connectedUserId: requestData.senderId,
        chatId: chatRef.id,
        createdAt: new Date(),
        lastInteraction: new Date(),
      };
      await addDoc(collection(db, 'connections'), connectionDoc1);
      await addDoc(collection(db, 'connections'), connectionDoc2);

      // Update user counts
      const senderDoc = await getDoc(doc(db, 'users', requestData.senderId));
      const receiverDoc = await getDoc(doc(db, 'users', requestData.receiverId));
      await updateDoc(doc(db, 'users', requestData.senderId), {
        connectionCount: (senderDoc.data()?.connectionCount || 0) + 1,
        connections: [...(senderDoc.data()?.connections || []), requestData.receiverId],
      });
      await updateDoc(doc(db, 'users', requestData.receiverId), {
        connectionCount: (receiverDoc.data()?.connectionCount || 0) + 1,
        connections: [...(receiverDoc.data()?.connections || []), requestData.senderId],
      });

      // Update request status
      await updateDoc(doc(db, 'chatRequests', requestId), {
        status: 'accepted',
        respondedAt: new Date(),
      });

      Alert.alert('Success', 'Connection request accepted!');
    } catch (error) {
      Alert.alert('Error', 'Failed to accept request');
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      await updateDoc(doc(db, 'chatRequests', requestId), {
        status: 'rejected',
        respondedAt: new Date(),
      });
      Alert.alert('Success', 'Connection request rejected');
    } catch (error) {
      Alert.alert('Error', 'Failed to reject request');
    }
  };

  const renderSentRequest = ({ item }: { item: RequestItem }) => (
    <View style={styles.requestCard}>
      <Text style={styles.requestUsername}>{item.receiverUsername}</Text>
      <Text style={styles.requestMessage}>{item.message || 'Connection request sent'}</Text>
      <Text style={styles.requestStatus}>Pending</Text>
    </View>
  );

  const renderReceivedRequest = ({ item }: { item: RequestItem }) => (
    <View style={styles.requestCard}>
      <Text style={styles.requestUsername}>{item.senderUsername}</Text>
      <Text style={styles.requestMessage}>{item.message || 'Wants to connect'}</Text>
      <View style={styles.requestActions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.acceptButton]}
          onPress={() => handleAcceptRequest(item.id)}
        >
          <Text style={styles.acceptButtonText}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.rejectButton]}
          onPress={() => handleRejectRequest(item.id)}
        >
          <Text style={styles.rejectButtonText}>Reject</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const handleRateUser = (user: FriendItem) => {
    setSelectedUserForRating(user);
    setRateModalVisible(true);
  };

  const handleRatingSubmitted = () => {
    // Refresh friends list to show updated ratings
    // The onSnapshot will automatically update the data
  };

  const renderFriend = ({ item }: { item: FriendItem }) => (
    <View style={styles.friendCard}>
      <TouchableOpacity style={styles.friendMain} onPress={() => {
        router.push(`/chat/${item.chatId}`);
      }}>
        <Text style={styles.friendAvatar}>{item.connectedUserAvatar}</Text>
        <View style={styles.friendInfo}>
          <View style={styles.friendHeader}>
            <Text style={styles.friendUsername}>{item.connectedUserUsername}</Text>
            {item.verified && (
              <View style={styles.verifiedBadge}>
                <Star size={12} color="#007AFF" fill="#007AFF" />
              </View>
            )}
          </View>
          <View style={styles.friendStats}>
            <View style={styles.stat}>
              <Star size={12} color="#FFB800" fill="#FFB800" />
              <Text style={styles.statText}>
                {item.rating > 0 ? item.rating.toFixed(1) : "New"}
              </Text>
            </View>
          </View>
          <Text style={styles.friendLastInteraction}>
            Connected {item.createdAt.toLocaleDateString()}
          </Text>
        </View>
      </TouchableOpacity>
      {item.hasChatted && (
        <TouchableOpacity
          style={styles.rateButton}
          onPress={() => handleRateUser(item)}
        >
          <Star size={16} color="#FFB800" />
          <Text style={styles.rateButtonText}>Rate</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      );
    }

    switch (activeTab) {
      case 'sent':
        return (
          <FlatList
            data={sentRequests}
            renderItem={renderSentRequest}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No pending requests sent</Text>
              </View>
            }
          />
        );
      case 'received':
        return (
          <FlatList
            data={receivedRequests}
            renderItem={renderReceivedRequest}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No pending requests received</Text>
              </View>
            }
          />
        );
      case 'friends':
        return (
          <FlatList
            data={friends}
            renderItem={renderFriend}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No connections yet</Text>
                <Text style={styles.emptySubtext}>Start connecting with people!</Text>
              </View>
            }
          />
        );
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'sent' && styles.tabButtonActive]}
          onPress={() => setActiveTab('sent')}
        >
          <Text style={[styles.tabButtonText, activeTab === 'sent' && styles.tabButtonTextActive]}>
            Sent ({sentRequests.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'received' && styles.tabButtonActive]}
          onPress={() => setActiveTab('received')}
        >
          <Text style={[styles.tabButtonText, activeTab === 'received' && styles.tabButtonTextActive]}>
            Received ({receivedRequests.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'friends' && styles.tabButtonActive]}
          onPress={() => setActiveTab('friends')}
        >
          <Text style={[styles.tabButtonText, activeTab === 'friends' && styles.tabButtonTextActive]}>
            Friends ({friends.length})
          </Text>
        </TouchableOpacity>
      </View>
      {renderContent()}

      <RateUserModal
        visible={rateModalVisible}
        onClose={() => setRateModalVisible(false)}
        userId={selectedUserForRating?.connectedUserId || ''}
        username={selectedUserForRating?.connectedUserUsername || ''}
        onRatingSubmitted={handleRatingSubmitted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  tabContainer: {
    flexDirection: "row",
    padding: 12,
    gap: 8,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
  },
  tabButtonActive: {
    backgroundColor: "#007AFF",
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#666",
  },
  tabButtonTextActive: {
    color: "#fff",
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
  requestCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  requestUsername: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#1a1a1a",
    marginBottom: 4,
  },
  requestMessage: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  requestStatus: {
    fontSize: 12,
    color: "#007AFF",
    fontWeight: "600" as const,
  },
  requestActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  acceptButton: {
    backgroundColor: "#34C759",
  },
  rejectButton: {
    backgroundColor: "#FF3B30",
  },
  acceptButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600" as const,
  },
  rejectButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600" as const,
  },
  friendCard: {
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
  friendMain: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  friendAvatar: {
    fontSize: 48,
    marginRight: 12,
  },
  friendInfo: {
    flex: 1,
  },
  friendHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  friendUsername: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#1a1a1a",
  },
  verifiedBadge: {
    marginLeft: 6,
  },
  friendStats: {
    marginBottom: 4,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: "#666",
  },
  friendLastInteraction: {
    fontSize: 12,
    color: "#666",
  },
  rateButton: {
    flexDirection: "row",
    backgroundColor: "#FFF7E0",
    borderRadius: 12,
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#FFB800",
    marginLeft: 12,
  },
  rateButtonText: {
    color: "#FFB800",
    fontSize: 14,
    fontWeight: "600" as const,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: "#666",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
  },
});
