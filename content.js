// content.js

// 1. Which replacements do we want? (example: English -> Japanese)
const replacements = [
    { from: "a", to: "$" },
  ];
  
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
    let text = textNode.nodeValue;
  
    for (const { from, to } of replacements) {
      // simple case-insensitive replace
      const pattern = new RegExp("\\b" + escapeRegExp(from) + "\\b", "gi");
      text = text.replace(pattern, (match) => {
        // preserve capitalization if you want
        if (match[0] === match[0].toUpperCase()) {
          return to[0].toUpperCase() + to.slice(1);
        }
        return to;
      });
    }
  
    textNode.nodeValue = text;
  }
  
  // 4. Escape regex special characters in "from" words
  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  