// server/items.js
const ITEMS = [
  { id: 1, label: "stapler", hint: "It keeps your papers together." },
  { id: 2, label: "pen", hint: "You write with it, not type." },
  { id: 3, label: "scissors", hint: "Careful - it cuts." },
  { id: 4, label: "notebook", hint: "Lines, pages, and notes." },
  { id: 5, label: "tape", hint: "Sticky and transparent." }
  // add more as you like
];

function getRandomItem() {
  const idx = Math.floor(Math.random() * ITEMS.length);
  return ITEMS[idx];
}

module.exports = { ITEMS, getRandomItem };
