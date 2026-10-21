ALTER TABLE "item_options" ADD COLUMN "available" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "option_choices" ADD COLUMN "available" boolean DEFAULT true NOT NULL;