// content.js

// 1. Load CSV from the extension package
const csvUrl = browser.runtime.getURL("wordlist.txt");

let replacements = [];
const minWordsBetweenReplacements = 40;
let wordsSinceLastReplacement = 0;

fetch(csvUrl)
  .then(response => response.text())
  .then(text => {
    const lines = text.trim().split("\n");
    lines.shift(); // remove header

    for (const line of lines) {
      const [kanji, kana, english, cls] = line.split(";").map(s => s.trim());

      replacements.push({
        from: english,
        to: { kanji, kana, class: cls }
      });
    }

    console.log("Loaded replacements:", replacements);

    // When replacements are ready, run on current page and start observer
    startProcessing();
  })
  .catch(err => {
    console.error("Failed to load words.csv:", err);
  });

// ------------ Styles ------------

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .lonewords-pronunciation {
      cursor: pointer;
      border-bottom: 1px dotted transparent;
      transition: border-color 0.2s ease;
      position: relative;
    }
    .lonewords-pronunciation:hover {
      border-bottom-color: #888;
    }
    .lonewords-speaking {
      background-color: rgba(100, 149, 237, 0.2);
      border-radius: 2px;
    }
    .lonewords-tooltip {
      position: absolute;
      background: #333;
      color: #fff;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      white-space: nowrap;
      z-index: 999999;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s ease;
    }
    .lonewords-tooltip.visible {
      opacity: 1;
    }
    .lonewords-tooltip::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      border: 5px solid transparent;
      border-top-color: #333;
    }
  `;
  document.head.appendChild(style);
}

// ------------ Speech Synthesis ------------

function speakJapanese(text) {
  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.rate = 0.8;

  const voices = speechSynthesis.getVoices();
  const japaneseVoice = voices.find(v => v.lang.startsWith('ja'));
  if (japaneseVoice) {
    utterance.voice = japaneseVoice;
  }

  speechSynthesis.speak(utterance);
}

// ------------ Tooltip ------------

let tooltip = null;

function setupTooltip() {
  tooltip = document.createElement('div');
  tooltip.className = 'lonewords-tooltip';
  document.body.appendChild(tooltip);

  document.body.addEventListener('mouseenter', (event) => {
    const target = event.target;
    if (target.classList && target.classList.contains('lonewords-pronunciation')) {
      const original = target.dataset.original;
      if (original) {
        tooltip.textContent = original;
        const rect = target.getBoundingClientRect();
        tooltip.style.left = `${rect.left + rect.width / 2 - tooltip.offsetWidth / 2 + window.scrollX}px`;
        tooltip.style.top = `${rect.top - tooltip.offsetHeight - 8 + window.scrollY}px`;
        tooltip.classList.add('visible');
      }
    }
  }, true);

  document.body.addEventListener('mouseleave', (event) => {
    const target = event.target;
    if (target.classList && target.classList.contains('lonewords-pronunciation')) {
      tooltip.classList.remove('visible');
    }
  }, true);
}

// ------------ Click Handler (Event Delegation) ------------

function setupClickHandler() {
  document.body.addEventListener('click', (event) => {
    const target = event.target;

    if (target.classList.contains('lonewords-pronunciation')) {
      event.preventDefault();
      event.stopPropagation();

      const kana = target.dataset.kana;
      if (kana) {
        speakJapanese(kana);
        target.classList.add('lonewords-speaking');
        setTimeout(() => target.classList.remove('lonewords-speaking'), 500);
      }
    }
  }, true);
}

// ------------ Processing logic below ------------

function startProcessing() {
  injectStyles();
  setupTooltip();
  setupClickHandler();

  // Run once on initial page - only process <p> tags
  document.querySelectorAll('p').forEach(p => walk(p));

  // Also handle dynamically added content
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // If the added node is a <p>, process it
          if (node.tagName === 'P') {
            walk(node);
          } else {
            // Otherwise, find any <p> tags inside it
            node.querySelectorAll?.('p')?.forEach(p => walk(p));
          }
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// 2. Helper: walk through all text nodes
function walk(node) {
  let child, next;

  switch (node.nodeType) {
    case Node.ELEMENT_NODE:
    case Node.DOCUMENT_NODE:
    case Node.DOCUMENT_FRAGMENT_NODE:
      // Skip our own span elements to prevent re-processing
      if (node.classList && node.classList.contains('lonewords-pronunciation')) {
        return;
      }
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

// 3. Replace text inside a text node using DocumentFragment
function handleText(textNode) {
  const text = textNode.nodeValue;
  const wordRegex = /\b[\w'-]+\b/g;
  let lastIndex = 0;
  const fragment = document.createDocumentFragment();
  let hasReplacement = false;

  let match;
  while ((match = wordRegex.exec(text)) !== null) {
    const word = match[0];

    // Add text before this word
    if (match.index > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    // Check if this word should be replaced
    const replacement = maybeReplaceWord(word);

    if (replacement.isReplaced) {
      // Create clickable span for Japanese word
      const span = document.createElement('span');
      span.className = 'lonewords-pronunciation';
      span.textContent = replacement.text;
      span.dataset.kana = replacement.kana;
      span.dataset.original = word;
      fragment.appendChild(span);
      hasReplacement = true;
    } else {
      // Keep original word as text node
      fragment.appendChild(document.createTextNode(replacement.text));
    }

    lastIndex = match.index + word.length;
  }

  // Add remaining text after last match
  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  // Only replace if we made changes
  if (hasReplacement) {
    textNode.parentNode.replaceChild(fragment, textNode);
  }
}

// 4. Count words and only replace when the spacing threshold is met
function maybeReplaceWord(word) {
  wordsSinceLastReplacement += 1;

  if (wordsSinceLastReplacement < minWordsBetweenReplacements) {
    return { isReplaced: false, text: word };
  }

  const replacementData = findReplacementData(word);
  if (!replacementData) {
    return { isReplaced: false, text: word };
  }

  wordsSinceLastReplacement = 0;
  return {
    isReplaced: true,
    text: applyCase(word, replacementData.kana),
    kana: replacementData.kana
  };
}

// Find a replacement that matches the word, case-insensitive
function findReplacementData(word) {
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
