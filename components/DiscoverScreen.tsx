import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { Star, Shield, Users, Send } from "lucide-react-native";
import { collection, query, orderBy, limit, getDocs, where, addDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { UserCache, ConnectionCache, OfflineManager } from "@/lib/storage";
import type { Gender } from "@/types/user";

type SortOption = "random" | "rating" | "verified" | "active" | "connections";

interface DiscoverUser {
  id: string;
  username: string;
  gender: Gender;
  avatar: string;
  rating: number;
  verified: boolean;
  connectionCount: number;
  status: "online" | "offline";
  lastSeen?: string;
}

export default function DiscoverScreen() {
  const { user } = useAuth();
  const [sortBy, setSortBy] = useState<SortOption>("random");
  const [refreshing, setRefreshing] = useState(false);
  const [users, setUsers] = useState<DiscoverUser[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [pendingRequests, setPendingRequests] = useState<Set<string>>(new Set());

  const fetchUsers = async (background = false) => {
    try {
      setIsError(false);
      setError(null);

      // Always show cached users if available for instant UX
      const cachedUsers = UserCache.getAllUsers();
      if (cachedUsers.length > 0) {
        let filteredCachedUsers = cachedUsers.filter(u =>
          u.id !== user?.uid &&
          !ConnectionCache.getUserConnections(user?.uid || '').some(conn => conn.connectedUserId === u.id)
        );

        // Convert CachedUser to DiscoverUser format
        const discoverUsers: DiscoverUser[] = filteredCachedUsers.map(u => ({
          id: u.id,
          username: u.username,
          gender: u.gender,
          avatar: u.avatar,
          rating: u.rating,
          verified: u.verified,
          connectionCount: u.connectionCount || 0,
          status: u.status,
          lastSeen: u.lastSeen,
        }));

        // Apply sorting to cached users
        let result: DiscoverUser[];
        if (sortBy === 'rating') {
          result = discoverUsers.sort((a, b) => b.rating - a.rating).slice(0, 20);
        } else if (sortBy === 'verified') {
          result = discoverUsers.filter(u => u.verified).slice(0, 20);
        } else if (sortBy === 'active') {
          result = discoverUsers
            .sort((a, b) => (b.lastSeen ? new Date(b.lastSeen).getTime() : 0) - (a.lastSeen ? new Date(a.lastSeen).getTime() : 0))
            .slice(0, 20);
        } else if (sortBy === 'connections') {
          result = discoverUsers.sort((a, b) => b.connectionCount - a.connectionCount).slice(0, 20);
        } else { // random
          const shuffled = [...discoverUsers];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          result = shuffled.slice(0, 20);
        }

        setUsers(result);
        setIsLoading(false); // We have data to show

        if (background) return; // Don't fetch from server for background loads
      }

      // Fetch from server to update with fresh data
      if (!background && cachedUsers.length === 0) {
        setIsLoading(true); // Only show loading if no cached data
      }

      try {
        let q: any = collection(db, 'users');

        if (sortBy === 'rating') {
          q = query(q, orderBy('rating', 'desc'), limit(20));
        } else if (sortBy === 'verified') {
          q = query(q, where('verified', '==', true), limit(20));
        } else if (sortBy === 'connections') {
          q = query(q, orderBy('connectionCount', 'desc'), limit(20));
        } else if (sortBy === 'active') {
          q = query(q, orderBy('lastSeen', 'desc'), limit(20));
        } else {
          // random: get more and shuffle
          q = query(q, limit(50));
        }

        const snapshot = await getDocs(q);
        let fetchedUsers = snapshot.docs.map(doc => {
          const data = doc.data() as any; // Firebase returns unknown, we'll handle safely
          return {
            id: doc.id,
            username: data.username || 'Unknown',
            gender: data.gender || 'other',
            avatar: data.avatar || '👤',
            rating: data.rating || 0,
            verified: data.verified || false,
            connectionCount: data.connectionCount || 0,
            status: data.status || 'offline',
            lastSeen: data.lastSeen?.toDate?.()?.toISOString() || data.lastSeen || undefined
          } as DiscoverUser;
        });

        // Cache users for offline use
        fetchedUsers.forEach(user => {
          UserCache.setUser({
            id: user.id,
            username: user.username,
            gender: user.gender,
            avatar: user.avatar,
            rating: user.rating,
            verified: user.verified,
            status: user.status,
            lastSeen: typeof user.lastSeen === 'string' ? user.lastSeen : undefined,
            connectionCount: user.connectionCount,
            synced: true
          });
        });

        // Filter out excluded ids (current user and existing connections)
        fetchedUsers = fetchedUsers.filter(u => u.id !== user?.uid);

        // Remove users that are already connected
        const userConnections = ConnectionCache.getUserConnections(user?.uid || '');
        fetchedUsers = fetchedUsers.filter(u =>
          !userConnections.some(conn => conn.connectedUserId === u.id)
        );

        // For random, shuffle and take 20
        if (sortBy === 'random') {
          fetchedUsers = fetchedUsers.sort(() => 0.5 - Math.random()).slice(0, 20);
        }

        setUsers(fetchedUsers);
        setIsLoading(false); // Hide loading when server data arrives
      } catch (serverError) {
        console.warn('Server fetch failed:', serverError);
        // Keep cached data displayed, no error if we have cached
        if (cachedUsers.length === 0) {
          setIsError(true);
          setError(serverError as Error);
        }
      }
    } catch (err) {
      setIsError(true);
      setError(err as Error);

      // On error, try to show cached users if available
      const cachedUsers = UserCache.getAllUsers();
      if (cachedUsers.length > 0) {
        let filteredCachedUsers = cachedUsers.filter(u =>
          u.id !== user?.uid &&
          !ConnectionCache.getUserConnections(user?.uid || '').some(conn => conn.connectedUserId === u.id)
        );

        let result: DiscoverUser[];
        // Convert CachedUser to DiscoverUser format and apply sorting
        const discoverUsers: DiscoverUser[] = filteredCachedUsers.map(u => ({
          id: u.id,
          username: u.username,
          gender: u.gender,
          avatar: u.avatar,
          rating: u.rating,
          verified: u.verified,
          connectionCount: u.connectionCount || 0,
          status: u.status,
          lastSeen: u.lastSeen,
        }));

        if (sortBy === 'rating') {
          result = discoverUsers.sort((a, b) => b.rating - a.rating).slice(0, 20);
        } else if (sortBy === 'verified') {
          result = discoverUsers.filter(u => u.verified).slice(0, 20);
        } else if (sortBy === 'active') {
          result = discoverUsers
            .sort((a, b) => (b.lastSeen ? new Date(b.lastSeen).getTime() : 0) - (a.lastSeen ? new Date(a.lastSeen).getTime() : 0))
            .slice(0, 20);
        } else if (sortBy === 'connections') {
          result = discoverUsers.sort((a, b) => b.connectionCount - a.connectionCount).slice(0, 20);
        } else { // random
          const shuffled = [...discoverUsers];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          result = shuffled.slice(0, 20);
        }

        setUsers(result);
        setIsError(false); 
      } else {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [sortBy, user?.uid]);

  // Listen for pending requests to disable connect buttons
  useEffect(() => {
    if (!user?.uid) return;

    const pendingQuery = query(
      collection(db, 'chatRequests'),
      where('senderId', '==', user.uid),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(pendingQuery, (snapshot) => {
      const pendingUserIds = new Set(snapshot.docs.map(doc => doc.data().receiverId));
      setPendingRequests(pendingUserIds);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchUsers();
    setRefreshing(false);
  };

  const handleSendRequest = async (userId: string, username: string) => {
    if (!user?.uid) return;

    try {
      const requestDoc = {
        senderId: user.uid,
        receiverId: userId,
        status: 'pending' as const,
        message: '',
        createdAt: new Date(),
      };

      await addDoc(collection(db, 'chatRequests'), requestDoc);
      Alert.alert('Success', `Connection request sent to ${username}!`);
    } catch (error) {
      Alert.alert('Error', 'Failed to send request');
    }
  };

  const renderUser = ({ item }: { item: DiscoverUser }) => {
    const hasPendingRequest = pendingRequests.has(item.id);

    return (
      <View style={styles.userCard}>
        <View style={styles.userHeader}>
          <Text style={styles.avatar}>{item.avatar}</Text>
          <View style={styles.userInfo}>
            <View style={styles.usernameRow}>
              <Text style={styles.username}>{item.username}</Text>
              {item.verified && (
                <Shield size={16} color="#007AFF" fill="#007AFF" />
              )}
            </View>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Star size={14} color="#FFB800" fill="#FFB800" />
                <Text style={styles.statText}>
                  {item.rating > 0 ? item.rating.toFixed(1) : "New"}
                </Text>
              </View>
              <View style={styles.stat}>
                <Users size={14} color="#666" />
                <Text style={styles.statText}>{item.connectionCount}</Text>
              </View>
            </View>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  item.status === "online"
                    ? styles.statusOnline
                    : styles.statusOffline,
                ]}
              />
              <Text style={styles.statusText}>
                {item.status === "online" ? "Online" : "Offline"}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.connectButton,
            hasPendingRequest && styles.connectButtonDisabled
          ]}
          onPress={() => !hasPendingRequest && handleSendRequest(item.id, item.username)}
          disabled={hasPendingRequest}
        >
          <Send size={18} color="#fff" />
          <Text style={styles.connectButtonText}>
            {hasPendingRequest ? "Request Sent" : "Connect"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, sortBy === "random" && styles.filterButtonActive]}
          onPress={() => setSortBy("random")}
        >
          <Text style={[styles.filterButtonText, sortBy === "random" && styles.filterButtonTextActive]}>
            Random
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, sortBy === "rating" && styles.filterButtonActive]}
          onPress={() => setSortBy("rating")}
        >
          <Text style={[styles.filterButtonText, sortBy === "rating" && styles.filterButtonTextActive]}>
            Top Rated
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, sortBy === "verified" && styles.filterButtonActive]}
          onPress={() => setSortBy("verified")}
        >
          <Text style={[styles.filterButtonText, sortBy === "verified" && styles.filterButtonTextActive]}>
            Verified
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Failed to load users</Text>
          <Text style={styles.errorSubtext}>{error?.message || "Please check your connection"}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchUsers()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={users as DiscoverUser[] || []}
          renderItem={renderUser}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No users found</Text>
              <Text style={styles.emptySubtext}>Try changing the filter</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  filterContainer: {
    flexDirection: "row",
    padding: 12,
    gap: 8,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#f5f5f5",
    alignItems: "center",
  },
  filterButtonActive: {
    backgroundColor: "#007AFF",
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#666",
  },
  filterButtonTextActive: {
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
  userCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userHeader: {
    flexDirection: "row",
    marginBottom: 16,
  },
  avatar: {
    fontSize: 48,
    marginRight: 12,
  },
  userInfo: {
    flex: 1,
    justifyContent: "center",
  },
  usernameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  username: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#1a1a1a",
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 4,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statText: {
    fontSize: 14,
    color: "#666",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusOnline: {
    backgroundColor: "#34C759",
  },
  statusOffline: {
    backgroundColor: "#999",
  },
  statusText: {
    fontSize: 12,
    color: "#666",
  },
  connectButton: {
    flexDirection: "row",
    backgroundColor: "#007AFF",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  connectButtonDisabled: {
    opacity: 0.6,
  },
  connectButtonText: {
    color: "#fff",
    fontSize: 16,
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
  errorText: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: "#FF3B30",
    marginBottom: 8,
  },
  errorSubtext: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600" as const,
  },
});
