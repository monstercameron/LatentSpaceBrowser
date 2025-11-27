import React, { useEffect, useRef, useState, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { SelectionPopup } from './SelectionPopup';

export function Article({ topic, content, onNavigate }) {
  const contentRef = useRef(null);
  const [selection, setSelection] = useState(null);

  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setSelection(null);
        return;
      }

      const text = selection.toString().trim();
      if (!text) {
        setSelection(null);
        return;
      }

      const range = selection.getRangeAt(0);
      
      // Only show if selection is within our article
      if (contentRef.current && contentRef.current.contains(range.commonAncestorContainer)) {
        const rect = range.getBoundingClientRect();
        const containerRect = contentRef.current.getBoundingClientRect();
        
        const newPosition = {
          top: rect.top - containerRect.top,
          left: rect.left - containerRect.left + (rect.width / 2)
        };

        setSelection(prev => {
          if (prev && prev.text === text && 
              Math.abs(prev.position.top - newPosition.top) < 2 && 
              Math.abs(prev.position.left - newPosition.left) < 2) {
            return prev;
          }
          return {
            text,
            position: newPosition
          };
        });
      } else {
        setSelection(null);
      }
    };

    // Use mouseup/keyup instead of selectionchange to avoid rapid updates during drag
    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('keyup', handleSelection);
    
    return () => {
      document.removeEventListener('mouseup', handleSelection);
      document.removeEventListener('keyup', handleSelection);
    };
  }, []);

  useEffect(() => {
    const handleClick = (e) => {
      // Check if the clicked element is an anchor tag
      const link = e.target.closest('a');
      if (link && contentRef.current.contains(link)) {
        const href = link.getAttribute('href');
        
        // If it's an external link, let the browser handle it (open in new tab)
        if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
          return;
        }

        e.preventDefault();
        // Use data-prompt if available (for contextual surfing), otherwise fallback to text content
        const topic = link.getAttribute('data-prompt') || link.textContent.trim();
        if (topic) {
          onNavigate(topic);
        }
      }
    };

    const container = contentRef.current;
    if (container) {
      container.addEventListener('click', handleClick);
    }

    return () => {
      if (container) {
        container.removeEventListener('click', handleClick);
      }
    };
  }, [onNavigate]);

  // Sanitize HTML
  const sanitizedContent = useMemo(() => {
    // Process <think> tags before sanitization
    let processedContent = content;
    
    // Replace <think> blocks with a collapsible details element
    processedContent = processedContent.replace(
      /<think>([\s\S]*?)<\/think>/gi, 
      (match, innerContent) => {
        return `
          <details class="mb-6 border border-gray-200 rounded-lg bg-gray-50 overflow-hidden group">
            <summary class="cursor-pointer p-3 text-xs font-mono text-gray-500 hover:bg-gray-100 select-none flex items-center gap-2 transition-colors">
              <span class="transform group-open:rotate-90 transition-transform duration-200">▶</span>
              <span>AI Thought Process</span>
            </summary>
            <div class="p-4 text-sm font-mono text-gray-600 border-t border-gray-200 bg-white whitespace-pre-wrap leading-relaxed">
              ${innerContent.trim()}
            </div>
          </details>
        `;
      }
    );

    return DOMPurify.sanitize(processedContent, {
      ADD_TAGS: ['details', 'summary'],
      ADD_ATTR: ['target', 'class', 'data-prompt', 'open'], // Allow class for Tailwind and data-prompt for context
    });
  }, [content]);

  // Post-process links to add external icons and security attributes
  useEffect(() => {
    if (!contentRef.current) return;

    const links = contentRef.current.querySelectorAll('a');
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        link.classList.add('external-link');
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }, [sanitizedContent]);

  return (
    <>
      <div 
        ref={contentRef}
        className="prose max-w-none text-gray-800 leading-relaxed relative"
        dangerouslySetInnerHTML={{ __html: sanitizedContent }}
      />
      {selection && (
        <SelectionPopup 
          position={selection.position} 
          selectedText={selection.text}
          contextTopic={topic}
          onNavigate={onNavigate}
        />
      )}
    </>
  );
}
