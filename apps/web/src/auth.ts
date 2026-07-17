import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { eq } from "drizzle-orm";
import { getDb, users, creditLedger } from "@/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID!,
      clientSecret: process.env.AUTH_GITHUB_SECRET!,
      authorization: {
        params: {
          scope: "repo read:user",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "github" && profile) {
        const db = getDb();
        const githubId = String(profile.id);

        const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, githubId)).limit(1);

        if (existing.length === 0) {
          await db.insert(users).values({
            id: githubId,
            login: profile.login as string,
            name: (profile.name as string) ?? null,
            avatarUrl: (profile.avatar_url as string) ?? "",
          });
          // Welcome bonus
          await db.insert(creditLedger).values({
            userId: githubId,
            delta: 100,
            reason: "welcome",
            ref: null,
          });
        }
      }
      return true;
    },

    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.accessToken = account.access_token as string;
        token.userId = String(profile.id);
        token.login = profile.login as string;
        token.avatarUrl = profile.avatar_url as string;
        token.name = (profile.name as string) ?? undefined;
      }
      return token;
    },

    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.user.id = token.userId as string;
      (session.user as unknown as Record<string, unknown>).login = token.login;
      (session.user as unknown as Record<string, unknown>).avatarUrl = token.avatarUrl;
      return session;
    },
  },
});
