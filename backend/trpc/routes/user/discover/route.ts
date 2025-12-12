import { publicProcedure } from "@/backend/trpc/create-context";
import { z } from "zod";
import { adminDb } from "@/backend/lib/firebase-admin";

const inputSchema = z.object({
  limit: z.number().default(20),
  sortBy: z.enum(['random', 'rating', 'verified', 'active', 'connections']).default('random'),
  gender: z.enum(['male', 'female', 'other']).optional(),
  excludeIds: z.array(z.string()).optional(),
});

export const discoverUsersProcedure = publicProcedure
  .input(inputSchema)
  .query(async ({ input }: { input: z.infer<typeof inputSchema> }) => {
    const { limit, sortBy, gender, excludeIds = [] } = input;

    let query = adminDb.collection('users').limit(limit);

    if (gender) {
      query = query.where('gender', '==', gender) as any;
    }

    if (sortBy === 'rating') {
      query = query.orderBy('rating', 'desc') as any;
    } else if (sortBy === 'verified') {
      query = query.where('verified', '==', true) as any;
    } else if (sortBy === 'connections') {
      query = query.orderBy('connectionCount', 'desc') as any;
    } else if (sortBy === 'active') {
      query = query.orderBy('lastSeen', 'desc') as any;
    }

    const snapshot = await query.get();
    const users = snapshot.docs
      .map(doc => doc.data())
      .filter(user => !excludeIds.includes(user.id));

    return users;
  });

export default discoverUsersProcedure;
