/**
 * Surfaces that only make sense for a hosted, billed deployment.
 *
 * Komodo self-hosts by default: one team, one deployment, whoever can reach
 * the URL is in. Seats, billing and audit trails are answers to questions that
 * only a multi-tenant service is asking, so they are hidden unless something
 * says otherwise. The routes stay — a hosted tier would need them, and the
 * components are the closest thing to a design reference for new settings
 * screens.
 */
export const IS_CLOUD = process.env.NEXT_PUBLIC_KOMODO_CLOUD === "1";
