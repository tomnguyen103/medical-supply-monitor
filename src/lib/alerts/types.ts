import type { alertChannelEnum } from "@/lib/db/schema";

export type AlertChannel = (typeof alertChannelEnum.enumValues)[number];
