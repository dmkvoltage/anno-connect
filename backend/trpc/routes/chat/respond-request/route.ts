import { publicProcedure } from "@/backend/trpc/create-context";
import { z } from "zod";
import { adminDb } from "@/backend/lib/firebase-admin";

export const respondRequestProcedure = publicProcedure
  .input(
    z.object({
      requestId: z.string(),
      accept: z.boolean(),
    })
  )
  .mutation(async ({ input }: { input: { requestId: string; accept: boolean } }) => {
    const { requestId, accept } = input;

    const requestDoc = await adminDb.collection('chatRequests').doc(requestId).get();
    
    if (!requestDoc.exists) {
      throw new Error('Request not found');
    }

    const requestData = requestDoc.data();
    
    if (!requestData) {
      throw new Error('Request data not found');
    }

    if (accept) {
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

      const chatRef = await adminDb.collection('chats').add(chatDoc);

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

      await adminDb.collection('connections').add(connectionDoc1);
      await adminDb.collection('connections').add(connectionDoc2);

      const senderDoc = await adminDb.collection('users').doc(requestData.senderId).get();
      const receiverDoc = await adminDb.collection('users').doc(requestData.receiverId).get();

      await adminDb.collection('users').doc(requestData.senderId).update({
        connectionCount: (senderDoc.data()?.connectionCount || 0) + 1,
        connections: [...(senderDoc.data()?.connections || []), requestData.receiverId],
      });

      await adminDb.collection('users').doc(requestData.receiverId).update({
        connectionCount: (receiverDoc.data()?.connectionCount || 0) + 1,
        connections: [...(receiverDoc.data()?.connections || []), requestData.senderId],
      });

      await adminDb.collection('chatRequests').doc(requestId).update({
        status: 'accepted',
        respondedAt: new Date(),
      });

      return {
        success: true,
        chatId: chatRef.id,
      };
    } else {
      await adminDb.collection('chatRequests').doc(requestId).update({
        status: 'rejected',
        respondedAt: new Date(),
      });

      return {
        success: true,
        chatId: null,
      };
    }
  });

export default respondRequestProcedure;
