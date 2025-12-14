import { StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import AuthScreen from "@/components/AuthScreen";
import DiscoverScreen from "@/components/DiscoverScreen";
import React from "react";

export default function TabOneScreen() {
  const { user, userProfile, isLoading } = useAuth();

  // Show loading only if no cached profile and authenticating
  if (isLoading && !userProfile) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.text}>Loading...</Text>
      </View>
    );
  }

  if (!user && !userProfile) {
    return <AuthScreen />;
  }

  return <DiscoverScreen />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fff",
  },
  text: {
    fontSize: 16,
    textAlign: "center",
    paddingHorizontal: 20,
    marginTop: 12,
    color: "#666",
  },
});
