import React from 'react';

interface JungleSilhouetteProps {
  className?: string;
  height?: number;
}

const JungleSilhouette: React.FC<JungleSilhouetteProps> = ({ 
  className = '', 
  height = 70 
}) => {
  return (
    <svg 
      width="100%" 
      height={height} 
      viewBox="0 0 1200 70" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      preserveAspectRatio="xMidYBottom slice"
    >
      {/* Jungle silhouette with layered trees and foliage */}
      <defs>
        <linearGradient id="jungleGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style={{stopColor: '#2E7D32', stopOpacity: 0.8}} />
          <stop offset="50%" style={{stopColor: '#388E3C', stopOpacity: 0.6}} />
          <stop offset="100%" style={{stopColor: '#4CAF50', stopOpacity: 0.4}} />
        </linearGradient>
        <linearGradient id="jungleGradient2" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style={{stopColor: '#1B5E20', stopOpacity: 0.9}} />
          <stop offset="100%" style={{stopColor: '#2E7D32', stopOpacity: 0.7}} />
        </linearGradient>
      </defs>
      
      {/* Background layer - distant mountains/hills */}
      <path 
        d="M0,70 L0,45 Q150,35 300,40 Q450,45 600,35 Q750,25 900,30 Q1050,35 1200,25 L1200,70 Z" 
        fill="url(#jungleGradient)" 
        opacity="0.3"
      />
      
      {/* Middle layer - medium trees */}
      <path 
        d="M0,70 L0,50 Q50,45 100,48 Q200,52 250,45 Q300,38 400,42 Q500,46 600,40 Q700,34 800,38 Q900,42 1000,36 Q1100,30 1200,35 L1200,70 Z" 
        fill="url(#jungleGradient)" 
        opacity="0.5"
      />
      
      {/* Foreground layer - tall trees and detailed foliage */}
      <path 
        d="M0,70 L0,55 Q80,50 120,52 Q180,55 220,48 Q280,40 320,45 Q380,50 420,43 Q480,35 540,40 Q600,45 660,38 Q720,30 780,35 Q840,40 900,33 Q960,25 1020,30 Q1080,35 1200,28 L1200,70 Z" 
        fill="url(#jungleGradient2)"
      />
      
      {/* Individual tree details */}
      {/* Palm tree 1 */}
      <g transform="translate(150,25)">
        <path d="M0,45 L2,10 Q2,8 4,8 Q6,8 6,10 L8,45" fill="#2E7D32" opacity="0.8"/>
        <path d="M4,10 Q-5,5 -8,8 Q-10,10 -6,12 Q0,14 4,10" fill="#388E3C" opacity="0.7"/>
        <path d="M4,10 Q13,5 16,8 Q18,10 14,12 Q8,14 4,10" fill="#388E3C" opacity="0.7"/>
        <path d="M4,10 Q2,0 0,2 Q-2,4 2,6 Q4,8 4,10" fill="#388E3C" opacity="0.7"/>
      </g>
      
      {/* Palm tree 2 */}
      <g transform="translate(400,20)">
        <path d="M0,50 L2,8 Q2,6 4,6 Q6,6 6,8 L8,50" fill="#1B5E20" opacity="0.9"/>
        <path d="M4,8 Q-6,3 -10,6 Q-12,8 -8,10 Q-2,12 4,8" fill="#2E7D32" opacity="0.8"/>
        <path d="M4,8 Q14,3 18,6 Q20,8 16,10 Q10,12 4,8" fill="#2E7D32" opacity="0.8"/>
        <path d="M4,8 Q2,-2 -1,0 Q-3,2 1,4 Q4,6 4,8" fill="#2E7D32" opacity="0.8"/>
      </g>
      
      {/* Cecropia tree */}
      <g transform="translate(700,15)">
        <path d="M0,55 L3,5 Q3,3 5,3 Q7,3 7,5 L10,55" fill="#2E7D32" opacity="0.8"/>
        <circle cx="5" cy="8" r="8" fill="#4CAF50" opacity="0.6"/>
        <circle cx="5" cy="12" r="6" fill="#66BB6A" opacity="0.5"/>
        <circle cx="5" cy="16" r="4" fill="#81C784" opacity="0.4"/>
      </g>
      
      {/* Broad-leaf tree */}
      <g transform="translate(950,18)">
        <path d="M0,52 L2,12 Q2,10 4,10 Q6,10 6,12 L8,52" fill="#1B5E20" opacity="0.9"/>
        <ellipse cx="4" cy="15" rx="12" ry="8" fill="#2E7D32" opacity="0.7"/>
        <ellipse cx="4" cy="18" rx="10" ry="6" fill="#388E3C" opacity="0.6"/>
        <ellipse cx="4" cy="21" rx="8" ry="4" fill="#4CAF50" opacity="0.5"/>
      </g>
      
      {/* Small understory plants scattered throughout */}
      <g opacity="0.6">
        <circle cx="80" cy="62" r="3" fill="#4CAF50"/>
        <circle cx="85" cy="60" r="2" fill="#66BB6A"/>
        <circle cx="320" cy="65" r="2.5" fill="#4CAF50"/>
        <circle cx="325" cy="63" r="1.5" fill="#81C784"/>
        <circle cx="580" cy="64" r="3" fill="#388E3C"/>
        <circle cx="585" cy="61" r="2" fill="#4CAF50"/>
        <circle cx="820" cy="66" r="2" fill="#66BB6A"/>
        <circle cx="1050" cy="63" r="2.5" fill="#4CAF50"/>
      </g>
      
      {/* Subtle texture overlay */}
      <rect width="1200" height="70" fill="url(#jungleGradient)" opacity="0.1"/>
    </svg>
  );
};

export default JungleSilhouette;
