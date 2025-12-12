import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  orderBy,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ArrowLeft, Send } from "lucide-react-native";
import type { Message } from "@/types/chat";

interface ChatMessage extends Message {
  id: string;
  deletedBy?: string[];
}

interface ChatParticipant {
  id: string;
  username: string;
  avatar: string;
}

// Helper function to format time ago
const getTimeAgo = (date: Date) => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;

  return date.toLocaleDateString();
};

export default function ChatScreen() {
  const { chatId } = useLocalSearchParams();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [participant, setParticipant] = useState<ChatParticipant | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(
    null
  );
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!chatId || !user?.uid) return;

    setLoading(true);

    // Get chat info and participant
    const fetchChatInfo = async () => {
      try {
        const chatDoc = await getDoc(doc(db, "chats", chatId as string));
        if (chatDoc.exists()) {
          const chatData = chatDoc.data();
          const otherParticipantId = chatData.participants.find(
            (id: string) => id !== user.uid
          );

          if (otherParticipantId) {
            const participantDoc = await getDoc(
              doc(db, "users", otherParticipantId)
            );
            const participantData = participantDoc.data();
            setParticipant({
              id: otherParticipantId,
              username: participantData?.username || "Unknown",
              avatar: participantData?.avatar || "👤",
            });
          }
        }
      } catch (error) {
        console.error("Error fetching chat info:", error);
      }
    };

    fetchChatInfo();

    // Listen to messages
    const messagesQuery = query(
      collection(db, "messages"),
      where("chatId", "==", chatId),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const messagesData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ChatMessage[];

      // Filter out messages deleted by current user
      const filteredMessages = messagesData.filter((message) => {
        const deletedBy = message.deletedBy || [];
        return !deletedBy.includes(user?.uid || "");
      });

      setMessages(filteredMessages);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [chatId, user?.uid]);

  useEffect(() => {
    const showListener = Keyboard.addListener("keyboardDidShow", (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideListener = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
    });

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);

  const startEditing = (message: ChatMessage) => {
    setEditingMessage(message);
    setNewMessage(message.content);
  };

  const deleteMessageForEveryone = async (messageId: string) => {
    try {
      await deleteDoc(doc(db, "messages", messageId));
      Alert.alert("Success", "Message deleted for everyone");
    } catch (error) {
      console.error("Error deleting message:", error);
      Alert.alert("Error", "Failed to delete message");
    }
  };

  const deleteMessageForMe = async (messageId: string) => {
    try {
      // Add current user to deletedBy array
      const messageRef = doc(db, "messages", messageId);
      await updateDoc(messageRef, {
        deletedBy: [
          ...((await getDoc(messageRef)).data()?.deletedBy || []),
          user?.uid,
        ],
      });
      Alert.alert("Success", "Message deleted from your chat");
    } catch (error) {
      console.error("Error deleting message for me:", error);
      Alert.alert("Error", "Failed to delete message");
    }
  };

  const editMessage = async () => {
    if (!editingMessage || !newMessage.trim() || sending) return;

    setSending(true);
    try {
      await updateDoc(doc(db, "messages", editingMessage.id), {
        content: newMessage.trim(),
        editedAt: new Date(),
      });

      // Update chat last message if this was the last message
      await updateDoc(doc(db, "chats", chatId as string), {
        lastMessage: {
          content: newMessage.trim(),
          senderId: user?.uid,
          createdAt: editingMessage.createdAt,
        },
        lastActivity: new Date(),
      });

      setEditingMessage(null);
      setNewMessage("");
    } catch (error) {
      Alert.alert("Error", "Failed to edit message");
    } finally {
      setSending(false);
    }
  };

  const cancelEditing = () => {
    setEditingMessage(null);
    setNewMessage("");
  };

  const sendMessage = async () => {
    if (editingMessage) {
      await editMessage();
      return;
    }

    if (!newMessage.trim() || !user?.uid || !chatId || sending) return;

    setSending(true);
    try {
      const messageDoc = {
        chatId,
        senderId: user.uid,
        content: newMessage.trim(),
        type: "text" as const,
        encrypted: false,
        status: "sent" as const,
        createdAt: new Date(),
      };

      await addDoc(collection(db, "messages"), messageDoc);

      // Update chat last message and activity
      await updateDoc(doc(db, "chats", chatId as string), {
        lastMessage: {
          content: newMessage.trim(),
          senderId: user.uid,
          createdAt: new Date(),
        },
        lastActivity: new Date(),
      });

      setNewMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isOwnMessage = item.senderId === user?.uid;
    // Handle Firestore Timestamp or regular Date
    const messageDate = (item.createdAt as any)?.toDate
      ? (item.createdAt as any).toDate()
      : new Date(item.createdAt as any);
    const timeAgo = getTimeAgo(messageDate);

    const handleLongPress = () => {
      const now = new Date();
      const messageTime = messageDate;
      const diffMinutes = (now.getTime() - messageTime.getTime()) / (1000 * 60);

      const options = [];

      if (isOwnMessage && diffMinutes <= 40) {
        options.push(
          { text: "Edit", onPress: () => startEditing(item) },
          {
            text: "Delete for everyone",
            style: "destructive" as const,
            onPress: () => deleteMessageForEveryone(item.id),
          }
        );
      } else if (!isOwnMessage) {
        options.push({
          text: "Delete for me",
          style: "destructive" as const,
          onPress: () => deleteMessageForMe(item.id),
        });
      }

      if (options.length > 0) {
        Alert.alert("Message Options", "Choose an action", [
          ...options,
          { text: "Cancel", style: "cancel" as const },
        ]);
      }
    };

    return (
      <TouchableOpacity
        style={[
          styles.messageContainer,
          isOwnMessage ? styles.ownMessage : styles.otherMessage,
        ]}
        onLongPress={handleLongPress}
        delayLongPress={500}
      >
        <Text
          style={[
            styles.messageText,
            isOwnMessage ? styles.ownMessageText : styles.otherMessageText,
          ]}
        >
          {item.content}
        </Text>
        <Text
          style={[
            styles.messageTime,
            isOwnMessage ? styles.ownMessageTime : styles.otherMessageTime,
          ]}
        >
          {timeAgo}
        </Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color="#007AFF" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerAvatar}>{participant?.avatar}</Text>
          <Text style={styles.headerUsername}>{participant?.username}</Text>
        </View>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesContainer}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No messages yet</Text>
              <Text style={styles.emptySubtext}>Start the conversation!</Text>
            </View>
          }
        />
      </KeyboardAvoidingView>

      {/* Input */}
      <View
        style={[
          styles.inputContainer,
          { paddingBottom: insets.bottom + keyboardHeight },
        ]}
      >
        <TextInput
          style={styles.textInput}
          value={newMessage}
          onChangeText={setNewMessage}
          placeholder={editingMessage ? "Edit message..." : "Type a message..."}
          placeholderTextColor="#999"
          multiline
          maxLength={1000}
        />
        <View style={styles.inputButtons}>
          {editingMessage && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={cancelEditing}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!newMessage.trim() || sending) && styles.sendButtonDisabled,
            ]}
            onPress={sendMessage}
            disabled={!newMessage.trim() || sending}
          >
            <Send size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
  messagesList: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
    justifyContent: "flex-end",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  backButton: {
    marginRight: 12,
  },
  headerInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  headerAvatar: {
    fontSize: 32,
    marginRight: 12,
  },
  headerUsername: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  messagesContainer: {
    flex: 1,
    padding: 16,
  },
  messageContainer: {
    maxWidth: "80%",
    marginBottom: 12,
    padding: 12,
    borderRadius: 16,
  },
  ownMessage: {
    alignSelf: "flex-end",
    backgroundColor: "#007AFF",
  },
  otherMessage: {
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  ownMessageText: {
    color: "#fff",
  },
  otherMessageText: {
    color: "#1a1a1a",
  },
  messageTime: {
    fontSize: 12,
    marginTop: 4,
  },
  ownMessageTime: {
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "right",
  },
  otherMessageTime: {
    color: "#999",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    padding: 12,
    paddingRight: 16,
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    fontSize: 16,
    color: "#1a1a1a",
    marginRight: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  inputButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f5f5f5",
    borderRadius: 16,
  },
  cancelButtonText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#ccc",
  },
});
