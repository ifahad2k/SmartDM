import React from 'react';
import { Hero } from '../components/home/Hero';
import { Ticker } from '../components/home/Ticker';
import { FeatureGrid } from '../components/home/FeatureGrid';
import { MultiSegmentSection } from '../components/home/MultiSegmentSection';
import { SecuritySection } from '../components/home/SecuritySection';
import { DownloadsSection } from '../components/home/DownloadsSection';
import { CommunitySection } from '../components/home/CommunitySection';
import { FAQSection } from '../components/home/FAQSection';
import { FinalCTA } from '../components/home/FinalCTA';

interface HomePageProps {
  triggerToast?: (msg: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ triggerToast }) => {
  return (
    <>
      <Hero />
      <Ticker />
      <FeatureGrid />
      <MultiSegmentSection />
      <SecuritySection />
      <DownloadsSection triggerToast={triggerToast} />
      <CommunitySection />
      <FAQSection />
      <FinalCTA />
    </>
  );
};
