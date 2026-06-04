CREATE TYPE "public"."segment_type" AS ENUM('flight', 'hotel_stay');--> statement-breakpoint
CREATE TABLE "segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"type" "segment_type" NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"start_timezone" text NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"end_timezone" text NOT NULL,
	"start_location" text NOT NULL,
	"start_lat" numeric(9, 6),
	"start_lng" numeric(9, 6),
	"end_location" text NOT NULL,
	"end_lat" numeric(9, 6),
	"end_lng" numeric(9, 6),
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "segments_booking_id_idx" ON "segments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "segments_trip_id_idx" ON "segments" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "segments_trip_id_start_time_idx" ON "segments" USING btree ("trip_id","start_time");