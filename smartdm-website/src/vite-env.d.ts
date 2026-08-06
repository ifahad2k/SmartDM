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
  import React from 'react';
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
}
