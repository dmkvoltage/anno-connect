import { createTRPCRouter } from "./create-context";
import hiRoute from "./routes/example/route"
import registerUserProcedure from "./routes/auth/route";
import getUserProcedure from "./routes/user/get/route";
import updateAvatarProcedure from "./routes/user/update-avatar/route";
import discoverUsersProcedure from "./routes/user/discover/route";
import sendRequestProcedure from "./routes/chat/send-request/route";
import respondRequestProcedure from "./routes/chat/respond-request/route";
import createRatingProcedure from "./routes/rating/create/route";
import getUserRatingsProcedure from "./routes/rating/get-user-ratings/route";

export const appRouter = createTRPCRouter({
  example: createTRPCRouter({
    hi: hiRoute,
  }),
  auth: createTRPCRouter({
    register: registerUserProcedure,
  }),
  user: createTRPCRouter({
    get: getUserProcedure,
    updateAvatar: updateAvatarProcedure,
    discover: discoverUsersProcedure,
  }),
  chat: createTRPCRouter({
    sendRequest: sendRequestProcedure,
    respondRequest: respondRequestProcedure,
  }),
  rating: createTRPCRouter({
    create: createRatingProcedure,
    getUserRatings: getUserRatingsProcedure,
  }),
});

export type AppRouter = typeof appRouter;
