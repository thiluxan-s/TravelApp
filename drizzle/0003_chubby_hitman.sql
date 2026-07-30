ALTER TYPE "public"."booking_type" ADD VALUE 'train' BEFORE 'unknown';--> statement-breakpoint
ALTER TYPE "public"."booking_type" ADD VALUE 'reservation' BEFORE 'unknown';--> statement-breakpoint
ALTER TYPE "public"."segment_type" ADD VALUE 'train_ride';--> statement-breakpoint
ALTER TYPE "public"."segment_type" ADD VALUE 'reservation';