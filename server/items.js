// server/items.js

// Core item pool used by the scavenger hunt game.
// Each item has:
// - id: a numeric identifier (not strictly required by logic, but useful for reference)
// - label: the display name that players see and that Azure Vision tags are matched against
// - hint: a short clue shown in the UI to help players locate the item


const ITEMS = [
//   { id: 1, label: "stapler", hint: "It keeps your papers together." }, 
// Note: stapler (and tape below) were removed because Azure Vision struggled to detect them reliably.
  { id: 2, label: "Pen", hint: "You write with it, not type." },
  { id: 3, label: "Scissors", hint: "Careful! Don't run with it!." },
  { id: 4, label: "Notebook", hint: "Lines, pages, and notes." },
//   { id: 5, label: "tape", hint: "Sticky and transparent." },
// Note: tape was too difficult to detect in testing so it is removed for now.
  { id: 6, label: "Paper Clip", hint: "It keeps your papers together." },

  // Additional items for future rounds can be added here following the same structure:
//{ id: 7, label: "Item Name", hint: "Short descriptive hint." },
];


// Helper function to select a random item from the pool.
// This is used by the game controller (in server/index.js) whenever a new round starts.
// It ensures that all connected players are tasked with the same randomly chosen item.
function getRandomItem() {
  const idx = Math.floor(Math.random() * ITEMS.length);
  return ITEMS[idx];
}

// Export both the full list of items and the helper for random selection.
// - ITEMS: for any logic that needs to inspect or iterate over the pool
// - getRandomItem: for the round lifecycle manager to pick the next target item
module.exports = { ITEMS, getRandomItem };
