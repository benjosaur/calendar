import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { MutationCtx } from "./_generated/server";
import { ensureSetupForUser } from "./model/users";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
  callbacks: {
    // Seed a default home location + timezone the moment a user is created.
    // The callback ctx is typed against AnyDataModel; narrow it to ours.
    async afterUserCreatedOrUpdated(ctx, { userId }) {
      await ensureSetupForUser(ctx as unknown as MutationCtx, userId);
    },
  },
});
