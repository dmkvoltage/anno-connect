import { StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import AuthScreen from "@/components/AuthScreen";
import ConnectionsScreen from "@/components/ConnectionsScreen";
import React from "react";

export default function ConnectionsTab() {
  const { user, userProfile, isLoading } = useAuth();

  if (isLoading && !userProfile) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!user && !userProfile) {
    return <AuthScreen />;
  }

  return <ConnectionsScreen />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
});
