import type { ErSpec, FlowchartSpec, SequenceSpec, StateSpec } from "../src/spec.js";

export const sequenceFixture: SequenceSpec = {
  type: "sequence",
  title: "Token refresh",
  description: "Client calls the API; an expired token triggers a refresh before the retry.",
  actors: [
    { id: "client", name: "Client" },
    { id: "api", name: "API" },
    { id: "auth", name: "Auth" },
  ],
  items: [
    { kind: "message", message: { from: "client", to: "api", kind: "call", label: "GET /orders", headline: false } },
    {
      kind: "fragment",
      fragment: {
        kind: "alt",
        regions: [
          {
            guard: "token valid",
            messages: [
              {
                from: "api",
                to: "client",
                kind: "return",
                label: "200 OK",
                headline: true,
              },
            ],
          },
          {
            guard: "token expired",
            messages: [
              { from: "api", to: "auth", kind: "call", label: "refresh()", headline: false },
              { from: "auth", to: "api", kind: "return", label: "new token", headline: false },
              { from: "api", to: "client", kind: "return", label: "200 OK", headline: false },
            ],
          },
        ],
      },
    },
  ],
};

export const flowchartFixture: FlowchartSpec = {
  type: "flowchart",
  title: "Checkout validation",
  description: "Validates cart contents before charging the customer.",
  nodes: [
    { id: "start", kind: "start", label: "Start", headline: false },
    { id: "check", kind: "decision", label: "Cart valid?", headline: false },
    { id: "charge", kind: "step", label: "Charge card", headline: true },
    { id: "reject", kind: "step", label: "Show error", headline: false },
    { id: "end", kind: "end", label: "End", headline: false },
  ],
  edges: [
    { from: "start", to: "check" },
    { from: "check", to: "charge", label: "yes" },
    { from: "check", to: "reject", label: "no" },
    { from: "charge", to: "end" },
    { from: "reject", to: "end" },
  ],
};

export const stateFixture: StateSpec = {
  type: "state",
  title: "Payment lifecycle",
  description: "A payment moves from pending to settled or failed.",
  states: [
    { id: "pending", label: "Pending", initial: true, final: false, headline: false },
    { id: "settled", label: "Settled", initial: false, final: true, headline: true },
    { id: "failed", label: "Failed", initial: false, final: true, headline: false },
  ],
  transitions: [
    { from: "pending", to: "settled", label: "capture succeeds" },
    { from: "pending", to: "failed", label: "capture declines" },
  ],
};

export const erFixture: ErSpec = {
  type: "er",
  title: "Orders schema",
  description: "An order belongs to a customer and has many line items.",
  entities: [
    {
      id: "customer",
      name: "Customer",
      headline: false,
      fields: [
        { name: "id", type: "uuid", pk: true, fk: false },
        { name: "email", type: "text", pk: false, fk: false },
      ],
    },
    {
      id: "order",
      name: "Order",
      headline: true,
      fields: [
        { name: "id", type: "uuid", pk: true, fk: false },
        { name: "customer_id", type: "uuid", pk: false, fk: true },
      ],
    },
  ],
  relationships: [{ from: "customer", to: "order", label: "places", cardinality: "one-to-many" }],
};
