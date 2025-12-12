import { publicProcedure } from "@/backend/trpc/create-context";
import { z } from "zod";
import { adminDb } from "@/backend/lib/firebase-admin";

export const getUserProcedure = publicProcedure
  .input(z.object({ userId: z.string() }))
  .query(async ({ input }: { input: { userId: string } }) => {
    const userDoc = await adminDb.collection('users').doc(input.userId).get();
    
    if (!userDoc.exists) {
      throw new Error('User not found');
    }

    return userDoc.data();
  });

export default getUserProcedure;
