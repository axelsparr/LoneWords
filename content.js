// content.js

// 1. Which replacements do we want? (example: English -> Japanese)
const replacements = [
  { from: "a", to: "$" },
];

// 1b. Minimum distance (in words) between replacements
const minWordsBetweenReplacements = 40;
let wordsSinceLastReplacement = 0;

// 2. Helper: walk through all text nodes
function walk(node) {
  let child, next;

  switch (node.nodeType) {
    case Node.ELEMENT_NODE:
    case Node.DOCUMENT_NODE:
    case Node.DOCUMENT_FRAGMENT_NODE:
      child = node.firstChild;
      while (child) {
        next = child.nextSibling;
        walk(child);
        child = next;
      }
      break;

    case Node.TEXT_NODE:
      handleText(node);
      break;
  }
}

// 3. Replace text inside a text node
function handleText(textNode) {
  const text = textNode.nodeValue;
  const wordRegex = /\b[\w'-]+\b/g;
  let lastIndex = 0;
  let result = "";

  let match;
  while ((match = wordRegex.exec(text)) !== null) {
    const word = match[0];
    result += text.slice(lastIndex, match.index);
    result += maybeReplaceWord(word);
    lastIndex = match.index + word.length;
  }

  result += text.slice(lastIndex);
  textNode.nodeValue = result;
}

// 4. Count words and only replace when the spacing threshold is met
function maybeReplaceWord(word) {
  wordsSinceLastReplacement += 1;

  if (wordsSinceLastReplacement < minWordsBetweenReplacements) {
    return word;
  }

  const replacement = findReplacement(word);
  if (!replacement) {
    return word;
  }

  wordsSinceLastReplacement = 0;
  return applyCase(word, replacement);
}

// Find a replacement that matches the word, case-insensitive
function findReplacement(word) {
  const lower = word.toLowerCase();
  for (const { from, to } of replacements) {
    if (lower === from.toLowerCase()) {
      return to;
    }
  }
  return null;
}

// Preserve capitalization of the first character
function applyCase(original, replacement) {
  if (original[0] === original[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

// 5. Run once on initial page
walk(document.body);

// 6. Also observe dynamic changes (e.g. SPAs, infinite scroll)
const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      walk(node);
    }
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
