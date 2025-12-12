import { publicProcedure } from "@/backend/trpc/create-context";
import { z } from "zod";
import { adminDb } from "@/backend/lib/firebase-admin";

const updateAvatarInput = z.object({
  userId: z.string(),
  avatar: z.string(),
});

export const updateAvatarProcedure = publicProcedure
  .input(updateAvatarInput)
  .mutation(async ({ input }: { input: z.infer<typeof updateAvatarInput> }) => {
    const { userId, avatar } = input;

    await adminDb.collection('users').doc(userId).update({
      avatar,
    });

    return { success: true };
  });

export default updateAvatarProcedure;
