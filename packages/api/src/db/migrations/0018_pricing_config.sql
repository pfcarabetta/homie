CREATE TABLE "pricing_config" (
  "id" text PRIMARY KEY DEFAULT 'singleton',
  "config" jsonb NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
INSERT INTO "pricing_config" ("id", "config") VALUES ('singleton', '{
  "homeowner": {
    "standard": {"priceCents": 999, "promoPriceCents": null, "promoLabel": null},
    "priority": {"priceCents": 1999, "promoPriceCents": null, "promoLabel": null},
    "emergency": {"priceCents": 2999, "promoPriceCents": null, "promoLabel": null}
  },
  "business": {
    "trial":        {"base": 0,   "perProperty": 0,  "promoBase": null, "promoLabel": null, "searchesPerProperty": 5, "maxProperties": 5,    "maxTeamMembers": 1},
    "starter":      {"base": 0,   "perProperty": 10, "promoBase": null, "promoLabel": null, "searchesPerProperty": 5, "maxProperties": 10,   "maxTeamMembers": 1},
    "professional": {"base": 99,  "perProperty": 10, "promoBase": null, "promoLabel": null, "searchesPerProperty": 5, "maxProperties": 50,   "maxTeamMembers": 5},
    "business":     {"base": 249, "perProperty": 10, "promoBase": null, "promoLabel": null, "searchesPerProperty": 5, "maxProperties": 150,  "maxTeamMembers": 15},
    "enterprise":   {"base": 0,   "perProperty": 10, "promoBase": null, "promoLabel": null, "searchesPerProperty": 5, "maxProperties": 9999, "maxTeamMembers": 9999}
  }
}');
