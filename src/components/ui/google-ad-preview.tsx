import { useEffect, useMemo, useState } from 'react';
import { MoreVertical } from 'lucide-react';

interface GoogleAdPreviewProps {
  domain: string;
  path1?: string;
  path2?: string;
  headlines: string[];
  descriptions: string[];
  className?: string;
}

export function GoogleAdPreview({
  domain,
  path1,
  path2,
  headlines,
  descriptions,
  className = '',
}: GoogleAdPreviewProps) {
  const [rotationIndex, setRotationIndex] = useState(0);

  const validHeadlines = useMemo(
    () => headlines.filter((headline) => headline.trim() !== ''),
    [headlines]
  );
  const validDescriptions = useMemo(
    () => descriptions.filter((description) => description.trim() !== ''),
    [descriptions]
  );

  useEffect(() => {
    if (validHeadlines.length <= 3 && validDescriptions.length <= 2) return;

    const interval = window.setInterval(() => {
      setRotationIndex((current) => current + 1);
    }, 3500);

    return () => window.clearInterval(interval);
  }, [validDescriptions.length, validHeadlines.length]);

  const currentHeadlines = useMemo(() => {
    if (validHeadlines.length <= 3) return validHeadlines;
    return Array.from({ length: 3 }, (_, offset) => {
      const index = (rotationIndex + offset) % validHeadlines.length;
      return validHeadlines[index];
    });
  }, [rotationIndex, validHeadlines]);

  const currentDescriptions = useMemo(() => {
    if (validDescriptions.length <= 2) return validDescriptions;
    return Array.from({ length: 2 }, (_, offset) => {
      const index = (rotationIndex + offset) % validDescriptions.length;
      return validDescriptions[index];
    });
  }, [rotationIndex, validDescriptions]);

  // Format domain (strip protocol and www)
  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

  const displayParts = [
    cleanDomain || 'example.com',
    path1?.trim(),
    path2?.trim()
  ].filter(Boolean);
  
  const displayUrl = displayParts.join(' \u203A ');

  const displayHeadlines = currentHeadlines.length > 0 
    ? currentHeadlines.join(' | ') 
    : 'Your Headline 1 | Your Headline 2';
    
  const displayDescriptions = currentDescriptions.length > 0
    ? currentDescriptions.join(' ')
    : 'Your ad description goes here. Make it compelling and relevant to the user\'s search.';

  return (
    <div className={`bg-white dark:bg-[#202124] p-4 rounded-lg border border-border shadow-sm max-w-full font-sans text-left ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-bold text-[#202124] dark:text-[#e8eaed]">Sponsored</span>
          </div>
          <div className="flex items-center gap-1 text-[12px] text-[#4d5156] dark:text-[#bdc1c6] mt-0.5">
            <span className="truncate max-w-[280px] font-normal">{displayUrl}</span>
          </div>
        </div>
        <MoreVertical className="h-4 w-4 text-[#70757a] dark:text-[#9aa0a6] shrink-0" />
      </div>
      
      <div className="mb-1 mt-1.5">
        <h3 className="text-[20px] leading-[26px] font-normal text-[#1a0dab] dark:text-[#8ab4f8] hover:underline cursor-pointer break-words">
          {displayHeadlines}
        </h3>
      </div>
      
      <div>
        <p className="text-[14px] leading-[22px] text-[#4d5156] dark:text-[#bdc1c6] break-words">
          {displayDescriptions}
        </p>
      </div>
    </div>
  );
}
