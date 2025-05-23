// Word Memory Assistant - Content Script

let isCtrlPressed = false;
let savedWords = new Set();
let lastMouseEvent = null;

// Load saved words from storage
chrome.storage.sync.get(['savedWords'], function(result) {
  if (result.savedWords) {
    savedWords = new Set(result.savedWords);
    highlightSavedWords();
  }
});

// Track mouse position
document.addEventListener('mousemove', function(e) {
  lastMouseEvent = e;
});

// Track Ctrl key state
document.addEventListener('keydown', function(e) {
  if (e.key === 'Control' && !isCtrlPressed) {
    isCtrlPressed = true;
    
    // Trigger word extraction when Ctrl is pressed (if mouse is over a word)
    if (lastMouseEvent) {
      const word = getWordUnderCursor(lastMouseEvent);
      if (word && word.length > 2) {
        // Directly add or remove word without showing tooltip
        if (savedWords.has(word)) {
          removeWord(word);
        } else {
          addWord(word);
        }
      }
    }
  }
});

document.addEventListener('keyup', function(e) {
  if (e.key === 'Control') {
    isCtrlPressed = false;
  }
});

// Extract word under cursor
function getWordUnderCursor(e) {
  const element = e.target;
  
  // Skip if hovering over script, style, or our own elements
  if (element.tagName === 'SCRIPT' || 
      element.tagName === 'STYLE' ||
      element.closest('.word-memory-message') ||
      element.classList.contains('word-memory-highlight')) {
    return null;
  }
  
  // Try multiple methods to get the word under cursor
  let word = null;
  
  // Method 1: Use caretRangeFromPoint (most accurate for text nodes)
  const range = document.caretRangeFromPoint(e.clientX, e.clientY);
  if (range && range.startContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
    const textNode = range.startContainer;
    const offset = range.startOffset;
    const textContent = textNode.textContent;
    
    // Find word boundaries around the cursor position
    let start = offset;
    let end = offset;
    
    // Move start backward to find word start
    while (start > 0 && /[a-zA-Z]/.test(textContent[start - 1])) {
      start--;
    }
    
    // Move end forward to find word end
    while (end < textContent.length && /[a-zA-Z]/.test(textContent[end])) {
      end++;
    }
    
    if (start < end) {
      word = textContent.substring(start, end).toLowerCase();
    }
  }
  
  // Method 2: Fallback - extract from element text content
  if (!word || !word.match(/^[a-zA-Z]+$/)) {
    const text = element.textContent || element.innerText || '';
    if (text) {
      // Get element bounds
      const rect = element.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const relativeY = e.clientY - rect.top;
      
      // Simple word extraction based on mouse position
      const words = text.match(/\b[a-zA-Z]+\b/g);
      if (words && words.length > 0) {
        // For simple cases, just return the first valid word
        // This is a fallback when precise positioning fails
        const elementText = text.toLowerCase();
        for (let testWord of words) {
          if (testWord.length > 2 && /^[a-zA-Z]+$/.test(testWord)) {
            word = testWord.toLowerCase();
            break;
          }
        }
      }
    }
  }
  
  // Method 3: Enhanced selection-based approach
  if (!word || !word.match(/^[a-zA-Z]+$/)) {
    try {
      // Create a temporary selection to find word boundaries
      const selection = window.getSelection();
      const originalRange = selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
      
      // Clear selection and create new range at mouse position
      selection.removeAllRanges();
      const newRange = document.caretRangeFromPoint(e.clientX, e.clientY);
      
      if (newRange) {
        // Expand range to word boundaries
        newRange.expand('word');
        const selectedText = newRange.toString().trim();
        
        if (selectedText && /^[a-zA-Z]+$/.test(selectedText)) {
          word = selectedText.toLowerCase();
        }
        
        // Restore original selection
        selection.removeAllRanges();
        if (originalRange) {
          selection.addRange(originalRange);
        }
      }
    } catch (err) {
      // Ignore errors from range operations
    }
  }
  
  // Return valid word or null
  return (word && word.length > 2 && /^[a-zA-Z]+$/.test(word)) ? word : null;
}

// Add word to saved list
function addWord(word) {
  savedWords.add(word);
  saveWordsToStorage();
  highlightWord(word);
  
  // Show success message
  showMessage(`"${word}" added to your word list!`, 'success');
}

// Remove word from saved list
function removeWord(word) {
  savedWords.delete(word);
  saveWordsToStorage();
  removeHighlight(word);
  
  // Show success message
  showMessage(`"${word}" removed from your word list!`, 'info');
}

// Save words to Chrome storage
function saveWordsToStorage() {
  chrome.storage.sync.set({
    savedWords: Array.from(savedWords)
  });
}

// Highlight a specific word
function highlightWord(word) {
  const regex = new RegExp(`\\b${word}\\b`, 'gi');
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  const textNodes = [];
  let node;
  while (node = walker.nextNode()) {
    if (node.parentElement.tagName !== 'SCRIPT' && 
        node.parentElement.tagName !== 'STYLE' &&
        !node.parentElement.closest('.word-memory-tooltip')) {
      textNodes.push(node);
    }
  }
  
  textNodes.forEach(textNode => {
    const text = textNode.textContent;
    if (regex.test(text)) {
      const parent = textNode.parentElement;
      const newHTML = text.replace(regex, `<span class="word-memory-highlight">$&</span>`);
      
      const wrapper = document.createElement('div');
      wrapper.innerHTML = newHTML;
      
      while (wrapper.firstChild) {
        parent.insertBefore(wrapper.firstChild, textNode);
      }
      
      parent.removeChild(textNode);
    }
  });
}

// Highlight all saved words
function highlightSavedWords() {
  savedWords.forEach(word => {
    highlightWord(word);
  });
}

// Remove highlight for a specific word
function removeHighlight(word) {
  const highlights = document.querySelectorAll('.word-memory-highlight');
  highlights.forEach(highlight => {
    if (highlight.textContent.toLowerCase() === word.toLowerCase()) {
      const parent = highlight.parentElement;
      parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
      parent.normalize();
    }
  });
}

// Show success/info messages
function showMessage(text, type) {
  const message = document.createElement('div');
  message.className = `word-memory-message ${type}`;
  message.textContent = text;
  
  document.body.appendChild(message);
  
  setTimeout(() => {
    message.classList.add('show');
  }, 10);
  
  setTimeout(() => {
    message.classList.remove('show');
    setTimeout(() => {
      if (message.parentElement) {
        message.parentElement.removeChild(message);
      }
    }, 300);
  }, 2000);
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'getWords') {
    sendResponse({words: Array.from(savedWords)});
  } else if (request.action === 'removeWord') {
    removeWord(request.word);
    sendResponse({success: true});
  } else if (request.action === 'clearAllWords') {
    savedWords.clear();
    saveWordsToStorage();
    // Remove all highlights
    const highlights = document.querySelectorAll('.word-memory-highlight');
    highlights.forEach(highlight => {
      const parent = highlight.parentElement;
      parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
      parent.normalize();
    });
    sendResponse({success: true});
  }
});