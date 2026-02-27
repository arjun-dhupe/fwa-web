export const quotes = [
  "Discipline beats motivation.",
  "You don’t need to be extreme. Just consistent.",
  "Your future body is watching you today.",
  "Every workout is a vote for the person you want to become.",
  "Progress, not perfection.",
  "You’re one decision away from a better life.",
  "Small steps every day. Big results over time.",
  "You showed up. That’s the win.",
  "Make today count.",
];

export function getDailyQuote(date = new Date()) {
  const index = date.getDate() % quotes.length;
  return quotes[index];
}