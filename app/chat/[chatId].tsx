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
  StatusBar,
  Platform,
  ActivityIndicator,
  Modal,
  Animated,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
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
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ArrowLeft, Send, Check, CheckCheck, Edit3, Trash2, X, Shield } from "lucide-react-native";
import type { Message } from "@/types/chat";

interface ChatMessage extends Message {
  id: string;
  deletedBy?: string[];
  readBy?: string[];
}

interface ChatParticipant {
  id: string;
  username: string;
  avatar: string;
  verified: boolean;
  isTyping?: boolean;
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
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const hasMarkedAsRead = useRef(false);
  const slideAnim = useRef(new Animated.Value(300)).current;

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
              verified: participantData?.verified || false,
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

    const unsubscribe = onSnapshot(messagesQuery, async (snapshot) => {
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

      // Mark unread messages as read and update delivery status
      if (!hasMarkedAsRead.current && filteredMessages.length > 0) {
        hasMarkedAsRead.current = true;
        await markMessagesAsRead(filteredMessages);
      }
    });

    return () => unsubscribe();
  }, [chatId, user?.uid]);

  // Mark messages as read when user enters chat
  const markMessagesAsRead = async (messagesToMark: ChatMessage[]) => {
    try {
      const batch = writeBatch(db);
      let unreadCount = 0;

      messagesToMark.forEach((msg) => {
        const readBy = msg.readBy || [];
        
        // If message is not from current user and not already read
        if (msg.senderId !== user?.uid && !readBy.includes(user?.uid || "")) {
          unreadCount++;
          const messageRef = doc(db, "messages", msg.id);
          batch.update(messageRef, {
            readBy: [...readBy, user?.uid],
            status: 'read'
          });
        } else if (msg.senderId !== user?.uid && !readBy.includes(user?.uid || "")) {
          // Mark as delivered if not already
          const messageRef = doc(db, "messages", msg.id);
          batch.update(messageRef, {
            readBy: [...readBy, user?.uid],
            status: 'delivered'
          });
        }
      });

      // Reset unread count for this user
      if (unreadCount > 0) {
        const chatRef = doc(db, "chats", chatId as string);
        batch.update(chatRef, {
          [`unreadCount.${user?.uid}`]: 0,
        });
      }

      await batch.commit();
    } catch (error) {
      console.error("Error marking messages as read:", error);
    }
  };

  // Listen to typing status changes
  useEffect(() => {
    if (!participant?.id) return;

    const chatRef = doc(db, "chats", chatId as string);
    const unsubscribe = onSnapshot(chatRef, (doc) => {
      const data = doc.data();
      if (data?.typing?.[participant.id]) {
        setParticipant(prev => prev ? { ...prev, isTyping: true } : null);
      } else {
        setParticipant(prev => prev ? { ...prev, isTyping: false } : null);
      }
    });

    return () => unsubscribe();
  }, [participant?.id, chatId]);

  // Cleanup typing status when component unmounts
  useEffect(() => {
    return () => {
      if (isTyping) {
        updateTypingStatus(false);
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [isTyping]);

  // Animate action sheet
  useEffect(() => {
    if (showActionSheet) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [showActionSheet]);

  const openActionSheet = (message: ChatMessage) => {
    setSelectedMessage(message);
    setShowActionSheet(true);
  };

  const closeActionSheet = () => {
    setShowActionSheet(false);
    setTimeout(() => setSelectedMessage(null), 200);
  };

  const startEditing = (message: ChatMessage) => {
    setEditingMessage(message);
    setNewMessage(message.content);
    closeActionSheet();
  };

  const deleteMessageForEveryone = async () => {
    if (!selectedMessage) return;
    try {
      await deleteDoc(doc(db, "messages", selectedMessage.id));
      closeActionSheet();
    } catch (error) {
      console.error("Error deleting message:", error);
    }
  };

  const deleteMessageForMe = async () => {
    if (!selectedMessage) return;
    try {
      const messageRef = doc(db, "messages", selectedMessage.id);
      await updateDoc(messageRef, {
        deletedBy: [
          ...((await getDoc(messageRef)).data()?.deletedBy || []),
          user?.uid,
        ],
      });
      closeActionSheet();
    } catch (error) {
      console.error("Error deleting message for me:", error);
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
      const chatRef = doc(db, "chats", chatId as string);
      const chatSnap = await getDoc(chatRef);
      const chatData = chatSnap.data();
      
      const lastMessageTime = (chatData?.lastMessage?.createdAt as any)?.toDate
        ? (chatData?.lastMessage?.createdAt as any).toDate().getTime()
        : new Date(chatData?.lastMessage?.createdAt as any).getTime();
      const editingMessageTime = (editingMessage.createdAt as any)?.toDate
        ? (editingMessage.createdAt as any).toDate().getTime()
        : new Date(editingMessage.createdAt as any).getTime();
      
      if (lastMessageTime === editingMessageTime) {
        await updateDoc(chatRef, {
          lastMessage: {
            content: newMessage.trim(),
            senderId: user?.uid,
            createdAt: editingMessage.createdAt,
            readBy: editingMessage.readBy || [user?.uid],
          },
          lastActivity: new Date(),
        });
      }

      setEditingMessage(null);
      setNewMessage("");
    } catch (error) {
      console.error("Error editing message:", error);
    } finally {
      setSending(false);
    }
  };

  const cancelEditing = () => {
    setEditingMessage(null);
    setNewMessage("");
  };

  const handleTextChange = (text: string) => {
    setNewMessage(text);

    if (!editingMessage && text.trim()) {
      if (!isTyping) {
        setIsTyping(true);
        updateTypingStatus(true);
      }

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        updateTypingStatus(false);
      }, 2000);
    } else if (isTyping && !text.trim()) {
      setIsTyping(false);
      updateTypingStatus(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };

  const updateTypingStatus = async (typing: boolean) => {
    try {
      await updateDoc(doc(db, "chats", chatId as string), {
        [`typing.${user?.uid}`]: typing,
      });
    } catch (error) {
      console.error("Error updating typing status:", error);
    }
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
        readBy: [user.uid],
      };

      const messageRef = await addDoc(collection(db, "messages"), messageDoc);

      // Update chat last message and increment unread count
      const chatRef = doc(db, "chats", chatId as string);
      const chatSnap = await getDoc(chatRef);
      const chatData = chatSnap.data();
      const currentUnreadCount = chatData?.unreadCount?.[participant?.id || ''] || 0;

      await updateDoc(chatRef, {
        lastMessage: {
          content: newMessage.trim(),
          senderId: user.uid,
          createdAt: new Date(),
          readBy: [user.uid],
        },
        lastActivity: new Date(),
        [`unreadCount.${participant?.id}`]: currentUnreadCount + 1,
      });

      setNewMessage("");
      
      // Clear typing status
      if (isTyping) {
        setIsTyping(false);
        updateTypingStatus(false);
      }
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isOwnMessage = item.senderId === user?.uid;
    const messageDate = (item.createdAt as any)?.toDate
      ? (item.createdAt as any).toDate()
      : new Date(item.createdAt as any);
    const timeAgo = getTimeAgo(messageDate);

    // Determine message status for own messages
    const readBy = item.readBy || [];
    const isRead = participant?.id && readBy.includes(participant.id);
    const isDelivered = readBy.length > 1;

    const handleLongPress = () => {
      openActionSheet(item);
    };

    return (
      <TouchableOpacity
        style={[
          styles.messageContainer,
          isOwnMessage ? styles.ownMessage : styles.otherMessage,
        ]}
        onLongPress={handleLongPress}
        delayLongPress={500}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.messageText,
            isOwnMessage ? styles.ownMessageText : styles.otherMessageText,
          ]}
        >
          {item.content}
        </Text>
        <View style={styles.messageFooter}>
          <Text
            style={[
              styles.messageTime,
              isOwnMessage ? styles.ownMessageTime : styles.otherMessageTime,
            ]}
          >
            {timeAgo}
          </Text>
          {isOwnMessage && (
            <View style={styles.statusContainer}>
              {isRead ? (
                <CheckCheck size={16} color="#4CAF50" />
              ) : isDelivered ? (
                <CheckCheck size={16} color="rgba(255, 255, 255, 0.7)" />
              ) : (
                <Check size={16} color="rgba(255, 255, 255, 0.7)" />
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderActionSheet = () => {
    if (!selectedMessage) return null;

    const isOwnMessage = selectedMessage.senderId === user?.uid;
    const messageDate = (selectedMessage.createdAt as any)?.toDate
      ? (selectedMessage.createdAt as any).toDate()
      : new Date(selectedMessage.createdAt as any);
    const now = new Date();
    const diffMinutes = (now.getTime() - messageDate.getTime()) / (1000 * 60);
    const canEdit = isOwnMessage && diffMinutes <= 40;

    return (
      <Modal
        visible={showActionSheet}
        transparent
        animationType="fade"
        onRequestClose={closeActionSheet}
      >
        <Pressable style={styles.modalOverlay} onPress={closeActionSheet}>
          <Pressable style={styles.actionSheetContainer} onPress={(e) => e.stopPropagation()}>
            <Animated.View
              style={[
                styles.actionSheet,
                {
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              {/* Header */}
              <View style={styles.actionSheetHeader}>
                <Text style={styles.actionSheetTitle}>Message Options</Text>
                <TouchableOpacity onPress={closeActionSheet} style={styles.closeButton}>
                  <X size={24} color="#666" />
                </TouchableOpacity>
              </View>

              {/* Actions */}
              <View style={styles.actionsList}>
                {canEdit && (
                  <>
                    <TouchableOpacity
                      style={styles.actionItem}
                      onPress={() => startEditing(selectedMessage)}
                    >
                      <View style={[styles.actionIconContainer, styles.editIconBg]}>
                        <Edit3 size={20} color="#007AFF" />
                      </View>
                      <Text style={styles.actionText}>Edit Message</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionItem}
                      onPress={deleteMessageForEveryone}
                    >
                      <View style={[styles.actionIconContainer, styles.deleteIconBg]}>
                        <Trash2 size={20} color="#FF3B30" />
                      </View>
                      <Text style={[styles.actionText, styles.deleteText]}>
                        Delete for Everyone
                      </Text>
                    </TouchableOpacity>
                  </>
                )}

                {!isOwnMessage && (
                  <TouchableOpacity
                    style={styles.actionItem}
                    onPress={deleteMessageForMe}
                  >
                    <View style={[styles.actionIconContainer, styles.deleteIconBg]}>
                      <Trash2 size={20} color="#FF3B30" />
                    </View>
                    <Text style={[styles.actionText, styles.deleteText]}>
                      Delete for Me
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Cancel Button */}
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={closeActionSheet}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </Animated.View>
          </Pressable>
        </Pressable>
      </Modal>
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
    <React.Fragment>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
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
            <View>
              <View style={styles.usernameRow}>
                <Text style={styles.headerUsername}>{participant?.username}</Text>
                {participant?.verified && (
                  <Shield size={16} color="#007AFF" fill="#007AFF" />
                )}
              </View>
              {participant?.isTyping && (
                <Text style={styles.typingIndicator}>typing...</Text>
              )}
            </View>
          </View>
        </View>

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesContainer}
          style={styles.messagesList}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          onLayout={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No messages yet</Text>
              <Text style={styles.emptySubtext}>Start the conversation!</Text>
            </View>
          }
        />

        {/* Editing Bar */}
        {editingMessage && (
          <View style={styles.editingBar}>
            <View style={styles.editingInfo}>
              <Edit3 size={16} color="#007AFF" />
              <Text style={styles.editingText}>Editing message</Text>
            </View>
            <TouchableOpacity onPress={cancelEditing}>
              <X size={20} color="#666" />
            </TouchableOpacity>
          </View>
        )}

        {/* Input */}
        <View
          style={[
            styles.inputContainer,
            { marginBottom: insets.bottom },
          ]}
        >
          <TextInput
            style={styles.textInput}
            value={newMessage}
            onChangeText={handleTextChange}
            placeholder={
              editingMessage ? "Edit message..." : "Type a message..."
            }
            placeholderTextColor="#999"
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!newMessage.trim() || sending) && styles.sendButtonDisabled,
            ]}
            onPress={sendMessage}
            disabled={!newMessage.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Send size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>

        {/* Action Sheet */}
        {renderActionSheet()}
      </KeyboardAvoidingView>
    </React.Fragment>
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
  usernameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerUsername: {
    fontSize: 20,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  typingIndicator: {
    fontSize: 12,
    color: "#4CAF50",
    fontStyle: "italic",
    marginTop: 2,
  },
  messagesContainer: {
    flexGrow: 1,
    padding: 20,
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
  messageFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 4,
    gap: 4,
  },
  messageTime: {
    fontSize: 11,
  },
  ownMessageTime: {
    color: "rgba(255, 255, 255, 0.7)",
  },
  otherMessageTime: {
    color: "#999",
  },
  statusContainer: {
    marginLeft: 2,
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
  editingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    backgroundColor: "#E3F2FD",
    borderTopWidth: 1,
    borderTopColor: "#BBDEFB",
  },
  editingInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  editingText: {
    fontSize: 14,
    color: "#007AFF",
    fontWeight: "500",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
    gap: 8,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    padding: 12,
    paddingRight: 16,
    backgroundColor: "#f8f8f8",
    borderRadius: 20,
    fontSize: 16,
    color: "#1a1a1a",
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  actionSheetContainer: {
    justifyContent: "flex-end",
  },
  actionSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
  },
  actionSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  actionSheetTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  closeButton: {
    padding: 4,
  },
  actionsList: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    gap: 16,
  },
  actionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  editIconBg: {
    backgroundColor: "#E3F2FD",
  },
  deleteIconBg: {
    backgroundColor: "#FFEBEE",
  },
  actionText: {
    fontSize: 16,
    color: "#1a1a1a",
    fontWeight: "500",
  },
  deleteText: {
    color: "#FF3B30",
  },
  cancelButton: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 16,
    backgroundColor: "#f8f8f8",
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    color: "#666",
    fontWeight: "600",
  },
});
