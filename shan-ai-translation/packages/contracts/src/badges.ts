import { BADGE_MILESTONES } from './text';

export interface Badge {
  id: string;
  label: string;
  earned: boolean;
}

export function milestoneBadges(approvedSentences: number, approvedPages: number): Badge[] {
  const badges: Badge[] = [];
  for (const count of BADGE_MILESTONES.sentence) {
    badges.push({
      id: `sentences-${count}`,
      label: `${count} approved sentence${count === 1 ? '' : 's'}`,
      earned: approvedSentences >= count,
    });
  }
  for (const count of BADGE_MILESTONES.page) {
    badges.push({
      id: `pages-${count}`,
      label: `${count} approved page${count === 1 ? '' : 's'}`,
      earned: approvedPages >= count,
    });
  }
  return badges;
}
