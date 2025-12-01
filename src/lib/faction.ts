export type Faction = {
  ID: number;
  name: string;
  tag: string;
  tag_image: string;
  leader: number;
  "co-leader": number;
  respect: number;
  age: number;
  capacity: number;
  best_chain: number;
  territory_wars: Peace;
  raid_wars: Peace;
  peace: Peace;
  rank: Rank;
  ranked_wars: RankedWars;
  members: { [key: string]: Member };
};

export type Member = {
  name: string;
  level: number;
  days_in_faction: number;
  last_action: LastAction;
  status: StatusClass;
  position: Position;
};

export type LastAction = {
  status: StatusEnum;
  timestamp: number;
  relative: string;
};

export type StatusEnum = "Idle" | "Offline" | "Online";

export type Position =
  | "Captain"
  | "Co-leader"
  | "Leader"
  | "Lieutenant"
  | "Member"
  | "Sergeant";

export type StatusClass = {
  description: string;
  details: string;
  state: State;
  color: Color;
  until: number;
  travel_type?: string;
  plane_image_type?: string;
};

export type Color = "blue" | "green" | "red";

export type State = "Abroad" | "Federal" | "Hospital" | "Okay" | "Traveling";

export type Peace = {};

export type Rank = {
  level: number;
  name: string;
  division: number;
  position: number;
  wins: number;
};

export type RankedWars = {
  [key: string]: {
    factions: { [key: string]: FactionValue };
    war: War;
  };
};

export type FactionValue = {
  name: string;
  score: number;
  chain: number;
};

export type War = {
  start: number;
  end: number;
  target: number;
  winner: number;
};

export type FactionChain = {
  id: number;
  current: number;
  max: number;
  timeout: number;
  modifier: number;
  cooldown: number;
  start: number;
  end: number;
};
