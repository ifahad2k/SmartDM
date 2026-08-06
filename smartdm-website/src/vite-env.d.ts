/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'lucide-react' {
  import * as React from 'react';
  export interface IconProps extends React.SVGProps<SVGSVGElement> {
    size?: number | string;
    color?: string;
    strokeWidth?: number | string;
    fill?: string;
    [key: string]: any;
  }
  export const Download: React.FC<IconProps>;
  export const Github: React.FC<IconProps>;
  export const Star: React.FC<IconProps>;
  export const Menu: React.FC<IconProps>;
  export const X: React.FC<IconProps>;
  export const ShieldCheck: React.FC<IconProps>;
  export const UserCheck: React.FC<IconProps>;
  export const LogOut: React.FC<IconProps>;
  export const ChevronDown: React.FC<IconProps>;
  export const User: React.FC<IconProps>;
  export const ArrowRight: React.FC<IconProps>;
  export const CheckCircle: React.FC<IconProps>;
  export const Lock: React.FC<IconProps>;
  export const Terminal: React.FC<IconProps>;
  export const Cpu: React.FC<IconProps>;
  export const Zap: React.FC<IconProps>;
  export const Shield: React.FC<IconProps>;
  export const Activity: React.FC<IconProps>;
  export const Copy: React.FC<IconProps>;
  export const Globe: React.FC<IconProps>;
  export const HelpCircle: React.FC<IconProps>;
  export const Bug: React.FC<IconProps>;
  export const Lightbulb: React.FC<IconProps>;
  export const MessageSquare: React.FC<IconProps>;
  export const Monitor: React.FC<IconProps>;
  export const CheckCircle2: React.FC<IconProps>;
  export const ShieldAlert: React.FC<IconProps>;
  export const Bell: React.FC<IconProps>;
  export const Brain: React.FC<IconProps>;
  export const FolderCheck: React.FC<IconProps>;
  export const FileCode: React.FC<IconProps>;
  export const Sparkles: React.FC<IconProps>;
  export const Layers: React.FC<IconProps>;
  export const Check: React.FC<IconProps>;
  export const ExternalLink: React.FC<IconProps>;
  export const Filter: React.FC<IconProps>;
  export const Search: React.FC<IconProps>;
  export const Plus: React.FC<IconProps>;
  export const Trash2: React.FC<IconProps>;
  export const Edit: React.FC<IconProps>;
  export const RefreshCw: React.FC<IconProps>;
  export const AlertTriangle: React.FC<IconProps>;
  export const Info: React.FC<IconProps>;
}
