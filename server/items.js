// server/items.js
const ITEMS = [
//   { id: 1, label: "stapler", hint: "It keeps your papers together." }, Note: tape was too difficult to detect in testing so i have removed it for now.
  { id: 2, label: "Pen", hint: "You write with it, not type." },
  { id: 3, label: "Scissors", hint: "Careful! Don't run with it!." },
  { id: 4, label: "Notebook", hint: "Lines, pages, and notes." },
//   { id: 5, label: "tape", hint: "Sticky and transparent." } // Note: tape was too difficult to detect in testing so i have removed it for now.
  { id: 6, label: "Paper Clip", hint: "It keeps your papers together." },
// <can add more items here>
];

function getRandomItem() {
  const idx = Math.floor(Math.random() * ITEMS.length);
  return ITEMS[idx];
}

module.exports = { ITEMS, getRandomItem };
