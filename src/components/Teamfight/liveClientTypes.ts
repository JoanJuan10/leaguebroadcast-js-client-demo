export interface LiveClientItem {
  canUse?: boolean;
  consumable?: boolean;
  count?: number | string;
  displayName?: string;
  id?: number | string;
  itemID?: number | string;
  itemId?: number | string;
  price?: number | string;
  slot?: number | string;
}

export interface LiveClientPlayer {
  championName?: string;
  items?: LiveClientItem[];
  position?: string;
  rawChampionName?: string;
  riotId?: string;
  riotIdGameName?: string;
  riotIdTagLine?: string;
  summonerName?: string;
  team?: string;
}
