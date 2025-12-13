import { publicProcedure } from "@/backend/trpc/create-context";
import { z } from "zod";
import { adminDb } from "@/backend/lib/firebase-admin";
import type { Rating, UserRatingSummary } from "@/types/rating";

const getUserRatingsInput = z.object({
  userId: z.string(),
  limit: z.number().optional().default(10),
});

export const getUserRatingsProcedure = publicProcedure
  .input(getUserRatingsInput)
  .query(async ({ input }: { input: z.infer<typeof getUserRatingsInput> }) => {
    const { userId, limit } = input;

    // Get recent ratings
    const ratingsQuery = adminDb
      .collection('ratings')
      .where('ratedUserId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit);

    const ratingsSnapshot = await ratingsQuery.get();

    const recentRatings: Rating[] = ratingsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt.toDate(),
    })) as Rating[];

    // Get user data for summary
    const userDoc = await adminDb.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      throw new Error('User not found');
    }

    const userData = userDoc.data()!;
    const totalRatings = userData.totalRatings || 0;
    const averageRating = userData.rating || 0;

    const summary: UserRatingSummary = {
      averageRating,
      totalRatings,
      recentRatings,
    };

    return summary;
  });

export default getUserRatingsProcedure;
