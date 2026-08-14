/**
 * The shared Komodo interface.
 *
 * Everything a host needs to render the judge → thread → close flow: the
 * design-system kit, the navigation port, and the screens themselves. Screens
 * are driven by ReviewActions from @komodo/core and the NavAdapter below, so
 * the same components serve the cloud app and the CLI viewer without either
 * one's plumbing leaking in.
 *
 * The read-only review viewer (ReviewList / ReviewDetail) is deliberately NOT
 * exported here. It is bound to the CLI viewer's own fetch store and is only
 * ever mounted by that SPA — re-exporting it would pull a browser-only data
 * layer into any server-rendered host that imports this barrel.
 */

// ---- navigation port ----
export { NavProvider, useNav, type NavAdapter, type NavLinkProps } from "./nav";

// ---- design-system kit ----
export * from "./kit";

// ---- judge / thread / close flow ----
export { CloseScreen } from "./flow/CloseScreen";
export { JudgeFlow } from "./flow/JudgeFlow";
export { JudgeHeader, type Pip } from "./flow/JudgeHeader";
export { PostReview } from "./flow/PostReview";
export { QueueScreen, queueHref } from "./flow/QueueScreen";
export { QueueShortcut } from "./flow/QueueShortcut";
export { ThreadActions } from "./flow/ThreadActions";
export { ThreadScreen } from "./flow/ThreadScreen";
