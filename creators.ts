import creatorsData from "@/data/creators.json";

export type CreatorCategory = "foods" | "things-to-do" | "secret-spots";

export interface Creator {
  id: string;
  name: string;
  channelId: string;
  category: CreatorCategory;
}

export const CREATORS: Creator[] = creatorsData as Creator[];
