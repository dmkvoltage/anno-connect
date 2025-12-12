import { publicProcedure } from "@/backend/trpc/create-context";
import { z } from "zod";
import { adminDb } from "@/backend/lib/firebase-admin";
import { generateRandomUsername } from "@/lib/username-generators";
import { getRandomAvatar } from "@/constants/avatars";

const registerUserInput = z.object({
  uid: z.string(),
  email: z.string().email().optional(),
  gender: z.enum(['male', 'female', 'other']),
});

export const registerUserProcedure = publicProcedure
  .input(registerUserInput)
  .mutation(async ({ input }: { input: z.infer<typeof registerUserInput> }) => {
    const { uid, email, gender } = input;

    const username = generateRandomUsername();
    const avatar = getRandomAvatar(gender);

    const userDoc = {
      id: uid,
      username,
      gender,
      avatar,
      rating: 0,
      totalRatings: 0,
      verified: false,
      connectionCount: 0,
      joinDate: new Date(),
      status: 'online' as const,
      lastSeen: new Date(),
      email: email || null,
      connections: [],
      blockedUsers: [],
      reportCount: 0,
    };

    await adminDb.collection('users').doc(uid).set(userDoc);

    return {
      success: true,
      user: userDoc,
    };
  });

export default registerUserProcedure;
