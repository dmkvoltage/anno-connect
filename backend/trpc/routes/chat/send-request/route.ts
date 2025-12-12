import { publicProcedure } from "@/backend/trpc/create-context";
import { z } from "zod";
import { adminDb } from "@/backend/lib/firebase-admin";

const sendRequestInput = z.object({
  senderId: z.string(),
  receiverId: z.string(),
  message: z.string().optional(),
});

export const sendRequestProcedure = publicProcedure
  .input(sendRequestInput)
  .mutation(async ({ input }: { input: z.infer<typeof sendRequestInput> }) => {
    const { senderId, receiverId, message } = input;

    const senderDoc = await adminDb.collection('users').doc(senderId).get();
    const receiverDoc = await adminDb.collection('users').doc(receiverId).get();

    if (!senderDoc.exists || !receiverDoc.exists) {
      throw new Error('User not found');
    }

    const receiverData = receiverDoc.data();
    if (receiverData?.blockedUsers?.includes(senderId)) {
      throw new Error('You are blocked by this user');
    }

    const requestDoc = {
      senderId,
      receiverId,
      status: 'pending' as const,
      message: message || '',
      createdAt: new Date(),
    };

    const docRef = await adminDb.collection('chatRequests').add(requestDoc);

    return {
      success: true,
      requestId: docRef.id,
    };
  });

export default sendRequestProcedure;
