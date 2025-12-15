import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Shield,
  Star,
  Users,
  Calendar,
  LogOut,
  Edit,
} from "lucide-react-native";

export default function ProfileScreen() {
  const { userProfile, signOut } = useAuth();

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => signOut(),
      },
    ]);
  };

  if (!userProfile) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <Text style={styles.avatar}>{userProfile.avatar}</Text>
          <TouchableOpacity style={styles.editButton}>
            <Edit size={20} color="#013a96da" />
          </TouchableOpacity>
        </View>
        <View style={styles.usernameRow}>
          <Text style={styles.username}>{userProfile.username}</Text>
          {userProfile.verified && (
            <Shield size={20} color="#013a96da" fill="#013a96da" />
          )}
        </View>
        <Text style={styles.gender}>{userProfile.gender}</Text>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statBox}>
          <Star size={24} color="#FFB800" fill="#FFB800" />
          <Text style={styles.statValue}>
            {userProfile.rating > 0 ? userProfile.rating.toFixed(1) : "New"}
          </Text>
          <Text style={styles.statLabel}>Rating</Text>
        </View>

        <View style={styles.statBox}>
          <Users size={24} color="#013a96da" />
          <Text style={styles.statValue}>{userProfile.connectionCount}</Text>
          <Text style={styles.statLabel}>Connections</Text>
        </View>

        <View style={styles.statBox}>
          <Calendar size={24} color="#34C759" />
          <Text style={styles.statValue}>
            {(userProfile.joinDate as any)?.toDate
              ? (userProfile.joinDate as any)
                  .toDate()
                  .toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })
              : new Date(userProfile.joinDate as any).toLocaleDateString(
                  "en-US",
                  {
                    month: "short",
                    year: "numeric",
                  }
                )}
          </Text>
          <Text style={styles.statLabel}>Joined</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Total Ratings:</Text>
            <Text style={styles.infoValue}>{userProfile.totalRatings}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Status:</Text>
            <View style={styles.statusContainer}>
              <View style={[styles.statusDot, styles.statusOnline]} />
              <Text style={styles.infoValue}>{userProfile.status}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Settings</Text>
        <TouchableOpacity style={styles.settingButton}>
          <Edit size={20} color="#666" />
          <Text style={styles.settingButtonText}>Change Avatar</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <LogOut size={20} color="#FF3B30" />
        <Text style={styles.signOutButtonText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Stay anonymous. Stay safe. Stay connected.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    alignItems: "center",
    padding: 24,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  avatarContainer: {
    position: "relative",
    marginBottom: 12,
  },
  avatar: {
    fontSize: 80,
  },
  editButton: {
    position: "absolute",
    bottom: 0,
    right: -8,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 8,
    borderWidth: 2,
    borderColor: "#013a96da",
  },
  usernameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  username: {
    fontSize: 24,
    fontWeight: "700" as const,
    color: "#1a1a1a",
  },
  gender: {
    fontSize: 16,
    color: "#666",
    textTransform: "capitalize",
  },
  statsContainer: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
    backgroundColor: "#fff",
    marginTop: 12,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
    padding: 16,
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: "#1a1a1a",
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  section: {
    marginTop: 12,
    backgroundColor: "#fff",
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#1a1a1a",
    marginBottom: 12,
  },
  infoCard: {
    gap: 12,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 16,
    color: "#666",
  },
  infoValue: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#1a1a1a",
  },
  statusContainer: {
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
  settingButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
  },
  settingButtonText: {
    fontSize: 16,
    color: "#1a1a1a",
  },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    margin: 16,
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FF3B30",
  },
  signOutButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#FF3B30",
  },
  footer: {
    padding: 24,
    alignItems: "center",
  },
  footerText: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
  },
});
