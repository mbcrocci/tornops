export type User = {
  rank: string;
  level: number;
  honor: number;
  gender: string;
  property: string;
  signup: Date;
  awards: number;
  friends: number;
  enemies: number;
  forum_posts: number;
  karma: number;
  age: number;
  role: string;
  donator: number;
  player_id: number;
  name: string;
  property_id: number;
  revivable: number;
  profile_image: string;
  life: Life;
  status: Status;
  job: Job;
  faction: Faction;
  married: Married;
  basicicons: Basicicons;
  states: States;
  last_action: LastAction;
  competition: Competition;
  cooldowns: Cooldowns;
  energy: Energy;
  nerve:  Energy;
  happy:  Energy;
  chain:  Chain;
};

export type Basicicons = {
  icon6: string;
  icon4: string;
  icon8: string;
  icon21: string;
  icon9: string;
  icon71: string;
};

export type Competition = {
  name: string;
};

export type Cooldowns = {
  drug: number;
  medical: number;
  booster: number;
};

export type Faction = {
  position: string;
  faction_id: number;
  days_in_faction: number;
  faction_name: string;
  faction_tag: string;
  faction_tag_image: string;
};

export type Job = {
  job: string;
  position: string;
  company_id: number;
  company_name: string;
  company_type: number;
};

export type LastAction = {
  status: string;
  timestamp: number;
  relative: string;
};

export type Life = {
  current: number;
  maximum: number;
  increment: number;
  interval: number;
  ticktime: number;
  fulltime: number;
};

export type Married = {
  spouse_id: number;
  spouse_name: string;
  duration: number;
};

export type States = {
  hospital_timestamp: number;
  jail_timestamp: number;
};

export type Status = {
  description: string;
  details: string;
  state: string;
  color: string;
  until: number;
};

export type Chain = {
  id:       number;
  current:  number;
  max:      number;
  timeout:  number;
  modifier: number;
  cooldown: number;
  start:    number;
  end:      number;
}

export type Energy = {
  current:   number;
  maximum:   number;
  increment: number;
  interval:  number;
  tick_time: number;
  full_time: number;
}
