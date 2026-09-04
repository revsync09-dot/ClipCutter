import { DashboardHero } from '../components/dashboard-hero';
import { ExamplesShowcase } from '../components/examples-showcase';
import { ProjectsSection } from '../components/projects-section';
import { SiteInfo } from '../components/site-info';
import { TopNav } from '../components/top-nav';

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-clip bg-cream text-ink">
      <TopNav />
      <DashboardHero />
      <ExamplesShowcase />
      <ProjectsSection />
      <SiteInfo />
    </main>
  );
}
