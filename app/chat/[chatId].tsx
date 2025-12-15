"use client"

import React, { useState, useEffect, useRef } from "react"
import {
StyleSheet,
Text,
View,
FlatList,
TextInput,
TouchableOpacity,
KeyboardAvoidingView,
StatusBar,
ActivityIndicator,
Modal,
Animated,
Pressable,
Keyboard,
InteractionManager,
} from "react-native"
import { PanGestureHandler, State } from "react-native-gesture-handler"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useLocalSearchParams, useRouter, Stack } from "expo-router"
import { useAuth } from "@/contexts/AuthContext"
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
setDoc,
} from "firebase/firestore"
import { db } from "@/lib/firebase"
import { ArrowLeft, Send, Edit3, Trash2, X, Shield } from "lucide-react-native"
import type { Message } from "@/types/chat"
import type { CachedMessage } from "@/lib/storage"
import { MessageCache, UserCache, ChatCache } from "@/lib/storage"

interface ChatMessage extends Message {
id: string
deletedBy?: string[]
readBy?: string[]
}

interface ChatParticipant {
id: string
username: string
avatar: string
verified: boolean
isTyping?: boolean
}

// Helper function to format time ago
const getTimeAgo = (date: Date) => {
const now = new Date()
const diffMs = now.getTime() - date.getTime()
const diffMins = Math.floor(diffMs / (1000 * 60))
const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

if (diffMins < 1) return "now"
if (diffMins < 60) return `${diffMins}m`
if (diffHours < 24) return `${diffHours}h`
if (diffDays < 7) return `${diffDays}d`

return date.toLocaleDateString()
}

export default function ChatDetail() {
const { chatId } = useLocalSearchParams()
const { user } = useAuth()
const router = useRouter()
const insets = useSafeAreaInsets()
const [messages, setMessages] = useState<ChatMessage[]>([])
const [newMessage, setNewMessage] = useState("")

const [sending, setSending] = useState(false)
const [participant, setParticipant] = useState<ChatParticipant | null>(null)
const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null)
const [replyingToMessage, setReplyingToMessage] = useState<ChatMessage | null>(null)
const [isTyping, setIsTyping] = useState(false)
const [showActionSheet, setShowActionSheet] = useState(false)
const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null)
const [lastReadAt, setLastReadAt] = useState<Date | null>(null)
const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
const flatListRef = useRef<FlatList>(null)
const initialScrollIndex = useRef<number | null>(null)
const didInitialScroll = useRef(false)
const hasResetUnreadCount = useRef(false)
const slideAnim = useRef(new Animated.Value(300)).current
const viewabilityConfig = useRef({
  itemVisiblePercentThreshold: 50,
}).current
const isNearBottom = useRef(true)

const handleLayout = () => {
  // Handle layout changes here
}

const handleScroll = (event: any) => {
  const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent
  const paddingToBottom = 50
  isNearBottom.current = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom
}

const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
  if (!user?.uid || !chatId || !lastReadAt || viewableItems.length === 0) return

  // Check if any unread messages became visible
  const hasUnreadVisible = viewableItems.some((item: any) => {
    const msg = item.item
    const messageDate = (msg.createdAt as any)?.toDate?.() ?? new Date(msg.createdAt)
    return msg.senderId !== user.uid && messageDate > lastReadAt
  })

  // Update lastReadAt timestamp when unread messages are viewed
  if (hasUnreadVisible) {
    updateLastReadAt(chatId as string, user.uid)
  }
}).current

useEffect(() => {
  if (!chatId || !user?.uid) return

  const fetchLastReadAt = async () => {
    try {
      const readStatusDoc = await getDoc(doc(db, "chats", chatId as string, "readStatus", user.uid))
      if (readStatusDoc.exists()) {
        const data = readStatusDoc.data()
        if (data?.lastReadAt) {
          setLastReadAt(data.lastReadAt.toDate())
        }
      }
    } catch (error) {
      console.error("Error fetching lastReadAt:", error)
    }
  }

  fetchLastReadAt()
}, [chatId, user?.uid])

useEffect(() => {
  if (!chatId || !user?.uid) return

  // Load cached messages immediately for instant display
  const loadFromCache = () => {
    const cachedMessages = MessageCache.getMessages(chatId as string)

    // Filter out messages deleted by current user and convert to ChatMessage format
    const filteredMessages: ChatMessage[] = cachedMessages
      .filter((message) => {
        const deletedBy = message.deletedBy || []
        return !deletedBy.includes(user.uid)
      })
      .map((msg) => ({
        id: msg.id,
        chatId: msg.chatId,
        senderId: msg.senderId,
        content: msg.content,
        type: msg.type as any, // Compatible with Message interface
        encrypted: msg.encrypted,
        status: msg.status as any, // Compatible with MessageStatus
        createdAt: new Date(msg.createdAt), // Convert ISO string to Date
        readBy: msg.readBy,
        replyTo: msg.replyTo,
        ...(msg.editedAt && { editedAt: new Date(msg.editedAt) }),
        deletedBy: msg.deletedBy,
      }))

    setMessages(filteredMessages)
  }

  loadFromCache()

  // Get chat info and participant (try cache first, then server)
  const fetchChatInfo = async () => {
    // Try cache first
    const cachedChat = ChatCache.getChat(chatId as string)
    if (cachedChat) {
      const otherParticipantId = cachedChat.participants.find((id: string) => id !== user.uid)
      if (otherParticipantId) {
        const cachedUser = UserCache.getUser(otherParticipantId)
        if (cachedUser) {
          setParticipant({
            id: otherParticipantId,
            username: cachedUser.username || "Unknown",
            avatar: cachedUser.avatar || "👤",
            verified: cachedUser.verified || false,
          })
        }
      }
    }

    // Fetch from server in background
    try {
      const chatDoc = await getDoc(doc(db, "chats", chatId as string))
      if (chatDoc.exists()) {
        const chatData = chatDoc.data()
        const otherParticipantId = chatData.participants.find((id: string) => id !== user.uid)

        if (otherParticipantId) {
          const participantDoc = await getDoc(doc(db, "users", otherParticipantId))
          const participantData = participantDoc.data()
          setParticipant({
            id: otherParticipantId,
            username: participantData?.username || "Unknown",
            avatar: participantData?.avatar || "👤",
            verified: participantData?.verified || false,
          })

          // Cache participant
          if (participantData) {
            UserCache.setUser({
              id: otherParticipantId,
              username: participantData.username || "Unknown",
              gender: participantData.gender || "other",
              avatar: participantData.avatar || "👤",
              rating: participantData.rating || 0,
              verified: participantData.verified || false,
              status: participantData.status || "offline",
              lastSeen: participantData.lastSeen?.toDate?.()?.toISOString() || undefined,
              connectionCount: participantData.connectionCount || 0,
              synced: true,
            })
          }

          // Cache chat
          if (chatData) {
            ChatCache.setChat({
              id: chatId as string,
              participants: chatData.participants || [],
              lastMessage: chatData.lastMessage ? {
                content: chatData.lastMessage.content,
                senderId: chatData.lastMessage.senderId,
                createdAt: chatData.lastMessage.createdAt?.toDate?.()?.toISOString() || chatData.lastMessage.createdAt,
                readBy: chatData.lastMessage.readBy || []
              } : undefined,
              lastActivity: chatData.lastActivity?.toDate?.()?.toISOString() || new Date().toISOString(),
              unreadCount: chatData.unreadCount || {},
              synced: true,
            })
          }
        }
      }
    } catch (error) {
      console.log("Background sync error, but cached data displayed:", error)
    }
  }

  fetchChatInfo()

  // Listen to messages in background (offline-first approach)
  const messagesQuery = query(collection(db, "messages"), where("chatId", "==", chatId), orderBy("createdAt", "asc"))

  const unsubscribe = onSnapshot(messagesQuery, async (snapshot) => {
    const messagesData = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as ChatMessage[]

    // Cache all messages locally
    messagesData.forEach(msg => {
      const cachedMsg: CachedMessage = {
        id: msg.id,
        chatId: msg.chatId,
        senderId: msg.senderId,
        content: msg.content,
        type: (msg.type as any) || 'text',
        encrypted: msg.encrypted || false,
        status: (msg.status as any) || 'sent',
        createdAt: ((msg.createdAt as any)?.toDate ? (msg.createdAt as any).toDate().toISOString() : (msg.createdAt instanceof Date ? msg.createdAt.toISOString() : String(msg.createdAt))),
        readBy: msg.readBy || [],
        deletedBy: msg.deletedBy || [],
        replyTo: msg.replyTo,
        synced: true,
      }
      // Skip messages with temp IDs
      if (!msg.id.startsWith("temp-")) {
        MessageCache.addMessage(chatId as string, cachedMsg)
      }
    })

    // Filter out messages deleted by current user and temp messages
    const filteredMessages = messagesData.filter((message) => {
      const deletedBy = message.deletedBy || []
      return !deletedBy.includes(user.uid) && !message.id.startsWith("temp-")
    })

    setMessages(filteredMessages)
  }, (error) => {
    console.log("Background sync failed, using cached messages:", error)
    // Error is handled silently - cached messages remain displayed
  })

  return () => unsubscribe()
}, [chatId, user?.uid])

useEffect(() => {
  if (!messages.length || initialScrollIndex.current !== null || lastReadAt === undefined) return

  const firstUnreadIndex = messages.findIndex((msg) => {
    const messageDate = (msg.createdAt as any)?.toDate?.() ?? new Date(msg.createdAt)
    return msg.senderId !== user?.uid && (!lastReadAt || messageDate > lastReadAt)
  })

  initialScrollIndex.current = firstUnreadIndex !== -1 ? firstUnreadIndex : messages.length - 1
}, [messages, lastReadAt, user?.uid])

useEffect(() => {
  if (!user?.uid || !chatId || hasResetUnreadCount.current) return

  hasResetUnreadCount.current = true

  updateDoc(doc(db, "chats", chatId as string), {
    [`unreadCount.${user.uid}`]: 0,
  }).catch((error) => {
    console.error("Error resetting unread count:", error)
  })
}, [chatId, user?.uid])

useEffect(() => {
  if (
    initialScrollIndex.current !== null &&
    !didInitialScroll.current &&
    flatListRef.current &&
    messages.length > 0
  ) {
    didInitialScroll.current = true

    InteractionManager.runAfterInteractions(() => {
      flatListRef.current?.scrollToIndex({
        index: initialScrollIndex.current!,
        animated: false,
      })
    })
  }
}, [messages])

useEffect(() => {
  if (!participant?.id) return

  const chatRef = doc(db, "chats", chatId as string)
  const unsubscribe = onSnapshot(chatRef, (doc) => {
    const data = doc.data()
    if (data?.typing?.[participant.id]) {
      setParticipant((prev) => (prev ? { ...prev, isTyping: true } : null))
    } else {
      setParticipant((prev) => (prev ? { ...prev, isTyping: false } : null))
    }
  })

  return () => unsubscribe()
}, [participant?.id, chatId])

useEffect(() => {
  return () => {
    if (isTyping) {
      updateTypingStatus(false)
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }
  }
}, [isTyping])

useEffect(() => {
  if (showActionSheet) {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start()
  } else {
    Animated.timing(slideAnim, {
      toValue: 300,
      duration: 200,
      useNativeDriver: true,
    }).start()
  }
}, [showActionSheet])

// Auto-scroll to bottom when keyboard shows
useEffect(() => {
  const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true })
    }, 100)
  })

  return () => {
    keyboardDidShowListener.remove()
  }
}, [])

const openActionSheet = (message: ChatMessage) => {
  setSelectedMessage(message)
  setShowActionSheet(true)
}

const closeActionSheet = () => {
  setShowActionSheet(false)
  setTimeout(() => setSelectedMessage(null), 200)
}

const startEditing = (message: ChatMessage) => {
  setEditingMessage(message)
  setNewMessage(message.content)
  closeActionSheet()
}

const deleteMessageForEveryone = async () => {
  if (!selectedMessage) return
  closeActionSheet()
  try {
    await deleteDoc(doc(db, "messages", selectedMessage.id))
  } catch (error) {
    console.error("Error deleting message:", error)
  }
}

const deleteMessageForMe = async () => {
  if (!selectedMessage) return
  closeActionSheet()
  try {
    const messageRef = doc(db, "messages", selectedMessage.id)
    await updateDoc(messageRef, {
      deletedBy: [...((await getDoc(messageRef)).data()?.deletedBy || []), user?.uid],
    })
  } catch (error) {
    console.error("Error deleting message for me:", error)
  }
}

const editMessage = async () => {
  if (!editingMessage || !newMessage.trim() || sending) return

  setSending(true)
  try {
    await updateDoc(doc(db, "messages", editingMessage.id), {
      content: newMessage.trim(),
      editedAt: new Date(),
    })

    // Update chat last message if this was the last message
    const chatRef = doc(db, "chats", chatId as string)
    const chatSnap = await getDoc(chatRef)
    const chatData = chatSnap.data()

    const lastMessageTime = (chatData?.lastMessage?.createdAt as any)?.toDate
      ? (chatData?.lastMessage?.createdAt as any).toDate().getTime()
      : new Date(chatData?.lastMessage?.createdAt as any).getTime()
    const editingMessageTime = (editingMessage.createdAt as any)?.toDate
      ? (editingMessage.createdAt as any).toDate().getTime()
      : new Date(editingMessage.createdAt as any).getTime()

    if (lastMessageTime === editingMessageTime) {
      await updateDoc(chatRef, {
        lastMessage: {
          content: newMessage.trim(),
          senderId: user?.uid,
          createdAt: editingMessage.createdAt,
          readBy: editingMessage.readBy || [user?.uid],
        },
        lastActivity: new Date(),
      })
    }

    setEditingMessage(null)
    setNewMessage("")
  } catch (error) {
    console.error("Error editing message:", error)
  } finally {
    setSending(false)
  }
}

const cancelEditing = () => {
  setEditingMessage(null)
  setNewMessage("")
}

const startReplying = (message: ChatMessage) => {
  setReplyingToMessage(message)
  setEditingMessage(null)
  closeActionSheet()
}

const cancelReplying = () => {
  setReplyingToMessage(null)
}

const handleTextChange = (text: string) => {
  setNewMessage(text)

  if (!editingMessage && text.trim()) {
    if (!isTyping) {
      setIsTyping(true)
      updateTypingStatus(true)
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false)
      updateTypingStatus(false)
    }, 2000)
  } else if (isTyping && !text.trim()) {
    setIsTyping(false)
    updateTypingStatus(false)
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }
  }
}

const updateTypingStatus = async (typing: boolean) => {
  try {
    await updateDoc(doc(db, "chats", chatId as string), {
      [`typing.${user?.uid}`]: typing,
    })
  } catch (error) {
    console.error("Error updating typing status:", error)
  }
}

const sendMessage = async () => {
  if (editingMessage) {
    await editMessage()
    return
  }

  if (!newMessage.trim() || !user?.uid || !chatId || sending) return

  const messageContent = newMessage.trim()
  const replyTo = replyingToMessage?.id

  setNewMessage("")
  setReplyingToMessage(null)

  Keyboard.dismiss()

  // Clear typing status
  if (isTyping) {
    setIsTyping(false)
    updateTypingStatus(false)
  }

  const tempId = "temp-" + Date.now()
  const tempMessage: ChatMessage = {
    id: tempId,
    chatId: chatId as string,
    senderId: user.uid,
    content: messageContent,
    type: "text" as const,
    encrypted: false,
    status: "sending" as const,
    createdAt: new Date(),
    readBy: [user.uid],
    ...(replyTo && { replyTo }),
  }

  setMessages((prev) => [...prev, tempMessage])

  if (isNearBottom.current) {
    InteractionManager.runAfterInteractions(() => {
      flatListRef.current?.scrollToEnd({ animated: false })
    })
  }

  setSending(true)
  try {
    const messageDoc: any = {
      chatId,
      senderId: user.uid,
      content: messageContent,
      type: "text" as const,
      encrypted: false,
      status: "sent" as const,
      createdAt: tempMessage.createdAt,
      readBy: [user.uid],
    }

    if (replyTo) {
      messageDoc.replyTo = replyTo
    }

    const messageRef = await addDoc(collection(db, "messages"), messageDoc)

    // Update chat last message and increment unread count
    const chatRef = doc(db, "chats", chatId as string)
    const chatSnap = await getDoc(chatRef)
    const chatData = chatSnap.data()
    const currentUnreadCount = chatData?.unreadCount?.[participant?.id || ""] || 0

    await updateDoc(chatRef, {
      lastMessage: {
        content: messageContent,
        senderId: user.uid,
        createdAt: tempMessage.createdAt,
        readBy: [user.uid],
      },
      lastActivity: new Date(),
      [`unreadCount.${participant?.id}`]: currentUnreadCount + 1,
    })
  } catch (error) {
    console.error("Error sending message:", error)
  } finally {
    setSending(false)
    setMessages((prev) => prev.filter((m) => m.id !== tempId))
  }
}

const renderMessage = ({ item }: { item: ChatMessage }) => {
  const isOwnMessage = item.senderId === user?.uid
  const messageDate = (item.createdAt as any)?.toDate
    ? (item.createdAt as any).toDate()
    : new Date(item.createdAt as any)
  const timeAgo = getTimeAgo(messageDate)

  // Determine message status for own messages
  const readBy = item.readBy || []
  const isRead = participant?.id && readBy.includes(participant.id)
  const isDelivered = readBy.length > 1 // Sender + at least one other

  // Find the replied message if this is a reply
  const repliedMessage = item.replyTo ? messages.find((msg) => msg.id === item.replyTo) : null

  const handleLongPress = () => {
    openActionSheet(item)
  }

  const onGestureEvent = (event: any) => {
    // Handle swipe gestures
  }

  const onHandlerStateChange = (event: any) => {
    if (event.nativeEvent.state === State.END) {
      const { translationX } = event.nativeEvent

      // Swipe right on received messages or swipe left on sent messages to reply
      if ((!isOwnMessage && translationX > 50) || (isOwnMessage && translationX < -50)) {
        startReplying(item)
      }
    }
  }

  const getStatusIcon = () => {
    if (!isOwnMessage) return null

    const readBy = item.readBy || []
    const isRead = participant?.id && readBy.includes(participant.id)
    const isDelivered = readBy.length > 1 // Sender + at least one other

    if (isRead) {
      // Double blue checkmarks for read
      return (
        <View style={styles.tickContainer}>
          <Text style={[styles.tick, styles.tickRead]}>✓✓</Text>
        </View>
      )
    } else if (isDelivered) {
      // Double grey checkmarks for delivered
      return (
        <View style={styles.tickContainer}>
          <Text style={styles.tick}>✓✓</Text>
        </View>
      )
    } else if (item.status === "sent" || item.id.startsWith("temp-")) {
      // Single grey checkmark for sent
      return (
        <View style={styles.tickContainer}>
          <Text style={styles.tick}>✓</Text>
        </View>
      )
    }

    return null
  }

  return (
    <PanGestureHandler
      onGestureEvent={onGestureEvent}
      onHandlerStateChange={onHandlerStateChange}
      activeOffsetX={[-20, 20]}
      failOffsetY={[-5, 5]}
    >
      <View style={styles.messageWrapper}>
        <TouchableOpacity
          style={[styles.messageContainer, isOwnMessage ? styles.ownMessage : styles.otherMessage]}
          onLongPress={handleLongPress}
          delayLongPress={500}
          activeOpacity={0.7}
        >
          {/* Reply indicator */}
          {repliedMessage && (
            <View
              style={[styles.replyIndicator, isOwnMessage ? styles.replyIndicatorOwn : styles.replyIndicatorOther]}
            >
              <View style={[styles.replyLine, isOwnMessage ? styles.replyLineOwn : styles.replyLineOther]} />
              <View style={styles.replyContent}>
                <Text
                  style={[styles.replySender, isOwnMessage ? styles.replySenderOwn : styles.replySenderOther]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {repliedMessage.senderId === user?.uid ? "You" : participant?.username}
                </Text>
                <Text
                  style={[styles.replyText, isOwnMessage ? styles.replyTextOwn : styles.replyTextOther]}
                  numberOfLines={2}
                >
                  {repliedMessage.content}
                </Text>
              </View>
            </View>
          )}

          <Text style={[styles.messageText, isOwnMessage ? styles.ownMessageText : styles.otherMessageText]}>
            {item.content}
          </Text>
          <View style={styles.messageFooter}>
            <Text style={isOwnMessage ? styles.messageTimeOwn : styles.messageTime}>{timeAgo}</Text>
            {getStatusIcon()}
            {item.id.startsWith("temp-") && (
              <ActivityIndicator
                size="small"
                color={isOwnMessage ? "#667781" : "#666"}
                style={styles.sendingIndicator}
              />
            )}
          </View>
        </TouchableOpacity>
      </View>
    </PanGestureHandler>
  )
}

const renderActionSheet = () => {
  if (!selectedMessage) return null

  const isOwnMessage = selectedMessage.senderId === user?.uid
  const messageDate = (selectedMessage.createdAt as any)?.toDate
    ? (selectedMessage.createdAt as any).toDate()
    : new Date(selectedMessage.createdAt as any)
  const now = new Date()
  const diffMinutes = (now.getTime() - messageDate.getTime()) / (1000 * 60)
  const canEdit = isOwnMessage && diffMinutes <= 40

  return (
    <Modal visible={showActionSheet} transparent animationType="fade" onRequestClose={closeActionSheet}>
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
              <TouchableOpacity style={styles.actionItem} onPress={() => startReplying(selectedMessage)}>
                <View style={[styles.actionIconContainer, styles.replyIconBg]}>
                  <ArrowLeft size={20} color="#128C7E" style={{ transform: [{ rotate: "180deg" }] }} />
                </View>
                <Text style={styles.actionText}>Reply</Text>
              </TouchableOpacity>

              {canEdit && (
                <>
                  <TouchableOpacity style={styles.actionItem} onPress={() => startEditing(selectedMessage)}>
                    <View style={[styles.actionIconContainer, styles.editIconBg]}>
                      <Edit3 size={20} color="#128C7E" />
                    </View>
                    <Text style={styles.actionText}>Edit Message</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.actionItem} onPress={deleteMessageForEveryone}>
                    <View style={[styles.actionIconContainer, styles.deleteIconBg]}>
                      <Trash2 size={20} color="#FF3B30" />
                    </View>
                    <Text style={[styles.actionText, styles.deleteText]}>Delete for Everyone</Text>
                  </TouchableOpacity>
                </>
              )}

              {!isOwnMessage && (
                <TouchableOpacity style={styles.actionItem} onPress={deleteMessageForMe}>
                  <View style={[styles.actionIconContainer, styles.deleteIconBg]}>
                    <Trash2 size={20} color="#FF3B30" />
                  </View>
                  <Text style={[styles.actionText, styles.deleteText]}>Delete for Me</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Cancel Button */}
            <TouchableOpacity style={styles.cancelButton} onPress={closeActionSheet}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

return (
  <React.Fragment>
    <StatusBar barStyle="dark-content" backgroundColor="#075E54" />
    <Stack.Screen options={{ headerShown: false }} />
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerAvatar}>{participant?.avatar}</Text>
          <View style={styles.headerTextContainer}>
            <View style={styles.usernameRow}>
              <Text style={styles.headerUsername} numberOfLines={1}>
                {participant?.username}
              </Text>
              {participant?.verified && <Shield size={14} color="#fff" fill="#fff" style={styles.verifiedIcon} />}
            </View>
            {participant?.isTyping && <Text style={styles.typingIndicator}>typing...</Text>}
          </View>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        contentContainerStyle={styles.messagesContainer}
        style={styles.messagesList}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onLayout={handleLayout}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onScrollToIndexFailed={(info) => {
          const { index, highestMeasuredFrameIndex, averageItemLength } = info
          const safeIndex = Math.min(index, highestMeasuredFrameIndex)

          flatListRef.current?.scrollToOffset({
            offset: safeIndex * averageItemLength,
            animated: false,
          })
        }}
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
          <View style={styles.editingBarContent}>
            <View style={styles.editingIconContainer}>
              <Edit3 size={18} color="#128C7E" />
            </View>
            <View style={styles.editingTextContainer}>
              <Text style={styles.editingLabel}>Edit message</Text>
              <Text style={styles.editingPreview} numberOfLines={1}>
                {editingMessage.content}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={cancelEditing} style={styles.cancelIcon}>
            <X size={22} color="#8696A0" />
          </TouchableOpacity>
        </View>
      )}

      {/* Replying Bar */}
      {replyingToMessage && (
        <View style={styles.replyingBar}>
          <View style={styles.replyingBarContent}>
            <View style={styles.replyBarLine} />
            <View style={styles.replyingTextContainer}>
              <Text style={styles.replyingToLabel} numberOfLines={1}>
                {replyingToMessage.senderId === user?.uid ? "You" : participant?.username}
              </Text>
              <Text style={styles.replyingMessagePreview} numberOfLines={1}>
                {replyingToMessage.content}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={cancelReplying} style={styles.cancelIcon}>
            <X size={22} color="#8696A0" />
          </TouchableOpacity>
        </View>
      )}

      {/* Input */}
      <View style={[styles.inputContainer, { marginBottom: insets.bottom || 8 }]}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.textInput}
            value={newMessage}
            onChangeText={handleTextChange}
            placeholder={editingMessage ? "Edit message..." : replyingToMessage ? "Reply..." : "Message"}
            placeholderTextColor="#8696A0"
            multiline
            maxLength={1000}
          />
        </View>
        <TouchableOpacity
          style={[styles.sendButton, !newMessage.trim() && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={!newMessage.trim()}
        >
          <Send size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Action Sheet */}
      {renderActionSheet()}
    </KeyboardAvoidingView>
  </React.Fragment>
)
}

const updateLastReadAt = async (chatId: string, userId: string) => {
if (!userId || !chatId) return

try {
  await setDoc(doc(db, "chats", chatId as string, "readStatus", userId), { lastReadAt: new Date() }, { merge: true })
} catch (error) {
  console.error("Error updating lastReadAt:", error)
}
}

const styles = StyleSheet.create({
container: {
  flex: 1,
  backgroundColor: "#ECE5DD",
},
loadingContainer: {
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  backgroundColor: "#ECE5DD",
},
messagesList: {
  flex: 1,
},
messagesContainer: {
  flexGrow: 1,
  paddingHorizontal: 8,
  paddingVertical: 12,
},
header: {
  flexDirection: "row",
  alignItems: "center",
  paddingHorizontal: 12,
  paddingBottom: 12,
  backgroundColor: "#075E54",
},
backButton: {
  marginRight: 8,
  padding: 4,
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
headerTextContainer: {
  flex: 1,
},
usernameRow: {
  flexDirection: "row",
  alignItems: "center",
},
headerUsername: {
  fontSize: 18,
  fontWeight: "600",
  color: "#fff",
  flex: 1,
},
verifiedIcon: {
  marginLeft: 4,
},
typingIndicator: {
  fontSize: 13,
  color: "#D9FDD3",
  marginTop: 2,
},
messageWrapper: {
  marginBottom: 4,
  paddingHorizontal: 4,
},
messageContainer: {
  minWidth: 100,
  maxWidth: "75%",
  paddingHorizontal: 10,
  paddingVertical: 6,
  paddingBottom: 8,
  borderRadius: 8,
  position: "relative",
},
ownMessage: {
  alignSelf: "flex-end",
  backgroundColor: "#DCF8C6",
  borderTopRightRadius: 0,
},
otherMessage: {
  alignSelf: "flex-start",
  backgroundColor: "#fff",
  borderTopLeftRadius: 0,
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.08,
  shadowRadius: 1,
  elevation: 1,
},
messageText: {
  fontSize: 15,
  lineHeight: 20,
  paddingRight: 4,
},
ownMessageText: {
  color: "#000",
},
otherMessageText: {
  color: "#000",
},
messageFooter: {
  flexDirection: "row",
  justifyContent: "flex-end",
  alignItems: "center",
  marginTop: 2,
  gap: 3,
  minHeight: 16,
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
  color: "#667781",
  marginBottom: 8,
},
emptySubtext: {
  fontSize: 14,
  color: "#8696A0",
},
editingBar: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingHorizontal: 12,
  paddingVertical: 10,
  backgroundColor: "#F7F8FA",
  borderTopWidth: 1,
  borderTopColor: "#E9EDEF",
},
editingBarContent: {
  flexDirection: "row",
  alignItems: "center",
  flex: 1,
  gap: 10,
},
editingIconContainer: {
  width: 36,
  height: 36,
  borderRadius: 18,
  backgroundColor: "#D9FDD3",
  justifyContent: "center",
  alignItems: "center",
},
editingTextContainer: {
  flex: 1,
},
editingLabel: {
  fontSize: 13,
  color: "#128C7E",
  fontWeight: "600",
  marginBottom: 2,
},
editingPreview: {
  fontSize: 14,
  color: "#667781",
},
cancelIcon: {
  padding: 4,
},
replyingBar: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingLeft: 12,
  paddingRight: 12,
  paddingVertical: 10,
  backgroundColor: "#F7F8FA",
  borderTopWidth: 1,
  borderTopColor: "#E9EDEF",
},
replyingBarContent: {
  flexDirection: "row",
  alignItems: "stretch",
  flex: 1,
  gap: 10,
},
replyBarLine: {
  width: 4,
  backgroundColor: "#128C7E",
  borderRadius: 2,
},
replyingTextContainer: {
  flex: 1,
  justifyContent: "center",
},
replyingToLabel: {
  fontSize: 13,
  color: "#128C7E",
  fontWeight: "600",
  marginBottom: 2,
},
replyingMessagePreview: {
  fontSize: 13,
  lineHeight: 17,
},
replyIndicator: {
  flexDirection: "row",
  alignItems: "stretch",
  marginBottom: 6,
  paddingLeft: 8,
  paddingRight: 8,
  paddingVertical: 6,
  borderRadius: 6,
  gap: 8,
},
replyIndicatorOwn: {
  backgroundColor: "rgba(0, 0, 0, 0.05)",
},
replyIndicatorOther: {
  backgroundColor: "rgba(0, 0, 0, 0.03)",
},
replyLine: {
  width: 3,
  borderRadius: 1.5,
},
replyLineOwn: {
  backgroundColor: "#25D366",
},
replyLineOther: {
  backgroundColor: "#128C7E",
},
replyContent: {
  flex: 1,
  justifyContent: "center",
  minWidth: 0,
},
replySender: {
  fontSize: 13,
  fontWeight: "700",
  marginBottom: 2,
  flexShrink: 1,
},
replySenderOwn: {
  color: "#25D366",
},
replySenderOther: {
  color: "#128C7E",
},
replyText: {
  fontSize: 13,
  lineHeight: 17,
},
replyTextOwn: {
  color: "#667781",
},
replyTextOther: {
  color: "#667781",
},
statusContainer: {
  marginLeft: 2,
  minWidth: 16,
  alignItems: "center",
  justifyContent: "center",
},
sendingIndicator: {
  marginLeft: 4,
},
sendButton: {
  width: 42,
  height: 42,
  borderRadius: 21,
  backgroundColor: "#128C7E",
  justifyContent: "center",
  alignItems: "center",
},
sendButtonDisabled: {
  backgroundColor: "#B3B3B3",
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
  borderBottomColor: "#E9EDEF",
},
actionSheetTitle: {
  fontSize: 18,
  fontWeight: "600",
  color: "#000",
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
  backgroundColor: "#D9FDD3",
},
replyIconBg: {
  backgroundColor: "#D9FDD3",
},
deleteIconBg: {
  backgroundColor: "#FFEBEE",
},
actionText: {
  fontSize: 16,
  color: "#000",
  fontWeight: "500",
},
deleteText: {
  color: "#FF3B30",
},
cancelButton: {
  marginHorizontal: 20,
  marginTop: 12,
  padding: 16,
  backgroundColor: "#F0F2F5",
  borderRadius: 12,
  alignItems: "center",
},
cancelButtonText: {
  fontSize: 16,
  color: "#667781",
  fontWeight: "600",
},
inputContainer: {
  flexDirection: "row",
  alignItems: "flex-end",
  paddingHorizontal: 8,
  paddingVertical: 4,
  backgroundColor: "#F0F2F5",
  gap: 8,
},
inputWrapper: {
  flex: 1,
  backgroundColor: "#fff",
  borderRadius: 20,
  paddingHorizontal: 16,
  paddingVertical: 6,
  minHeight: 38,
  maxHeight: 120,
  justifyContent: "center",
},
textInput: {
  fontSize: 15,
  color: "#000",
  maxHeight: 100,
},
messageTimeOwn: {
  fontSize: 11,
  color: "#667781",
},
messageTime: {
  fontSize: 11,
  color: "#667781",
},
tickContainer: {
  marginLeft: 2,
},
tick: {
  fontSize: 14,
  color: "#999",
  fontWeight: "bold",
},
tickRead: {
  color: "#53BDEB",
},
})
