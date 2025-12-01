export function playerProfileLink(playerId: number): string {
  return `https://www.torn.com/profiles.php?XID=${playerId}`;
}

export function playerAttackLink(playerId: number): string {
  return `https://www.torn.com/loader.php?sid=attack&user2ID=${playerId}`;
}

export function factionArmoryLink(): string {
  return `https://www.torn.com/factions.php?step=your#/tab=armoury`;
}

export function inventoryLink(): string {
  return `https://www.torn.com/item.php`;
}
