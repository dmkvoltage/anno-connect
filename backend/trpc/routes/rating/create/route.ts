import { publicProcedure } from "@/backend/trpc/create-context";
import { z } from "zod";
import { adminDb } from "@/backend/lib/firebase-admin";
import { CreateRatingInput } from "@/types/rating";

const createRatingInput = z.object({
  raterId: z.string(),
  ratedUserId: z.string(),
  rating: z.number().min(1).max(5),
  reason: z.string().optional(),
});

export const createRatingProcedure = publicProcedure
  .input(createRatingInput)
  .mutation(async ({ input }: { input: z.infer<typeof createRatingInput> }) => {
    const { raterId, ratedUserId, rating, reason } = input;

    // Prevent self-rating
    if (raterId === ratedUserId) {
      throw new Error('Cannot rate yourself');
    }

    // Check if user has already rated this person
    const existingRatingQuery = await adminDb
      .collection('ratings')
      .where('raterId', '==', raterId)
      .where('ratedUserId', '==', ratedUserId)
      .limit(1)
      .get();

    if (!existingRatingQuery.empty) {
      throw new Error('You have already rated this user');
    }

    const ratingDoc = {
      raterId,
      ratedUserId,
      rating,
      reason: reason || null,
      createdAt: new Date(),
    };

    const ratingRef = await adminDb.collection('ratings').add(ratingDoc);

    // Update user's rating and totalRatings
    const userRef = adminDb.collection('users').doc(ratedUserId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      throw new Error('User not found');
    }

    const userData = userDoc.data()!;
    const currentTotalRatings = userData.totalRatings || 0;
    const currentRating = userData.rating || 0;

    const newTotalRatings = currentTotalRatings + 1;
    const newAverageRating = ((currentRating * currentTotalRatings) + rating) / newTotalRatings;

    await userRef.update({
      rating: newAverageRating,
      totalRatings: newTotalRatings,
    });

    return {
      success: true,
      ratingId: ratingRef.id,
    };
  });

export default createRatingProcedure;
