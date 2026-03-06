export type CreatorCategory = "foods" | "things-to-do" | "secret-spots";

export interface Creator {
  id: string;
  name: string;
  channelId: string;
  category: CreatorCategory;
}

// Placeholder list for now – the full data setup
// (including JSON files and API integration) is not needed
// when using this repo as a simple website.
export const CREATORS: Creator[] = [];
