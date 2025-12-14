import { StyleSheet, Text, View, ActivityIndicator } from "react-native";
import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import AuthScreen from "@/components/AuthScreen";
import ChatsScreen from "@/components/ChatsScreen";

export default function ChatsTab() {
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

  return <ChatsScreen />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
});
